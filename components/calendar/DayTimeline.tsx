"use client";

import { useEffect, useRef } from "react";
import { formatTime, GRID_DEFAULT_SCROLL_HOUR, GRID_END_HOUR, GRID_START_HOUR, toDateKey } from "@/lib/calendar-dates";
import { eventColor, CATEGORY_LABELS, type CalendarEventRow, type ColorContext } from "@/lib/calendar-colors";

// Riesportate per compatibilità con gli import esistenti (es. i test di
// questo componente) — la fonte di verità è ora lib/calendar-dates.ts.
export { GRID_START_HOUR, GRID_END_HOUR };

/**
 * Timeline oraria della vista Giorno (piano UX "Gruppo Calendario/
 * Appuntamenti", punto 6).
 *
 * Prima: gli eventi erano piazzati SOLO nella riga oraria di inizio, come
 * blocchi ad altezza fissa (min-h-[52px]) — un evento 9:00-17:00 mostrava
 * il testo corretto ("09:00 – 17:00") ma occupava visivamente la stessa
 * riga di un evento da 15 minuti, indistinguibile a colpo d'occhio.
 *
 * Ora: layout a posizionamento assoluto ("vero calendario"). Un contenitore
 * relativo alto `hours.length * ROW_HEIGHT` fa da sfondo/griglia (righe
 * orarie come semplici divisori, non più contenitori degli eventi); ogni
 * evento timed è posizionato con `top`/`height` proporzionali a inizio/
 * durata reali (vedi `layoutTimedEvents`, estratta come funzione pura per
 * essere testabile senza montare il componente). Gli eventi che si
 * sovrappongono nello stesso intervallo vengono raggruppati in "cluster" e
 * affiancati in colonne di larghezza uguale.
 *
 * Griglia dalle 00:00 alle 24:00 (bug segnalato dall'utente: prima partiva
 * alle 6, un evento delle 5 del mattino spariva del tutto) dentro un
 * contenitore SCROLLABILE — 24 ore leggibili non ci stanno tutte a schermo,
 * quindi invece di rimpicciolirle si scrolla. Di default la vista è
 * scrollata a `GRID_DEFAULT_SCROLL_HOUR` (7 del mattino): l'utente scorre
 * verso l'alto per vedere la notte/primissimo mattino solo quando serve,
 * verso il basso per il resto della giornata.
 *
 * Estratto come componente esportato (prima era una funzione locale dentro
 * CalendarView.tsx) per testabilità diretta — vedi
 * tests/components/calendar/DayTimeline.test.tsx.
 */

export const ROW_HEIGHT = 52; // px, altezza di un'ora
const MIN_EVENT_HEIGHT = 28; // px, altezza minima garantita per eventi brevi o senza ends_at
// Quanto alta al massimo la griglia scrollabile — abbastanza per vedere
// diverse ore di fila senza scrollare in continuazione, non così tanta da
// spingere fuori schermo il resto della pagina (switcher, legenda, ecc.).
const GRID_MAX_HEIGHT = "60vh";

export interface TimedEventLayout {
  event: CalendarEventRow;
  /** px dall'alto del contenitore relativo. */
  top: number;
  /** px, altezza della card. */
  height: number;
  /** Indice colonna (0-based) all'interno del proprio cluster di sovrapposizione. */
  column: number;
  /** Numero totale di colonne del cluster a cui appartiene l'evento. */
  columns: number;
}

function hourFloat(d: Date): number {
  return d.getHours() + d.getMinutes() / 60;
}

interface Interval {
  event: CalendarEventRow;
  start: number; // epoch ms
  end: number; // epoch ms, >= start (coincide con start se l'evento non ha ends_at)
  top: number;
  height: number;
}

/**
 * Calcola top/height/colonna per ogni evento timed di un giorno.
 *
 * Sovrapposizioni: gli eventi vengono raggruppati in cluster per
 * transitività (due eventi nello stesso cluster se i loro intervalli si
 * toccano, direttamente o tramite un terzo evento in comune) — non un
 * algoritmo di scheduling sofisticato, solo il pattern semplice già usato da
 * molti calendari: dentro ogni cluster la larghezza si divide per il
 * numero di eventi del cluster, con una colonna assegnata greedily (primo
 * slot libero il cui evento precedente è già finito).
 *
 * `rowHeight` opzionale (default `ROW_HEIGHT`, invariato per la vista
 * Giorno): la vista Settimana (`WeekTimeline.tsx`) riusa questa stessa
 * funzione — stesso algoritmo di clustering/colonne — con un'altezza oraria
 * più compatta, senza duplicare la logica.
 */
