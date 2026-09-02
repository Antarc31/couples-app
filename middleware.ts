// =============================================================================
// Middleware Next.js — rinnovo sessione Supabase su ogni richiesta.
// =============================================================================
// La logica vera e propria vive in lib/supabase/middleware.ts (`updateSession`,
// scope backend). Questo file è volutamente minimo: crea/rinnova i cookie di
// sessione Supabase prima che la richiesta arrivi a una route.
//
// Redirect applicativi (non loggato -> /login, loggato ma non accoppiato ->
// /pairing) NON sono gestiti qui: sono responsabilità del frontend/UI (da
// aggiungere qui dentro, dopo `updateSession`, quando le rotte relative
// esisteranno) per non accoppiare la logica di sessione a decisioni di
// navigazione che cambiano spesso.
// =============================================================================

import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
