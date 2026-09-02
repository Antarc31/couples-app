/**
 * Unit test per lib/appointments-actions.ts (listAppointments,
 * createAppointmentIdea, confirmAppointment, updateAppointment,
 * deleteAppointment) — sezione Appuntamenti (docs/PLAN.md), consegnata da
 * backend2 in Fase 2.
 *
 * Il client Supabase reale (@/lib/supabase/client) viene mockato: qui NON
 * verifichiamo che la tabella `appointments`/i vincoli DB funzionino davvero
 * (non "live" al momento di questi test, vedi HANDOFF.md — backend2 deve
 * ancora confermare `supabase db push`), ma che appointments-actions.ts
 * orchestri correttamente le chiamate e mappi risposta/errore nella forma
 * attesa dal frontend (Appointment[] | ActionError).
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest` globale
 * ambient (non `import { jest } from "@jest/globals"`).
 */

import { makeQueryBuilderMock } from "../helpers/supabase-query-mock";

type MockGetUserResponse = { data: { user: { id: string } | null } };
type QueryResponse<T> = { data: T; error: { message: string } | null };

/** Mock della catena `.from("appointments").select(cols).order(col, opts)` (senza .limit). */
function makeSelectOrderMock(response: QueryResponse<unknown[] | null>) {
  const order = jest
    .fn<Promise<typeof response>, [column: string, opts?: unknown]>()
    .mockResolvedValue(response);
  const select = jest.fn<{ order: typeof order }, [columns: string]>().mockReturnValue({ order });
  return { select, order };
}

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

/**
 * Mock combinato per la tabella `calendar_events` così come viene usata da
 * confirmAppointment: un `insert(...).select("id").single()` sempre, e
 * (solo sul percorso di rollback) un `delete().eq("id", ...)` separato.
 * Vedi lib/appointments-actions.ts: `confirmAppointment` fa due scritture
 * lato client non atomiche (nessun trigger/RPC), con rollback best-effort
 * del calendar_event se il secondo update fallisce.
 */
function makeCalendarEventsMock(
  insertResponse: QueryResponse<unknown>,
  deleteResponse: { error: { message: string } | null } = { error: null },
) {
  const insertMock = makeInsertSelectSingleMock(insertResponse);
  const deleteMock = makeDeleteEqMock(deleteResponse);
  return {
    insert: insertMock.insert,
    delete: deleteMock.delete,
    _insertMock: insertMock,
    _deleteMock: deleteMock,
  };
}

type FromReturn =
  | ReturnType<typeof makeQueryBuilderMock>
  | ReturnType<typeof makeSelectOrderMock>
  | ReturnType<typeof makeInsertSelectSingleMock>
  | ReturnType<typeof makeUpdateEqSelectSingleMock>
  | ReturnType<typeof makeDeleteEqMock>
  | ReturnType<typeof makeCalendarEventsMock>;

type MockSupabase = {
  auth: { getUser: jest.Mock<Promise<MockGetUserResponse>, []> };
  from: jest.Mock<FromReturn, [table: string]>;
};

function makeMockSupabase(): MockSupabase {
  return {
    auth: { getUser: jest.fn<Promise<MockGetUserResponse>, []>() },
    from: jest.fn<FromReturn, [table: string]>(),
  };
}

let mockSupabase: MockSupabase;

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

import {
  listAppointments,
  createAppointmentIdea,
  confirmAppointment,
  createConfirmedAppointment,
  updateAppointment,
  deleteAppointment,
} from "@/lib/appointments-actions";

beforeEach(() => {
  mockSupabase = makeMockSupabase();
});

const baseRow = {
  id: "ap1",
  couple_id: "c1",
  created_by: "me",
  title: "Cena romantica",
  location: null,
  cost: null,
  notes: null,
  photo_url: null,
  tag: null,
  status: "idea" as const,
  calendar_event_id: null,
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
};

