"use client";

/**
 * Azioni per il quiz giornaliero "quanto mi conosci" (Fase B del piano
 * approvato, /Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md).
 * Stesso pattern di lib/wishlist-actions.ts: client browser Supabase per
 * funzione, error mapping a {error: string}.
 *
 * La domanda del giorno è la stessa per tutte le coppie (confermato con
 * l'utente) e viene calcolata qui, deterministicamente, senza alcuno stato
 * salvato lato DB — stesso principio già seguito per traguardi/throwback
 * (nessun cron nel progetto). `quiz_questions` è ordinata per `id` (uuid):
 * un ordine stabile e identico su ogni client, non l'ordine di inserimento.
 */

import { createClient } from "@/lib/supabase/client";
import { toDateKey } from "@/lib/calendar-dates";

export interface ActionError {
  error: string;
}

export interface TodaysQuiz {
  questionId: string;
  prompt: string;
  myAnswer: string | null;
  /** Valorizzata SOLO quando `revealed` è true — se null e revealed è false, il partner non ha ancora risposto (o la RLS la nasconde comunque). */
  partnerAnswer: string | null;
  revealed: boolean;
}

// Data di ancoraggio della rotazione: arbitraria ma fissa — cambiarla in
// futuro sposterebbe quale domanda cade in quale giorno per tutte le coppie.
const QUIZ_EPOCH = new Date(2026, 0, 1);
const MS_PER_DAY = 86400000;

function quizIndexForDate(date: Date, totalQuestions: number): number {
  const daysSinceEpoch = Math.floor((date.getTime() - QUIZ_EPOCH.getTime()) / MS_PER_DAY);
  return ((daysSinceEpoch % totalQuestions) + totalQuestions) % totalQuestions;
}

/** Domanda di oggi + stato delle risposte (mia sempre visibile, del partner solo se ha risposto anche lui/lei oggi — la RLS lo garantisce già). */
export async function getTodaysQuiz(): Promise<TodaysQuiz | ActionError> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const myId = userData?.user?.id;
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
    .select("profile_id, answer")
    .eq("answer_date", toDateKey(today));
  if (answersError) return { error: answersError.message };

  const rows = answers ?? [];
  const mine = rows.find((row) => row.profile_id === myId);
  const partnerRow = rows.find((row) => row.profile_id !== myId);

  return {
    questionId: question.id,
    prompt: question.prompt,
    myAnswer: mine?.answer ?? null,
    partnerAnswer: partnerRow?.answer ?? null,
    revealed: Boolean(mine && partnerRow),
  };
}

/** Invia la risposta di oggi (una sola, immutabile) e ritorna lo stato aggiornato. */
export async function answerTodaysQuiz(questionId: string, answer: string): Promise<TodaysQuiz | ActionError> {
  const trimmed = answer.trim();
  if (!trimmed) return { error: "La risposta non può essere vuota." };

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
    answer: trimmed,
  });
  if (error) return { error: error.message };

  return getTodaysQuiz();
}
