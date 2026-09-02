"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { getTodaysQuiz, answerTodaysQuiz, type TodaysQuiz } from "@/lib/quiz-actions";

interface QuizCardProps {
  partnerName: string;
}

/** Quiz giornaliero "quanto mi conosci" (Fase B del piano). Self-fetch client-side, stesso schema di MemoriesDeck/ThrowbackCard. */
export default function QuizCard({ partnerName }: QuizCardProps) {
  const [quiz, setQuiz] = useState<TodaysQuiz | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTodaysQuiz().then((result) => {
      if (cancelled) return;
      if ("error" in result) setLoadError(result.error);
      else setQuiz(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit() {
    if (!quiz) return;
    setSaving(true);
    setSubmitError(null);
    const result = await answerTodaysQuiz(quiz.questionId, draft);
    setSaving(false);
    if ("error" in result) {
      setSubmitError(result.error);
      return;
    }
    setQuiz(result);
    setDraft("");
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-sm font-bold text-ink">🧠 Quiz &quot;quanto mi conosci&quot;</h2>

      {loadError ? (
        <p className="text-xs text-danger">{loadError}</p>
      ) : !quiz ? (
        <p className="text-xs text-ink-soft">Caricamento…</p>
      ) : (
        <>
          <p className="text-sm text-ink">{quiz.prompt}</p>

          {quiz.revealed ? (
            <div className="flex flex-col gap-2">
              <div className="rounded-2xl bg-base px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Tu</p>
                <p className="text-sm text-ink">{quiz.myAnswer}</p>
              </div>
              <div className="rounded-2xl bg-base px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{partnerName}</p>
                <p className="text-sm text-ink">{quiz.partnerAnswer}</p>
              </div>
            </div>
          ) : quiz.myAnswer !== null ? (
            <p className="rounded-2xl bg-base px-3 py-3 text-center text-xs text-ink-soft">
              Hai risposto! Appena risponde anche {partnerName} vedrete entrambe le risposte.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {submitError && <p className="text-xs text-danger">{submitError}</p>}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Scrivi la tua risposta…"
                rows={2}
                className="w-full resize-none rounded-2xl bg-base px-3 py-2 text-sm text-ink outline-none"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleSubmit}
                disabled={saving || !draft.trim()}
                className="w-full"
              >
                {saving ? "Invio…" : "Rispondi"}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
