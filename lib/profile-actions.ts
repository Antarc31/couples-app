"use client";

/**
 * Azioni per la schermata Profilo (piano approvato in
 * /Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md,
 * "Feature B — Eventi 'speciale' automatici"): data di nascita e data di
 * inizio relazione. Impostare l'una o l'altra fa scattare (lato DB, vedi
 * supabase/migrations/20260901060000_profile_birth_date_and_special_events.sql)
 * la generazione/aggiornamento automatico dell'evento calendario categoria
 * 'speciale' collegato — nessuna logica applicativa in più necessaria qui,
 * questo modulo si limita a scrivere le due colonne sorgente.
 *
 * Stesso pattern di lib/messages-actions.ts / lib/appointments-actions.ts:
 * client browser Supabase, chiamato da componenti client-side (non Server
 * Actions).
 */

import { createClient } from "@/lib/supabase/client";

export interface ActionError {
  error: string;
}

/**
 * Aggiorna profiles.birth_date per l'utente autenticato corrente (RLS
 * `profiles_update_self` lo permette già, nessuna RPC necessaria — a
 * differenza di relationship_start_date, che vive su `couples` e quindi
 * richiede la RPC set_relationship_start_date sotto). Passare `null` svuota
 * la data (cancella anche l'evento "Compleanno" collegato, vedi trigger
 * `handle_profile_birthday_event`).
 */
export async function updateBirthDate(birthDate: string | null): Promise<true | ActionError> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { error: "Utente non autenticato" };

  const { error } = await supabase.from("profiles").update({ birth_date: birthDate }).eq("id", user.id);

  if (error) return { error: error.message };
  return true;
}

/** Aggiorna profiles.display_name (il nickname mostrato ovunque nell'app) per l'utente autenticato corrente. */
export async function updateDisplayName(displayName: string): Promise<true | ActionError> {
  const trimmed = displayName.trim();
  if (!trimmed) return { error: "Il nickname non può essere vuoto." };

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { error: "Utente non autenticato" };

  const { error } = await supabase.from("profiles").update({ display_name: trimmed }).eq("id", user.id);

  if (error) return { error: error.message };
  return true;
}

/**
 * Imposta couples.relationship_start_date per la coppia dell'utente
 * autenticato via la RPC `set_relationship_start_date` già esistente (vedi
 * supabase/migrations/20260831190100_couples_relationship_start_date_rpc.sql
 * — unico modo per scrivere quella colonna, `couples` non ha policy UPDATE
 * dirette per `authenticated`). Fallisce esplicitamente (errore leggibile
 * dalla RPC) se l'utente non è ancora accoppiato: chi chiama questa funzione
 * deve verificare `isPaired` prima di mostrare il form, stesso principio già
 * usato per `EventDetailSheet.canEdit`.
 */
export async function setRelationshipStartDate(date: string): Promise<true | ActionError> {
  const trimmed = date.trim();
  if (!trimmed) return { error: "La data non può essere vuota." };

  const supabase = createClient();
  const { error } = await supabase.rpc("set_relationship_start_date", { p_date: trimmed });

  if (error) return { error: error.message };
  return true;
}

/** Attiva/disattiva il quiz giornaliero per la coppia (RPC set_quiz_enabled, stesso schema di setRelationshipStartDate). */
export async function setQuizEnabled(enabled: boolean): Promise<true | ActionError> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_quiz_enabled", { p_enabled: enabled });
  if (error) return { error: error.message };
  return true;
}

/** Attiva/disattiva il check-in emotivo per la coppia (RPC set_mood_checkin_enabled). */
export async function setMoodCheckinEnabled(enabled: boolean): Promise<true | ActionError> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_mood_checkin_enabled", { p_enabled: enabled });
  if (error) return { error: error.message };
  return true;
}
