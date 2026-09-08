/**
 * Unit test per lib/mood-actions.ts (getTodaysMood, logTodaysMood,
 * getMoodForDate, getMoodRevealForNotification) — check-in emotivo
 * quotidiano. Stesso pattern generale di tests/lib/quiz-actions.test.ts
 * (stesso schema di rivelazione reciproca RLS).
 */

import { makeQueryBuilderMock } from "../helpers/supabase-query-mock";

type MoodResponse = {
  data:
    | {
        profile_id: string;
        mood: string;
        mood_custom_label: string | null;
        profiles: { display_name: string | null } | null;
      }[]
    | null;
  error: { message: string } | null;
};
type InsertResponse = { error: { message: string } | null };
type SourceLookupResponse = { data: { checkin_date: string } | null; error: { message: string } | null };

function makeMoodCheckinsMock(selectResponse: MoodResponse, insertResponse: InsertResponse = { error: null }) {
  const eq = jest.fn<Promise<MoodResponse>, [string, string]>().mockResolvedValue(selectResponse);
  const select = jest.fn<{ eq: typeof eq }, [string]>().mockReturnValue({ eq });
  const insert = jest.fn<Promise<InsertResponse>, [unknown]>().mockResolvedValue(insertResponse);
  return { select, eq, insert };
}

/** Mock per `.from("mood_checkins").select("checkin_date").eq("id", id).maybeSingle()` — la lookup del source_id di una notifica. */
function makeSourceLookupMock(response: SourceLookupResponse) {
  const maybeSingle = jest.fn<Promise<SourceLookupResponse>, []>().mockResolvedValue(response);
  const eq = jest.fn<{ maybeSingle: typeof maybeSingle }, [string, string]>().mockReturnValue({ maybeSingle });
  const select = jest.fn<{ eq: typeof eq }, [string]>().mockReturnValue({ eq });
  return { select, eq, maybeSingle };
}

type FromReturn =
  | ReturnType<typeof makeMoodCheckinsMock>
  | ReturnType<typeof makeQueryBuilderMock>
  | ReturnType<typeof makeSourceLookupMock>;

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

import { getTodaysMood, logTodaysMood, getMoodForDate, getMoodRevealForNotification } from "@/lib/mood-actions";

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
    expect(result).toEqual({
      myMood: null,
      myCustomLabel: null,
      partnerMood: null,
      partnerCustomLabel: null,
      partnerName: null,
      revealed: false,
    });
  });

  it("solo io ho fatto il check-in: myMood valorizzato, partner null, revealed false", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(
      makeMoodCheckinsMock({
        data: [{ profile_id: "me", mood: "felice", mood_custom_label: null, profiles: null }],
        error: null,
      }),
    );

    const result = await getTodaysMood();
    expect(result).toEqual({
      myMood: "felice",
      myCustomLabel: null,
      partnerMood: null,
      partnerCustomLabel: null,
      partnerName: null,
      revealed: false,
    });
  });

  it("mood 'altro' espone l'etichetta personalizzata", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(
      makeMoodCheckinsMock({
        data: [{ profile_id: "me", mood: "altro", mood_custom_label: "Nervoso per l'esame", profiles: null }],
        error: null,
      }),
    );

    const result = await getTodaysMood();
    expect(result).toEqual(
      expect.objectContaining({ myMood: "altro", myCustomLabel: "Nervoso per l'esame" }),
    );
  });

  it("entrambi hanno fatto il check-in: revealed true, partnerName risolto da profiles", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(
      makeMoodCheckinsMock({
        data: [
          { profile_id: "me", mood: "felice", mood_custom_label: null, profiles: null },
          { profile_id: "partner-1", mood: "stanco", mood_custom_label: null, profiles: { display_name: "Sam" } },
        ],
        error: null,
      }),
    );

    const result = await getTodaysMood();
    expect(result).toEqual({
      myMood: "felice",
      myCustomLabel: null,
      partnerMood: "stanco",
      partnerCustomLabel: null,
      partnerName: "Sam",
      revealed: true,
    });
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

  it("mood='altro' senza etichetta ritorna errore, senza chiamare la query", async () => {
    const result = await logTodaysMood("altro");
    expect(result).toEqual({ error: "Scrivi come ti senti." });
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("mood='altro' con etichetta solo spazi ritorna lo stesso errore", async () => {
    const result = await logTodaysMood("altro", "   ");
    expect(result).toEqual({ error: "Scrivi come ti senti." });
  });

  it("inserisce il mood e ritorna lo stato aggiornato (refetch)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const moodMock = makeMoodCheckinsMock({
      data: [{ profile_id: "me", mood: "felice", mood_custom_label: null, profiles: null }],
      error: null,
    });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "mood_checkins") return moodMock;
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await logTodaysMood("felice");

    expect(moodMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ couple_id: "c1", profile_id: "me", mood: "felice", mood_custom_label: null }),
    );
    expect(result).toEqual(expect.objectContaining({ myMood: "felice" }));
  });

  it("inserisce mood='altro' con l'etichetta trimmata in mood_custom_label", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const moodMock = makeMoodCheckinsMock({
      data: [{ profile_id: "me", mood: "altro", mood_custom_label: "Nervoso per l'esame", profiles: null }],
      error: null,
    });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "mood_checkins") return moodMock;
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await logTodaysMood("altro", "  Nervoso per l'esame  ");

    expect(moodMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ mood: "altro", mood_custom_label: "Nervoso per l'esame" }),
    );
    expect(result).toEqual(expect.objectContaining({ myMood: "altro", myCustomLabel: "Nervoso per l'esame" }));
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

