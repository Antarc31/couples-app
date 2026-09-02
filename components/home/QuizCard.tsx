"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import {
  getTodaysQuiz,
  submitTodaysQuiz,
  confirmQuizGuess,
  getQuizScores,
  type TodaysQuiz,
  type QuizScores,
} from "@/lib/quiz-actions";

interface QuizCardProps {
  partnerName: string;
  partnerId: string;
  coupleId: string;
}

/** Quiz giornaliero "indovina il partner" (Fase B, redesign). Self-fetch client-side + realtime su quiz_answers per rivelazione/conferma senza refresh. */
export default function QuizCard({ partnerName, partnerId, coupleId }: QuizCardProps) {
  const [quiz, setQuiz] = useState<TodaysQuiz | null>(null);
  const [scores, setScores] = useState<QuizScores | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [truthDraft, setTruthDraft] = useState("");
  const [guessDraft, setGuessDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function refetch() {
    getTodaysQuiz().then((result) => {
      if ("error" in result) setLoadError(result.error);
      else setQuiz(result);
    });
    getQuizScores(partnerId).then((result) => {
      if (!("error" in result)) setScores(result);
    });
  }

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`quiz_answers:${coupleId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quiz_answers", filter: `couple_id=eq.${coupleId}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupleId]);

  async function handleSubmit() {
    if (!quiz) return;
    setSaving(true);
    setSubmitError(null);
    const result = await submitTodaysQuiz(quiz.questionId, truthDraft, guessDraft);
    setSaving(false);
    if ("error" in result) {
      setSubmitError(result.error);
      return;
    }
    setQuiz(result);
    setTruthDraft("");
    setGuessDraft("");
  }

  async function handleConfirm(answerId: string, correct: boolean) {
    setConfirmingId(answerId);
    setSubmitError(null);
    const result = await confirmQuizGuess(answerId, correct);
    setConfirmingId(null);
    if ("error" in result) {
      setSubmitError(result.error);
      return;
    }
    setQuiz(result);
    getQuizScores(partnerId).then((s) => {
      if (!("error" in s)) setScores(s);
    });
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">🧠 Quiz: indovina il partner</h2>
        {scores && (
          <span className="text-xs font-semibold text-ink-soft">
            Tu {scores.mine} — {scores.partner} {partnerName}
          </span>
        )}
      </div>

      {loadError ? (
        <p className="text-xs text-danger">{loadError}</p>
      ) : !quiz ? (
        <p className="text-xs text-ink-soft">Caricamento…</p>
      ) : (
        <>
          <p className="text-sm text-ink">{quiz.prompt}</p>
          {submitError && <p className="text-xs text-danger">{submitError}</p>}

          {quiz.revealed && quiz.mine && quiz.partner ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-2xl bg-base px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  La tua ipotesi su {partnerName}
                </p>
                <p className="text-sm text-ink">{quiz.mine.guess}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  La verità di {partnerName}
                </p>
                <p className="text-sm text-ink">{quiz.partner.truth}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {quiz.mine.guessCorrect === null
                    ? `In attesa che ${partnerName} confermi`
                    : quiz.mine.guessCorrect
                      ? "✅ Hai indovinato!"
                      : "❌ Non hai indovinato"}
                </p>
              </div>

              <div className="rounded-2xl bg-base px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  L&apos;ipotesi di {partnerName} su di te
                </p>
                <p className="text-sm text-ink">{quiz.partner.guess}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">La tua verità</p>
                <p className="text-sm text-ink">{quiz.mine.truth}</p>
                {quiz.partner.guessCorrect === null ? (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={confirmingId === quiz.partner.answerId}
                      onClick={() => quiz.partner && handleConfirm(quiz.partner.answerId, true)}
                      className="flex-1 rounded-[var(--radius-app)] bg-couple px-3 py-2 text-xs font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                    >
                      Ha indovinato
                    </button>
                    <button
                      type="button"
                      disabled={confirmingId === quiz.partner.answerId}
                      onClick={() => quiz.partner && handleConfirm(quiz.partner.answerId, false)}
                      className="flex-1 rounded-[var(--radius-app)] bg-surface border border-border px-3 py-2 text-xs font-semibold text-ink transition active:scale-[0.98] disabled:opacity-50"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-ink-soft">
                    {quiz.partner.guessCorrect ? "✅ Hai confermato: ha indovinato" : "❌ Hai confermato: non ha indovinato"}
                  </p>
                )}
              </div>
            </div>
          ) : quiz.mine !== null ? (
            <p className="rounded-2xl bg-base px-3 py-3 text-center text-xs text-ink-soft">
              Hai scritto! Appena scrive anche {partnerName} vedrete le ipotesi svelate.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">La tua risposta vera</span>
                <textarea
                  value={truthDraft}
                  onChange={(e) => setTruthDraft(e.target.value)}
                  placeholder="La verità su di te…"
                  rows={2}
                  className="w-full resize-none rounded-2xl bg-base px-3 py-2 text-sm text-ink outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  La tua ipotesi su {partnerName}
                </span>
                <textarea
                  value={guessDraft}
                  onChange={(e) => setGuessDraft(e.target.value)}
                  placeholder={`Cosa risponderebbe ${partnerName}?`}
                  rows={2}
                  className="w-full resize-none rounded-2xl bg-base px-3 py-2 text-sm text-ink outline-none"
                />
              </label>
              <Button
                type="button"
                size="sm"
                onClick={handleSubmit}
                disabled={saving || !truthDraft.trim() || !guessDraft.trim()}
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
