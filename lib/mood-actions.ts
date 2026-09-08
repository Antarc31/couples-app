"use client";

/**
 * Azioni per il check-in emotivo quotidiano (Fase B). Stessa forma di
 * lib/quiz-actions.ts (stesso pattern di rivelazione reciproca RLS): la mia
 * riga sempre visibile, quella del partner solo se ha fatto anche lui/lei
 * il check-in quel giorno.
 *
 * getMoodForDate/getMoodRevealForNotification servono al tap sulla notifica
 * "check-in svelato" (components/MoodRevealSheet.tsx): la card in Home
 * sparisce appena rispondi (su richiesta esplicita dell'utente, nessun
 * messaggio persistente lì), quindi l'unico modo per vedere il risultato è
 * riaprirlo dalla notifica — che riferisce una data/riga specifica, non
 * necessariamente "oggi" (l'utente potrebbe aprirla il giorno dopo).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { toDateKey } from "@/lib/calendar-dates";
import type { Database, MoodType } from "@/types/database";

/** Vedi lib/messages-actions.ts per il perché di questo contesto opzionale (chiamata da Home lato server). */
interface ServerFetchContext {
  client: SupabaseClient<Database>;
  userId: string;
}

export interface ActionError {
  error: string;
}

export interface TodaysMood {
  myMood: MoodType | null;
  /** Valorizzata solo se myMood === "altro". */
  myCustomLabel: string | null;
  partnerMood: MoodType | null;
  /** Valorizzata solo se partnerMood === "altro" ED è visibile (revealed). */
  partnerCustomLabel: string | null;
  /** Valorizzato solo se partnerMood è visibile (revealed) — RLS lo garantisce comunque. */
  partnerName: string | null;
  revealed: boolean;
}

interface MoodRow {
  profile_id: string;
  mood: MoodType;
  mood_custom_label: string | null;
  profiles: unknown;
}

function partnerDisplayName(row: MoodRow): string | null {
  return (row.profiles as unknown as { display_name: string | null } | null)?.display_name ?? "Partner";
}

/** Stato del check-in per una data specifica (self-riga sempre visibile, partner solo se rivelato — RLS). */
export async function getMoodForDate(checkinDate: string, ctx?: ServerFetchContext): Promise<TodaysMood | ActionError> {
  const supabase = ctx?.client ?? createClient();
  const myId = ctx?.userId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!myId) return { error: "Utente non autenticato" };

  const { data, error } = await supabase
    .from("mood_checkins")
    .select("profile_id, mood, mood_custom_label, profiles!mood_checkins_profile_id_fkey(display_name)")
    .eq("checkin_date", checkinDate);
  if (error) return { error: error.message };

  const rows = (data ?? []) as unknown as MoodRow[];
  const mineRow = rows.find((row) => row.profile_id === myId);
  const partnerRow = rows.find((row) => row.profile_id !== myId);

  return {
    myMood: mineRow?.mood ?? null,
    myCustomLabel: mineRow?.mood_custom_label ?? null,
    partnerMood: partnerRow?.mood ?? null,
    partnerCustomLabel: partnerRow?.mood_custom_label ?? null,
    partnerName: partnerRow ? partnerDisplayName(partnerRow) : null,
    revealed: Boolean(mineRow && partnerRow),
  };
}

/** Stato del check-in di oggi. */
export async function getTodaysMood(ctx?: ServerFetchContext): Promise<TodaysMood | ActionError> {
  return getMoodForDate(toDateKey(new Date()), ctx);
}

/**
 * Registra il mood di oggi (uno solo, immutabile) e ritorna lo stato
 * aggiornato. `customLabel` è obbligatorio (non vuoto) quando `mood ===
 * "altro"`, ignorato per tutti gli altri valori (mai scritto a metà: o c'è
 * un'etichetta scritta a mano valida, o "altro" non si può salvare).
 */
export async function logTodaysMood(mood: MoodType, customLabel?: string): Promise<TodaysMood | ActionError> {
  const trimmedLabel = customLabel?.trim() || null;
  if (mood === "altro" && !trimmedLabel) {
    return { error: "Scrivi come ti senti." };
  }

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
    mood_custom_label: mood === "altro" ? trimmedLabel : null,
  });
  if (error) return { error: error.message };

  return getTodaysMood();
}

export interface MoodReveal extends TodaysMood {
  checkinDate: string;
}

/**
 * Risolve la data del check-in a partire dal source_id di una notifica
 * "check-in svelato"/"tocca a te" (mood_checkins.id), poi ne ritorna lo
 * stato completo. Se la riga non è (ancora) leggibile per il chiamante — la
 * notifica era un nudge "tocca a te", non la rivelazione — la query per id
 * ritorna semplicemente nessuna riga (RLS la nasconde, nessun errore): il
 * chiamante (MoodRevealSheet) interpreta "not found" come "non ancora
 * pronto" e reindirizza al check-in invece di mostrare un dettaglio vuoto.
 */
export async function getMoodRevealForNotification(sourceId: string): Promise<MoodReveal | ActionError> {
  const supabase = createClient();

  const { data: sourceRow, error: sourceError } = await supabase
    .from("mood_checkins")
    .select("checkin_date")
    .eq("id", sourceId)
    .maybeSingle();
  if (sourceError) return { error: sourceError.message };
  if (!sourceRow) return { error: "not_ready" };

  const result = await getMoodForDate(sourceRow.checkin_date);
  if ("error" in result) return result;
  if (!result.revealed) return { error: "not_ready" };

  return { ...result, checkinDate: sourceRow.checkin_date };
}
