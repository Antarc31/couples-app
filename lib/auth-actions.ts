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
  /** true se serve confermare l'email prima di poter accedere (nessuna sessione creata dalla signUp) — false se si è già loggati. */
  needsEmailConfirmation: boolean;
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

/**
 * Traduce i messaggi grezzi di Supabase Auth (sempre in inglese, spesso
 * tecnici — es. l'elenco letterale dei set di caratteri richiesti dalla
 * password) in un messaggio breve e comprensibile in italiano. Match sul
 * testo (l'SDK non espone sempre un codice errore stabile su ogni versione):
 * fallback al messaggio originale per qualunque errore non riconosciuto, mai
 * un buco silenzioso.
 */
function friendlyAuthErrorMessage(message: string): string {
  if (message.includes("Password should contain at least one character of each")) {
    return "La password deve contenere lettere maiuscole, minuscole e numeri (minimo 8 caratteri).";
  }
  if (message.includes("Password should be at least") || message.includes("Password should have at least")) {
    return "La password deve essere di almeno 8 caratteri.";
  }
  if (message.includes("Email not confirmed")) {
    return "Devi prima confermare la tua email: controlla la posta (anche lo spam) e apri il link di conferma, poi riprova ad accedere.";
  }
  if (message.includes("Invalid login credentials")) {
    return "Email o password non corretti.";
  }
  if (message.includes("User already registered")) {
    return "Esiste già un account con questa email.";
  }
  return message;
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
    options: {
      data: { display_name: params.displayName },
      // Il link nell'email di conferma deve passare da app/auth/callback/route.ts
      // (che scambia il `code` con una sessione vera) — senza questo la
      // conferma non si completava mai lato server, vedi commento lì.
      // window.location.origin funziona qui perché signUp() gira solo
      // client-side (chiamata da un form, mai da un Server Component).
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) return { error: friendlyAuthErrorMessage(error.message) };
  if (!data.user) return { error: "Registrazione non riuscita, riprova." };
  return {
    userId: data.user.id,
    email: data.user.email ?? params.email,
    displayName: params.displayName,
    // Nessuna sessione creata = il progetto richiede conferma email prima del login.
    needsEmailConfirmation: !data.session,
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
  if (error) return { error: friendlyAuthErrorMessage(error.message) };
  if (!data.user) return { error: "Accesso non riuscito, riprova." };
  return {
    userId: data.user.id,
    email: data.user.email ?? params.email,
    displayName: (data.user.user_metadata?.display_name as string | undefined) ?? null,
    needsEmailConfirmation: false,
  };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}

/**
 * Cancellazione account self-service (RPC `delete_own_account`, vedi
 * 20260902000000_delete_own_account.sql): cancella auth.users + tutti i dati
 * applicativi collegati via cascata. Fa anche signOut() dopo, perché la
 * sessione locale resterebbe altrimenti valida finché non scade (l'utente
 * non esiste più lato server, ma il client non lo saprebbe finché non prova
 * una richiesta autenticata).
 */
export async function deleteOwnAccount(): Promise<{ error: string } | { success: true }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("delete_own_account");
  if (error) return { error: error.message };
  await supabase.auth.signOut();
  return { success: true };
}

/**
 * Scioglie la coppia corrente (RPC `leave_couple`, vedi
 * 20260902010000_leave_couple.sql): a differenza di deleteOwnAccount, il
 * proprio account/login resta valido, quindi qui NON si fa signOut() — chi
 * lascia la coppia resta loggato e torna alla schermata di pairing.
 */
export async function leaveCouple(): Promise<{ error: string } | { success: true }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("leave_couple");
  if (error) return { error: error.message };
  return { success: true };
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
