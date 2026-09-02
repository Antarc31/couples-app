// =============================================================================
// Helper di refresh sessione da chiamare dal middleware Next.js.
// =============================================================================
// Questo file vive in lib/supabase/** (scope backend), ma va richiamato da
// un file `middleware.ts` nella ROOT del progetto (fuori dallo scope
// backend, di competenza frontend/lead) con contenuto minimo:
//
//   // middleware.ts (root del progetto)
//   import { type NextRequest } from "next/server";
//   import { updateSession } from "@/lib/supabase/middleware";
//
//   export async function middleware(request: NextRequest) {
//     return updateSession(request);
//   }
//
//   export const config = {
//     matcher: [
//       "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
//     ],
//   };
//
// Perché serve: i token di sessione Supabase scadono; senza questo
// middleware un access token scaduto non verrebbe rinnovato finché il
// browser non fa una richiesta che passi da un Server Component che lo
// rilegge, causando logout apparentemente casuali. Il middleware gira su
// ogni richiesta e rinnova i cookie di sessione, se necessario, prima che la
// richiesta arrivi alla route.
//
// Questo helper NON decide redirect di pagine protette/onboarding pairing:
// quella logica applicativa (es. "se non loggato -> /login", "se loggato ma
// non accoppiato -> /pairing") è responsabilità del frontend, da aggiungere
// nel middleware.ts di root dopo aver chiamato updateSession() e letto
// `user`/il profilo.
// =============================================================================

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Non aggiungere logica tra createServerClient e getUser(): getUser()
  // deve essere la prima chiamata per garantire che il token venga
  // rinnovato correttamente (pattern raccomandato da Supabase con
  // @supabase/ssr).
  await supabase.auth.getUser();

  return supabaseResponse;
}
