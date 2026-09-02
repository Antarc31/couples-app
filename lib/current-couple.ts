// =============================================================================
// Helper server-side condiviso: profilo utente corrente + coppia + partner.
// =============================================================================
// Usato dalle pagine sotto app/(app)/ (Home, Profilo) dopo che il layout
// app/(app)/layout.tsx ha già verificato che l'utente sia loggato e
// accoppiato — qui NON si fa redirect, si ritorna null se qualcosa manca,
// così ogni pagina decide come degradare (in pratica non dovrebbe mai
// succedere dato il guard nel layout).
// =============================================================================

import { createClient } from "@/lib/supabase/server";

export interface CurrentCoupleData {
  userId: string;
  email: string;
  displayName: string | null;
  color: string;
  /** profiles.birth_date dell'utente corrente (non del partner). Vedi lib/profile-actions.ts per come si modifica. */
  birthDate: string | null;
  partner: { id: string; displayName: string | null; color: string } | null;
  couple: { id: string; relationshipStartDate: string | null } | null;
}

export async function getCurrentCoupleData(): Promise<CurrentCoupleData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, color, couple_id, birth_date")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  let partner: CurrentCoupleData["partner"] = null;
  let couple: CurrentCoupleData["couple"] = null;

  if (profile.couple_id) {
    const { data: coupleRow } = await supabase
      .from("couples")
      .select("id, partner_1_id, partner_2_id, relationship_start_date")
      .eq("id", profile.couple_id)
      .maybeSingle();

    if (coupleRow) {
      couple = { id: coupleRow.id, relationshipStartDate: coupleRow.relationship_start_date };
      const partnerId = coupleRow.partner_1_id === user.id ? coupleRow.partner_2_id : coupleRow.partner_1_id;
      const { data: partnerProfile } = await supabase
        .from("profiles")
        .select("id, display_name, color")
        .eq("id", partnerId)
        .maybeSingle();
      if (partnerProfile) {
        partner = {
          id: partnerProfile.id,
          displayName: partnerProfile.display_name,
          color: partnerProfile.color,
        };
      }
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
}
