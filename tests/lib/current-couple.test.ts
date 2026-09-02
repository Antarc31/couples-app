/**
 * Unit test per lib/current-couple.ts (getCurrentCoupleData).
 *
 * Il client Supabase server-side (@/lib/supabase/server, `createClient`
 * async) viene mockato: qui NON verifichiamo che Supabase/RLS funzionino
 * davvero (serve un'istanza reale/Docker), ma che getCurrentCoupleData
 * orchestri correttamente profilo + coppia + partner e degradi bene
 * (ritorni null / partner null / couple null) quando dei pezzi mancano.
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest`
 * globale ambient (non `import { jest } from "@jest/globals"`) e per il
 * bug di hoisting che altrimenti fa fallire i test a runtime.
 */

import { makeQueryBuilderMock, type MockRow } from "../helpers/supabase-query-mock";

type MockAuthUser = { id: string; email?: string };
type MockGetUserResponse = { data: { user: MockAuthUser | null } };

type MockSupabase = {
  auth: {
    getUser: jest.Mock<Promise<MockGetUserResponse>, []>;
  };
  from: jest.Mock<ReturnType<typeof makeQueryBuilderMock>, [table: string]>;
};

function makeMockSupabase(): MockSupabase {
  return {
    auth: {
      getUser: jest.fn<Promise<MockGetUserResponse>, []>(),
    },
    from: jest.fn<ReturnType<typeof makeQueryBuilderMock>, [table: string]>(),
  };
}

let mockSupabase: MockSupabase;

jest.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(mockSupabase),
}));

import { getCurrentCoupleData } from "@/lib/current-couple";

beforeEach(() => {
  mockSupabase = makeMockSupabase();
});

/** Configura from() per rispondere in base alla tabella richiesta. */
function mockTables(rows: Record<string, MockRow>) {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table in rows) return makeQueryBuilderMock(rows[table]);
    throw new Error(`tabella inattesa nel test: ${table}`);
  });
}

describe("getCurrentCoupleData", () => {
  it("ritorna null se non c'è utente autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await getCurrentCoupleData();
    expect(result).toBeNull();
  });

  it("ritorna null se l'utente autenticato non ha un profilo", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    mockTables({ profiles: null });

    const result = await getCurrentCoupleData();
    expect(result).toBeNull();
  });

  it("ritorna profilo con partner=null e couple=null se non ancora accoppiato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    mockTables({
      profiles: { display_name: "Anna", color: "#F7A6C4", couple_id: null, birth_date: null },
    });

    const result = await getCurrentCoupleData();

    expect(result).toEqual({
      userId: "u1",
      email: "a@b.com",
      displayName: "Anna",
      color: "#F7A6C4",
      birthDate: null,
      partner: null,
      couple: null,
    });
  });

  it("espone birthDate dal profilo dell'utente corrente (non del partner)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    mockTables({
      profiles: { display_name: "Anna", color: "#F7A6C4", couple_id: null, birth_date: "1998-03-14" },
    });

    const result = await getCurrentCoupleData();

    expect(result?.birthDate).toBe("1998-03-14");
  });

  it("risolve il partner quando l'utente è partner_1 nella coppia", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me", email: "a@b.com" } } });

    // getCurrentCoupleData chiama .from() in ordine fisso: profiles (self),
    // couples, profiles (partner) — mockiamo le tre chiamate in sequenza
    // invece di instradare per nome tabella, più semplice da leggere.
    mockSupabase.from
      .mockImplementationOnce(() =>
        makeQueryBuilderMock({ display_name: "Anna", color: "#F7A6C4", couple_id: "c1" }),
      )
      .mockImplementationOnce(() =>
        makeQueryBuilderMock({
          id: "c1",
          partner_1_id: "me",
          partner_2_id: "partner-1",
          relationship_start_date: "2022-05-14",
        }),
      )
      .mockImplementationOnce(() =>
        makeQueryBuilderMock({ id: "partner-1", display_name: "Marco", color: "#A6C8F0" }),
      );

    const result = await getCurrentCoupleData();

    expect(mockSupabase.from.mock.calls.map((call) => call[0])).toEqual([
      "profiles",
      "couples",
      "profiles",
    ]);
    expect(result?.couple).toEqual({ id: "c1", relationshipStartDate: "2022-05-14" });
    expect(result?.partner).toEqual({ id: "partner-1", displayName: "Marco", color: "#A6C8F0" });
  });

  it("ritorna couple=null e partner=null se la riga couples non viene trovata (dato inconsistente)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me", email: "a@b.com" } } });
    mockTables({
      profiles: { display_name: "Anna", color: "#F7A6C4", couple_id: "c1" },
      couples: null,
    });

    const result = await getCurrentCoupleData();

    expect(result?.couple).toBeNull();
    expect(result?.partner).toBeNull();
  });
});
