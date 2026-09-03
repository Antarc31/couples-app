/**
 * Unit/componente test per components/calendar/WeekTimeline.tsx — vista
 * Settimana del Calendario (via di mezzo tra Giorno e Mese, vedi piano
 * "Recupero password + vista Settimana"). Il layout orario riusa
 * `layoutTimedEvents` di DayTimeline.tsx (già testata a parte per il
 * clustering delle sovrapposizioni in tests/components/calendar/DayTimeline.test.tsx,
 * incluso il nuovo parametro `rowHeight`): qui verifichiamo solo
 * l'orchestrazione specifica di questo componente — intestazioni giorno,
 * evidenziazione di oggi, cap delle chip "tutto il giorno", e i callback di
 * interazione.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WeekTimeline from "@/components/calendar/WeekTimeline";
import { weekDays, formatDayLabel } from "@/lib/calendar-dates";
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

// Settimana fissa lun 7 -> dom 13 settembre 2026, usata dalla maggior parte
// dei test (solo il test "evidenzia oggi" usa la settimana REALE corrente,
// visto che il componente calcola "oggi" internamente con `new Date()`).
const fixedWeek = weekDays(new Date(2026, 8, 10));

describe("WeekTimeline — intestazioni", () => {
  it("mostra le 7 intestazioni giorno con etichetta e numero corretti", () => {
    render(<WeekTimeline days={fixedWeek} events={[]} colorCtx={ctx} />);

    expect(screen.getByRole("button", { name: formatDayLabel(fixedWeek[0]) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: formatDayLabel(fixedWeek[6]) })).toBeInTheDocument();
    ["lun", "mar", "mer", "gio", "ven", "sab", "dom"].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it("evidenzia il giorno di oggi (la settimana corrente lo include sempre)", () => {
    const today = new Date();
    const currentWeek = weekDays(today);
    render(<WeekTimeline days={currentWeek} events={[]} colorCtx={ctx} />);

    const todayButton = screen.getByRole("button", { name: formatDayLabel(today) });
    expect(todayButton.className).toContain("bg-couple-soft");
  });

  it("tap su un'intestazione giorno chiama onDayClick con quella data", async () => {
    const onDayClick = jest.fn();
    const user = userEvent.setup();
    render(<WeekTimeline days={fixedWeek} events={[]} colorCtx={ctx} onDayClick={onDayClick} />);

    await user.click(screen.getByRole("button", { name: formatDayLabel(fixedWeek[2]) }));

    expect(onDayClick).toHaveBeenCalledWith(fixedWeek[2]);
  });
});

describe("WeekTimeline — eventi 'tutto il giorno'", () => {
  it("mostra fino a 2 chip per giorno, poi un '+N'", () => {
    // martedì 8 settembre 2026 (fixedWeek[1])
    const events = [
      makeEvent({ id: "a1", title: "Ferie", all_day: true, starts_at: "2026-09-08T00:00:00" }),
      makeEvent({ id: "a2", title: "Fiera", all_day: true, starts_at: "2026-09-08T00:00:00" }),
      makeEvent({ id: "a3", title: "Trasloco", all_day: true, starts_at: "2026-09-08T00:00:00" }),
    ];
    render(<WeekTimeline days={fixedWeek} events={events} colorCtx={ctx} />);

    expect(screen.getByText("Ferie")).toBeInTheDocument();
    expect(screen.getByText("Fiera")).toBeInTheDocument();
    expect(screen.queryByText("Trasloco")).not.toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});

describe("WeekTimeline — eventi orari", () => {
  it("mostra un evento orario nel giorno giusto e chiama onEventClick al tap", async () => {
    const onEventClick = jest.fn();
    const event = makeEvent({
      id: "e1",
      title: "Lezione di Analisi",
      starts_at: "2026-09-09T09:00:00.000",
      ends_at: "2026-09-09T10:00:00.000",
    });
    const user = userEvent.setup();
    render(<WeekTimeline days={fixedWeek} events={[event]} colorCtx={ctx} onEventClick={onEventClick} />);

    const card = screen.getByRole("button", { name: "Lezione di Analisi" });
    await user.click(card);

    expect(onEventClick).toHaveBeenCalledWith(event);
  });

  it("un evento fuori dalla settimana mostrata non compare", () => {
    const event = makeEvent({
      id: "e2",
      title: "Fuori settimana",
      starts_at: "2026-10-01T09:00:00.000",
      ends_at: "2026-10-01T10:00:00.000",
    });
    render(<WeekTimeline days={fixedWeek} events={[event]} colorCtx={ctx} />);

    expect(screen.queryByText("Fuori settimana")).not.toBeInTheDocument();
  });
});