export function layoutTimedEvents(events: CalendarEventRow[], rowHeight: number = ROW_HEIGHT): TimedEventLayout[] {
  const sorted = [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const minEventHeight = (MIN_EVENT_HEIGHT / ROW_HEIGHT) * rowHeight;

  const intervals: Interval[] = sorted.map((ev) => {
    const start = new Date(ev.starts_at);
    const end = ev.ends_at ? new Date(ev.ends_at) : null;
    const top = (hourFloat(start) - GRID_START_HOUR) * rowHeight;
    const durationHours = end ? Math.max(0, (end.getTime() - start.getTime()) / 3_600_000) : 0;
    const height = Math.max(minEventHeight, durationHours * rowHeight);
    return {
      event: ev,
      start: start.getTime(),
      end: (end ?? start).getTime(),
      top,
      height,
    };
  });

  // Clustering per transitività.
  const clusters: Interval[][] = [];
  for (const interval of intervals) {
    const overlapping = clusters.filter((cluster) =>
      cluster.some((other) => interval.start < other.end && other.start < interval.end),
    );
    if (overlapping.length === 0) {
      clusters.push([interval]);
      continue;
    }
    const merged = overlapping.flat();
    merged.push(interval);
    for (const c of overlapping) clusters.splice(clusters.indexOf(c), 1);
    clusters.push(merged);
  }

  const result: TimedEventLayout[] = [];
  for (const cluster of clusters) {
    const clusterSorted = [...cluster].sort((a, b) => a.start - b.start);
    const columnEnds: number[] = [];
    const columns = cluster.length;
    for (const interval of clusterSorted) {
      let column = columnEnds.findIndex((end) => end <= interval.start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(interval.end);
      } else {
        columnEnds[column] = interval.end;
      }
      result.push({ event: interval.event, top: interval.top, height: interval.height, column, columns });
    }
  }

  return result;
}

interface DayTimelineProps {
  day: Date;
  events: CalendarEventRow[];
  colorCtx: ColorContext;
  /** Piano UX punto 3: tap su un evento apre il dettaglio (Modifica/Elimina). */
  onEventClick?: (event: CalendarEventRow) => void;
}

export default function DayTimeline({ day, events, colorCtx, onEventClick }: DayTimelineProps) {
  const allDayEvents = events.filter((ev) => ev.all_day);
  const timedEvents = events.filter((ev) => !ev.all_day);
  const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => i + GRID_START_HOUR);
  const layout = layoutTimedEvents(timedEvents);
  const totalHeight = hours.length * ROW_HEIGHT;

  const scrollRef = useRef<HTMLDivElement>(null);
  // Ogni cambio di giorno riparte dalla stessa ora di default, non da dove
  // si era rimasti scrollando il giorno precedente.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (GRID_DEFAULT_SCROLL_HOUR - GRID_START_HOUR) * ROW_HEIGHT;
    }
  }, [day]);

  function handleActivate(ev: CalendarEventRow) {
    onEventClick?.(ev);
  }

  return (
    <div className="flex flex-col gap-2">
      {allDayEvents.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-2xl bg-base p-2">
          {allDayEvents.map((ev) => (
            <div
              key={ev.id}
              role="button"
              tabIndex={0}
              onClick={() => handleActivate(ev)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleActivate(ev)}
              className="flex cursor-pointer items-center gap-2 rounded-xl bg-surface on-surface px-3 py-2 text-sm transition active:scale-[0.98]"
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: eventColor(ev, colorCtx) }} />
              <span className="font-semibold text-ink">{ev.title}</span>
              <span className="text-xs text-ink-soft">tutto il giorno{ev.tag ? ` · ${ev.tag}` : ""}</span>
            </div>
          ))}
        </div>
      )}

      <div
        key={toDateKey(day)}
        ref={scrollRef}
        data-testid="day-grid-scroll"
        className="overflow-y-auto rounded-2xl bg-base"
        style={{ maxHeight: GRID_MAX_HEIGHT }}
      >
        <div className="relative" style={{ height: totalHeight }}>
          {/* Griglia oraria di sfondo: righe divisorie + etichette, non più contenitori degli eventi. */}
          {hours.map((hour, i) => (
            <div
              key={hour}
              className="absolute inset-x-0 border-t border-border px-3 pt-0.5 text-xs text-ink-soft"
              style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
            >
              <span className="w-10 shrink-0">{String(hour).padStart(2, "0")}:00</span>
            </div>
          ))}

          {/* Eventi timed: posizionamento assoluto, colonne affiancate per i cluster sovrapposti. */}
          <div className="absolute inset-y-0 left-14 right-2">
            {layout.map(({ event: ev, top, height, column, columns }) => (
              <div
                key={ev.id}
                role="button"
                tabIndex={0}
                onClick={() => handleActivate(ev)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleActivate(ev)}
                className="absolute cursor-pointer overflow-hidden rounded-xl px-2.5 py-1.5 text-white shadow-sm transition active:scale-[0.98]"
                style={{
                  top,
                  height,
                  left: `${(column / columns) * 100}%`,
                  width: `calc(${100 / columns}% - 4px)`,
                  backgroundColor: eventColor(ev, colorCtx),
                }}
              >
                <p className="truncate text-sm font-semibold">{ev.title}</p>
                <p className="truncate text-xs opacity-90">
                  {formatTime(ev.starts_at)}
                  {ev.ends_at ? ` – ${formatTime(ev.ends_at)}` : ""}
                  {" · "}
                  {CATEGORY_LABELS[ev.category]}
                  {ev.tag ? ` · ${ev.tag}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {timedEvents.length === 0 && allDayEvents.length === 0 && (
        <p className="py-6 text-center text-sm text-ink-soft">Nessun evento in questo giorno.</p>
      )}
    </div>
  );
}
