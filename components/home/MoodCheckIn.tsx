"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import IconBadge from "@/components/ui/IconBadge";
import { Smile } from "@/components/ui/icons";
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
interface MoodCheckInProps {
  /** Precaricato da app/(app)/home/page.tsx lato server — se assente (fallback), il componente si arrangia col proprio fetch client-side come prima. */
  initialMood?: TodaysMood;
}

export default function MoodCheckIn({ initialMood }: MoodCheckInProps) {
  const [mood, setMood] = useState<TodaysMood | null>(initialMood ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customDraft, setCustomDraft] = useState("");

  useEffect(() => {
    if (initialMood === undefined) {
      getTodaysMood().then((result) => {
        if ("error" in result) setLoadError(result.error);
        else setMood(result);
      });
    }
    setDismissed(isDismissedToday());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialMood è solo il seed iniziale (server), non va ri-osservato.
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

  async function handleCustomSubmit() {
    setSaving(true);
    setSubmitError(null);
    const result = await logTodaysMood("altro", customDraft);
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
    <Card className="theme-mood widget-inner flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <IconBadge icon={Smile} size={32} />
        <h2 className="text-lg leading-none text-ink">Come va oggi?</h2>
      </div>
      {submitError && <p className="text-xs text-danger">{submitError}</p>}
      {showCustomInput ? (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            placeholder="Come ti senti?"
            autoFocus
            className="w-full rounded-full border border-dashed border-[color:var(--color-border)] bg-surface px-4 py-2 text-sm text-ink placeholder:text-ink-soft outline-none"
          />
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCustomInput(false);
                setCustomDraft("");
                setSubmitError(null);
              }}
              className="rounded-full px-4 py-2 text-sm font-semibold text-ink-soft"
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={saving || !customDraft.trim()}
              onClick={handleCustomSubmit}
              className="rounded-full bg-couple px-4 py-2 text-sm font-semibold text-surface transition active:scale-90 disabled:opacity-50"
            >
              {saving ? "Salvo…" : "Salva"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          {MOOD_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              disabled={saving}
              onClick={() => handlePick(value)}
              aria-label={MOOD_LABEL[value]}
              className="rounded-full border border-dashed border-[color:var(--color-border)] bg-surface px-4 py-2 text-sm font-semibold text-ink transition active:scale-90 disabled:opacity-50"
            >
              {MOOD_LABEL[value]}
            </button>
          ))}
          <button
            type="button"
            disabled={saving}
            onClick={() => setShowCustomInput(true)}
            aria-label="Altro"
            className="rounded-full border border-dashed border-[color:var(--color-border)] bg-surface px-4 py-2 text-sm font-semibold text-ink transition active:scale-90 disabled:opacity-50"
          >
            Altro
          </button>
        </div>
      )}
      {!showCustomInput && (
        <button type="button" onClick={handleDismiss} className="text-center text-xs text-ink-soft underline">
          Più tardi
        </button>
      )}
    </Card>
  );
}
