"use client";

import { useState } from "react";
import { addDays, findUpcomingFreeSlots, formatDayLabel, formatTime } from "@/lib/calendar-dates";
import { listCoupleEventsInRange } from "@/lib/calendar-actions";

const DURATION_OPTIONS = [
  { label: "30 min", minutes: 30 },
  { label: "1 ora", minutes: 60 },
  { label: "1h 30", minutes: 90 },
  { label: "2 ore", minutes: 120 },
];

interface SlotSuggestionsProps {
  coupleId: string;
  from: Date;
  daysAhead: number;
  /** L'evento/appuntamento in modifica non deve contare come impegno contro se stesso. */
  excludeEventId?: string;
  /** `end` è sempre `start + durata scelta`, mai l'intera fascia libera trovata
   *  (l'utente potrebbe non voler occupare tutto il buco) — i campi restano
   *  comunque modificabili nel form dopo la precompilazione. */
  onPick: (start: Date, end: Date) => void;
}

/**
 * Blocco condiviso "quanto tempo ti serve?" + lista risultati, riusato in tre
 * punti: il bottom-sheet del pulsante indipendente "Trova buchi liberi"
 * (CalendarView) e inline in EventFormModal/AppointmentFormModal per
 * "Suggerisci slot orario". La richiesta della durata fa parte di questo
 * componente, quindi vale automaticamente ovunque venga montato — non serve
 * ripeterla nei tre chiamanti. Vedi piano approvato in
 * /Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md.
 */
export default function SlotSuggestions({ coupleId, from, daysAhead, excludeEventId, onPick }: SlotSuggestionsProps) {
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ start: Date; end: Date }[] | null>(null);

  async function pickDuration(minutes: number) {
    setDurationMinutes(minutes);
    setLoading(true);
    setError(null);
    setResults(null);

    const events = await listCoupleEventsInRange(coupleId, from, addDays(from, daysAhead));
    setLoading(false);
    if ("error" in events) {
      setError(events.error);
      return;
    }
    const filtered = excludeEventId ? events.filter((ev) => ev.id !== excludeEventId) : events;
    setResults(findUpcomingFreeSlots(filtered, from, daysAhead, minutes));
  }

  if (durationMinutes === null) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-ink-soft">Quanto tempo ti serve?</p>
        <div className="flex flex-wrap gap-2">
          {DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.minutes}
              type="button"
              onClick={() => pickDuration(opt.minutes)}
              className="rounded-full bg-couple-soft/50 px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-couple-soft"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-ink-soft">
          Slot liberi da {DURATION_OPTIONS.find((o) => o.minutes === durationMinutes)?.label}
        </p>
        <button
          type="button"
          onClick={() => {
            setDurationMinutes(null);
            setResults(null);
          }}
          className="shrink-0 text-xs font-semibold text-couple"
        >
          Cambia durata
        </button>
      </div>

      {loading && <p className="py-4 text-center text-xs text-ink-soft">Cerco slot liberi…</p>}
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {results && results.length === 0 && (
        <p className="py-4 text-center text-xs text-ink-soft">Nessuno slot libero trovato, prova una durata più corta.</p>
      )}

      {results && results.length > 0 && (
        <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {results.map((slot, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onPick(slot.start, new Date(slot.start.getTime() + durationMinutes * 60000))}
                className="flex w-full items-center justify-between rounded-xl bg-base px-3 py-2 text-left transition active:scale-[0.98]"
              >
                <span className="text-sm font-semibold capitalize text-ink">{formatDayLabel(slot.start)}</span>
                <span className="text-xs text-ink-soft">
                  {formatTime(slot.start.toISOString())} – {formatTime(slot.end.toISOString())}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
