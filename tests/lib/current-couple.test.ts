/**
 * Unit test per lib/current-couple.ts (getCurrentCoupleData).
 *
 * Il client Supabase server-side (@/lib/supabase/server, `createClient`
 * async) viene mockato: qui NON verifichiamo che Supabase/RLS funzionino
 * davvero (serve un'istanza reale/Docker), ma che getCurrentCoupleData
 * orchestri correttamente profilo + coppia + partner (ora in un'UNICA query
 * embedded, non più tre round-trip separati — vedi il commento in
 * lib/current-couple.ts) e degradi bene (ritorni null / partner null /
 * couple null) quando dei pezzi mancano.
 *
 * Mock locale invece del solito tests/helpers/supabase-query-mock.ts:
 * questa query è l'unica nel progetto che chiude la catena con
 * `.returns<T>()` dopo `.maybeSingle()` (necessario perché postgrest-js non
 * infierisce da solo il tipo di un embed multi-hop con alias su FK
 * ambigue), e il helper condiviso non lo supporta — a runtime `.returns()`
 * è un no-op puramente di tipo (nessun argomento), quindi il mock qui sotto
 * si limita a farlo ritornare la stessa Promise di `.maybeSingle()`.
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest`
 * globale ambient (non `import { jest } from "@jest/globals"`) e per il
 * bug di hoisting che altrimenti fa fallire i test a runtime.
 */

type MockRow = Record<string, unknown> | null;

type MockAuthUser = { id: string; email?: string };
type MockGetUserResponse = { data: { user: MockAuthUser | null } };

type MockSupabase = {
  auth: {
    getUser: jest.Mock<Promise<MockGetUserResponse>, []>;
  };
  from: jest.Mock;
};

/** Mock della catena `.from("profiles").select(...).eq(...).maybeSingle().returns<T>()`. */
function makeProfileQueryMock(row: MockRow) {
  const resultPromise = Promise.resolve({ data: row });
  const returns = jest.fn().mockReturnValue(resultPromise);
  const maybeSingle = jest.fn().mockReturnValue({ returns });
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  return { select, eq, maybeSingle, returns };
}

function makeMockSupabase(): MockSupabase {
  return {
    auth: {
      getUser: jest.fn<Promise<MockGetUserResponse>, []>(),
    },
    from: jest.fn(),
  };
}

let mockSupabase: MockSupabase;

jest.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(mockSupabase),
}));

// React cache() de-duplica per render/request reale (Next.js) — fuori da
// quel contesto (qui, in un test Node/Jest puro) non c'è alcun request
// scope attivo, quindi ogni chiamata a getCurrentCoupleData() in questi
// test esegue davvero la query mockata da capo (nessun rischio di
// inquinamento tra un `it()` e l'altro).
import { getCurrentCoupleData } from "@/lib/current-couple";

beforeEach(() => {
  mockSupabase = makeMockSupabase();
});

describe("getCurrentCoupleData", () => {
  it("ritorna null se non c'è utente autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await getCurrentCoupleData();
    expect(result).toBeNull();
  });

  it("ritorna null se l'utente autenticato non ha un profilo", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    mockSupabase.from.mockReturnValue(makeProfileQueryMock(null));

    const result = await getCurrentCoupleData();
    expect(result).toBeNull();
  });

  it("ritorna profilo con partner=null e couple=null se non ancora accoppiato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });
    mockSupabase.from.mockReturnValue(
      makeProfileQueryMock({ display_name: "Anna", color: "#F7A6C4", couple_id: null, birth_date: null, couple: null }),
    );

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
    mockSupabase.from.mockReturnValue(
      makeProfileQueryMock({
        display_name: "Anna",
        color: "#F7A6C4",
        couple_id: null,
        birth_date: "1998-03-14",
        couple: null,
      }),
    );

    const result = await getCurrentCoupleData();

    expect(result?.birthDate).toBe("1998-03-14");
  });

  it("risolve il partner quando l'utente è partner_1 nella coppia, in una sola query", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me", email: "a@b.com" } } });
    const queryMock = makeProfileQueryMock({
      display_name: "Anna",
      color: "#F7A6C4",
      couple_id: "c1",
      birth_date: null,
      couple: {
        id: "c1",
        relationship_start_date: "2022-05-14",
        quiz_enabled: true,
        mood_checkin_enabled: false,
        partner_1: { id: "me", display_name: "Anna", color: "#F7A6C4" },
        partner_2: { id: "partner-1", display_name: "Marco", color: "#A6C8F0" },
      },
    });
    mockSupabase.from.mockReturnValue(queryMock);

    const result = await getCurrentCoupleData();

    // Una sola query invece delle tre round-trip sequenziali di prima
    // (profilo -> coppia -> profilo del partner): PostgREST fa il join via
    // le FK già presenti nello schema.
    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    expect(mockSupabase.from).toHaveBeenCalledWith("profiles");
    expect(result?.couple).toEqual({
      id: "c1",
      relationshipStartDate: "2022-05-14",
      quizEnabled: true,
      moodCheckinEnabled: false,
    });
    expect(result?.partner).toEqual({ id: "partner-1", displayName: "Marco", color: "#A6C8F0" });
  });

  it("risolve il partner quando l'utente è partner_2 nella coppia", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "partner-1", email: "a@b.com" } } });
    mockSupabase.from.mockReturnValue(
      makeProfileQueryMock({
        display_name: "Marco",
        color: "#A6C8F0",
        couple_id: "c1",
        birth_date: null,
        couple: {
          id: "c1",
          relationship_start_date: "2022-05-14",
          quiz_enabled: true,
          mood_checkin_enabled: true,
          partner_1: { id: "me", display_name: "Anna", color: "#F7A6C4" },
          partner_2: { id: "partner-1", display_name: "Marco", color: "#A6C8F0" },
        },
      }),
    );

    const result = await getCurrentCoupleData();

    expect(result?.partner).toEqual({ id: "me", displayName: "Anna", color: "#F7A6C4" });
  });

  it("ritorna couple=null e partner=null se l'embed couple non risolve (dato inconsistente, es. couple_id orfano)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me", email: "a@b.com" } } });
    mockSupabase.from.mockReturnValue(
      makeProfileQueryMock({ display_name: "Anna", color: "#F7A6C4", couple_id: "c1", birth_date: null, couple: null }),
    );

    const result = await getCurrentCoupleData();

    expect(result?.couple).toBeNull();
    expect(result?.partner).toBeNull();
  });
});
