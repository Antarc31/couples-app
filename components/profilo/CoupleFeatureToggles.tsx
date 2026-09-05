"use client";

/**
 * Due switch per attivare/disattivare quiz e check-in emotivo per la coppia
 * (Fase B, redesign — impostazione di coppia condivisa, non del singolo
 * utente, coerente con relationship_start_date). Montato in Profilo solo se
 * l'utente è accoppiato (le RPC sottostanti falliscono esplicitamente
 * altrimenti, stesso principio già usato per la sezione anniversario di
 * ProfileEditForm).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import { setQuizEnabled, setMoodCheckinEnabled } from "@/lib/profile-actions";

interface CoupleFeatureTogglesProps {
  quizEnabled: boolean;
  moodCheckinEnabled: boolean;
}

function ToggleRow({
  label,
  description,
  enabled,
  saving,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-xs text-ink-soft">{description}</p>
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={onToggle}
        aria-pressed={enabled}
        className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-50 ${
          enabled ? "bg-couple text-white" : "bg-surface on-surface border border-border text-ink-soft"
        }`}
      >
        {enabled ? "Attivo" : "Disattivato"}
      </button>
    </div>
  );
}

export default function CoupleFeatureToggles({ quizEnabled, moodCheckinEnabled }: CoupleFeatureTogglesProps) {
  const router = useRouter();
  const [quiz, setQuiz] = useState(quizEnabled);
  const [mood, setMood] = useState(moodCheckinEnabled);
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [savingMood, setSavingMood] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggleQuiz() {
    const next = !quiz;
    setSavingQuiz(true);
    setError(null);
    const result = await setQuizEnabled(next);
    setSavingQuiz(false);
    if (result !== true) {
      setError(result.error);
      return;
    }
    setQuiz(next);
    router.refresh();
  }

  async function handleToggleMood() {
    const next = !mood;
    setSavingMood(true);
    setError(null);
    const result = await setMoodCheckinEnabled(next);
    setSavingMood(false);
    if (result !== true) {
      setError(result.error);
      return;
    }
    setMood(next);
    router.refresh();
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-bold text-ink">Funzionalità di coppia</h2>
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <ToggleRow
        label="Quiz quotidiano"
        description="Una domanda al giorno, indovinate a vicenda le risposte"
        enabled={quiz}
        saving={savingQuiz}
        onToggle={handleToggleQuiz}
      />
      <ToggleRow
        label="Check-in emotivo"
        description="Un tap al giorno su come vi sentite"
        enabled={mood}
        saving={savingMood}
        onToggle={handleToggleMood}
      />
    </Card>
  );
}
