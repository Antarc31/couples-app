/**
 * Unit test per lib/calendar-actions.ts (createCalendarEvent,
 * updateCalendarEvent, deleteCalendarEvent) — piano UX "Gruppo
 * Calendario/Appuntamenti", punto 3 (dettaglio/modifica/elimina evento).
 *
 * Stesso pattern di tests/lib/appointments-actions.test.ts: client Supabase
 * reale mockato, qui verifichiamo solo che calendar-actions.ts orchestri
 * correttamente le chiamate e mappi risposta/errore, non che la RLS di
 * calendar_events funzioni davvero (verificata separatamente contro
 * Postgres reale in Fase 1/2, vedi HANDOFF.md).
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest`
 * globale ambient (non `import { jest } from "@jest/globals"`).
 */

import { makeQueryBuilderMock } from "../helpers/supabase-query-mock";

type QueryResponse<T> = { data: T; error: { message: string } | null };

/** Mock della catena `.from(table).insert(row).select(cols).single()`. */
function makeInsertSelectSingleMock(response: QueryResponse<unknown>) {
  const single = jest.fn<Promise<typeof response>, []>().mockResolvedValue(response);
  const select = jest.fn<{ single: typeof single }, [columns: string]>().mockReturnValue({ single });
  const insert = jest.fn<{ select: typeof select }, [row: unknown]>().mockReturnValue({ select });
  return { insert, select, single };
}

/** Mock della catena `.from(table).update(patch).eq(col, val).select(cols).single()`. */
function makeUpdateEqSelectSingleMock(response: QueryResponse<unknown>) {
  const single = jest.fn<Promise<typeof response>, []>().mockResolvedValue(response);
  const select = jest.fn<{ single: typeof single }, [columns: string]>().mockReturnValue({ single });
  const eq = jest
    .fn<{ select: typeof select }, [column: string, value: string]>()
    .mockReturnValue({ select });
  const update = jest.fn<{ eq: typeof eq }, [patch: unknown]>().mockReturnValue({ eq });
  return { update, eq, select, single };
}

/** Mock della catena `.from(table).delete().eq(col, val)` -> Promise<{error}>. */
function makeDeleteEqMock(response: { error: { message: string } | null }) {
  const eq = jest.fn<Promise<typeof response>, [column: string, value: string]>().mockResolvedValue(response);
  const del = jest.fn<{ eq: typeof eq }, []>().mockReturnValue({ eq });
  return { delete: del, eq };
}

/** Mock della catena `.from("calendar_events").select(cols).eq(col,val).gte(col,val).order(col,opts).limit(n)` — usata da listUpcomingCoupleEvents. */
function makeUpcomingEventsMock(response: QueryResponse<unknown[] | null>) {
  const limit = jest.fn<Promise<typeof response>, [number]>().mockResolvedValue(response);
  const order = jest.fn<{ limit: typeof limit }, [string, unknown?]>().mockReturnValue({ limit });
  const gte = jest.fn<{ order: typeof order }, [string, string]>().mockReturnValue({ order });
  const eq = jest.fn<{ gte: typeof gte }, [string, string]>().mockReturnValue({ gte });
  const select = jest.fn<{ eq: typeof eq }, [string]>().mockReturnValue({ eq });
  return { select, eq, gte, order, limit };
}

/** Mock della catena `.select("*").eq(col,val).gte(col,val).lt(col,val).order(col,opts)` — query "range" di listCoupleEventsInRange. */
function makeRangeQueryMock(response: QueryResponse<unknown[] | null>) {
  const order = jest.fn<Promise<typeof response>, [string, unknown?]>().mockResolvedValue(response);
  const lt = jest.fn<{ order: typeof order }, [string, string]>().mockReturnValue({ order });
  const gte = jest.fn<{ lt: typeof lt }, [string, string]>().mockReturnValue({ lt });
  const eq = jest.fn<{ gte: typeof gte }, [string, string]>().mockReturnValue({ gte });
  const select = jest.fn<{ eq: typeof eq }, [string]>().mockReturnValue({ eq });
  return { select, eq, gte, lt, order };
}

