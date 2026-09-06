import { redirect } from "next/navigation";
import { getCurrentCoupleData } from "@/lib/current-couple";
import AppTabBar from "@/components/AppTabBar";
import AppTopBar from "@/components/AppTopBar";

/**
 * Shell delle schermate autenticate: verifica sessione + pairing (stessa
 * logica di app/page.tsx, ma qui protegge tutte le rotte /home, /calendario,
 * /appuntamenti, /wishlist, /profilo), poi renderizza la top bar (campanella
 * notifiche) e la bottom tab bar.
 *
 * Usa getCurrentCoupleData() invece di query proprie: essendo avvolta in
 * cache() (vedi lib/current-couple.ts), la stessa identica chiamata fatta
 * poco dopo da Home/Profilo per i propri dati riusa questo risultato invece
 * di rifare da capo utente+profilo+coppia — un solo round-trip verso
 * Supabase condiviso tra layout e pagina, non due.
 */
export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const data = await getCurrentCoupleData();
  if (!data) redirect("/login");
  if (!data.couple) redirect("/pairing");

  return (
    <div className="flex flex-1 flex-col">
      <AppTopBar userId={data.userId} />
      <div className="flex flex-1 flex-col overflow-y-auto pb-4">{children}</div>
      <AppTabBar />
    </div>
  );
}
