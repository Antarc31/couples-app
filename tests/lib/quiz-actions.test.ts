/**
 * Unit test per lib/quiz-actions.ts (getTodaysQuiz, answerTodaysQuiz) — quiz
 * giornaliero "quanto mi conosci" (Fase B del piano approvato).
 *
 * Il client Supabase reale viene mockato: qui non verifichiamo che la RLS di
 * quiz_answers funzioni davvero (quella si verifica applicando la migration
 * al progetto di test, come da prassi del progetto), ma che quiz-actions.ts
 * orchestri correttamente le chiamate — inclusa la rotazione deterministica
 * della domanda del giorno e il refetch dopo l'invio della risposta.
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest` globale
 * ambient (non `import { jest } from "@jest/globals"`).
 */

import { makeQueryBuilderMock } from "../helpers/supabase-query-mock";

type QuestionsResponse = { data: { id: string; prompt: string }[] | null; error: { message: string } | null };
type AnswersResponse = {
  data: { profile_id: string; answer: string }[] | null;
  error: { message: string } | null;
};
type InsertResponse = { error: { message: string } | null };

function makeQuestionsMock(response: QuestionsResponse) {
  const order = jest.fn<Promise<QuestionsResponse>, [string, unknown?]>().mockResolvedValue(response);
  const select = jest.fn<{ order: typeof order }, [string]>().mockReturnValue({ order });
  return { select, order };
}

/** Mock combinato per "quiz_answers": espone sia .select().eq() (getTodaysQuiz) sia .insert() (answerTodaysQuiz) sullo stesso oggetto, perché nella stessa chiamata ad answerTodaysQuiz vengono usati entrambi (insert, poi refetch). */
function makeQuizAnswersMock(selectResponse: AnswersResponse, insertResponse: InsertResponse = { error: null }) {
  const eq = jest.fn<Promise<AnswersResponse>, [string, string]>().mockResolvedValue(selectResponse);
  const select = jest.fn<{ eq: typeof eq }, [string]>().mockReturnValue({ eq });
  const insert = jest.fn<Promise<InsertResponse>, [unknown]>().mockResolvedValue(insertResponse);
  return { select, eq, insert };
}

type FromReturn =
  | ReturnType<typeof makeQuestionsMock>
  | ReturnType<typeof makeQuizAnswersMock>
  | ReturnType<typeof makeQueryBuilderMock>;

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

import { getTodaysQuiz, answerTodaysQuiz } from "@/lib/quiz-actions";

const QUESTIONS = [
  { id: "q1", prompt: "Qual è il mio colore preferito?" },
  { id: "q2", prompt: "Qual è il mio piatto preferito?" },
  { id: "q3", prompt: "Qual è la mia più grande paura?" },
];

beforeEach(() => {
  mockSupabase = makeMockSupabase();
});

describe("getTodaysQuiz", () => {
  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await getTodaysQuiz();
    expect(result).toEqual({ error: "Utente non autenticato" });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("propaga l'errore se il pool di domande non si riesce a leggere", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makeQuestionsMock({ data: null, error: { message: "Errore di rete" } }));

    const result = await getTodaysQuiz();
    expect(result).toEqual({ error: "Errore di rete" });
  });

  it("ritorna errore se il pool di domande è vuoto", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makeQuestionsMock({ data: [], error: null }));

    const result = await getTodaysQuiz();
    expect(result).toEqual({ error: "Nessuna domanda disponibile." });
  });

  it("nessuna risposta oggi: myAnswer/partnerAnswer null, revealed false", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "quiz_questions") return makeQuestionsMock({ data: QUESTIONS, error: null });
      if (table === "quiz_answers") return makeQuizAnswersMock({ data: [], error: null });
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await getTodaysQuiz();
    expect(result).toMatchObject({ myAnswer: null, partnerAnswer: null, revealed: false });
    expect((result as { prompt: string }).prompt).toEqual(expect.any(String));
  });

  it("solo io ho risposto: myAnswer valorizzata, partnerAnswer null, revealed false (coerente con RLS: la riga del partner non esisterebbe finché non rispondo anch'io)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "quiz_questions") return makeQuestionsMock({ data: QUESTIONS, error: null });
      if (table === "quiz_answers") {
        return makeQuizAnswersMock({ data: [{ profile_id: "me", answer: "Rosso" }], error: null });
      }
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await getTodaysQuiz();
    expect(result).toMatchObject({ myAnswer: "Rosso", partnerAnswer: null, revealed: false });
  });

  it("entrambi hanno risposto: revealed true, entrambe le risposte visibili", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "quiz_questions") return makeQuestionsMock({ data: QUESTIONS, error: null });
      if (table === "quiz_answers") {
        return makeQuizAnswersMock({
          data: [
            { profile_id: "me", answer: "Rosso" },
            { profile_id: "partner-1", answer: "Blu" },
          ],
          error: null,
        });
      }
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await getTodaysQuiz();
    expect(result).toMatchObject({ myAnswer: "Rosso", partnerAnswer: "Blu", revealed: true });
  });

  it("propaga l'errore della query delle risposte", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "quiz_questions") return makeQuestionsMock({ data: QUESTIONS, error: null });
      if (table === "quiz_answers") return makeQuizAnswersMock({ data: null, error: { message: "Errore risposte" } });
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await getTodaysQuiz();
    expect(result).toEqual({ error: "Errore risposte" });
  });
});

describe("answerTodaysQuiz", () => {
  it("ritorna errore senza chiamare Supabase se la risposta è vuota/solo spazi", async () => {
    const result = await answerTodaysQuiz("q1", "   ");
    expect(result).toEqual({ error: "La risposta non può essere vuota." });
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await answerTodaysQuiz("q1", "Rosso");
    expect(result).toEqual({ error: "Utente non autenticato" });
  });

  it("ritorna errore se l'utente non è accoppiato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makeQueryBuilderMock({ couple_id: null }));

    const result = await answerTodaysQuiz("q1", "Rosso");
    expect(result).toEqual({ error: "Non sei accoppiato/a con un partner." });
  });

  it("inserisce la risposta trimmata e ritorna lo stato aggiornato (refetch)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const quizAnswersMock = makeQuizAnswersMock({ data: [{ profile_id: "me", answer: "Rosso" }], error: null });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "quiz_answers") return quizAnswersMock;
      if (table === "quiz_questions") return makeQuestionsMock({ data: QUESTIONS, error: null });
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await answerTodaysQuiz("q1", "  Rosso  ");

    expect(quizAnswersMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ couple_id: "c1", profile_id: "me", question_id: "q1", answer: "Rosso" }),
    );
    expect(result).toMatchObject({ myAnswer: "Rosso", revealed: false });
  });

  it("propaga l'errore di insert senza fare il refetch", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "quiz_answers") {
        return makeQuizAnswersMock({ data: [], error: null }, { error: { message: "Hai già risposto oggi" } });
      }
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await answerTodaysQuiz("q1", "Rosso");
    expect(result).toEqual({ error: "Hai già risposto oggi" });
    expect(mockSupabase.from).not.toHaveBeenCalledWith("quiz_questions");
  });
});
