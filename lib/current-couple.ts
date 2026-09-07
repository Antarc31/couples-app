// =============================================================================
// Helper server-side condiviso: profilo utente corrente + coppia + partner.
// =============================================================================
// Usato dalle pagine sotto app/(app)/ (Home, Profilo) dopo che il layout
// app/(app)/layout.tsx ha già verificato che l'utente sia loggato e
// accoppiato — qui NON si fa redirect, si ritorna null se qualcosa manca,
// così ogni pagina decide come degradare (in pratica non dovrebbe mai
// succedere dato il guard nel layout).
// =============================================================================

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface CurrentCoupleData {
  userId: string;
  email: string;
  displayName: string | null;
  color: string;
  /** profiles.birth_date dell'utente corrente (non del partner). Vedi lib/profile-actions.ts per come si modifica. */
  birthDate: string | null;
  partner: { id: string; displayName: string | null; color: string } | null;
  couple: {
    id: string;
    relationshipStartDate: string | null;
    quizEnabled: boolean;
    moodCheckinEnabled: boolean;
  } | null;
}

/**
 * Forma della riga restituita dalla query embedded qui sotto — usata solo
 * per `.returns<>()`, dato che postgrest-js non infierisce da solo il tipo
 * di un embed multi-hop con alias su FK ambigue (couples ha due FK verso
 * profiles). I nomi dei vincoli (profiles_couple_id_fkey,
 * couples_partner_1_id_fkey, couples_partner_2_id_fkey) sono quelli reali
 * dello schema, vedi types/database.ts "Relationships" per lo stesso elenco
 * generato dal DB.
 */
interface ProfileWithCoupleRow {
  display_name: string | null;
  color: string;
  couple_id: string | null;
  birth_date: string | null;
  couple: {
    id: string;
    relationship_start_date: string | null;
    quiz_enabled: boolean;
    mood_checkin_enabled: boolean;
    // Tipati nullable anche se in teoria sempre presenti quando c'è una
    // couple (ogni couple ha esattamente due partner, vincolo DB): il tipo
    // riflette che un embed RLS/dato inconsistente potrebbe comunque
    // restituire null qui, e il codice sotto lo gestisce esplicitamente
    // invece di assumerlo per certo.
    partner_1: { id: string; display_name: string | null; color: string } | null;
    partner_2: { id: string; display_name: string | null; color: string } | null;
  } | null;
}

/**
 * cache() (React, non specifico di Next.js) de-duplica le chiamate a questa
 * funzione all'interno dello STESSO request/render: app/(app)/layout.tsx la
 * chiama per il guard di autenticazione/pairing, poi ogni pagina (Home,
 * Profilo) la richiama per i propri dati. Senza cache() sarebbero due
 * round-trip completi e identici verso Supabase a ogni navigazione; con
 * cache() la seconda chiamata riusa il risultato già calcolato dal layout,
 * a costo zero.
 */
export const getCurrentCoupleData = cache(async (): Promise<CurrentCoupleData | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Un'unica query invece di profilo -> coppia -> profilo del partner in
  // sequenza (prima erano 3 round-trip separati): PostgREST segue le
  // foreign key già presenti nello schema per fare i join lato DB,
  // partner_1/partner_2 disambiguati per nome vincolo perché couples ha
  // DUE FK verso profiles. RLS invariata (profiles_select_self_or_partner,
  // couples_select_members permettono già esattamente questa lettura) —
  // qui cambia solo QUANTI round-trip servono per ottenerla, non cosa si
  // può leggere.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      `display_name, color, couple_id, birth_date,
       couple:couples!profiles_couple_id_fkey (
         id, relationship_start_date, quiz_enabled, mood_checkin_enabled,
         partner_1:profiles!couples_partner_1_id_fkey ( id, display_name, color ),
         partner_2:profiles!couples_partner_2_id_fkey ( id, display_name, color )
       )`,
    )
    .eq("id", user.id)
    .maybeSingle()
    .returns<ProfileWithCoupleRow>();
  // Un errore qui (query malformata, permessi) non deve mai far crashare la
  // pagina intera con un 500: si logga e si degrada come "profilo non
  // trovato", stesso comportamento del ramo `!profile` sotto.
  if (profileError) console.error("getCurrentCoupleData: query profilo fallita", profileError);
  if (!profile) return null;

  let partner: CurrentCoupleData["partner"] = null;
  let couple: CurrentCoupleData["couple"] = null;

  if (profile.couple) {
    const c = profile.couple;
    const { partner_1: partnerOne, partner_2: partnerTwo } = c;
    // partnerOne/partnerTwo dovrebbero essere sempre presenti quando c'è una
    // couple (ogni couple ha esattamente due partner, per vincolo DB) — il
    // controllo esplicito è solo per non far crashare l'intera Home con un
    // errore 500 nel caso mai capitasse un embed incompleto (RLS/dato
    // inconsistente): meglio degradare a "non accoppiato" che rompere tutto.
    if (partnerOne && partnerTwo) {
      couple = {
        id: c.id,
        relationshipStartDate: c.relationship_start_date,
        quizEnabled: c.quiz_enabled,
        moodCheckinEnabled: c.mood_checkin_enabled,
      };
      const partnerRow = partnerOne.id === user.id ? partnerTwo : partnerOne;
      partner = { id: partnerRow.id, displayName: partnerRow.display_name, color: partnerRow.color };
    } else {
      console.error("getCurrentCoupleData: couple trovata ma partner_1/partner_2 mancanti nell'embed", c);
    }
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    displayName: profile.display_name,
    color: profile.color,
    birthDate: profile.birth_date,
    partner,
    couple,
  };
});
