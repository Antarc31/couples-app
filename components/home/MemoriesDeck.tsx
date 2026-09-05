"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import {
  listRecentThoughts,
  sendThought,
  sendPhotoThought,
  toggleThoughtReaction,
  type Thought,
} from "@/lib/messages-actions";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import IconBadge from "@/components/ui/IconBadge";
import { MessageCircle, Camera, Clock, Plus } from "@/components/ui/icons";

const TYPE_ICON: Record<Thought["type"], ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  text: MessageCircle,
  photo: Camera,
  reminder: Clock,
};

/** Content di default salvato per le foto senza didascalia (vedi sendPhotoThought) — non va mostrato come testo. */
const DEFAULT_PHOTO_CONTENT = "📷";

function formatThoughtTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `oggi, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `ieri, ${time}`;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

const STACK_VISIBLE = 3;
const SWIPE_DISTANCE_THRESHOLD = 100;
const SWIPE_VELOCITY_THRESHOLD = 0.5; // px/ms
const FLY_OUT_DISTANCE = 600;
const RESOLVE_SWIPE_DELAY_MS = 220;
/** Durata dell'animazione .animate-heart-pop in app/globals.css — tenuta in sync qui per rimuovere la classe a fine transizione. */
const POP_ANIMATION_MS = 380;

/**
 * Pulsante di reazione a cuore: vero contorno a pulsante (cerchio su
 * `bg-surface`), non più un glifo emoji nudo — così si percepisce
 * chiaramente come cliccabile. Stesso path SVG del cuore già usato per
 * l'icona "Appuntamenti" in components/AppTabBar.tsx, per coerenza visiva.
 * `data-liked` (non il colore) è ciò su cui i test verificano lo stato,
 * dato che il glifo non è più testo.
 */
function HeartButton({
  liked,
  popping,
  onClick,
  className = "",
}: {
  liked: boolean;
  popping: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Il cuore vive dentro la card con drag/swipe: senza fermare qui la
      // propagazione, il pointerdown risale alla card, che chiama
      // setPointerCapture sul pointer — a quel punto il browser reindirizza
      // il click risultante alla card invece che al bottone, e il tap sul
      // cuore smette di funzionare (bug reale, non riproducibile in jsdom
      // perché PointerEvent/setPointerCapture non sono implementati lì, vedi
      // tests/components/home/MemoriesDeck.test.tsx).
      onPointerDown={(e) => e.stopPropagation()}
      data-liked={liked}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface shadow-sm transition active:scale-90 ${
        popping ? "animate-heart-pop" : ""
      } ${className}`}
      aria-label={liked ? "Togli reazione" : "Reagisci con un cuore"}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={liked ? "var(--color-couple)" : "none"}
        stroke="var(--color-couple)"
      >
        <path d="M12 20.5s-7.5-4.6-9.7-9A5.1 5.1 0 0 1 12 6.3a5.1 5.1 0 0 1 9.7 5.2c-2.2 4.4-9.7 9-9.7 9Z" />
      </svg>
    </button>
  );
}

/**
 * Widget "Ricordi" di Home (sostituisce ThoughtsSection + PhotoStrip, vedi
 * piano approvato — punto 7). Mazzetto di card impilate
 * (max STACK_VISIBLE visibili), la più recente in cima. Card testo/reminder
 * = sfondo bianco con solo il messaggio; card foto = immagine a piena card
 * con signed URL già risolta da listRecentThoughts.
 *
 * Drag orizzontale via pointer events nativi (nessuna libreria di gesture nel
 * progetto): oltre una soglia di distanza o velocità la card scivola via e
 * si passa alla successiva, altrimenti torna elasticamente al centro.
 */
