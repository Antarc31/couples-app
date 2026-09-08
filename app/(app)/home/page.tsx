import { redirect } from "next/navigation";
import { getCurrentCoupleData } from "@/lib/current-couple";
import { createClient } from "@/lib/supabase/server";
import { daysBetween, nextOccurrence, nextMilestone } from "@/lib/calendar-dates";
import CountdownHero from "@/components/home/CountdownHero";
import MemoriesDeck from "@/components/home/MemoriesDeck";
import ThrowbackCard from "@/components/home/ThrowbackCard";
import QuizCard from "@/components/home/QuizCard";
import MoodCheckIn from "@/components/home/MoodCheckIn";
import UpcomingEventsCard from "@/components/home/UpcomingEventsCard";
import WishlistPreviewCard from "@/components/home/WishlistPreviewCard";

// NOTA: niente più prefetch server-side dei dati di Ricordi/Un anno fa
// oggi/Quiz/Come va oggi? qui. Tentativo fatto (commit "Perf: precarica
// lato server i dati dei widget Home") e revertito subito dopo aver rotto
// la produzione: lib/messages-actions.ts, lib/mood-actions.ts,
// lib/quiz-actions.ts sono "use client" (client Supabase browser), e
// Next.js a RUNTIME (non a build/tsc time — next build locale non lo
// intercetta) impedisce di chiamare direttamente da un Server Component
// una funzione esportata da un modulo "use client" ("Attempted to call
// X() from the server but X is on the client"). I 4 widget tornano quindi
// al proprio fetch client-side dopo il mount, come da progettazione
// originale — i prop initialThoughts/initialThrowback/initialQuiz/
// initialScores/initialMood restano supportati dai componenti (opzionali,
// innocui se non passati) per un'eventuale reimplementazione futura che
// however dovrà passare da funzioni davvero server-only, non da queste.

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

  let nextMilestoneDisplay: { label: string; daysUntil: number } | null = null;
  if (data.couple.relationshipStartDate) {
    const milestone = nextMilestone(data.couple.relationshipStartDate);
    if (milestone) {
      const label =
        milestone.days % 365 === 0
          ? `${milestone.days / 365} ${milestone.days === 365 ? "anno" : "anni"} insieme`
          : `${milestone.days} giorni insieme`;
      nextMilestoneDisplay = { label, daysUntil: daysBetween(new Date(), milestone.occursOn) };
    }
  }

  const colorCtx = {
    selfId: data.userId,
    selfColor: data.color,
    partnerId: data.partner?.id ?? null,
    partnerColor: data.partner?.color ?? null,
  };

  return (
    <div className="bg-diary flex flex-1 flex-col gap-4 px-4 pt-5 pb-24">
      <CountdownHero nextSpecial={nextSpecial} nextMilestone={nextMilestoneDisplay} />
      <MemoriesDeck partnerName={data.partner?.displayName ?? "il tuo partner"} selfId={data.userId} />
      <ThrowbackCard selfId={data.userId} />
      {data.couple.quizEnabled && data.partner && (
        <QuizCard
          partnerName={data.partner.displayName ?? "il tuo partner"}
          partnerId={data.partner.id}
          coupleId={data.couple.id}
          selfColor={data.color}
          partnerColor={data.partner.color}
        />
      )}
      <UpcomingEventsCard events={upcoming ?? []} colorCtx={colorCtx} />
      <WishlistPreviewCard
        items={wishlistPreview ?? []}
        selfId={data.userId}
        partnerName={data.partner?.displayName ?? "il tuo partner"}
      />
      {data.couple.moodCheckinEnabled && data.partner && <MoodCheckIn />}
    </div>
  );
}
