"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createWishlistItem } from "@/lib/wishlist-actions";
import { listUpcomingCoupleEvents, type UpcomingEventOption } from "@/lib/calendar-actions";
import { formatDateShort } from "@/lib/calendar-dates";
import type { WishlistPriority, WishlistTarget } from "@/types/database";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

const PRIORITY_OPTIONS: { value: WishlistPriority; label: string }[] = [
  { value: "bassa", label: "Bassa" },
  { value: "media", label: "Media" },
  { value: "alta", label: "Alta" },
];

const TARGET_OPTIONS: { value: WishlistTarget; label: string }[] = [
  { value: "self", label: "Per me" },
  { value: "partner", label: "Per il partner" },
  { value: "entrambi", label: "Per entrambi" },
];

interface WishlistFormModalProps {
  onClose: () => void;
  /** Chiamato a successo salvataggio: il chiamante ricarica la lista e chiude. */
  onSaved: () => void;
}

/**
 * Form nuovo elemento wishlist (docs/PLAN.md sezione "Wishlist"). Collegato
 * a lib/wishlist-actions.ts (dati reali, tabella `wishlist_items` live dal
 * 2026-09-01).
 *
 * Modalità sorpresa: il checkbox compare per target "partner" O "entrambi"
 * (vincolo DB reale `wishlist_items_surprise_requires_partner_target`: solo
 * target "self" la esclude, non solo "partner" come si potrebbe pensare a
 * naso). Il filtro dei dettagli per il destinatario avviene lato server
 * (view `wishlist_feed`, vedi WishlistView.tsx) — questo form si limita a
 * impostare il flag, non decide chi vede cosa.
 */
export default function WishlistFormModal({ onClose, onSaved }: WishlistFormModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<WishlistPriority>("media");
  const [price, setPrice] = useState("");
  const [link, setLink] = useState("");
  const [target, setTarget] = useState<WishlistTarget>("self");
  const [isSurprise, setIsSurprise] = useState(false);
  const [linkedEventId, setLinkedEventId] = useState<string>("");
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEventOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSurprise = target === "partner" || target === "entrambi";

  // Caricati solo quando servono davvero (si apre la modalità sorpresa), non
  // ad ogni apertura del form: il selettore è opzionale e poco usato.
  useEffect(() => {
    if (!canSurprise || !isSurprise || upcomingEvents.length > 0) return;
    listUpcomingCoupleEvents().then((result) => {
      if (!("error" in result)) setUpcomingEvents(result);
    });
  }, [canSurprise, isSurprise, upcomingEvents.length]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);

    const result = await createWishlistItem({
      // Categoria rimossa dalla UI (piano "sezioni per me/partner/entrambi"):
      // "regalo" fisso, non più scelto dall'utente — vedi commento in
      // WishlistView.tsx sul perché la distinzione regalo/attività di coppia
      // è stata tolta (ridondante col Calendario/Appuntamenti).
      category: "regalo",
      target,
      title: title.trim(),
      description: description.trim() || undefined,
      price: price.trim() ? Number(price) : undefined,
      link: link.trim() || undefined,
      priority,
      isSurprise: canSurprise && isSurprise,
      linkedCalendarEventId: canSurprise && isSurprise && linkedEventId ? linkedEventId : undefined,
    });

    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-scrim/30 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-surface p-5 shadow-[var(--shadow-soft)] sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border sm:hidden" />
        <h2 className="mb-4 text-lg font-extrabold text-ink">Nuovo desiderio</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            type="text"
            placeholder="Titolo (es. Cuffie wireless)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />

          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink-soft">Per chi</p>
            <div className="flex gap-2">
              {TARGET_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setTarget(opt.value);
                    if (opt.value === "self") setIsSurprise(false);
                  }}
                  className={`flex-1 rounded-2xl border px-2 py-2 text-xs font-semibold transition ${
                    target === opt.value ? "border-transparent bg-couple text-white" : "border-border text-ink-soft"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {canSurprise && (
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                checked={isSurprise}
                onChange={(e) => setIsSurprise(e.target.checked)}
                className="h-4 w-4 rounded accent-[var(--color-couple)]"
              />
              🎁 Modalità sorpresa (nascondi i dettagli fino al completamento)
            </label>
          )}

          {canSurprise && isSurprise && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-ink-soft">
                Collega a un evento del calendario (opzionale)
              </p>
              <select
                value={linkedEventId}
                onChange={(e) => setLinkedEventId(e.target.value)}
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] text-ink outline-none focus:border-partner-a focus:ring-2 focus:ring-partner-a-soft"
              >
                <option value="">Nessun evento collegato</option>
                {upcomingEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} — {formatDateShort(ev.startsAt)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink-soft">Priorità</p>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPriority(opt.value)}
                  className={`flex-1 rounded-2xl border px-2 py-2 text-xs font-semibold transition ${
                    priority === opt.value ? "border-transparent bg-couple text-white" : "border-border text-ink-soft"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="Prezzo indicativo in € (opzionale)"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <Input type="url" placeholder="Link (opzionale)" value={link} onChange={(e) => setLink(e.target.value)} />
          <textarea
            placeholder="Descrizione (opzionale)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] text-ink placeholder:text-ink-soft outline-none focus:border-partner-a focus:ring-2 focus:ring-partner-a-soft"
          />

          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" className="flex-1" disabled={saving || !title.trim()}>
              {saving ? "Salvo…" : "Aggiungi"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