/** Mock della catena `.select("*").eq(col,val).neq(col,val)` — query "ricorrenti" di listCoupleEventsInRange. */
function makeRecurringQueryMock(response: QueryResponse<unknown[] | null>) {
  const neq = jest.fn<Promise<typeof response>, [string, string]>().mockResolvedValue(response);
  const eq = jest.fn<{ neq: typeof neq }, [string, string]>().mockReturnValue({ neq });
  const select = jest.fn<{ eq: typeof eq }, [string]>().mockReturnValue({ eq });
  return { select, eq, neq };
}

type FromReturn =
  | ReturnType<typeof makeQueryBuilderMock>
  | ReturnType<typeof makeInsertSelectSingleMock>
  | ReturnType<typeof makeUpdateEqSelectSingleMock>
  | ReturnType<typeof makeDeleteEqMock>
  | ReturnType<typeof makeUpcomingEventsMock>
  | ReturnType<typeof makeRangeQueryMock>
  | ReturnType<typeof makeRecurringQueryMock>;

type MockSupabase = {
  auth: { getUser: jest.Mock<Promise<{ data: { user: { id: string } | null } }>, []> };
  from: jest.Mock<FromReturn, [table: string]>;
};

function makeMockSupabase(): MockSupabase {
  return {
    auth: { getUser: jest.fn<Promise<{ data: { user: { id: string } | null } }>, []>() },
    from: jest.fn<FromReturn, [table: string]>(),
  };
}

let mockSupabase: MockSupabase;

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listUpcomingCoupleEvents,
  listCoupleEventsInRange,
} from "@/lib/calendar-actions";

beforeEach(() => {
  mockSupabase = makeMockSupabase();
});

const baseRow = {
  id: "ev1",
  couple_id: "c1",
  created_by: "me",
  title: "Cena da Marco",
  tag: null,
  notes: null,
  category: "personale" as const,
  starts_at: "2026-09-10T20:00:00.000Z",
  ends_at: null,
  all_day: false,
  recurrence: "nessuna" as const,
  is_shared_with_partner: false,
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
};

