"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Brain, Trophy, Check, X } from "@/components/ui/icons";
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
  /** Stesso colore usato nel Calendario per distinguere i due partner (profiles.color) — riusato qui per il punteggio invece del corallo generico "di coppia". */
  selfColor: string;
  partnerColor: string;
}

/** Colore scuro di testo per i pannelli traslucidi (bg-white/40) sopra la card viola — il testo bianco ereditato dalla card non basta lì, serve un colore proprio. */
const PANEL_TEXT = "text-[#5b2172]";

/** Quiz giornaliero "indovina il partner" (Fase B, redesign). Self-fetch client-side + realtime su quiz_answers per rivelazione/conferma senza refresh. */
export default function QuizCard({ partnerName, partnerId, coupleId, selfColor, partnerColor }: QuizCardProps) {
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
    <Card gradient="violet" className="flex flex-col gap-3">
      <h2 className="flex items-center gap-1.5 text-sm font-bold">
        <Brain size={16} strokeWidth={2.2} />
        Indovina il partner
      </h2>

      {scores && (scores.mine > 0 || scores.partner > 0) && (
        <div className={`flex items-center justify-center gap-5 rounded-2xl bg-white/40 px-4 py-3 ${PANEL_TEXT}`}>
          <div className="flex flex-col items-center gap-0.5">
            <span className="flex h-5 items-center justify-center">
              {scores.mine > scores.partner && <Trophy size={15} strokeWidth={2.2} />}
            </span>
            <span className="text-2xl font-extrabold" style={{ color: selfColor }}>
              {scores.mine}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide">Tu</span>
          </div>
          <span className="text-base font-bold">—</span>
          <div className="flex flex-col items-center gap-0.5">
            <span className="flex h-5 items-center justify-center">
              {scores.partner > scores.mine && <Trophy size={15} strokeWidth={2.2} />}
            </span>
            <span className="text-2xl font-extrabold" style={{ color: partnerColor }}>
              {scores.partner}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide">{partnerName}</span>
          </div>
        </div>
      )}

      {loadError ? (
        <p className="rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-danger">{loadError}</p>
      ) : !quiz ? (
        <p className="text-xs text-white/80">Caricamento…</p>
      ) : (
        <>
          <p className="text-sm">{quiz.prompt}</p>
          {submitError && <p className="rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-danger">{submitError}</p>}

          {quiz.revealed && quiz.mine && quiz.partner ? (
            <div className="flex flex-col gap-3">
              <div className={`rounded-2xl bg-white/40 px-3 py-2 ${PANEL_TEXT}`}>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                  La tua ipotesi su {partnerName}
                </p>
                <p className="text-sm">{quiz.mine.guess}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-70">
                  La verità di {partnerName}
                </p>
                <p className="text-sm">{quiz.partner.truth}</p>
                <p className="mt-1 flex items-center gap-1 text-xs opacity-80">
                  {quiz.mine.guessCorrect === null ? (
                    `In attesa che ${partnerName} confermi`
                  ) : quiz.mine.guessCorrect ? (
                    <>
                      <Check size={13} strokeWidth={2.4} /> Hai indovinato!
                    </>
                  ) : (
                    <>
                      <X size={13} strokeWidth={2.4} /> Non hai indovinato
                    </>
                  )}
                </p>
              </div>

              <div className={`rounded-2xl bg-white/40 px-3 py-2 ${PANEL_TEXT}`}>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                  L&apos;ipotesi di {partnerName} su di te
                </p>
                <p className="text-sm">{quiz.partner.guess}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-70">La tua verità</p>
                <p className="text-sm">{quiz.mine.truth}</p>
                {quiz.partner.guessCorrect === null ? (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={confirmingId === quiz.partner.answerId}
                      onClick={() => quiz.partner && handleConfirm(quiz.partner.answerId, true)}
                      className="flex-1 rounded-[var(--radius-app)] bg-[#5b2172] px-3 py-2 text-xs font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                    >
                      Ha indovinato
                    </button>
                    <button
                      type="button"
                      disabled={confirmingId === quiz.partner.answerId}
                      onClick={() => quiz.partner && handleConfirm(quiz.partner.answerId, false)}
                      className={`flex-1 rounded-[var(--radius-app)] bg-white px-3 py-2 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-50 ${PANEL_TEXT}`}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 flex items-center gap-1 text-xs opacity-80">
                    {quiz.partner.guessCorrect ? (
                      <>
                        <Check size={13} strokeWidth={2.4} /> Hai confermato: ha indovinato
                      </>
                    ) : (
                      <>
                        <X size={13} strokeWidth={2.4} /> Hai confermato: non ha indovinato
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
          ) : quiz.mine !== null ? (
            <p className={`rounded-2xl bg-white/40 px-3 py-3 text-center text-xs opacity-90 ${PANEL_TEXT}`}>
              Hai scritto! Appena scrive anche {partnerName} vedrete le ipotesi svelate.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/80">
                  La tua risposta vera
                </span>
                <textarea
                  value={truthDraft}
                  onChange={(e) => setTruthDraft(e.target.value)}
                  placeholder="La verità su di te…"
                  rows={2}
                  className={`w-full resize-none rounded-2xl bg-white/40 px-3 py-2 text-sm placeholder:opacity-50 outline-none ${PANEL_TEXT}`}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/80">
                  La tua ipotesi su {partnerName}
                </span>
                <textarea
                  value={guessDraft}
                  onChange={(e) => setGuessDraft(e.target.value)}
                  placeholder={`Cosa risponderebbe ${partnerName}?`}
                  rows={2}
                  className={`w-full resize-none rounded-2xl bg-white/40 px-3 py-2 text-sm placeholder:opacity-50 outline-none ${PANEL_TEXT}`}
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
