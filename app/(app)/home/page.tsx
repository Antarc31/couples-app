import { redirect } from "next/navigation";
import { getCurrentCoupleData } from "@/lib/current-couple";
import { createClient } from "@/lib/supabase/server";
import { daysBetween, nextOccurrence } from "@/lib/calendar-dates";
import CountdownHeader from "@/components/home/CountdownHeader";
import MemoriesDeck from "@/components/home/MemoriesDeck";
import UpcomingEventsCard from "@/components/home/UpcomingEventsCard";
import WishlistPreviewCard from "@/components/home/WishlistPreviewCard";

export default async function HomePage() {
  const data = await getCurrentCoupleData();
  if (!data || !data.couple) redirect("/pairing");

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [{ data: upcoming }, { data: specialEvents }, { data: wishlistPreview }] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("*")
      .eq("couple_id", data.couple.id)
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(3),
    supabase.from("calendar_events").select("*").eq("couple_id", data.couple.id).eq("category", "speciale"),
    supabase
      .from("wishlist_feed")
      .select(
        "id, created_by, category, is_hidden_surprise, title, price, is_surprise",
      )
      .eq("status", "attivo")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  let nextSpecial: { label: string; daysUntil: number } | null = null;
  if (specialEvents && specialEvents.length > 0) {
    const withOccurrence = specialEvents
      .map((ev) => ({ ev, occurrence: nextOccurrence(ev.starts_at, ev.recurrence) }))
      .sort((a, b) => a.occurrence.getTime() - b.occurrence.getTime());
    const next = withOccurrence[0];
    nextSpecial = { label: next.ev.title, daysUntil: daysBetween(new Date(), next.occurrence) };
  }

  const colorCtx = {
    selfId: data.userId,
    selfColor: data.color,
    partnerId: data.partner?.id ?? null,
    partnerColor: data.partner?.color ?? null,
  };

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pt-5 pb-24">
      <CountdownHeader nextSpecial={nextSpecial} />
      <MemoriesDeck partnerName={data.partner?.displayName ?? "il tuo partner"} selfId={data.userId} />
      <UpcomingEventsCard events={upcoming ?? []} colorCtx={colorCtx} />
      <WishlistPreviewCard
        items={wishlistPreview ?? []}
        selfId={data.userId}
        partnerName={data.partner?.displayName ?? "il tuo partner"}
      />
    </div>
  );
}
