/**
 * Unit test per lib/profile-actions.ts (updateBirthDate,
 * setRelationshipStartDate) — le due azioni dietro
 * components/profilo/ProfileEditForm.tsx (piano "Feature B — Eventi
 * 'speciale' automatici").
 *
 * Il client Supabase reale (@/lib/supabase/client) viene mockato: qui NON
 * verifichiamo che i trigger DB che generano gli eventi calendario
 * funzionino davvero (scritti ma non ancora collaudati su un Postgres
 * reale, vedi HANDOFF.md), ma che questo modulo orchestri correttamente le
 * chiamate e mappi risposta/errore nella forma attesa dal frontend
 * (true | ActionError).
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest`
 * globale ambient (non `import { jest } from "@jest/globals"`) — stesso
 * bug di hoisting, stesso fix.
 */

type MockGetUserResponse = { data: { user: { id: string } | null } };
type UpdateResponse = { error: { message: string } | null };

/** Mock della catena `.from("profiles").update(patch).eq("id", val)`. */
function makeUpdateEqMock(response: UpdateResponse) {
  const eq = jest.fn<Promise<UpdateResponse>, [column: string, value: string]>().mockResolvedValue(response);
  const update = jest.fn<{ eq: typeof eq }, [patch: unknown]>().mockReturnValue({ eq });
  return { update, eq };
}

type MockSupabase = {
  auth: {
    getUser: jest.Mock<Promise<MockGetUserResponse>, []>;
  };
  from: jest.Mock<ReturnType<typeof makeUpdateEqMock>, [table: string]>;
  rpc: jest.Mock<Promise<{ data: unknown; error: { message: string } | null }>, [fn: string, args?: unknown]>;
};

function makeMockSupabase(): MockSupabase {
  return {
    auth: {
      getUser: jest.fn<Promise<MockGetUserResponse>, []>(),
    },
    from: jest.fn<ReturnType<typeof makeUpdateEqMock>, [table: string]>(),
    rpc: jest.fn<Promise<{ data: unknown; error: { message: string } | null }>, [fn: string, args?: unknown]>(),
  };
}

let mockSupabase: MockSupabase;

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

import { updateBirthDate, setRelationshipStartDate, setQuizEnabled, setMoodCheckinEnabled } from "@/lib/profile-actions";

beforeEach(() => {
  mockSupabase = makeMockSupabase();
});

describe("updateBirthDate", () => {
  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await updateBirthDate("1998-03-14");
    expect(result).toEqual({ error: "Utente non autenticato" });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("aggiorna profiles.birth_date per l'utente corrente e ritorna true", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { update, eq } = makeUpdateEqMock({ error: null });
    mockSupabase.from.mockReturnValue({ update, eq });

    const result = await updateBirthDate("1998-03-14");

    expect(result).toBe(true);
    expect(mockSupabase.from).toHaveBeenCalledWith("profiles");
    expect(update).toHaveBeenCalledWith({ birth_date: "1998-03-14" });
    expect(eq).toHaveBeenCalledWith("id", "u1");
  });

  it("passa null per svuotare la data (rimuove l'evento collegato lato trigger)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { update, eq } = makeUpdateEqMock({ error: null });
    mockSupabase.from.mockReturnValue({ update, eq });

    const result = await updateBirthDate(null);

    expect(result).toBe(true);
    expect(update).toHaveBeenCalledWith({ birth_date: null });
  });

  it("propaga l'errore della query", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { update, eq } = makeUpdateEqMock({ error: { message: "colonna inesistente" } });
    mockSupabase.from.mockReturnValue({ update, eq });

    const result = await updateBirthDate("1998-03-14");

    expect(result).toEqual({ error: "colonna inesistente" });
  });
});

describe("setRelationshipStartDate", () => {
  it("ritorna errore se la data è vuota, senza chiamare la RPC", async () => {
    const result = await setRelationshipStartDate("   ");
    expect(result).toEqual({ error: "La data non può essere vuota." });
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it("chiama la RPC set_relationship_start_date con p_date e ritorna true in caso di successo", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    const result = await setRelationshipStartDate("2022-05-14");

    expect(result).toBe(true);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("set_relationship_start_date", { p_date: "2022-05-14" });
  });

  it("propaga l'errore della RPC (es. utente non accoppiato o non autenticato)", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: "Non sei accoppiato/a con un partner" } });

    const result = await setRelationshipStartDate("2022-05-14");

    expect(result).toEqual({ error: "Non sei accoppiato/a con un partner" });
  });
});

describe("setQuizEnabled", () => {
  it("chiama la RPC set_quiz_enabled con p_enabled e ritorna true in caso di successo", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    const result = await setQuizEnabled(true);

    expect(result).toBe(true);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("set_quiz_enabled", { p_enabled: true });
  });

  it("propaga l'errore della RPC", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: "Non sei accoppiato/a con un partner." } });

    const result = await setQuizEnabled(false);

    expect(result).toEqual({ error: "Non sei accoppiato/a con un partner." });
  });
});

describe("setMoodCheckinEnabled", () => {
  it("chiama la RPC set_mood_checkin_enabled con p_enabled e ritorna true in caso di successo", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    const result = await setMoodCheckinEnabled(true);

    expect(result).toBe(true);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("set_mood_checkin_enabled", { p_enabled: true });
  });

  it("propaga l'errore della RPC", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: "Non sei accoppiato/a con un partner." } });

    const result = await setMoodCheckinEnabled(false);

    expect(result).toEqual({ error: "Non sei accoppiato/a con un partner." });
  });
});