describe("createCalendarEvent", () => {
  it("ritorna errore senza chiamare Supabase se il titolo è vuoto/solo spazi", async () => {
    const result = await createCalendarEvent({
      coupleId: "c1",
      createdBy: "me",
      title: "   ",
      category: "personale",
      startsAt: "2026-09-10T20:00:00.000Z",
    });
    expect(result).toEqual({ error: "Il titolo non può essere vuoto." });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("inserisce l'evento (trim titolo, default tag/notes/allDay) e ritorna la riga", async () => {
    const insertMock = makeInsertSelectSingleMock({ data: baseRow, error: null });
    mockSupabase.from.mockReturnValue(insertMock);

    const result = await createCalendarEvent({
      coupleId: "c1",
      createdBy: "me",
      title: "  Cena da Marco  ",
      category: "personale",
      startsAt: "2026-09-10T20:00:00.000Z",
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("calendar_events");
    expect(insertMock.insert).toHaveBeenCalledWith({
      couple_id: "c1",
      created_by: "me",
      title: "Cena da Marco",
      category: "personale",
      tag: null,
      notes: null,
      starts_at: "2026-09-10T20:00:00.000Z",
      ends_at: null,
      all_day: false,
    });
    expect(result).toEqual(baseRow);
  });

  it("passa tag/notes/endsAt/allDay quando forniti", async () => {
    const insertMock = makeInsertSelectSingleMock({ data: baseRow, error: null });
    mockSupabase.from.mockReturnValue(insertMock);

    await createCalendarEvent({
      coupleId: "c1",
      createdBy: "me",
      title: "Cena da Marco",
      category: "coppia",
      tag: "ristorante",
      notes: "portare il vino",
      startsAt: "2026-09-10T20:00:00.000Z",
      endsAt: "2026-09-10T22:00:00.000Z",
      allDay: false,
    });

    expect(insertMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "coppia",
        tag: "ristorante",
        notes: "portare il vino",
        ends_at: "2026-09-10T22:00:00.000Z",
      }),
    );
  });

  it("propaga l'errore di insert", async () => {
    mockSupabase.from.mockReturnValue(
      makeInsertSelectSingleMock({ data: null, error: { message: "RLS violation" } }),
    );
    const result = await createCalendarEvent({
      coupleId: "c1",
      createdBy: "me",
      title: "Cena da Marco",
      category: "personale",
      startsAt: "2026-09-10T20:00:00.000Z",
    });
    expect(result).toEqual({ error: "RLS violation" });
  });
});

describe("updateCalendarEvent", () => {
  it("aggiorna solo i campi passati (trim su title) e mappa il risultato", async () => {
    const updateMock = makeUpdateEqSelectSingleMock({
      data: { ...baseRow, title: "Cena da Marco 2" },
      error: null,
    });
    mockSupabase.from.mockReturnValue(updateMock);

    const result = await updateCalendarEvent("ev1", { title: "  Cena da Marco 2  " });

    expect(mockSupabase.from).toHaveBeenCalledWith("calendar_events");
    expect(updateMock.update).toHaveBeenCalledWith({ title: "Cena da Marco 2" });
    expect(updateMock.eq).toHaveBeenCalledWith("id", "ev1");
    expect(result).toEqual({ ...baseRow, title: "Cena da Marco 2" });
  });

  it("non include nel patch i campi non passati (es. category invariata)", async () => {
    const updateMock = makeUpdateEqSelectSingleMock({ data: baseRow, error: null });
    mockSupabase.from.mockReturnValue(updateMock);

    await updateCalendarEvent("ev1", { notes: "aggiornata" });

    expect(updateMock.update).toHaveBeenCalledWith({ notes: "aggiornata" });
  });

  it("permette di azzerare tag/notes/endsAt passando null esplicitamente", async () => {
    const updateMock = makeUpdateEqSelectSingleMock({ data: baseRow, error: null });
    mockSupabase.from.mockReturnValue(updateMock);

    await updateCalendarEvent("ev1", { tag: null, notes: null, endsAt: null });

    expect(updateMock.update).toHaveBeenCalledWith({ tag: null, notes: null, ends_at: null });
  });

  it("propaga l'errore della query (es. RLS: non autorizzato a modificare un evento personale altrui)", async () => {
    mockSupabase.from.mockReturnValue(
      makeUpdateEqSelectSingleMock({ data: null, error: { message: "Non autorizzato" } }),
    );
    const result = await updateCalendarEvent("ev1", { title: "X" });
    expect(result).toEqual({ error: "Non autorizzato" });
  });
});

describe("deleteCalendarEvent", () => {
  it("ritorna true se la delete riesce", async () => {
    const deleteMock = makeDeleteEqMock({ error: null });
    mockSupabase.from.mockReturnValue(deleteMock);

    const result = await deleteCalendarEvent("ev1");

    expect(mockSupabase.from).toHaveBeenCalledWith("calendar_events");
    expect(result).toBe(true);
    expect(deleteMock.eq).toHaveBeenCalledWith("id", "ev1");
  });

  it("propaga l'errore della delete (es. RLS: evento personale non tuo)", async () => {
    mockSupabase.from.mockReturnValue(makeDeleteEqMock({ error: { message: "Non autorizzato" } }));
    const result = await deleteCalendarEvent("ev1");
    expect(result).toEqual({ error: "Non autorizzato" });
  });
});

describe("listUpcomingCoupleEvents", () => {
  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await listUpcomingCoupleEvents();
    expect(result).toEqual({ error: "Utente non autenticato" });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("ritorna errore se l'utente non è accoppiato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makeQueryBuilderMock({ couple_id: null }));

    const result = await listUpcomingCoupleEvents();
    expect(result).toEqual({ error: "Non sei accoppiato/a con un partner." });
  });

  it("filtra per couple_id e da 'ora' in poi, ordinati per data crescente", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const eventsMock = makeUpcomingEventsMock({
      data: [{ id: "ev1", title: "Cena", starts_at: "2026-09-10T20:00:00.000Z" }],
      error: null,
    });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "calendar_events") return eventsMock;
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await listUpcomingCoupleEvents();

    expect(eventsMock.eq).toHaveBeenCalledWith("couple_id", "c1");
    expect(eventsMock.order).toHaveBeenCalledWith("starts_at", { ascending: true });
    expect(result).toEqual([{ id: "ev1", title: "Cena", startsAt: "2026-09-10T20:00:00.000Z" }]);
  });

  it("propaga l'errore della query", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "calendar_events") return makeUpcomingEventsMock({ data: null, error: { message: "Errore di rete" } });
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await listUpcomingCoupleEvents();
    expect(result).toEqual({ error: "Errore di rete" });
  });

  it("ritorna array vuoto se data è null senza errore", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "calendar_events") return makeUpcomingEventsMock({ data: null, error: null });
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await listUpcomingCoupleEvents();
    expect(result).toEqual([]);
  });
});

