"use client";

import { useEffect, useState } from "react";
import { formatDayLabel, formatRecurrenceSummary, formatTime } from "@/lib/calendar-dates";
import { eventColor, CATEGORY_LABELS, type CalendarEventRow, type ColorContext } from "@/lib/calendar-colors";
import { deleteCalendarEvent } from "@/lib/calendar-actions";
import { getLinkedSurprise, type LinkedSurprise } from "@/lib/wishlist-actions";
import Button from "@/components/ui/Button";

interface EventDetailSheetProps {
  event: CalendarEventRow;
  selfId: string;
  colorCtx: ColorContext;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

/**
 * Bottom sheet di dettaglio evento (piano UX "Gruppo Calendario/
 * Appuntamenti", punto 3): aperto al tap su un evento, sia da
 * DayAgendaSheet sia da DayTimeline. Due azioni "Modifica"/"Elimina" con
 * conferma inline a due step prima della delete (niente `window.confirm`,
 * coerente con lo stile del resto dell'app).
 */
export default function EventDetailSheet({ event, selfId, colorCtx, onClose, onEdit, onDeleted }: EventDetailSheetProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedSurprise, setLinkedSurprise] = useState<LinkedSurprise | null>(null);

  // Fase D: se una sorpresa attiva è collegata a questo evento, un banner
  // discreto lo anticipa senza mai rivelarne il contenuto (getLinkedSurprise
  // ritorna solo created_by, mai title/price/ecc — vedi lib/wishlist-actions.ts).
  useEffect(() => {
    let cancelled = false;
    getLinkedSurprise(event.id).then((result) => {
      if (!cancelled && result && !("error" in result)) setLinkedSurprise(result);
    });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  // Rispecchia lato client la RLS calendar_events_update_own_or_couple_category
  // / _delete_own_or_couple_category (supabase/migrations/20260831120100_calendar_events.sql):
  // il creatore può sempre modificare/eliminare, il partner solo per categoria
  // 'coppia'. Solo per non mostrare azioni destinate a fallire — la RLS resta
  // l'unica vera fonte di verità, nessuna nuova migration necessaria qui.
  const canEdit = event.created_by === selfId || event.category === "coppia";

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteCalendarEvent(event.id);
    setDeleting(false);
    if (result !== true) {
      setError(result.error);
      return;
    }
    onDeleted();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-surface p-5 shadow-[var(--shadow-soft)] sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border sm:hidden" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span
              className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: eventColor(event, colorCtx) }}
            />
            <div>
              <h2 className="text-lg font-extrabold text-ink">{event.title}</h2>
              <p className="text-xs capitalize text-ink-soft">{formatDayLabel(new Date(event.starts_at))}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-sm text-ink-soft" aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-1.5 rounded-2xl bg-base p-3 text-sm text-ink">
          <p>
            <span className="font-semibold">Quando: </span>
            {event.all_day
              ? "Tutto il giorno"
              : `${formatTime(event.starts_at)}${event.ends_at ? ` – ${formatTime(event.ends_at)}` : ""}`}
          </p>
          <p>
            <span className="font-semibold">Categoria: </span>
            {CATEGORY_LABELS[event.category]}
            {event.tag ? ` · ${event.tag}` : ""}
          </p>
          {event.recurrence !== "nessuna" && (
            <p className="inline-flex w-fit items-center gap-1 rounded-full bg-special-soft px-2.5 py-1 text-xs font-semibold text-ink">
              🔁{" "}
              {formatRecurrenceSummary(
                event.recurrence,
                event.recurrence_interval,
                event.recurrence_until,
                event.recurrence_count,
              )}
            </p>
          )}
          {event.notes && (
            <p>
              <span className="font-semibold">Note: </span>
              {event.notes}
            </p>
          )}
        </div>

        {linkedSurprise && (
          <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-couple-soft px-3 py-1.5 text-xs font-semibold text-ink">
            🎁{" "}
            {linkedSurprise.createdBy === selfId
              ? "Hai una sorpresa in arrivo per questo giorno"
              : `${linkedSurprise.creatorName ?? "Il tuo partner"} ha una sorpresa per te`}
          </p>
        )}

        {error && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        {canEdit ? (
          <div className="mt-4 flex flex-col gap-2">
            {!confirmingDelete ? (
              <div className="flex gap-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={onEdit}>
                  Modifica
                </Button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="flex-1 rounded-[var(--radius-app)] border border-danger px-5 py-3 text-[15px] font-semibold text-danger transition active:scale-[0.98]"
                >
                  Elimina
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 rounded-2xl bg-danger/10 p-3">
                <p className="text-sm text-danger">Eliminare definitivamente questo evento?</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                  >
                    Annulla
                  </Button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 rounded-[var(--radius-app)] bg-danger px-5 py-3 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {deleting ? "Elimino…" : "Conferma eliminazione"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-center text-xs text-ink-soft">
            Solo chi ha creato questo evento può modificarlo o eliminarlo.
          </p>
        )}
      </div>
    </div>
  );
}
