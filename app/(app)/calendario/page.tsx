import { redirect } from "next/navigation";
import { getCurrentCoupleData } from "@/lib/current-couple";
import CalendarView from "@/components/calendar/CalendarView";

export default async function CalendarioPage() {
  const data = await getCurrentCoupleData();
  if (!data || !data.couple) redirect("/pairing");

  return (
    <CalendarView
      selfId={data.userId}
      selfColor={data.color}
      selfName={data.displayName ?? "Tu"}
      partnerId={data.partner?.id ?? null}
      partnerColor={data.partner?.color ?? null}
      partnerName={data.partner?.displayName ?? "Partner"}
      coupleId={data.couple.id}
    />
  );
}
