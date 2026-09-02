import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppTabBar from "@/components/AppTabBar";
import AppTopBar from "@/components/AppTopBar";

/**
 * Shell delle schermate autenticate: verifica sessione + pairing (stessa
 * logica di app/page.tsx, ma qui protegge tutte le rotte /home, /calendario,
 * /appuntamenti, /wishlist, /profilo), poi renderizza la top bar (campanella
 * notifiche) e la bottom tab bar.
 */
export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
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

  return (
    <div className="flex flex-1 flex-col">
      <AppTopBar userId={user.id} />
      <div className="flex flex-1 flex-col overflow-y-auto pb-4">{children}</div>
      <AppTabBar />
    </div>
  );
}
