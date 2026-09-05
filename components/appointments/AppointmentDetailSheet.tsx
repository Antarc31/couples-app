"use client";

import { useState } from "react";
import { formatDayLabel, formatTime } from "@/lib/calendar-dates";
import { deleteAppointment, type Appointment } from "@/lib/appointments-actions";
import type { LinkedEvent } from "@/components/appointments/AppointmentsView";
import Button from "@/components/ui/Button";

interface AppointmentDetailSheetProps {
  appointment: Appointment;
  /** calendar_event collegato, se confermato e risolto — assente per le idee. */
  event?: LinkedEvent;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

function formatCost(cost: number | null): string | null {
  if (cost == null) return null;
  return Number.isInteger(cost) ? `~${cost}€` : `~${cost.toFixed(2)}€`;
}

/**
 * Bottom sheet di dettaglio appuntamento (idea o confermato), stesso
 * pattern di components/calendar/EventDetailSheet.tsx. A differenza di
 * quello, nessun controllo "canEdit": la RLS `appointments_update_couple`/
 * `appointments_delete_couple` permette già a entrambi i partner di
 * modificare/eliminare qualunque appuntamento della coppia (un appuntamento
 * è per natura un piano condiviso, non personale), quindi qui i bottoni
 * Modifica/Elimina sono sempre visibili.
 */
export default function AppointmentDetailSheet({
  appointment,
  event,
  onClose,
  onEdit,
  onDeleted,
}: AppointmentDetailSheetProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteAppointment(appointment.id);
    setDeleting(false);
    if (result !== true) {
      setError(result.error);
      return;
    }
    onDeleted();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/30 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-surface on-surface p-5 shadow-[var(--shadow-soft)] sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border sm:hidden" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-ink">{appointment.title}</h2>
            <p className="text-xs text-ink-soft">
              {appointment.status === "confermato" ? "Confermato" : "Idea"}
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-ink-soft" aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-1.5 rounded-2xl bg-base p-3 text-sm text-ink">
          {appointment.status === "confermato" && (
            <p>
              <span className="font-semibold">Quando: </span>
              {event
                ? `${formatDayLabel(new Date(event.startsAt))}${event.allDay ? "" : `, ${formatTime(event.startsAt)}`}`
                : "senza data"}
            </p>
          )}
          {appointment.location && (
            <p>
              <span className="font-semibold">Luogo: </span>
              {appointment.location}
            </p>
          )}
          {formatCost(appointment.cost) && (
            <p>
              <span className="font-semibold">Costo: </span>
              {formatCost(appointment.cost)}
            </p>
          )}
          {appointment.tag && (
            <p>
              <span className="font-semibold">Tag: </span>
              {appointment.tag}
            </p>
          )}
          {appointment.notes && (
            <p>
              <span className="font-semibold">Note: </span>
              {appointment.notes}
            </p>
          )}
        </div>

        {error && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

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
              <p className="text-sm text-danger">Eliminare definitivamente questo appuntamento?</p>
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
      </div>
    </div>
  );
}
