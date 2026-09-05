import Link from "next/link";
import { formatDateShort, formatTime } from "@/lib/calendar-dates";
import { eventColor, CATEGORY_LABELS, type CalendarEventRow, type ColorContext } from "@/lib/calendar-colors";
import Card from "@/components/ui/Card";
import IconBadge from "@/components/ui/IconBadge";
import { CalendarDays } from "@/components/ui/icons";

interface UpcomingEventsCardProps {
  events: CalendarEventRow[];
  colorCtx: ColorContext;
}

export default function UpcomingEventsCard({ events, colorCtx }: UpcomingEventsCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconBadge icon={CalendarDays} size={32} />
          <h2 className="text-sm font-bold text-ink">Prossimi impegni</h2>
        </div>
        <Link href="/calendario" className="text-xs font-semibold text-couple">
          Calendario
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-soft">Nessun impegno in programma. Aggiungine uno!</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((ev) => (
            <li key={ev.id} className="flex items-center gap-3 rounded-2xl bg-base px-3 py-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: eventColor(ev, colorCtx) }}
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">{ev.title}</p>
                <p className="text-xs text-ink-soft">
                  {formatDateShort(ev.starts_at)}
                  {!ev.all_day ? ` · ${formatTime(ev.starts_at)}` : " · tutto il giorno"}
                  {" · "}
                  {CATEGORY_LABELS[ev.category]}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