describe("getMoodForDate", () => {
  it("interroga checkin_date invece di 'oggi'", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const mock = makeMoodCheckinsMock({ data: [], error: null });
    mockSupabase.from.mockReturnValue(mock);

    await getMoodForDate("2026-08-20");
    expect(mock.eq).toHaveBeenCalledWith("checkin_date", "2026-08-20");
  });
});

describe("getMoodRevealForNotification", () => {
  it("ritorna error 'not_ready' se la riga sorgente non è (ancora) leggibile", async () => {
    mockSupabase.from.mockReturnValue(makeSourceLookupMock({ data: null, error: null }));

    const result = await getMoodRevealForNotification("row-1");
    expect(result).toEqual({ error: "not_ready" });
  });

  it("propaga l'errore della lookup del source_id", async () => {
    mockSupabase.from.mockReturnValue(makeSourceLookupMock({ data: null, error: { message: "Errore di rete" } }));

    const result = await getMoodRevealForNotification("row-1");
    expect(result).toEqual({ error: "Errore di rete" });
  });

  it("risolve la data e ritorna il dettaglio completo se rivelato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const sourceMock = makeSourceLookupMock({ data: { checkin_date: "2026-08-20" }, error: null });
    const listMock = makeMoodCheckinsMock({
      data: [
        { profile_id: "me", mood: "felice", mood_custom_label: null, profiles: null },
        { profile_id: "partner-1", mood: "stanco", mood_custom_label: null, profiles: { display_name: "Sam" } },
      ],
      error: null,
    });
    let call = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table !== "mood_checkins") throw new Error(`tabella inattesa nel test: ${table}`);
      call += 1;
      return call === 1 ? sourceMock : listMock;
    });

    const result = await getMoodRevealForNotification("row-1");
    expect(result).toEqual({
      myMood: "felice",
      myCustomLabel: null,
      partnerMood: "stanco",
      partnerCustomLabel: null,
      partnerName: "Sam",
      revealed: true,
      checkinDate: "2026-08-20",
    });
  });

  it("ritorna 'not_ready' se la data risolta non è (ancora) rivelata", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const sourceMock = makeSourceLookupMock({ data: { checkin_date: "2026-08-20" }, error: null });
    const listMock = makeMoodCheckinsMock({
      data: [{ profile_id: "me", mood: "felice", mood_custom_label: null, profiles: null }],
      error: null,
    });
    let call = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table !== "mood_checkins") throw new Error(`tabella inattesa nel test: ${table}`);
      call += 1;
      return call === 1 ? sourceMock : listMock;
    });

    const result = await getMoodRevealForNotification("row-1");
    expect(result).toEqual({ error: "not_ready" });
  });
});