const baseAppointment = {
  id: "ap1",
  coupleId: "c1",
  createdBy: "me",
  title: "Cena romantica",
  location: null,
  cost: null,
  notes: null,
  photoUrl: null,
  tag: null,
  status: "idea" as const,
  calendarEventId: null,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

describe("listAppointments", () => {
  it("mappa le righe (idee + confermati) più recenti prima", async () => {
    mockSupabase.from.mockReturnValue(
      makeSelectOrderMock({
        data: [
          baseRow,
          { ...baseRow, id: "ap2", status: "confermato", calendar_event_id: "ev1" },
        ],
        error: null,
      }),
    );

    const result = await listAppointments();

    expect(mockSupabase.from).toHaveBeenCalledWith("appointments");
    expect(result).toEqual([
      baseAppointment,
      { ...baseAppointment, id: "ap2", status: "confermato", calendarEventId: "ev1" },
    ]);
  });

  it("ritorna array vuoto se data è null senza errore", async () => {
    mockSupabase.from.mockReturnValue(makeSelectOrderMock({ data: null, error: null }));
    const result = await listAppointments();
    expect(result).toEqual([]);
  });

  it("propaga l'errore della query", async () => {
    mockSupabase.from.mockReturnValue(
      makeSelectOrderMock({ data: null, error: { message: "Errore di rete" } }),
    );
    const result = await listAppointments();
    expect(result).toEqual({ error: "Errore di rete" });
  });
});

describe("createAppointmentIdea", () => {
  it("ritorna errore senza chiamare Supabase se il titolo è vuoto/solo spazi", async () => {
    const result = await createAppointmentIdea({ title: "   " });
    expect(result).toEqual({ error: "Il titolo non può essere vuoto." });
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await createAppointmentIdea({ title: "Viaggio a Roma" });
    expect(result).toEqual({ error: "Utente non autenticato" });
  });

  it("ritorna errore se l'utente non è accoppiato (couple_id null)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makeQueryBuilderMock({ couple_id: null }));

    const result = await createAppointmentIdea({ title: "Viaggio a Roma" });
    expect(result).toEqual({ error: "Non sei accoppiato/a con un partner." });
  });

  it("inserisce l'idea (status 'idea' implicito, nessun calendar_event) e ritorna l'Appointment risultante", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "appointments") return makeInsertSelectSingleMock({ data: baseRow, error: null });
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await createAppointmentIdea({ title: "  Cena romantica  ", tag: "ristorante" });

    expect(result).toEqual(baseAppointment);
    // Verifica che l'insert non forzi mai uno status/calendar_event_id (resta al default DB 'idea').
    const appointmentsMock = mockSupabase.from.mock.results.find(
      (_, i) => mockSupabase.from.mock.calls[i][0] === "appointments",
    );
    expect(appointmentsMock).toBeDefined();
  });

  it("propaga l'errore di insert", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "appointments") return makeInsertSelectSingleMock({ data: null, error: { message: "RLS violation" } });
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await createAppointmentIdea({ title: "Viaggio a Roma" });
    expect(result).toEqual({ error: "RLS violation" });
  });
});

