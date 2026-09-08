"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listWishlistFeed,
  completeWishlistItem,
  reopenWishlistItem,
  type WishlistFeedItem,
} from "@/lib/wishlist-actions";
import Card from "@/components/ui/Card";
import WishlistFormModal from "@/components/wishlist/WishlistFormModal";

// Sezioni per destinatario, non più per categoria regalo/attività di coppia
// (tolta su richiesta dell'utente: ridondante col Calendario/Appuntamenti,
// che già coprono la pianificazione di attività condivise — la Wishlist
// resta solo "cosa vorrei", non "cosa vogliamo fare"). Niente sezione
// "Tutto": le tre sezioni per destinatario sono già esaustive e mutuamente
// esclusive (ogni item ha esattamente un target).
type Filter = "self" | "partner" | "entrambi";

const PRIORITY_LABELS: Record<WishlistFeedItem["priority"], string> = {
  bassa: "Bassa",
  media: "Media",
  alta: "Alta",
};

const PRIORITY_STYLES: Record<WishlistFeedItem["priority"], string> = {
  bassa: "bg-base text-ink-soft",
  media: "bg-partner-b-soft text-ink",
  alta: "bg-couple-soft text-couple",
};

function formatPrice(price: number | null): string | null {
  if (price == null) return null;
  return Number.isInteger(price) ? `~${price}€` : `~${price.toFixed(2)}€`;
}

/**
 * `target` è sempre relativo a chi ha CREATO l'item, non a chi guarda —
 * qui lo traduciamo rispetto al viewer corrente (selfId): la stessa riga si
 * legge "self"/"per te" per chi ne beneficia, "partner"/"per <partner>" per
 * l'altro. Stessa traduzione usata sia per l'etichetta sulla card
 * (targetLabel) sia per decidere in quale sezione ricade l'item (itemBucket).
 */
function beneficiaryIsSelf(item: WishlistFeedItem, selfId: string): boolean {
  return item.target === "self" ? item.createdBy === selfId : item.createdBy !== selfId;
}

function targetLabel(item: WishlistFeedItem, selfId: string, partnerName: string): string {
  if (item.target === "entrambi") return "Per voi due";
  return beneficiaryIsSelf(item, selfId) ? "Per te" : `Per ${partnerName}`;
}

/** Sezione (Filter) a cui appartiene l'item dal punto di vista del viewer corrente. */
function itemBucket(item: WishlistFeedItem, selfId: string): Filter {
  if (item.target === "entrambi") return "entrambi";
  return beneficiaryIsSelf(item, selfId) ? "self" : "partner";
}

interface WishlistViewProps {
  selfId: string;
  partnerName: string;
}

/**
 * Schermata Wishlist (docs/PLAN.md sezione "Wishlist"): filtri per
 * destinatario (Per me/Per <partner>/Per entrambi — sostituiscono i vecchi
 * filtri per categoria Regali/Attività di coppia/Tutto, tolti su richiesta
 * dell'utente perché ridondanti col Calendario/Appuntamenti), archivio
 * "Completati" separato (mai delete secco: nessuna policy DELETE lato DB,
 * solo il pulsante di completamento), modalità sorpresa. Dati reali (tabella
 * `wishlist_items`, live dal 2026-09-01) via lib/wishlist-actions.ts.
 *
 * IMPORTANTE (ribadito da backend2 e da main): la lista condivisa legge
 * SEMPRE `listWishlistFeed()` (view `wishlist_feed`), mai una query diretta
 * su `wishlist_items` — è la view che maschera i campi sensibili delle
 * sorprese attive del partner e calcola `isHiddenSurprise`. Qui ci si limita
 * a leggere quel flag già calcolato lato server, non c'è nessuna logica di
 * mascheramento client-side da mantenere.
 */
