"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { getTodaysMood, logTodaysMood, type TodaysMood } from "@/lib/mood-actions";
import { toDateKey } from "@/lib/calendar-dates";
import type { MoodType } from "@/types/database";

const MOOD_EMOJI: Record<MoodType, string> = {
  felice: "😊",
  sereno: "😌",
  stanco: "😴",
  stressato: "😣",
  triste: "😢",
  innamorato: "🥰",
};

const MOOD_LABEL: Record<MoodType, string> = {
  felice: "Felice",
  sereno: "Sereno/a",
  stanco: "Stanco/a",
  stressato: "Stressato/a",
  triste: "Triste",
  innamorato: "Innamorato/a",
};

const MOOD_VALUES = Object.keys(MOOD_EMOJI) as MoodType[];

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

interface MoodCheckInProps {
  partnerName: string;
  coupleId: string;
}

/**
 * Check-in emotivo quotidiano (Fase B, redesign): appare come overlay
 * bottom-sheet in primo piano appena la Home monta questo componente, se non
 * hai ancora risposto oggi e non l'hai "rimandato" — non una card scrollabile
 * come nella prima versione. Sottoscrizione realtime su mood_checkins:
 * se il partner risponde mentre hai l'app aperta, la rivelazione arriva
 * senza refresh.
 */
export default function MoodCheckIn({ partnerName, coupleId }: MoodCheckInProps) {
  const [mood, setMood] = useState<TodaysMood | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  function refetch() {
    getTodaysMood().then((result) => {
      if ("error" in result) setLoadError(result.error);
      else setMood(result);
    });
  }

  useEffect(() => {
    refetch();
    setDismissed(isDismissedToday());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`mood_checkins:${coupleId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mood_checkins", filter: `couple_id=eq.${coupleId}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupleId]);

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

  // Ancora nessuno stato noto (fetch in corso) o errore: niente overlay
  // fastidioso per un bonus non critico, semplicemente non si mostra nulla.
  if (loadError || !mood) return null;

  if (mood.myMood !== null) {
    return (
      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-ink">💛 Come ti senti oggi?</h2>
        {mood.revealed && mood.partnerMood ? (
          <div className="flex items-center justify-around">
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl">{MOOD_EMOJI[mood.myMood]}</span>
              <span className="text-xs text-ink-soft">Tu</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl">{MOOD_EMOJI[mood.partnerMood]}</span>
              <span className="text-xs text-ink-soft">{partnerName}</span>
            </div>
          </div>
        ) : (
          <p className="rounded-2xl bg-base px-3 py-3 text-center text-xs text-ink-soft">
            {MOOD_EMOJI[mood.myMood]} Registrato! Appena fa il check-in anche {partnerName} vedrete entrambi.
          </p>
        )}
      </Card>
    );
  }

  if (dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/30 backdrop-blur-sm" onClick={handleDismiss}>
      <div
        className="flex w-full flex-col gap-3 rounded-t-[28px] bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-ink">Come ti senti oggi?</h2>
        {submitError && <p className="text-xs text-danger">{submitError}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          {MOOD_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              disabled={saving}
              onClick={() => handlePick(value)}
              aria-label={MOOD_LABEL[value]}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-base text-3xl transition active:scale-90 disabled:opacity-50"
            >
              {MOOD_EMOJI[value]}
            </button>
          ))}
        </div>
        <button type="button" onClick={handleDismiss} className="text-center text-xs text-ink-soft underline">
          Più tardi
        </button>
      </div>
    </div>
  );
}
