// =============================================================================
// Client Supabase per componenti browser ("use client").
// =============================================================================
// Uso:
//
//   "use client";
//   import { createClient } from "@/lib/supabase/client";
//
//   const supabase = createClient();
//   const { data, error } = await supabase.from("calendar_events").select("*");
//
// Non fare cache/singleton a livello di modulo di questo client: crearne uno
// nuovo per ogni componente/hook che lo usa è l'approccio raccomandato da
// Supabase con @supabase/ssr (il client è leggero, gestisce internamente il
// parsing dei cookie di sessione lato browser).
//
// Richiede le env var NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
// (vedi supabase/README.md per come ottenerle in locale o da un progetto
// cloud).
// =============================================================================

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
