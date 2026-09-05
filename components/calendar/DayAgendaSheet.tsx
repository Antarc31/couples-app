"use client";

import { formatDayLabel, formatTime } from "@/lib/calendar-dates";
import { eventColor, CATEGORY_LABELS, type CalendarEventRow, type ColorContext } from "@/lib/calendar-colors";
import Button from "@/components/ui/Button";

interface DayAgendaSheetProps {
  date: Date;
  events: CalendarEventRow[];
  colorCtx: ColorContext;
  onClose: () => void;
  onAddEvent: () => void;
  /** Piano UX punto 3: tap su un evento apre il dettaglio (Modifica/Elimina). */
  onEventClick?: (event: CalendarEventRow) => void;
}

export default function DayAgendaSheet({ date, events, colorCtx, onClose, onAddEvent, onEventClick }: DayAgendaSheetProps) {
  const sorted = [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-scrim/30 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-surface p-5 shadow-[var(--shadow-soft)] sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold capitalize text-ink">{formatDayLabel(date)}</h2>
          <button onClick={onClose} className="text-sm text-ink-soft" aria-label="Chiudi">
            ✕
          </button>
        </div>

        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft">Nessun evento in questo giorno.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => onEventClick?.(ev)}
                  className="flex w-full items-start gap-3 rounded-2xl bg-base p-3 text-left transition active:scale-[0.98]"
                >
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: eventColor(ev, colorCtx) }}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-ink">{ev.title}</p>
                    <p className="text-xs text-ink-soft">
                      {ev.all_day ? "Tutto il giorno" : formatTime(ev.starts_at)}
                      {!ev.all_day && ev.ends_at ? ` – ${formatTime(ev.ends_at)}` : ""}
                      {" · "}
                      {CATEGORY_LABELS[ev.category]}
                      {ev.tag ? ` · ${ev.tag}` : ""}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <Button className="mt-4 w-full" onClick={onAddEvent}>
          + Aggiungi evento
        </Button>
      </div>
    </div>
  );
}
