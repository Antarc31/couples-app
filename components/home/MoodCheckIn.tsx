"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { getTodaysMood, logTodaysMood, type TodaysMood } from "@/lib/mood-actions";
import { MOOD_LABEL, MOOD_VALUES } from "@/lib/mood-display";
import { toDateKey } from "@/lib/calendar-dates";
import type { MoodType } from "@/types/database";

/** Chiave localStorage per "rimandato oggi": stato di comodo per-dispositivo, non serve sincronizzarlo lato server. */
function dismissedTodayKey(): string {
  return `mood-checkin-dismissed-${toDateKey(new Date())}`;
}

function isDismissedToday(): boolean {
  try {
    return localStorage.getItem(dismissedTodayKey()) === "1";
  } catch {
    return false;
  }
}

function dismissToday(): void {
  try {
    localStorage.setItem(dismissedTodayKey(), "1");
  } catch {
    // Nessun problema di correttezza se non persiste: al massimo il prompt ricompare.
  }
}

/**
 * Check-in emotivo quotidiano, in fondo alla Home. Appena rispondi la card
 * sparisce del tutto: nessun messaggio/toast in Home, né per "in attesa del
 * partner" né per la rivelazione — quel segnale arriva SOLO dalla campanella
 * notifiche (trigger notify_mood_checkin, già attivo lato DB, indipendente
 * da questo componente), su richiesta esplicita dell'utente. Per questo
 * niente più sottoscrizione realtime qui: non c'è più nulla in Home da
 * aggiornare dal vivo una volta risposto.
 *
 * Restyling design brief v2: niente più emoji come bottone (regola "niente
 * emoji nell'interfaccia") — MOOD_LABEL forniva già un'etichetta breve per
 * ciascun mood, usata qui come pillola di testo al posto del glifo.
 */
export default function MoodCheckIn() {
  const [mood, setMood] = useState<TodaysMood | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    getTodaysMood().then((result) => {
      if ("error" in result) setLoadError(result.error);
      else setMood(result);
    });
    setDismissed(isDismissedToday());
  }, []);

  async function handlePick(value: MoodType) {
    setSaving(true);
    setSubmitError(null);
    const result = await logTodaysMood(value);
    setSaving(false);
    if ("error" in result) {
      setSubmitError(result.error);
      return;
    }
    setMood(result);
  }

  function handleDismiss() {
    dismissToday();
    setDismissed(true);
  }

  // Ancora nessuno stato noto, errore, già risposto oggi, o rimandato:
  // nessun output in tutti questi casi — niente card, niente messaggio.
  if (loadError || !mood || mood.myMood !== null || dismissed) return null;

  return (
    <Card gradient="blush" className="flex flex-col gap-3">
      <h2 className="text-sm font-bold">Come va oggi?</h2>
      {submitError && <p className="text-xs text-white">{submitError}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        {MOOD_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            disabled={saving}
            onClick={() => handlePick(value)}
            aria-label={MOOD_LABEL[value]}
            className="rounded-full bg-white/20 px-4 py-2 text-sm font-semibold transition active:scale-90 disabled:opacity-50"
          >
            {MOOD_LABEL[value]}
          </button>
        ))}
      </div>
      <button type="button" onClick={handleDismiss} className="text-center text-xs text-white/80 underline">
        Più tardi
      </button>
    </Card>
  );
}
