"use client";

/**
 * Azioni di autenticazione/pairing — implementazione reale su Supabase.
 *
 * Aggiornato dopo l'handoff del teammate "backend" (client pronti in
 * `lib/supabase/client.ts` + RPC `create_pairing_invite` / `accept_pairing_invite`
 * + tabella `profiles` in `types/database.ts`). Le firme sono rimaste
 * identiche allo stub precedente così le schermate auth/pairing non hanno
 * dovuto cambiare.
 *
 * Nota: usa il client browser (`@/lib/supabase/client`) perché queste
 * funzioni sono chiamate da form client-side (useState locale nelle
 * schermate di onboarding), non da Server Actions.
 */

import { createClient } from "@/lib/supabase/client";

export interface AuthResult {
  userId: string;
  email: string;
  displayName: string | null;
}

export interface AuthError {
  error: string;
}

export interface Session {
  userId: string;
  email: string;
  displayName: string | null;
  coupleId: string | null;
}

export async function signUp(params: {
  email: string;
  password: string;
  displayName: string;
}): Promise<AuthResult | AuthError> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: { data: { display_name: params.displayName } },
  });
  if (error) return { error: error.message };
  if (!data.user) return { error: "Registrazione non riuscita, riprova." };
  return {
    userId: data.user.id,
    email: data.user.email ?? params.email,
    displayName: params.displayName,
  };
}

export async function signIn(params: {
  email: string;
  password: string;
}): Promise<AuthResult | AuthError> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });
  if (error) return { error: error.message };
  if (!data.user) return { error: "Accesso non riuscito, riprova." };
  return {
    userId: data.user.id,
    email: data.user.email ?? params.email,
    displayName: (data.user.user_metadata?.display_name as string | undefined) ?? null,
  };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}

/** Sessione + profilo (display_name, couple_id) dell'utente corrente, o null se non loggato. */
export async function getSession(): Promise<Session | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, couple_id")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? "",
    displayName: profile?.display_name ?? null,
    coupleId: profile?.couple_id ?? null,
  };
}

/** RPC create_pairing_invite() -> codice testuale da condividere col partner. */
export async function createPairingInvite(): Promise<{ code: string } | AuthError> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_pairing_invite");
  if (error) return { error: error.message };
  if (!data) return { error: "Impossibile generare il codice, riprova." };
  return { code: data };
}

/** RPC accept_pairing_invite({ invite_code }) -> uuid couple, poi risolve il nome del partner. */
export async function acceptPairingInvite(
  code: string,
): Promise<{ coupleId: string; partnerName: string } | AuthError> {
  const supabase = createClient();
  const { data: coupleId, error } = await supabase.rpc("accept_pairing_invite", {
    invite_code: code.trim(),
  });
  if (error) return { error: error.message };
  if (!coupleId) return { error: "Codice non valido o scaduto." };

  let partnerName = "il tuo partner";
  try {
    const { data: userData } = await supabase.auth.getUser();
    const { data: couple } = await supabase
      .from("couples")
      .select("partner_1_id, partner_2_id")
      .eq("id", coupleId)
      .maybeSingle();
    const myId = userData?.user?.id;
    const partnerId =
      couple && myId ? (couple.partner_1_id === myId ? couple.partner_2_id : couple.partner_1_id) : null;
    if (partnerId) {
      const { data: partnerProfile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", partnerId)
        .maybeSingle();
      partnerName = partnerProfile?.display_name ?? partnerName;
    }
  } catch {
    // Non bloccante: se non riusciamo a risolvere il nome del partner
    // mostriamo comunque il pairing riuscito con un nome generico.
  }

  return { coupleId, partnerName };
}
