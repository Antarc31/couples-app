/**
 * Route handler per il ritorno dai link di Supabase Auth (conferma email,
 * eventuale reset password futuro): con `@supabase/ssr` il link punta qui
 * con un `?code=...` da scambiare con una sessione vera (cookie) tramite
 * `exchangeCodeForSession` — passo prima mancante del tutto nel progetto,
 * per questo la conferma email non si completava mai lato server nonostante
 * il link sembrasse "funzionare" (il browser veniva comunque reindirizzato
 * sull'app, solo senza che nulla elaborasse il codice).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=conferma_non_riuscita`);
}