describe("listCoupleEventsInRange", () => {
  it("unisce eventi non ricorrenti nel range con le occorrenze proiettate dei ricorrenti, senza doppioni", async () => {
    const nonRecurring = { ...baseRow, id: "ev1", recurrence: "nessuna" as const };
    // Simula un evento ricorrente la cui data letterale cade *anche* nel range
    // interrogato dalla prima query: deve comunque sparire dal risultato finale
    // a favore della SOLA occorrenza proiettata dalla seconda query (dedup via
    // recurringIds — stesso meccanismo già in CalendarView.loadEvents).
    const recurringLiteral = { ...baseRow, id: "ev2", recurrence: "annuale" as const, starts_at: "2001-06-15T10:00:00.000Z" };

    const rangeMock = makeRangeQueryMock({ data: [nonRecurring, recurringLiteral], error: null });
    const recurringMock = makeRecurringQueryMock({ data: [recurringLiteral], error: null });
    mockSupabase.from.mockReturnValueOnce(rangeMock).mockReturnValueOnce(recurringMock);

    const rangeStart = new Date(2026, 5, 1);
    const rangeEnd = new Date(2026, 5, 30);
    const result = await listCoupleEventsInRange("c1", rangeStart, rangeEnd);

    expect(mockSupabase.from).toHaveBeenCalledTimes(2);
    expect(rangeMock.eq).toHaveBeenCalledWith("couple_id", "c1");
    expect(recurringMock.eq).toHaveBeenCalledWith("couple_id", "c1");
    expect(recurringMock.neq).toHaveBeenCalledWith("recurrence", "nessuna");

    if ("error" in result) throw new Error("non doveva ritornare un errore");
    expect(result).toHaveLength(2);
    expect(result.some((r) => r.id === "ev1")).toBe(true);
    // L'occorrenza proiettata ha lo stesso id della riga reale (ev2) ma
    // starts_at riscritto sulla data proiettata nel range (15 giugno 2026),
    // non più la data letterale (2001).
    const projected = result.find((r) => r.id === "ev2");
    expect(projected).toBeDefined();
    expect(toDateKeyLocal(new Date(projected!.starts_at))).toBe("2026-06-15");
  });

  it("il range di fetch include l'intero rangeEnd (lt sul giorno successivo, bordo escluso)", async () => {
    const rangeMock = makeRangeQueryMock({ data: [], error: null });
    const recurringMock = makeRecurringQueryMock({ data: [], error: null });
    mockSupabase.from.mockReturnValueOnce(rangeMock).mockReturnValueOnce(recurringMock);

    const rangeStart = new Date(2026, 5, 1);
    const rangeEnd = new Date(2026, 5, 30);
    await listCoupleEventsInRange("c1", rangeStart, rangeEnd);

    expect(rangeMock.gte).toHaveBeenCalledWith("starts_at", rangeStart.toISOString());
    expect(rangeMock.lt).toHaveBeenCalledWith("starts_at", new Date(2026, 6, 1).toISOString());
  });

  it("propaga l'errore della query 'range'", async () => {
    const rangeMock = makeRangeQueryMock({ data: null, error: { message: "Errore di rete" } });
    const recurringMock = makeRecurringQueryMock({ data: [], error: null });
    mockSupabase.from.mockReturnValueOnce(rangeMock).mockReturnValueOnce(recurringMock);

    const result = await listCoupleEventsInRange("c1", new Date(2026, 5, 1), new Date(2026, 5, 30));
    expect(result).toEqual({ error: "Errore di rete" });
  });

  it("propaga l'errore della query 'ricorrenti'", async () => {
    const rangeMock = makeRangeQueryMock({ data: [], error: null });
    const recurringMock = makeRecurringQueryMock({ data: null, error: { message: "Errore di rete" } });
    mockSupabase.from.mockReturnValueOnce(rangeMock).mockReturnValueOnce(recurringMock);

    const result = await listCoupleEventsInRange("c1", new Date(2026, 5, 1), new Date(2026, 5, 30));
    expect(result).toEqual({ error: "Errore di rete" });
  });
});

/** yyyy-mm-dd locale, solo per le asserzioni di questo file (evita di importare lib/calendar-dates.ts solo per toDateKey). */
function toDateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
