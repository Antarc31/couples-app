"use client";

import { useEffect, useState } from "react";
import { getMoodRevealForNotification, type MoodReveal } from "@/lib/mood-actions";
import { MOOD_EMOJI } from "@/lib/mood-display";
import { formatDayLabel } from "@/lib/calendar-dates";

/** "YYYY-MM-DD" -> Date locale a mezzanotte, senza passare da un parsing UTC che può far scivolare il giorno (stesso motivo del commento su toDateKey in lib/calendar-dates.ts). */
function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

interface MoodRevealSheetProps {
  sourceId: string;
  onClose: () => void;
  /** Chiamato se la notifica era un nudge "tocca a te" (non ancora rivelato) o se la riga sorgente non esiste più — porta al check-in invece di mostrare un dettaglio vuoto. */
  onNotReady: () => void;
}

/**
 * Bottom-sheet aperto dal tap su una notifica "check-in svelato"
 * (components/AppTopBar.tsx): la card del check-in in Home sparisce appena
 * rispondi, quindi questo è l'UNICO posto dove si vede davvero il risultato
 * — su richiesta esplicita dell'utente ("fallo apparire solo nelle
 * notifiche"). Stesso markup bottom-sheet già usato in tutto il progetto
 * (fixed inset-0 bg-scrim/30 backdrop-blur-sm + rounded-t-[28px]).
 */
export default function MoodRevealSheet({ sourceId, onClose, onNotReady }: MoodRevealSheetProps) {
  const [reveal, setReveal] = useState<MoodReveal | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMoodRevealForNotification(sourceId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        if (result.error === "not_ready") {
          onNotReady();
        } else {
          setError(result.error);
        }
        return;
      }
      setReveal(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-scrim/30 backdrop-blur-sm sm:items-center sm:justify-center" onClick={onClose}>
      <div
        className="flex w-full flex-col gap-4 rounded-t-[28px] bg-surface on-surface p-5 sm:max-w-sm sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">💛 Check-in emotivo</h2>
          <button type="button" onClick={onClose} className="text-xl text-ink-soft" aria-label="Chiudi">
            ✕
          </button>
        </div>

        {error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : !reveal ? (
          <p className="text-sm text-ink-soft">Caricamento…</p>
        ) : (
          <>
            <p className="text-xs text-ink-soft">{formatDayLabel(parseDateKey(reveal.checkinDate))}</p>
            <div className="flex items-center justify-around py-2">
              <div className="flex flex-col items-center gap-1">
                <span className="text-4xl">{reveal.myMood && MOOD_EMOJI[reveal.myMood]}</span>
                <span className="text-xs font-semibold text-ink-soft">Tu</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-4xl">{reveal.partnerMood && MOOD_EMOJI[reveal.partnerMood]}</span>
                <span className="text-xs font-semibold text-ink-soft">{reveal.partnerName}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
