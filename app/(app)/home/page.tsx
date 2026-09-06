import { redirect } from "next/navigation";
import { getCurrentCoupleData } from "@/lib/current-couple";
import { createClient } from "@/lib/supabase/server";
import { daysBetween, nextOccurrence, nextMilestone } from "@/lib/calendar-dates";
import { listRecentThoughts, getThrowbackForToday } from "@/lib/messages-actions";
import { getTodaysQuiz, getQuizScores } from "@/lib/quiz-actions";
import { getTodaysMood } from "@/lib/mood-actions";
import CountdownHero from "@/components/home/CountdownHero";
import MemoriesDeck from "@/components/home/MemoriesDeck";
import ThrowbackCard from "@/components/home/ThrowbackCard";
import QuizCard from "@/components/home/QuizCard";
import MoodCheckIn from "@/components/home/MoodCheckIn";
import UpcomingEventsCard from "@/components/home/UpcomingEventsCard";
import WishlistPreviewCard from "@/components/home/WishlistPreviewCard";

/** `undefined` (invece di errore/null) fa sì che il widget ricada sul proprio fetch client-side originale, invece di doverlo gestire come uno stato d'errore a parte. */
function ok<T extends object>(result: T | { error: string } | null): T | undefined {
  return result !== null && !("error" in result) ? result : undefined;
}

export default async function HomePage() {
  const data = await getCurrentCoupleData();
  if (!data || !data.couple) redirect("/pairing");

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const ctx = { client: supabase, userId: data.userId };
  const quizEnabled = data.couple.quizEnabled && Boolean(data.partner);
  const moodCheckinEnabled = data.couple.moodCheckinEnabled && Boolean(data.partner);

  // Tutto quello che serve per il primo render di Home in un'unica ondata di
  // query in parallelo — inclusi i dati che prima ogni widget (Ricordi, Un
  // anno fa oggi, Quiz, Come va oggi?) andava a prendersi da sé subito dopo
  // il mount lato client. Un fallimento di una SINGOLA query qui (ok())
  // degrada al comportamento originale di quel widget (self-fetch client-side)
  // invece di far fallire l'intera Home.
  const [
    { data: upcoming },
    { data: specialEvents },
    { data: wishlistPreview },
    thoughtsResult,
    throwbackResult,
    quizResult,
    scoresResult,
    moodResult,
  ] = await Promise.all([
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
    listRecentThoughts(20, ctx),
    getThrowbackForToday(ctx),
    quizEnabled ? getTodaysQuiz(ctx) : Promise.resolve(null),
    quizEnabled && data.partner ? getQuizScores(data.partner.id, ctx) : Promise.resolve(null),
    moodCheckinEnabled ? getTodaysMood(ctx) : Promise.resolve(null),
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
      <MemoriesDeck
        partnerName={data.partner?.displayName ?? "il tuo partner"}
        selfId={data.userId}
        initialThoughts={ok(thoughtsResult)}
      />
      <ThrowbackCard selfId={data.userId} initialThrowback={ok(throwbackResult)} />
      {quizEnabled && data.partner && (
        <QuizCard
          partnerName={data.partner.displayName ?? "il tuo partner"}
          partnerId={data.partner.id}
          coupleId={data.couple.id}
          selfColor={data.color}
          partnerColor={data.partner.color}
          initialQuiz={ok(quizResult)}
          initialScores={ok(scoresResult)}
        />
      )}
      <UpcomingEventsCard events={upcoming ?? []} colorCtx={colorCtx} />
      <WishlistPreviewCard
        items={wishlistPreview ?? []}
        selfId={data.userId}
        partnerName={data.partner?.displayName ?? "il tuo partner"}
      />
      {moodCheckinEnabled && <MoodCheckIn initialMood={ok(moodResult)} />}
    </div>
  );
}
