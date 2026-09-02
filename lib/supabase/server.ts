// =============================================================================
// Client Supabase per Server Components / Server Actions / Route Handlers.
// =============================================================================
// Uso (Server Component, async):
//
//   import { createClient } from "@/lib/supabase/server";
//
//   export default async function Page() {
//     const supabase = await createClient();
//     const { data } = await supabase.from("calendar_events").select("*");
//     ...
//   }
//
// IMPORTANTE (Next.js 16, vedi node_modules/next/dist/docs/.../cookies.md):
// `cookies()` è async, quindi anche questo `createClient()` è async — va
// sempre awaitato. Non riutilizzare l'istanza tra richieste diverse: va
// creata una volta per request/Server Component (nessun singleton a livello
// di modulo, a differenza di un client "service role" tradizionale — qui il
// client porta con sé i cookie della richiesta corrente per rispettare la
// RLS come l'utente autenticato).
//
// `cookieStore.set` dentro Server Component può lanciare (Next.js permette
// di scrivere cookie solo da Server Action/Route Handler): l'errore viene
// ignorato di proposito qui, perché in quel caso la sessione viene comunque
// rinfrescata dal middleware (vedi lib/supabase/middleware.ts).
//
// Richiede le env var NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
// (vedi supabase/README.md).
// =============================================================================

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chiamato da un Server Component: la scrittura cookie non è
            // supportata lì. Ignorabile perché il middleware (vedi
            // lib/supabase/middleware.ts) rinfresca comunque la sessione.
          }
        },
      },
    },
  );
}