describe("confirmAppointment", () => {
  const confirmedRow = { ...baseRow, status: "confermato" as const, calendar_event_id: "ev1" };
  const confirmedAppointment = { ...baseAppointment, status: "confermato" as const, calendarEventId: "ev1" };

  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await confirmAppointment("ap1", { startsAt: "2026-09-10T20:00:00.000Z" }, "Cena romantica");
    expect(result).toEqual({ error: "Utente non autenticato" });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("ritorna errore se l'utente non è accoppiato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makeQueryBuilderMock({ couple_id: null }));

    const result = await confirmAppointment("ap1", { startsAt: "2026-09-10T20:00:00.000Z" }, "Cena romantica");
    expect(result).toEqual({ error: "Non sei accoppiato/a con un partner." });
  });

  it("crea il calendar_event (categoria default 'coppia') poi conferma l'appointment", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const calendarMock = makeCalendarEventsMock({ data: { id: "ev1" }, error: null });
    const updateMock = makeUpdateEqSelectSingleMock({ data: confirmedRow, error: null });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "calendar_events") return calendarMock;
      if (table === "appointments") return updateMock;
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await confirmAppointment(
      "ap1",
      { startsAt: "2026-09-10T20:00:00.000Z" },
      "Cena romantica",
    );

    expect(result).toEqual(confirmedAppointment);
    expect(calendarMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ couple_id: "c1", created_by: "me", category: "coppia", title: "Cena romantica" }),
    );
    expect(updateMock.update).toHaveBeenCalledWith({ status: "confermato", calendar_event_id: "ev1" });
    expect(updateMock.eq).toHaveBeenCalledWith("id", "ap1");
    // Nessun rollback quando tutto va bene.
    expect(calendarMock.delete).not.toHaveBeenCalled();
    // Nessun tag/notes passato -> calendar_events li riceve a null (default), non undefined.
    expect(calendarMock.insert).toHaveBeenCalledWith(expect.objectContaining({ tag: null, notes: null }));
  });

  it("passa tag/notes dell'appuntamento all'insert del calendar_event collegato (gap colmato per il piano UX punto 4)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const calendarMock = makeCalendarEventsMock({ data: { id: "ev1" }, error: null });
    const updateMock = makeUpdateEqSelectSingleMock({ data: confirmedRow, error: null });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "calendar_events") return calendarMock;
      if (table === "appointments") return updateMock;
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    await confirmAppointment(
      "ap1",
      { startsAt: "2026-09-10T20:00:00.000Z", tag: "ristorante", notes: "portare il vino" },
      "Cena romantica",
    );

    expect(calendarMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ tag: "ristorante", notes: "portare il vino" }),
    );
  });

  it("propaga l'errore se la creazione del calendar_event fallisce (nessun update tentato)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const calendarMock = makeCalendarEventsMock({ data: null, error: { message: "RLS violation su calendar_events" } });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "calendar_events") return calendarMock;
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await confirmAppointment("ap1", { startsAt: "2026-09-10T20:00:00.000Z" }, "Cena romantica");
    expect(result).toEqual({ error: "RLS violation su calendar_events" });
  });

  it("fa rollback (best-effort) del calendar_event appena creato se l'update dell'appointment fallisce", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const calendarMock = makeCalendarEventsMock({ data: { id: "ev1" }, error: null });
    const updateMock = makeUpdateEqSelectSingleMock({ data: null, error: { message: "appointment non trovato" } });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "calendar_events") return calendarMock;
      if (table === "appointments") return updateMock;
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await confirmAppointment("ap1", { startsAt: "2026-09-10T20:00:00.000Z" }, "Cena romantica");

    // L'errore originale (dell'update fallito) è quello riportato, non un eventuale
    // errore del rollback.
    expect(result).toEqual({ error: "appointment non trovato" });
    expect(calendarMock.delete).toHaveBeenCalled();
    expect(calendarMock._deleteMock.eq).toHaveBeenCalledWith("id", "ev1");
  });
});

