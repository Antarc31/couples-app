/**
 * Unit test per lib/mood-actions.ts (getTodaysMood, logTodaysMood) —
 * check-in emotivo quotidiano (Fase B del piano approvato). Stessa forma di
 * tests/lib/quiz-actions.test.ts (stesso pattern di rivelazione reciproca).
 */

import { makeQueryBuilderMock } from "../helpers/supabase-query-mock";

type MoodResponse = { data: { profile_id: string; mood: string }[] | null; error: { message: string } | null };
type InsertResponse = { error: { message: string } | null };

function makeMoodCheckinsMock(selectResponse: MoodResponse, insertResponse: InsertResponse = { error: null }) {
  const eq = jest.fn<Promise<MoodResponse>, [string, string]>().mockResolvedValue(selectResponse);
  const select = jest.fn<{ eq: typeof eq }, [string]>().mockReturnValue({ eq });
  const insert = jest.fn<Promise<InsertResponse>, [unknown]>().mockResolvedValue(insertResponse);
  return { select, eq, insert };
}

type FromReturn = ReturnType<typeof makeMoodCheckinsMock> | ReturnType<typeof makeQueryBuilderMock>;

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

import { getTodaysMood, logTodaysMood } from "@/lib/mood-actions";

beforeEach(() => {
  mockSupabase = makeMockSupabase();
});

describe("getTodaysMood", () => {
  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await getTodaysMood();
    expect(result).toEqual({ error: "Utente non autenticato" });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("nessun check-in oggi: entrambi null, revealed false", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makeMoodCheckinsMock({ data: [], error: null }));

    const result = await getTodaysMood();
    expect(result).toEqual({ myMood: null, partnerMood: null, revealed: false });
  });

  it("solo io ho fatto il check-in: myMood valorizzato, partnerMood null, revealed false", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(
      makeMoodCheckinsMock({ data: [{ profile_id: "me", mood: "felice" }], error: null }),
    );

    const result = await getTodaysMood();
    expect(result).toEqual({ myMood: "felice", partnerMood: null, revealed: false });
  });

  it("entrambi hanno fatto il check-in: revealed true", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(
      makeMoodCheckinsMock({
        data: [
          { profile_id: "me", mood: "felice" },
          { profile_id: "partner-1", mood: "stanco" },
        ],
        error: null,
      }),
    );

    const result = await getTodaysMood();
    expect(result).toEqual({ myMood: "felice", partnerMood: "stanco", revealed: true });
  });

  it("propaga l'errore della query", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makeMoodCheckinsMock({ data: null, error: { message: "Errore di rete" } }));

    const result = await getTodaysMood();
    expect(result).toEqual({ error: "Errore di rete" });
  });
});

describe("logTodaysMood", () => {
  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await logTodaysMood("felice");
    expect(result).toEqual({ error: "Utente non autenticato" });
  });

  it("ritorna errore se l'utente non è accoppiato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makeQueryBuilderMock({ couple_id: null }));

    const result = await logTodaysMood("felice");
    expect(result).toEqual({ error: "Non sei accoppiato/a con un partner." });
  });

  it("inserisce il mood e ritorna lo stato aggiornato (refetch)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const moodMock = makeMoodCheckinsMock({ data: [{ profile_id: "me", mood: "felice" }], error: null });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "mood_checkins") return moodMock;
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await logTodaysMood("felice");

    expect(moodMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ couple_id: "c1", profile_id: "me", mood: "felice" }),
    );
    expect(result).toEqual({ myMood: "felice", partnerMood: null, revealed: false });
  });

  it("propaga l'errore di insert (es. hai già fatto il check-in oggi)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "mood_checkins") {
        return makeMoodCheckinsMock({ data: [], error: null }, { error: { message: "Hai già fatto il check-in oggi" } });
      }
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await logTodaysMood("felice");
    expect(result).toEqual({ error: "Hai già fatto il check-in oggi" });
  });
});
