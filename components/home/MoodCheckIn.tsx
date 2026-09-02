"use client";

import { useEffect, useRef, useState } from "react";
import Card from "@/components/ui/Card";
import Toast from "@/components/ui/Toast";
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
 * Check-in emotivo quotidiano (in fondo alla Home, non più un overlay in
 * primo piano — su richiesta esplicita dell'utente). Appena rispondi la
 * card sparisce: resta solo un Toast temporaneo ("in attesa del partner",
 * poi "svelato" quando risponde anche lui/lei via realtime) invece di una
 * card persistente che occupa spazio. Nessun toast al primo caricamento
 * della pagina, solo sulle transizioni di stato effettive (vedi
 * `applyMood`), per non "spammare" un evento che in realtà è già noto.
 */
export default function MoodCheckIn({ partnerName, coupleId }: MoodCheckInProps) {
  const [mood, setMood] = useState<TodaysMood | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const previousMoodRef = useRef<TodaysMood | null>(null);

  function applyMood(next: TodaysMood) {
    const previous = previousMoodRef.current;
    if (previous) {
      if (previous.myMood === null && next.myMood !== null && !next.revealed) {
        setToast(`In attesa della risposta di ${partnerName}…`);
      } else if (!previous.revealed && next.revealed && next.myMood && next.partnerMood) {
        setToast(`${MOOD_EMOJI[next.myMood]} Tu — ${MOOD_EMOJI[next.partnerMood]} ${partnerName}`);
      }
    }
    previousMoodRef.current = next;
    setMood(next);
  }

  function refetch() {
    getTodaysMood().then((result) => {
      if ("error" in result) setLoadError(result.error);
      else applyMood(result);
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
    applyMood(result);
  }

  function handleDismiss() {
    dismissToday();
    setDismissed(true);
  }

  const activeToast = toast && <Toast message={toast} onDismiss={() => setToast(null)} />;

  // Ancora nessuno stato noto (fetch in corso) o errore: niente card per un
  // bonus non critico — solo l'eventuale toast in coda da una transizione precedente.
  if (loadError || !mood) return activeToast;

  // Già risposto oggi: nessuna card persistente, solo l'eventuale toast.
  if (mood.myMood !== null) return activeToast;

  if (dismissed) return activeToast;

  return (
    <>
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink">💛 Come ti senti oggi?</h2>
        {submitError && <p className="text-xs text-danger">{submitError}</p>}
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
        <button type="button" onClick={handleDismiss} className="text-center text-xs text-ink-soft underline">
          Più tardi
        </button>
      </Card>
      {activeToast}
    </>
  );
}
