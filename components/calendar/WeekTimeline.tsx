"use client";

import { useEffect, useRef } from "react";
import {
  formatDayLabel,
  GRID_DEFAULT_SCROLL_HOUR,
  GRID_END_HOUR,
  GRID_START_HOUR,
  isSameDay,
  toDateKey,
  WEEKDAY_LABELS,
} from "@/lib/calendar-dates";
import { eventColor, type CalendarEventRow, type ColorContext } from "@/lib/calendar-colors";
import { layoutTimedEvents } from "@/components/calendar/DayTimeline";

// Più basso di ROW_HEIGHT (52px, vista Giorno): 7 colonne affiancate devono
// stare in verticale in uno schermo di telefono. layoutTimedEvents (stessa
// funzione pura già usata/testata da DayTimeline) accetta questo valore
// come rowHeight, nessuna duplicazione dell'algoritmo di clustering/colonne.
export const WEEK_ROW_HEIGHT = 36;
const MAX_ALL_DAY_CHIPS = 2;
// Stessa idea di DayTimeline.tsx: la griglia va da mezzanotte (bug
// segnalato dall'utente: prima partiva alle 6) ma scrolla internamente
// invece di rimpicciolirsi per stare tutta a schermo.
const GRID_MAX_HEIGHT = "55vh";
// Spaziatore di 28px anche a destra (oltre a quello a sinistra per le
// etichette ora): senza, le 7 colonne giorno risultano spinte verso destra
// invece di stare centrate rispetto all'asse verticale della pagina.
const GRID_TEMPLATE_COLUMNS = "grid-cols-[28px_repeat(7,minmax(0,1fr))_28px]";

interface WeekTimelineProps {
  /** 7 giorni consecutivi lun -> dom (lib/calendar-dates.ts: weekDays()). */
  days: Date[];
  /** TUTTI gli eventi già fetchati dal chiamante — filtrati per giorno qui dentro (stesso principio di CalendarView.eventsOnDay, ma self-contained per testabilità). */
  events: CalendarEventRow[];
  colorCtx: ColorContext;
  onEventClick?: (event: CalendarEventRow) => void;
  /** Tap sull'intestazione di un giorno — il chiamante decide cosa aprire (CalendarView: DayAgendaSheet, stesso già usato dalla vista Mese). */
  onDayClick?: (day: Date) => void;
}

/**
 * Vista Settimana (piano "Recupero password + vista Settimana"): via di
 * mezzo tra Giorno (tutto visibile ma un giorno alla volta) e Mese (tutto il
 * mese ma zero dettaglio orario) — 7 mini-timeline affiancate che
 * condividono lo stesso asse orario, per farsi un'idea a colpo d'occhio di
 * quando si è più liberi nella settimana.
 *
 * Intestazioni (giorno+data, chip "tutto il giorno") e griglia oraria sono
 * DUE contenitori grid separati (stessa `grid-template-columns`, quindi le
 * colonne restano allineate) apposta: solo la griglia oraria scrolla
 * verticalmente (00:00-24:00, troppe ore per stare leggibili tutte a
 * schermo), le intestazioni restano fisse sopra invece di scomparire
 * scrollando.
 */
export default function WeekTimeline({ days, events, colorCtx, onEventClick, onDayClick }: WeekTimelineProps) {
  const today = new Date();
  const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => i + GRID_START_HOUR);
  const totalHeight = hours.length * WEEK_ROW_HEIGHT;
  const weekKey = toDateKey(days[0]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Ogni cambio di settimana riparte dalla stessa ora di default, non da
  // dove si era rimasti scrollando la settimana precedente.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (GRID_DEFAULT_SCROLL_HOUR - GRID_START_HOUR) * WEEK_ROW_HEIGHT;
    }
  }, [weekKey]);

  function eventsOnDay(day: Date) {
    return events.filter((ev) => isSameDay(new Date(ev.starts_at), day));
  }

  return (
    <div className="flex flex-col gap-1">
      <div className={`grid ${GRID_TEMPLATE_COLUMNS} gap-1`}>
        <div />
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          const allDayEvents = eventsOnDay(day).filter((ev) => ev.all_day);
          return (
            <div key={toDateKey(day)} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => onDayClick?.(day)}
                aria-label={formatDayLabel(day)}
                className={`flex flex-col items-center rounded-xl py-1 text-xs transition ${
                  isToday ? "bg-couple-soft font-bold text-ink" : "bg-surface text-ink-soft"
                }`}
              >
                <span className="capitalize">{WEEKDAY_LABELS[i]}</span>
                <span className="text-sm">{day.getDate()}</span>
              </button>
              <div className="flex flex-col gap-0.5">
                {allDayEvents.slice(0, MAX_ALL_DAY_CHIPS).map((ev) => (
                  <span
                    key={ev.id}
                    title={ev.title}
                    className="truncate rounded-full px-1.5 py-0.5 text-center text-[9px] font-semibold text-white"
                    style={{ backgroundColor: eventColor(ev, colorCtx) }}
                  >
                    {ev.title}
                  </span>
                ))}
                {allDayEvents.length > MAX_ALL_DAY_CHIPS && (
                  <span className="text-center text-[9px] leading-none text-ink-soft">
                    +{allDayEvents.length - MAX_ALL_DAY_CHIPS}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div />
      </div>

      <div
        key={weekKey}
        ref={scrollRef}
        data-testid="week-grid-scroll"
        className="overflow-y-auto"
        style={{ maxHeight: GRID_MAX_HEIGHT }}
      >
        <div className={`grid ${GRID_TEMPLATE_COLUMNS} gap-1`}>
          <div className="relative" style={{ height: totalHeight }}>
            {hours.map((hour, i) => (
              <span
                key={hour}
                className="absolute right-1 text-[9px] text-ink-soft"
                style={{ top: i * WEEK_ROW_HEIGHT - 5 }}
              >
                {String(hour).padStart(2, "0")}
              </span>
            ))}
          </div>

          {days.map((day) => {
            const isToday = isSameDay(day, today);
            const timedEvents = eventsOnDay(day).filter((ev) => !ev.all_day);
            const layout = layoutTimedEvents(timedEvents, WEEK_ROW_HEIGHT);
            return (
              <div
                key={toDateKey(day)}
                className={`relative rounded-xl ${isToday ? "bg-couple-soft/25" : "bg-base"}`}
                style={{ height: totalHeight }}
              >
                {hours.map((hour, i) => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-border"
                    style={{ top: i * WEEK_ROW_HEIGHT }}
                  />
                ))}
                {layout.map(({ event: ev, top, height, column, columns }) => (
                  <div
                    key={ev.id}
                    role="button"
                    tabIndex={0}
                    title={ev.title}
                    onClick={() => onEventClick?.(ev)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onEventClick?.(ev)}
                    className="absolute cursor-pointer overflow-hidden rounded-md px-1 text-[9px] font-semibold leading-tight text-white transition active:scale-[0.98]"
                    style={{
                      top,
                      height,
                      left: `${(column / columns) * 100}%`,
                      width: `calc(${100 / columns}% - 2px)`,
                      backgroundColor: eventColor(ev, colorCtx),
                    }}
                  >
                    {ev.title}
                  </div>
                ))}
              </div>
            );
          })}
          <div />
        </div>
      </div>
    </div>
  );
}