export default function WishlistView({ selfId, partnerName }: WishlistViewProps) {
  const [items, setItems] = useState<WishlistFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("self");
  const [showArchive, setShowArchive] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listWishlistFeed();
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setItems(result);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const scoped = items.filter((i) => (showArchive ? i.status === "completato" : i.status === "attivo"));
  const filtered = scoped.filter((i) => itemBucket(i, selfId) === filter);

  async function complete(id: string) {
    // Ottimistico, coerente con ThoughtsSection: aggiorniamo subito la UI e
    // ricarichiamo dal server se la chiamata fallisce (rollback via refetch,
    // non con lo stato precedente salvato a mano — più semplice e comunque
    // corretto perché completeWishlistItem è idempotente lato UI).
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "completato", completedAt: new Date().toISOString() } : i)),
    );
    const result = await completeWishlistItem(id);
    if ("error" in result) {
      // load() azzera `error` a inizio fetch (per il caricamento iniziale) —
      // se lo impostassimo prima di chiamare load(), il refetch lo
      // cancellerebbe subito senza che l'utente lo veda mai. Aspettiamo che
      // il resync finisca e lo impostiamo per ultimo, così resta visibile.
      await load();
      setError(result.error);
    }
  }

  /** Annulla un completamento per errore — stesso schema ottimistico + rollback via refetch di complete(). */
  async function reopen(id: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "attivo", completedAt: null, completedBy: null } : i)),
    );
    const result = await reopenWishlistItem(id);
    if ("error" in result) {
      await load();
      setError(result.error);
    }
  }

  function handleCreated() {
    setShowForm(false);
    load();
  }

  return (
    <div className="theme-wishlist bg-diary flex flex-1 flex-col gap-4 px-4 pt-5">
      <div className="flex justify-end">
        <button
          onClick={() => setShowArchive((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            showArchive ? "bg-couple text-white" : "bg-base text-ink-soft"
          }`}
        >
          {showArchive ? "← Attivi" : "Completati 🗂"}
        </button>
      </div>

      {!showArchive && (
        <div className="flex rounded-2xl bg-couple-soft/50 p-1">
          {(["self", "partner", "entrambi"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
                filter === f ? "bg-surface text-ink shadow-sm" : "text-ink-soft"
              }`}
            >
              {f === "self" ? "Per me" : f === "partner" ? `Per ${partnerName}` : "Per entrambi"}
            </button>
          ))}
        </div>
      )}

      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {loading && <p className="text-center text-xs text-ink-soft">Carico la wishlist…</p>}

      {filtered.length === 0 && !loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
          <span className="text-3xl">{showArchive ? "🗂" : "🎁"}</span>
          <p className="text-sm text-ink-soft">
            {showArchive ? "Ancora nessun desiderio completato." : "Ancora nulla qui. Aggiungi qualcosa con il pulsante +!"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((item) => (
            <Card key={item.id} className="flex gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-couple-soft/50 text-2xl">
                🎁
              </span>
              <div className="flex-1">
                {item.isHiddenSurprise ? (
                  <>
                    <p className="text-sm font-bold text-ink">Sorpresa in arrivo…</p>
                    <p className="text-xs text-ink-soft">{partnerName} sta preparando qualcosa per te, niente spoiler 🤫</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-ink">{item.title}</p>
                    <p className="text-xs text-ink-soft">
                      aggiunto da {item.createdBy === selfId ? "te" : partnerName}
                      {formatPrice(item.price) ? ` · ${formatPrice(item.price)}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-couple-soft px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                        {targetLabel(item, selfId, partnerName)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_STYLES[item.priority]}`}>
                        {PRIORITY_LABELS[item.priority]}
                      </span>
                      {item.isSurprise && item.createdBy === selfId && (
                        <span className="rounded-full bg-cycle-soft px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                          🎁 sorpresa
                        </span>
                      )}
                      {item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-semibold text-couple underline"
                        >
                          link
                        </a>
                      )}
                    </div>
                  </>
                )}
              </div>
              {!showArchive && !item.isHiddenSurprise && (
                <button
                  onClick={() => complete(item.id)}
                  aria-label="Segna come completato"
                  className="h-8 w-8 shrink-0 self-center rounded-full border-2 border-success text-success transition active:scale-90"
                >
                  ✓
                </button>
              )}
              {showArchive && !item.isHiddenSurprise && (
                <button
                  onClick={() => reopen(item.id)}
                  aria-label="Riapri"
                  className="h-8 w-8 shrink-0 self-center rounded-full border-2 border-couple text-couple transition active:scale-90"
                >
                  ↺
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      {!showArchive && (
        <button
          onClick={() => setShowForm(true)}
          className="fixed bottom-20 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-couple text-2xl font-bold text-white shadow-[var(--shadow-soft)] transition active:scale-95"
          aria-label="Aggiungi alla wishlist"
        >
          +
        </button>
      )}

      {showForm && <WishlistFormModal onClose={() => setShowForm(false)} onSaved={handleCreated} />}
    </div>
  );
}
