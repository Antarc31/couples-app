"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { getTodaysMood, logTodaysMood, type TodaysMood } from "@/lib/mood-actions";
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

interface MoodCheckInCardProps {
  partnerName: string;
}

/** Check-in emotivo quotidiano (Fase B del piano). Stessa forma di QuizCard, un tap invece di un testo. */
export default function MoodCheckInCard({ partnerName }: MoodCheckInCardProps) {
  const [mood, setMood] = useState<TodaysMood | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTodaysMood().then((result) => {
      if (cancelled) return;
      if ("error" in result) setLoadError(result.error);
      else setMood(result);
    });
    return () => {
      cancelled = true;
    };
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

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-sm font-bold text-ink">💛 Come ti senti oggi?</h2>

      {loadError ? (
        <p className="text-xs text-danger">{loadError}</p>
      ) : !mood ? (
        <p className="text-xs text-ink-soft">Caricamento…</p>
      ) : (
        <>
          {submitError && <p className="text-xs text-danger">{submitError}</p>}

          {mood.revealed && mood.myMood && mood.partnerMood ? (
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
          ) : mood.myMood !== null ? (
            <p className="rounded-2xl bg-base px-3 py-3 text-center text-xs text-ink-soft">
              {MOOD_EMOJI[mood.myMood]} Registrato! Appena fa il check-in anche {partnerName} vedrete entrambi.
            </p>
          ) : (
            <div className="flex flex-wrap justify-center gap-2">
              {MOOD_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={saving}
                  onClick={() => handlePick(value)}
                  aria-label={MOOD_LABEL[value]}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-base text-2xl transition active:scale-90 disabled:opacity-50"
                >
                  {MOOD_EMOJI[value]}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
