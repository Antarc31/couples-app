import { redirect } from "next/navigation";
import { getCurrentCoupleData } from "@/lib/current-couple";
import WishlistView from "@/components/wishlist/WishlistView";

/**
 * Schermata Wishlist (Fase 2, docs/PLAN.md). Dati reali dal 2026-09-01
 * (tabella `wishlist_items` + view `wishlist_feed`, live e confermate da
 * main). getCurrentCoupleData() qui serve per selfId (distinguere "aggiunto
 * da te" vs dal partner) e il nome del partner da mostrare — una coppia ha
 * sempre e solo due persone, quindi non serve risolvere created_by via join
 * profiles per ogni riga: o è selfId o è il partner.
 */
export default async function WishlistPage() {
  const data = await getCurrentCoupleData();
  if (!data || !data.couple) redirect("/pairing");

  return <WishlistView selfId={data.userId} partnerName={data.partner?.displayName ?? "il partner"} />;
}