export default function MemoriesDeck({ partnerName, selfId }: { partnerName: string; selfId: string }) {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topIndex, setTopIndex] = useState(0);

  const [showMenu, setShowMenu] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stato del drag della card in cima. dragX/leaving sono condivisi (non per
  // card) perché solo la card in cima (i === 0) è mai interattiva.
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const dragStartRef = useRef<{ x: number; time: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  // Id della card che sta mostrando il pop del cuore in questo momento (una alla volta è sufficiente, solo la card in cima è interattiva).
  const [poppingId, setPoppingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listRecentThoughts();
      if (cancelled) return;
      setLoading(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setThoughts(result);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = thoughts.slice(topIndex, topIndex + STACK_VISIBLE);

  /**
   * Navigazione bidirezionale: nessuna card viene mai rimossa dai dati, solo
   * l'indice della card in cima si sposta. Swipe a sinistra = avanti (verso
   * i ricordi più vecchi), swipe a destra = indietro (torna a quelli più
   * recenti già visti) — così nessuna card "si perde" durante la sessione.
   */
  function goTo(direction: "next" | "prev") {
    setTopIndex((i) => {
      if (direction === "next") return Math.min(i + 1, Math.max(thoughts.length - 1, 0));
      return Math.max(i - 1, 0);
    });
    setDragX(0);
    setLeaving(null);
  }

  async function toggleLike(id: string) {
    // Ottimistico: la RPC è l'unica fonte di verità per liked_by, ma
    // aggiorniamo subito la UI e correggiamo se la chiamata fallisce.
    const wasLiked = thoughts.find((t) => t.id === id)?.likedByMe ?? false;
    setThoughts((prev) => prev.map((t) => (t.id === id ? { ...t, likedByMe: !t.likedByMe } : t)));
    if (!wasLiked) {
      // Il pop parte solo quando il cuore viene aggiunto (mai alla rimozione) — stessa regola della notifica lato DB, per coerenza.
      setPoppingId(id);
      window.setTimeout(() => setPoppingId((cur) => (cur === id ? null : cur)), POP_ANIMATION_MS);
    }
    const result = await toggleThoughtReaction(id);
    if (typeof result === "object" && "error" in result) {
      setThoughts((prev) => prev.map((t) => (t.id === id ? { ...t, likedByMe: !t.likedByMe } : t)));
      setPoppingId((cur) => (cur === id ? null : cur));
    }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (leaving) return;
    activePointerIdRef.current = e.pointerId;
    dragStartRef.current = { x: e.clientX, time: Date.now() };
    setDragging(true);
    // setPointerCapture non è implementato in jsdom (né in tutti i browser
    // meno recenti) — chiamata opzionale, il drag funziona comunque perché
    // i test/gli eventi successivi mirano sempre lo stesso elemento.
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current || activePointerIdRef.current !== e.pointerId) return;
    setDragX(e.clientX - dragStartRef.current.x);
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current || activePointerIdRef.current !== e.pointerId) return;
    const { x, time } = dragStartRef.current;
    const dx = e.clientX - x;
    const dt = Math.max(1, Date.now() - time);
    const velocity = Math.abs(dx) / dt;
    dragStartRef.current = null;
    activePointerIdRef.current = null;
    setDragging(false);

    // Sinistra (dx negativo) = avanti verso i ricordi più vecchi;
    // destra (dx positivo) = indietro verso quelli più recenti già visti.
    const wantsNext = dx < 0;
    const canMove = wantsNext ? topIndex < thoughts.length - 1 : topIndex > 0;

    if (canMove && (Math.abs(dx) > SWIPE_DISTANCE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD)) {
      const dir = dx > 0 ? "right" : "left";
      setLeaving(dir);
      setDragX(dir === "right" ? FLY_OUT_DISTANCE : -FLY_OUT_DISTANCE);
      window.setTimeout(() => goTo(wantsNext ? "next" : "prev"), RESOLVE_SWIPE_DELAY_MS);
    } else {
      // Sotto soglia (o già al limite in quella direzione): torna elasticamente al centro.
      setDragX(0);
    }
  }

  async function handleSendText(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    setSendError(null);
    const result = await sendThought(draft.trim());
    setSending(false);
    if ("error" in result) {
      setSendError(result.error);
      return;
    }
    setThoughts((prev) => [result, ...prev]);
    setTopIndex(0);
    setDraft("");
    setShowCompose(false);
  }

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permette di riselezionare lo stesso file una seconda volta
    if (!file) return;
    setUploadingPhoto(true);
    setPhotoError(null);
    const result = await sendPhotoThought(file);
    setUploadingPhoto(false);
    if ("error" in result) {
      setPhotoError(result.error);
      return;
    }
    setThoughts((prev) => [result, ...prev]);
    setTopIndex(0);
  }

  return (
    <>
      <div className="relative">
      <Card className="flex flex-col gap-3" style={{ backgroundColor: "var(--color-couple-tint)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconBadge icon={MessageCircle} size={32} variant="onTint" />
            <h2 className="text-sm font-bold text-ink">Ricordi</h2>
            {thoughts.length > 1 && (
              <span className="text-[11px] font-semibold text-ink-soft">
                {topIndex + 1}/{thoughts.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {uploadingPhoto && <span className="text-xs font-semibold text-ink-soft">Carico la foto…</span>}
            <Link href="/home/foto" className="text-xs font-semibold text-couple">
              Tutte le foto
            </Link>
          </div>
        </div>

        {photoError && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{photoError}</p>}

        <div className="relative h-72 w-full select-none">
          {loading ? (
            <div className="flex h-full items-center justify-center rounded-[28px] bg-surface text-sm text-ink-soft">
              Carico i ricordi…
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center rounded-[28px] bg-danger/10 px-4 text-center text-sm text-danger">
              {error}
            </div>
          ) : thoughts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-[28px] bg-surface text-center text-sm text-ink-soft">
              <MessageCircle size={30} strokeWidth={1.8} />
              Ancora nessun ricordo, manda il primo!
            </div>
          ) : (
            visible.map((t, i) => {
              const isTop = i === 0;
              const stackOffset = i * 10;
              const stackScale = 1 - i * 0.035;
              const transform = isTop
                ? `translateX(${dragX}px) rotate(${dragX / 20}deg)`
                : `translateY(${stackOffset}px) scale(${stackScale})`;
              const caption = t.type === "photo" && t.content !== DEFAULT_PHOTO_CONTENT ? t.content : null;

              return (
                <div
                  key={t.id}
                  data-testid="memory-card"
                  {...(isTop
                    ? {
                        onPointerDown: handlePointerDown,
                        onPointerMove: handlePointerMove,
                        onPointerUp: handlePointerUp,
                        onPointerCancel: handlePointerUp,
                      }
                    : {})}
                  className={`absolute inset-0 flex flex-col overflow-hidden rounded-[28px] shadow-[var(--shadow-soft)] ${
                    t.type === "photo" ? "bg-ink" : "bg-surface"
                  } ${isTop ? "cursor-grab active:cursor-grabbing" : "pointer-events-none"}`}
                  style={{
                    zIndex: visible.length - i,
                    transform,
                    touchAction: isTop ? "none" : undefined,
                    transition: isTop && !dragging ? "transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
                  }}
                >
                  {t.type === "photo" ? (
                    <>
                      {t.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed URL temporanea, non ottimizzabile da next/image
                        <img
                          src={t.photoUrl}
                          alt=""
                          draggable={false}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-white/60">
                          <Camera size={36} strokeWidth={1.8} />
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-ink/55 to-transparent p-3 pr-14">
                        <p className="flex items-center gap-1 text-xs font-semibold text-white/95">
                          <Camera size={13} strokeWidth={2.2} />
                          {t.senderId === selfId ? "Tu" : t.senderName} · {formatThoughtTimestamp(t.createdAt)}
                        </p>
                      </div>
                      {caption && (
                        <p className="pointer-events-none absolute inset-x-0 bottom-12 bg-gradient-to-t from-ink/60 to-transparent px-4 pb-2 pt-8 text-sm text-white">
                          {caption}
                        </p>
                      )}
                      <HeartButton
                        liked={t.likedByMe}
                        popping={poppingId === t.id}
                        onClick={() => toggleLike(t.id)}
                        className="absolute top-3 right-3 z-10"
                      />
                    </>
                  ) : (
                    <div className="flex h-full flex-col gap-3 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="flex items-center gap-1 text-xs font-semibold text-ink-soft">
                          {(() => {
                            const TypeIcon = TYPE_ICON[t.type];
                            return <TypeIcon size={13} strokeWidth={2.2} />;
                          })()}
                          {t.senderId === selfId ? "Tu" : t.senderName} · {formatThoughtTimestamp(t.createdAt)}
                        </p>
                        <HeartButton liked={t.likedByMe} popping={poppingId === t.id} onClick={() => toggleLike(t.id)} />
                      </div>
                      <p className="flex-1 overflow-y-auto text-base leading-relaxed text-ink">{t.content}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {!loading && !error && thoughts.length > 0 && topIndex === thoughts.length - 1 && (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface px-3 py-2">
            <p className="text-xs text-ink-soft">Hai visto tutti i ricordi</p>
            <button
              type="button"
              onClick={() => setShowMenu(true)}
              className="shrink-0 rounded-full bg-couple px-3 py-1.5 text-xs font-semibold text-white transition active:scale-95"
            >
              Mandane uno nuovo
            </button>
          </div>
        )}
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Seleziona foto"
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* Ancorato all'angolo della card "Ricordi" (non più fluttuante sulla
          pagina) — il nesso col widget resta chiaro anche scorrendo la Home,
          dato che si muove insieme alla card. Stesso identico stile del FAB
          "+" di Calendario/Appuntamenti/Wishlist (bg-couple), non
          un'eccezione a parte per questo widget. */}
      <button
        onClick={() => setShowMenu(true)}
        className="absolute bottom-3 right-3 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-couple text-white shadow-[var(--shadow-soft)] ring-4 ring-base transition active:scale-95"
        aria-label="Aggiungi un pensiero o una foto"
      >
        <Plus size={26} strokeWidth={2.4} />
      </button>
      </div>

      {showMenu && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 backdrop-blur-sm sm:items-center"
          onClick={() => setShowMenu(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[28px] bg-surface p-5 shadow-[var(--shadow-soft)] sm:rounded-[28px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border sm:hidden" />
            <h2 className="mb-3 text-lg font-extrabold text-ink">Manda qualcosa a {partnerName}</h2>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  setShowCompose(true);
                }}
                className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left text-[15px] font-semibold text-ink transition active:scale-[0.98] hover:bg-partner-a-soft/40"
              >
                <MessageCircle size={20} strokeWidth={2} className="text-couple" /> Manda un pensiero
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  fileInputRef.current?.click();
                }}
                className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left text-[15px] font-semibold text-ink transition active:scale-[0.98] hover:bg-partner-a-soft/40"
              >
                <Camera size={20} strokeWidth={2} className="text-couple" /> Manda una foto
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompose && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 backdrop-blur-sm sm:items-center"
          onClick={() => setShowCompose(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[28px] bg-surface p-5 shadow-[var(--shadow-soft)] sm:rounded-[28px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border sm:hidden" />
            <h2 className="mb-3 text-lg font-extrabold text-ink">Manda un pensiero a {partnerName}</h2>
            <form onSubmit={handleSendText} className="flex flex-col gap-3">
              <textarea
                autoFocus
                placeholder="Scrivi qualcosa di carino…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] text-ink placeholder:text-ink-soft outline-none focus:border-partner-a focus:ring-2 focus:ring-partner-a-soft"
              />
              {sendError && (
                <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{sendError}</p>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowCompose(false)}>
                  Annulla
                </Button>
                <Button type="submit" className="flex-1" disabled={!draft.trim() || sending}>
                  {sending ? "Invio…" : "Invia"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
