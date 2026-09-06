"use client";

/**
 * Azioni per il quiz giornaliero "indovina il partner" (Fase B del piano
 * approvato, redesign dopo la prima versione — vedi
 * /Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md).
 * Ogni risposta contiene sia la verità di chi risponde sia la sua ipotesi su
 * cosa risponderebbe il partner; una volta rivelato, chi possiede la verità
 * conferma manualmente se l'ipotesi era corretta (RPC confirm_quiz_guess) —
 * il punteggio individuale è il conteggio delle conferme positive, calcolato
 * in lettura, nessuna tabella punteggio da mantenere sincronizzata.
 *
 * Stesso pattern di lib/wishlist-actions.ts: client browser Supabase per
 * funzione, error mapping a {error: string}.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { toDateKey } from "@/lib/calendar-dates";
import type { Database } from "@/types/database";

export interface ActionError {
  error: string;
}

/** Vedi lib/messages-actions.ts per il perché di questo contesto opzionale (chiamata da Home lato server). */
interface ServerFetchContext {
  client: SupabaseClient<Database>;
  userId: string;
}

export interface QuizSide {
  answerId: string;
  truth: string;
  guess: string;
  /** null = non ancora confermata da chi possiede la verità. */
  guessCorrect: boolean | null;
}

export interface TodaysQuiz {
  questionId: string;
  prompt: string;
  /** null se non ho ancora scritto oggi. */
  mine: QuizSide | null;
  /** valorizzato SOLO quando `revealed` è true (la RLS lo garantisce comunque). */
  partner: QuizSide | null;
  revealed: boolean;
}

// Data di ancoraggio della rotazione del pool domande: arbitraria ma fissa —
// cambiarla sposterebbe quale domanda cade in quale giorno per tutte le coppie.
const QUIZ_EPOCH = new Date(2026, 0, 1);
const MS_PER_DAY = 86400000;

function quizIndexForDate(date: Date, totalQuestions: number): number {
  const daysSinceEpoch = Math.floor((date.getTime() - QUIZ_EPOCH.getTime()) / MS_PER_DAY);
  return ((daysSinceEpoch % totalQuestions) + totalQuestions) % totalQuestions;
}

interface QuizAnswerRow {
  id: string;
  profile_id: string;
  my_truth: string;
  my_guess: string;
  guess_correct: boolean | null;
}

function mapRowToSide(row: QuizAnswerRow): QuizSide {
  return { answerId: row.id, truth: row.my_truth, guess: row.my_guess, guessCorrect: row.guess_correct };
}

/** Domanda di oggi + stato delle risposte (la mia sempre visibile, quella del partner solo se ha scritto anche lui/lei oggi — RLS). */
export async function getTodaysQuiz(ctx?: ServerFetchContext): Promise<TodaysQuiz | ActionError> {
  const supabase = ctx?.client ?? createClient();
  const myId = ctx?.userId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!myId) return { error: "Utente non autenticato" };

  const { data: questions, error: questionsError } = await supabase
    .from("quiz_questions")
    .select("id, prompt")
    .order("id", { ascending: true });
  if (questionsError) return { error: questionsError.message };
  if (!questions || questions.length === 0) return { error: "Nessuna domanda disponibile." };

  const today = new Date();
  const question = questions[quizIndexForDate(today, questions.length)];

  const { data: answers, error: answersError } = await supabase
    .from("quiz_answers")
    .select("id, profile_id, my_truth, my_guess, guess_correct")
    .eq("answer_date", toDateKey(today));
  if (answersError) return { error: answersError.message };

  const rows = answers ?? [];
  const mineRow = rows.find((row) => row.profile_id === myId);
  const partnerRow = rows.find((row) => row.profile_id !== myId);

  return {
    questionId: question.id,
    prompt: question.prompt,
    mine: mineRow ? mapRowToSide(mineRow) : null,
    partner: partnerRow ? mapRowToSide(partnerRow) : null,
    revealed: Boolean(mineRow && partnerRow),
  };
}

/** Invia la risposta di oggi (verità + ipotesi, una sola volta, immutabile) e ritorna lo stato aggiornato. */
export async function submitTodaysQuiz(
  questionId: string,
  truth: string,
  guess: string,
): Promise<TodaysQuiz | ActionError> {
  const trimmedTruth = truth.trim();
  const trimmedGuess = guess.trim();
  if (!trimmedTruth || !trimmedGuess) return { error: "Compila sia la tua risposta sia la tua ipotesi." };

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { error: "Utente non autenticato" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("couple_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.couple_id) return { error: "Non sei accoppiato/a con un partner." };

  const { error } = await supabase.from("quiz_answers").insert({
    couple_id: profile.couple_id,
    profile_id: user.id,
    answer_date: toDateKey(new Date()),
    question_id: questionId,
    my_truth: trimmedTruth,
    my_guess: trimmedGuess,
  });
  if (error) return { error: error.message };

  return getTodaysQuiz();
}

/** Conferma se l'ipotesi del PARTNER su di te era corretta (RPC confirm_quiz_guess) e ritorna lo stato aggiornato. */
export async function confirmQuizGuess(answerId: string, correct: boolean): Promise<TodaysQuiz | ActionError> {
  const supabase = createClient();
  const { error } = await supabase.rpc("confirm_quiz_guess", { p_answer_id: answerId, p_correct: correct });
  if (error) return { error: error.message };

  return getTodaysQuiz();
}

export interface QuizScores {
  mine: number;
  partner: number;
}

/** Punteggio individuale cumulativo: conteggio delle ipotesi confermate corrette, per profilo. Nessuna tabella punteggio: sempre corretto per costruzione. */
export async function getQuizScores(partnerId: string, ctx?: ServerFetchContext): Promise<QuizScores | ActionError> {
  const supabase = ctx?.client ?? createClient();
  const myId = ctx?.userId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!myId) return { error: "Utente non autenticato" };

  const [mineResult, partnerResult] = await Promise.all([
    supabase
      .from("quiz_answers")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", myId)
      .eq("guess_correct", true),
    supabase
      .from("quiz_answers")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", partnerId)
      .eq("guess_correct", true),
  ]);

  if (mineResult.error) return { error: mineResult.error.message };
  if (partnerResult.error) return { error: partnerResult.error.message };

  return { mine: mineResult.count ?? 0, partner: partnerResult.count ?? 0 };
}
