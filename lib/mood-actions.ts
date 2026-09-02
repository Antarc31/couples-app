"use client";

/**
 * Azioni per il check-in emotivo quotidiano (Fase B del piano approvato).
 * Stessa forma esatta di lib/quiz-actions.ts (stesso pattern di rivelazione
 * reciproca RLS): la mia riga sempre visibile, quella del partner solo se ha
 * fatto anche lui/lei il check-in oggi.
 */

import { createClient } from "@/lib/supabase/client";
import { toDateKey } from "@/lib/calendar-dates";
import type { MoodType } from "@/types/database";

export interface ActionError {
  error: string;
}

export interface TodaysMood {
  myMood: MoodType | null;
  partnerMood: MoodType | null;
  revealed: boolean;
}

export async function getTodaysMood(): Promise<TodaysMood | ActionError> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const myId = userData?.user?.id;
  if (!myId) return { error: "Utente non autenticato" };

  const { data, error } = await supabase
    .from("mood_checkins")
    .select("profile_id, mood")
    .eq("checkin_date", toDateKey(new Date()));
  if (error) return { error: error.message };

  const rows = data ?? [];
  const mine = rows.find((row) => row.profile_id === myId);
  const partnerRow = rows.find((row) => row.profile_id !== myId);

  return {
    myMood: mine?.mood ?? null,
    partnerMood: partnerRow?.mood ?? null,
    revealed: Boolean(mine && partnerRow),
  };
}

/** Registra il mood di oggi (uno solo, immutabile) e ritorna lo stato aggiornato. */
export async function logTodaysMood(mood: MoodType): Promise<TodaysMood | ActionError> {
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

  const { error } = await supabase.from("mood_checkins").insert({
    couple_id: profile.couple_id,
    profile_id: user.id,
    checkin_date: toDateKey(new Date()),
    mood,
  });
  if (error) return { error: error.message };

  return getTodaysMood();
}
