"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import IconBadge from "@/components/ui/IconBadge";
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
  /** Precaricati da app/(app)/home/page.tsx lato server — se assenti (fallback), il componente si arrangia col proprio fetch client-side come prima. */
  initialQuiz?: TodaysQuiz;
  initialScores?: QuizScores;
}

/** Quiz giornaliero "indovina il partner" (Fase B, redesign). Self-fetch client-side + realtime su quiz_answers per rivelazione/conferma senza refresh. */
export default function QuizCard({
  partnerName,
  partnerId,
  coupleId,
  selfColor,
  partnerColor,
  initialQuiz,
  initialScores,
}: QuizCardProps) {
  const [quiz, setQuiz] = useState<TodaysQuiz | null>(initialQuiz ?? null);
  const [scores, setScores] = useState<QuizScores | null>(initialScores ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [truthDraft, setTruthDraft] = useState("");
  const [guessDraft, setGuessDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);

  // Ogni nuova domanda (giorno nuovo) riparte a carta coperta, anche se il
  // widget resta montato da ieri.
  useEffect(() => {
    setFlipped(false);
  }, [quiz?.questionId]);

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
    // initialQuiz precaricato lato server (vedi home/page.tsx): niente
    // fetch iniziale duplicato, il realtime sotto tiene comunque tutto
    // aggiornato da qui in poi.
    if (initialQuiz === undefined) refetch();
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
    // Torna a carta coperta: il fronte ora mostra "in attesa del partner",
    // non deve restare aperto sul form appena inviato.
    setFlipped(false);
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
      <div className="flex items-center gap-2">
        <IconBadge icon={Brain} size={32} />
        <h2 className="font-hand text-xl leading-none text-ink">indovina il partner</h2>
      </div>

      {scores && (
        <div className="flex items-center justify-center gap-5 rounded-2xl border border-dashed border-[color:var(--color-border)] bg-surface px-4 py-3">
          <div className="flex flex-col items-center gap-0.5">
            <span className="flex h-5 items-center justify-center text-couple">
              {scores.mine > scores.partner && <Trophy size={15} strokeWidth={2.2} />}
            </span>
            <span className="text-2xl font-extrabold" style={{ color: selfColor }}>
              {scores.mine}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Tu</span>
          </div>
          <span className="text-base font-bold text-ink-soft">—</span>
          <div className="flex flex-col items-center gap-0.5">
            <span className="flex h-5 items-center justify-center text-couple">
              {scores.partner > scores.mine && <Trophy size={15} strokeWidth={2.2} />}
            </span>
            <span className="text-2xl font-extrabold" style={{ color: partnerColor }}>
              {scores.partner}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{partnerName}</span>
          </div>
        </div>
      )}

      {loadError ? (
        <p className="text-xs text-danger">{loadError}</p>
      ) : !quiz ? (
        <p className="text-xs text-ink-soft">Caricamento…</p>
      ) : (
        <>
          {submitError && <p className="rounded-xl border border-dashed border-[color:var(--color-border)] bg-surface px-3 py-2 text-xs font-semibold text-danger">{submitError}</p>}

          {quiz.mine === null ? (
            !flipped ? (
              <button
                type="button"
                onClick={() => setFlipped(true)}
                aria-label="Rispondi alla domanda"
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[color:var(--color-border)] bg-surface px-4 py-10 text-center transition active:scale-[0.98]"
              >
                <p className="text-base font-semibold text-ink">{quiz.prompt}</p>
                <span className="text-xs font-bold uppercase tracking-wide text-couple">Tocca per rispondere</span>
              </button>
            ) : (
              <div className="flex flex-col gap-2 animate-toast-in">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    La tua risposta vera
                  </span>
                  <textarea
                    value={truthDraft}
                    onChange={(e) => setTruthDraft(e.target.value)}
                    placeholder="La verità su di te…"
                    rows={2}
                    className="w-full resize-none rounded-2xl border border-dashed border-[color:var(--color-border)] bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft outline-none"
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
                    className="w-full resize-none rounded-2xl border border-dashed border-[color:var(--color-border)] bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft outline-none"
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
            )
          ) : quiz.revealed && quiz.partner ? (
            !flipped ? (
              <button
                type="button"
                onClick={() => setFlipped(true)}
                aria-label="Scopri le risposte"
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[color:var(--color-border)] bg-surface px-4 py-10 text-center transition active:scale-[0.98]"
              >
                <p className="text-base font-semibold text-ink">{quiz.prompt}</p>
                <span className="text-xs font-bold uppercase tracking-wide text-couple">Tocca per scoprire</span>
              </button>
            ) : (
              <div className="flex flex-col gap-3 animate-toast-in">
                <div className="rounded-2xl border border-dashed border-[color:var(--color-border)] bg-surface px-3 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-couple">Tu</p>
                  <p className="mt-1 text-sm text-ink">{quiz.mine.guess}</p>
                  <p className="mt-2 text-xs text-ink-soft">
                    Verità di {partnerName}: {quiz.partner.truth}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
                    {quiz.mine.guessCorrect === null ? (
                      `In attesa che ${partnerName} confermi`
                    ) : quiz.mine.guessCorrect ? (
                      <>
                        <Check size={13} strokeWidth={2.4} className="text-success" /> Hai indovinato!
                      </>
                    ) : (
                      <>
                        <X size={13} strokeWidth={2.4} className="text-danger" /> Non hai indovinato
                      </>
                    )}
                  </p>
                </div>

                <div className="rounded-2xl border border-dashed border-[color:var(--color-border)] bg-surface px-3 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-couple">{partnerName}</p>
                  <p className="mt-1 text-sm text-ink">{quiz.partner.guess}</p>
                  <p className="mt-2 text-xs text-ink-soft">La tua verità: {quiz.mine.truth}</p>
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
                        className="flex-1 rounded-[var(--radius-app)] border border-dashed border-[color:var(--color-border)] bg-surface px-3 py-2 text-xs font-semibold text-ink transition active:scale-[0.98] disabled:opacity-50"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
                      {quiz.partner.guessCorrect ? (
                        <>
                          <Check size={13} strokeWidth={2.4} className="text-success" /> Hai confermato: ha
                          indovinato
                        </>
                      ) : (
                        <>
                          <X size={13} strokeWidth={2.4} className="text-danger" /> Hai confermato: non ha
                          indovinato
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[color:var(--color-border)] bg-surface px-4 py-10 text-center">
              <p className="text-base font-semibold text-ink">{quiz.prompt}</p>
              <span className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                Hai risposto! In attesa di {partnerName}…
              </span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
