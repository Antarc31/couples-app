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

type FromReturn =
  | ReturnType<typeof makeQueryBuilderMock>
  | ReturnType<typeof makeInsertSelectSingleMock>
  | ReturnType<typeof makeUpdateEqSelectSingleMock>
  | ReturnType<typeof makeDeleteEqMock>;

type MockSupabase = {
  from: jest.Mock<FromReturn, [table: string]>;
};

function makeMockSupabase(): MockSupabase {
  return {
    from: jest.fn<FromReturn, [table: string]>(),
  };
}

let mockSupabase: MockSupabase;

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "@/lib/calendar-actions";

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