describe("createConfirmedAppointment", () => {
  const confirmedRow = { ...baseRow, status: "confermato" as const, calendar_event_id: "ev1" };
  const confirmedAppointment = { ...baseAppointment, status: "confermato" as const, calendarEventId: "ev1" };

  it("ritorna errore senza chiamare Supabase se il titolo è vuoto/solo spazi", async () => {
    const result = await createConfirmedAppointment(
      { title: "   " },
      { startsAt: "2026-09-10T20:00:00.000Z" },
    );
    expect(result).toEqual({ error: "Il titolo non può essere vuoto." });
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await createConfirmedAppointment(
      { title: "Cena romantica" },
      { startsAt: "2026-09-10T20:00:00.000Z" },
    );
    expect(result).toEqual({ error: "Utente non autenticato" });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("ritorna errore se l'utente non è accoppiato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makeQueryBuilderMock({ couple_id: null }));

    const result = await createConfirmedAppointment(
      { title: "Cena romantica" },
      { startsAt: "2026-09-10T20:00:00.000Z" },
    );
    expect(result).toEqual({ error: "Non sei accoppiato/a con un partner." });
  });

  it("crea il calendar_event (categoria default 'coppia') poi inserisce l'appointment GIÀ 'confermato' con UN SOLO insert (non idea->update)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const calendarMock = makeCalendarEventsMock({ data: { id: "ev1" }, error: null });
    const appointmentsInsertMock = makeInsertSelectSingleMock({ data: confirmedRow, error: null });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "calendar_events") return calendarMock;
      if (table === "appointments") return appointmentsInsertMock;
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await createConfirmedAppointment(
      { title: "  Cena romantica  " },
      { startsAt: "2026-09-10T20:00:00.000Z" },
    );

    expect(result).toEqual(confirmedAppointment);
    expect(calendarMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ couple_id: "c1", created_by: "me", category: "coppia", title: "Cena romantica" }),
    );
    expect(appointmentsInsertMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        couple_id: "c1",
        created_by: "me",
        title: "Cena romantica",
        status: "confermato",
        calendar_event_id: "ev1",
      }),
    );
    expect(calendarMock.delete).not.toHaveBeenCalled();
    // Nessun tag/notes passato -> calendar_events li riceve a null (default), non undefined.
    expect(calendarMock.insert).toHaveBeenCalledWith(expect.objectContaining({ tag: null, notes: null }));
  });

  it("passa tag/notes dell'appuntamento all'insert del calendar_event collegato (gap colmato per il piano UX punto 4)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const calendarMock = makeCalendarEventsMock({ data: { id: "ev1" }, error: null });
    const appointmentsInsertMock = makeInsertSelectSingleMock({ data: confirmedRow, error: null });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "calendar_events") return calendarMock;
      if (table === "appointments") return appointmentsInsertMock;
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    await createConfirmedAppointment(
      { title: "Cena romantica" },
      { startsAt: "2026-09-10T20:00:00.000Z", tag: "ristorante", notes: "portare il vino" },
    );

    expect(calendarMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ tag: "ristorante", notes: "portare il vino" }),
    );
  });

  it("propaga l'errore se la creazione del calendar_event fallisce (nessun insert su appointments tentato)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const calendarMock = makeCalendarEventsMock({ data: null, error: { message: "RLS violation su calendar_events" } });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "calendar_events") return calendarMock;
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await createConfirmedAppointment(
      { title: "Cena romantica" },
      { startsAt: "2026-09-10T20:00:00.000Z" },
    );
    expect(result).toEqual({ error: "RLS violation su calendar_events" });
  });

  it("fa rollback (best-effort) del calendar_event appena creato se l'insert dell'appointment fallisce", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const calendarMock = makeCalendarEventsMock({ data: { id: "ev1" }, error: null });
    const appointmentsInsertMock = makeInsertSelectSingleMock({ data: null, error: { message: "RLS violation su appointments" } });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "calendar_events") return calendarMock;
      if (table === "appointments") return appointmentsInsertMock;
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await createConfirmedAppointment(
      { title: "Cena romantica" },
      { startsAt: "2026-09-10T20:00:00.000Z" },
    );

    // L'errore originale (dell'insert fallito), non un eventuale errore del rollback.
    expect(result).toEqual({ error: "RLS violation su appointments" });
    expect(calendarMock.delete).toHaveBeenCalled();
    expect(calendarMock._deleteMock.eq).toHaveBeenCalledWith("id", "ev1");
  });
});

describe("updateAppointment", () => {
  it("aggiorna solo i campi passati (trim su title) e mappa il risultato", async () => {
    const updateMock = makeUpdateEqSelectSingleMock({
      data: { ...baseRow, title: "Cena romantica 2" },
      error: null,
    });
    mockSupabase.from.mockReturnValue(updateMock);

    const result = await updateAppointment("ap1", { title: "  Cena romantica 2  " });

    expect(updateMock.update).toHaveBeenCalledWith({ title: "Cena romantica 2" });
    expect(result).toEqual({ ...baseAppointment, title: "Cena romantica 2" });
  });

  it("propaga l'errore della query", async () => {
    mockSupabase.from.mockReturnValue(
      makeUpdateEqSelectSingleMock({ data: null, error: { message: "Non autorizzato" } }),
    );
    const result = await updateAppointment("ap1", { title: "X" });
    expect(result).toEqual({ error: "Non autorizzato" });
  });
});

describe("deleteAppointment", () => {
  it("ritorna true se la delete riesce", async () => {
    const deleteMock = makeDeleteEqMock({ error: null });
    mockSupabase.from.mockReturnValue(deleteMock);

    const result = await deleteAppointment("ap1");

    expect(result).toBe(true);
    expect(deleteMock.eq).toHaveBeenCalledWith("id", "ap1");
  });

  it("propaga l'errore della delete", async () => {
    mockSupabase.from.mockReturnValue(makeDeleteEqMock({ error: { message: "Non autorizzato" } }));
    const result = await deleteAppointment("ap1");
    expect(result).toEqual({ error: "Non autorizzato" });
  });
});
