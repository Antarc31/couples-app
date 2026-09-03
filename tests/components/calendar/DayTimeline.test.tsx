/**
 * Unit/componente test per components/calendar/DayTimeline.tsx — piano UX
 * "Gruppo Calendario/Appuntamenti", punto 6 (l'evento deve occupare
 * l'intera durata in vista Giorno, non solo lo slot di inizio).
 *
 * `layoutTimedEvents` è estratta come funzione pura esportata apposta per
 * essere testabile senza montare il componente (vedi commento nel file
 * sorgente): qui verifichiamo che altezza/posizione riflettano davvero
 * l'orario/durata reale dell'evento, e che gli eventi sovrapposti vengano
 * divisi in colonne. Il componente stesso è testato separatamente per il
 * comportamento di interazione (tap -> onEventClick).
 *
 * Nota sui timestamp nei fixture: `starts_at`/`ends_at` sono scritti SENZA
 * suffisso "Z" (es. "2026-09-10T09:00:00.000") apposta, così `new
 * Date(...)` li interpreta come orario locale — `layoutTimedEvents` usa
 * `getHours()`/`getMinutes()` (locali, stessa convenzione già in uso in
 * lib/calendar-dates.ts/formatTime), quindi i test restano deterministici
 * indipendentemente dal fuso orario della macchina che li esegue.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DayTimeline, { layoutTimedEvents, GRID_START_HOUR, ROW_HEIGHT } from "@/components/calendar/DayTimeline";
import { GRID_DEFAULT_SCROLL_HOUR } from "@/lib/calendar-dates";
import type { ColorContext } from "@/lib/calendar-colors";
import type { Database } from "@/types/database";

type CalendarEventRow = Database["public"]["Tables"]["calendar_events"]["Row"];

function makeEvent(overrides: Partial<CalendarEventRow> & { id: string; starts_at: string }): CalendarEventRow {
  return {
    couple_id: "c1",
    created_by: "me",
    title: "Evento",
    tag: null,
    notes: null,
    category: "personale",
    ends_at: null,
    all_day: false,
    recurrence: "nessuna",
    recurrence_interval: 1,
    recurrence_until: null,
    recurrence_count: null,
    is_shared_with_partner: false,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const ctx: ColorContext = { selfId: "me", selfColor: "#F7A6C4", partnerId: null, partnerColor: null };

describe("layoutTimedEvents", () => {
  it("posiziona un evento delle 09:00 a (9 - GRID_START_HOUR) * ROW_HEIGHT dall'alto", () => {
    const ev = makeEvent({ id: "e1", starts_at: "2026-09-10T09:00:00.000", ends_at: "2026-09-10T10:00:00.000" });
    const [layout] = layoutTimedEvents([ev]);
    expect(layout.top).toBe((9 - GRID_START_HOUR) * ROW_HEIGHT);
  });

  it("un evento di 2 ore occupa il doppio dell'altezza di uno da 1 ora", () => {
    const oneHour = makeEvent({ id: "e1", starts_at: "2026-09-10T09:00:00.000", ends_at: "2026-09-10T10:00:00.000" });
    const twoHours = makeEvent({ id: "e2", starts_at: "2026-09-10T09:00:00.000", ends_at: "2026-09-10T11:00:00.000" });

    const [oneHourLayout] = layoutTimedEvents([oneHour]);
    const [twoHoursLayout] = layoutTimedEvents([twoHours]);

    expect(twoHoursLayout.height).toBe(oneHourLayout.height * 2);
    expect(oneHourLayout.height).toBe(ROW_HEIGHT);
  });

  it("tiene conto dei minuti di inizio (09:30 è a metà strada tra la riga delle 9 e delle 10)", () => {
    const ev = makeEvent({ id: "e1", starts_at: "2026-09-10T09:30:00.000", ends_at: "2026-09-10T10:00:00.000" });
    const [layout] = layoutTimedEvents([ev]);
    expect(layout.top).toBe((9.5 - GRID_START_HOUR) * ROW_HEIGHT);
  });

  it("un evento senza ends_at usa l'altezza minima garantita", () => {
    const ev = makeEvent({ id: "e1", starts_at: "2026-09-10T09:00:00.000", ends_at: null });
    const [layout] = layoutTimedEvents([ev]);
    expect(layout.height).toBeGreaterThan(0);
    expect(layout.height).toBeLessThan(ROW_HEIGHT);
  });

  it("un evento molto breve (15 minuti) rispetta comunque l'altezza minima garantita", () => {
    const ev = makeEvent({ id: "e1", starts_at: "2026-09-10T09:00:00.000", ends_at: "2026-09-10T09:15:00.000" });
    const [layout] = layoutTimedEvents([ev]);
    // 15 minuti a ROW_HEIGHT=52px farebbero 13px: troppo poco per essere leggibile,
    // deve scattare il minimo garantito (vedi MIN_EVENT_HEIGHT nel componente).
    expect(layout.height).toBeGreaterThanOrEqual(28);
  });

  it("eventi che non si sovrappongono restano ciascuno in una colonna singola (columns=1)", () => {
    const a = makeEvent({ id: "a", starts_at: "2026-09-10T09:00:00.000", ends_at: "2026-09-10T10:00:00.000" });
    const b = makeEvent({ id: "b", starts_at: "2026-09-10T11:00:00.000", ends_at: "2026-09-10T12:00:00.000" });

    const layout = layoutTimedEvents([a, b]);

    expect(layout.find((l) => l.event.id === "a")).toMatchObject({ column: 0, columns: 1 });
    expect(layout.find((l) => l.event.id === "b")).toMatchObject({ column: 0, columns: 1 });
  });

  it("due eventi sovrapposti vengono divisi in due colonne affiancate", () => {
    const a = makeEvent({ id: "a", starts_at: "2026-09-10T09:00:00.000", ends_at: "2026-09-10T10:00:00.000" });
    const b = makeEvent({ id: "b", starts_at: "2026-09-10T09:30:00.000", ends_at: "2026-09-10T10:30:00.000" });

    const layout = layoutTimedEvents([a, b]);
    const layoutA = layout.find((l) => l.event.id === "a")!;
    const layoutB = layout.find((l) => l.event.id === "b")!;

    expect(layoutA.columns).toBe(2);
    expect(layoutB.columns).toBe(2);
    expect(layoutA.column).not.toBe(layoutB.column);
  });

  it("un cluster di 3 eventi transitivamente sovrapposti (A-B, B-C, ma non A-C) resta un unico cluster", () => {
    const a = makeEvent({ id: "a", starts_at: "2026-09-10T09:00:00.000", ends_at: "2026-09-10T10:00:00.000" });
    const b = makeEvent({ id: "b", starts_at: "2026-09-10T09:30:00.000", ends_at: "2026-09-10T10:30:00.000" });
    const c = makeEvent({ id: "c", starts_at: "2026-09-10T10:15:00.000", ends_at: "2026-09-10T11:00:00.000" });

    const layout = layoutTimedEvents([a, b, c]);

    // Stesso cluster -> stesso denominatore "columns" per tutti e tre.
    expect(layout.every((l) => l.columns === 3)).toBe(true);
  });

  it("eventi in giorni/cluster indipendenti restano con columns=1 ciascuno anche se ce ne sono molti in totale", () => {
    const events = [
      makeEvent({ id: "a", starts_at: "2026-09-10T08:00:00.000", ends_at: "2026-09-10T09:00:00.000" }),
      makeEvent({ id: "b", starts_at: "2026-09-10T10:00:00.000", ends_at: "2026-09-10T11:00:00.000" }),
      makeEvent({ id: "c", starts_at: "2026-09-10T12:00:00.000", ends_at: "2026-09-10T13:00:00.000" }),
    ];
    const layout = layoutTimedEvents(events);
    expect(layout.every((l) => l.columns === 1)).toBe(true);
  });

  it("rowHeight custom (usato da WeekTimeline) scala top/height coerentemente, default invariato quando omesso", () => {
    const ev = makeEvent({ id: "e1", starts_at: "2026-09-10T09:00:00.000", ends_at: "2026-09-10T10:00:00.000" });

    const [defaultLayout] = layoutTimedEvents([ev]);
    expect(defaultLayout.top).toBe((9 - GRID_START_HOUR) * ROW_HEIGHT);
    expect(defaultLayout.height).toBe(ROW_HEIGHT);

    const customRowHeight = 36;
    const [customLayout] = layoutTimedEvents([ev], customRowHeight);
    expect(customLayout.top).toBe((9 - GRID_START_HOUR) * customRowHeight);
    expect(customLayout.height).toBe(customRowHeight);
  });
});

describe("DayTimeline (componente)", () => {
  it("mostra 'Nessun evento in questo giorno' quando non ci sono eventi", () => {
    render(<DayTimeline day={new Date("2026-09-10")} events={[]} colorCtx={ctx} />);
    expect(screen.getByText("Nessun evento in questo giorno.")).toBeInTheDocument();
  });

  it("chiama onEventClick al tap su un evento timed", async () => {
    const user = userEvent.setup();
    const onEventClick = jest.fn();
    const ev = makeEvent({
      id: "e1",
      title: "Cena da Marco",
      starts_at: "2026-09-10T09:00:00.000",
      ends_at: "2026-09-10T10:00:00.000",
    });

    render(<DayTimeline day={new Date("2026-09-10")} events={[ev]} colorCtx={ctx} onEventClick={onEventClick} />);

    await user.click(screen.getByText("Cena da Marco"));
    expect(onEventClick).toHaveBeenCalledWith(ev);
  });

  it("chiama onEventClick al tap su un evento 'tutto il giorno'", async () => {
    const user = userEvent.setup();
    const onEventClick = jest.fn();
    const ev = makeEvent({
      id: "e1",
      title: "Compleanno",
      starts_at: "2026-09-10T00:00:00.000",
      all_day: true,
      category: "speciale",
    });

    render(<DayTimeline day={new Date("2026-09-10")} events={[ev]} colorCtx={ctx} onEventClick={onEventClick} />);

    await user.click(screen.getByText("Compleanno"));
    expect(onEventClick).toHaveBeenCalledWith(ev);
  });

  // Bug segnalato dall'utente: la griglia partiva dalle 6 del mattino, un
  // evento più mattiniero spariva del tutto dalla vista.
  it("la griglia oraria parte da mezzanotte (00:00), non dalle 6", () => {
    render(<DayTimeline day={new Date("2026-09-10")} events={[]} colorCtx={ctx} />);
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(GRID_START_HOUR).toBe(0);
  });

  it("all'apertura la griglia è scrollata di default a GRID_DEFAULT_SCROLL_HOUR, non a mezzanotte", () => {
    render(<DayTimeline day={new Date("2026-09-10")} events={[]} colorCtx={ctx} />);
    const scrollContainer = screen.getByTestId("day-grid-scroll");
    expect(scrollContainer.scrollTop).toBe((GRID_DEFAULT_SCROLL_HOUR - GRID_START_HOUR) * ROW_HEIGHT);
  });
});
