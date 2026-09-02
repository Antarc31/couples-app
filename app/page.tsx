import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Entry point "/": nessuna UI propria, solo instradamento in base allo stato
 * di sessione/pairing. Il middleware (root) rinnova solo i cookie di
 * sessione, i redirect applicativi vivono qui come da commento in
 * middleware.ts.
 *
 *   non loggato          -> /login
 *   loggato, non accoppiato -> /pairing
 *   loggato e accoppiato -> /home
 */
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("couple_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.couple_id) redirect("/pairing");

  redirect("/home");
}
