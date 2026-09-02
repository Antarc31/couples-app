/**
 * Unit test per lib/quiz-actions.ts (getTodaysQuiz, submitTodaysQuiz,
 * confirmQuizGuess, getQuizScores) — quiz "indovina il partner" (Fase B,
 * redesign).
 *
 * Il client Supabase reale viene mockato: qui non verifichiamo che la RLS di
 * quiz_answers funzioni davvero (quella si verifica applicando la migration
 * al progetto di test, come da prassi del progetto), ma che quiz-actions.ts
 * orchestri correttamente le chiamate — inclusa la rotazione deterministica
 * della domanda del giorno e il refetch dopo submit/conferma.
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest` globale
 * ambient (non `import { jest } from "@jest/globals"`).
 */

import { makeQueryBuilderMock } from "../helpers/supabase-query-mock";

type QuestionsResponse = { data: { id: string; prompt: string }[] | null; error: { message: string } | null };
type AnswersResponse = {
  data: { id: string; profile_id: string; my_truth: string; my_guess: string; guess_correct: boolean | null }[] | null;
  error: { message: string } | null;
};
type InsertResponse = { error: { message: string } | null };
type RpcResponse = { error: { message: string } | null };
type CountResponse = { count: number | null; error: { message: string } | null };

function makeQuestionsMock(response: QuestionsResponse) {
  const order = jest.fn<Promise<QuestionsResponse>, [string, unknown?]>().mockResolvedValue(response);
  const select = jest.fn<{ order: typeof order }, [string]>().mockReturnValue({ order });
  return { select, order };
}

/** Mock combinato per "quiz_answers": .select().eq() (getTodaysQuiz/getQuizScores) e .insert() (submitTodaysQuiz) sullo stesso oggetto. */
function makeQuizAnswersMock(selectResponse: AnswersResponse, insertResponse: InsertResponse = { error: null }) {
  const eq = jest.fn<Promise<AnswersResponse>, [string, string]>().mockResolvedValue(selectResponse);
  const select = jest.fn<{ eq: typeof eq }, [string]>().mockReturnValue({ eq });
  const insert = jest.fn<Promise<InsertResponse>, [unknown]>().mockResolvedValue(insertResponse);
  return { select, eq, insert };
}

/** Chain per una singola query count: .select(cols, {count,head}).eq(a).eq(b) -> Promise<CountResponse>. */
function makeCountChain(response: CountResponse) {
  const eq2 = jest.fn<Promise<CountResponse>, [string, boolean]>().mockResolvedValue(response);
  const eq1 = jest.fn<{ eq: typeof eq2 }, [string, string]>().mockReturnValue({ eq: eq2 });
  const select = jest.fn<{ eq: typeof eq1 }, [string, unknown?]>().mockReturnValue({ eq: eq1 });
  return { select, eq1, eq2 };
}

/** Mock per la doppia query count di getQuizScores (una per profilo). */
function makeScoresMock(mineCount: number, partnerCount: number) {
  return {
    mine: makeCountChain({ count: mineCount, error: null }),
    partner: makeCountChain({ count: partnerCount, error: null }),
  };
}

type FromReturn =
  | ReturnType<typeof makeQuestionsMock>
  | ReturnType<typeof makeQuizAnswersMock>
  | ReturnType<typeof makeQueryBuilderMock>
  | ReturnType<typeof makeCountChain>;

type MockSupabase = {
  auth: { getUser: jest.Mock<Promise<{ data: { user: { id: string } | null } }>, []> };
  from: jest.Mock<FromReturn, [table: string]>;
  rpc: jest.Mock<Promise<RpcResponse>, [fn: string, args?: unknown]>;
};

function makeMockSupabase(): MockSupabase {
  return {
    auth: { getUser: jest.fn<Promise<{ data: { user: { id: string } | null } }>, []>() },
    from: jest.fn<FromReturn, [table: string]>(),
    rpc: jest.fn<Promise<RpcResponse>, [string, unknown?]>(),
  };
}

let mockSupabase: MockSupabase;

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

import { getTodaysQuiz, submitTodaysQuiz, confirmQuizGuess, getQuizScores } from "@/lib/quiz-actions";

const QUESTIONS = [
  { id: "q1", prompt: "Qual è il mio colore preferito?" },
  { id: "q2", prompt: "Qual è il mio piatto preferito?" },
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

  it("nessuna risposta oggi: mine/partner null, revealed false", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "quiz_questions") return makeQuestionsMock({ data: QUESTIONS, error: null });
      if (table === "quiz_answers") return makeQuizAnswersMock({ data: [], error: null });
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await getTodaysQuiz();
    expect(result).toMatchObject({ mine: null, partner: null, revealed: false });
  });

  it("solo io ho scritto: mine valorizzato, partner null, revealed false", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "quiz_questions") return makeQuestionsMock({ data: QUESTIONS, error: null });
      if (table === "quiz_answers") {
        return makeQuizAnswersMock({
          data: [{ id: "a1", profile_id: "me", my_truth: "Rosso", my_guess: "Blu", guess_correct: null }],
          error: null,
        });
      }
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await getTodaysQuiz();
    expect(result).toMatchObject({
      mine: { answerId: "a1", truth: "Rosso", guess: "Blu", guessCorrect: null },
      partner: null,
      revealed: false,
    });
  });

  it("entrambi hanno scritto: revealed true, entrambi i lati visibili", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "quiz_questions") return makeQuestionsMock({ data: QUESTIONS, error: null });
      if (table === "quiz_answers") {
        return makeQuizAnswersMock({
          data: [
            { id: "a1", profile_id: "me", my_truth: "Rosso", my_guess: "Blu", guess_correct: null },
            { id: "a2", profile_id: "partner-1", my_truth: "Blu", my_guess: "Rosso", guess_correct: true },
          ],
          error: null,
        });
      }
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await getTodaysQuiz();
    expect(result).toMatchObject({
      mine: { answerId: "a1", truth: "Rosso", guess: "Blu", guessCorrect: null },
      partner: { answerId: "a2", truth: "Blu", guess: "Rosso", guessCorrect: true },
      revealed: true,
    });
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

describe("submitTodaysQuiz", () => {
  it("ritorna errore senza chiamare Supabase se verità o ipotesi sono vuote", async () => {
    const result = await submitTodaysQuiz("q1", "  ", "Blu");
    expect(result).toEqual({ error: "Compila sia la tua risposta sia la tua ipotesi." });
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await submitTodaysQuiz("q1", "Rosso", "Blu");
    expect(result).toEqual({ error: "Utente non autenticato" });
  });

  it("ritorna errore se l'utente non è accoppiato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makeQueryBuilderMock({ couple_id: null }));

    const result = await submitTodaysQuiz("q1", "Rosso", "Blu");
    expect(result).toEqual({ error: "Non sei accoppiato/a con un partner." });
  });

  it("inserisce verità e ipotesi trimmate e ritorna lo stato aggiornato (refetch)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const quizAnswersMock = makeQuizAnswersMock({
      data: [{ id: "a1", profile_id: "me", my_truth: "Rosso", my_guess: "Blu", guess_correct: null }],
      error: null,
    });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "quiz_answers") return quizAnswersMock;
      if (table === "quiz_questions") return makeQuestionsMock({ data: QUESTIONS, error: null });
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await submitTodaysQuiz("q1", "  Rosso  ", "  Blu  ");

    expect(quizAnswersMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ couple_id: "c1", profile_id: "me", question_id: "q1", my_truth: "Rosso", my_guess: "Blu" }),
    );
    expect(result).toMatchObject({ mine: { truth: "Rosso", guess: "Blu" }, revealed: false });
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

    const result = await submitTodaysQuiz("q1", "Rosso", "Blu");
    expect(result).toEqual({ error: "Hai già risposto oggi" });
    expect(mockSupabase.from).not.toHaveBeenCalledWith("quiz_questions");
  });
});

describe("confirmQuizGuess", () => {
  it("chiama la RPC confirm_quiz_guess e ritorna lo stato aggiornato (refetch)", async () => {
    mockSupabase.rpc.mockResolvedValue({ error: null });
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "quiz_questions") return makeQuestionsMock({ data: QUESTIONS, error: null });
      if (table === "quiz_answers") return makeQuizAnswersMock({ data: [], error: null });
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    await confirmQuizGuess("a2", true);

    expect(mockSupabase.rpc).toHaveBeenCalledWith("confirm_quiz_guess", { p_answer_id: "a2", p_correct: true });
  });

  it("propaga l'errore della RPC senza fare il refetch", async () => {
    mockSupabase.rpc.mockResolvedValue({ error: { message: "Ipotesi già confermata" } });

    const result = await confirmQuizGuess("a2", true);
    expect(result).toEqual({ error: "Ipotesi già confermata" });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});

describe("getQuizScores", () => {
  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await getQuizScores("partner-1");
    expect(result).toEqual({ error: "Utente non autenticato" });
  });

  it("ritorna il conteggio delle ipotesi confermate corrette per ciascun profilo", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const mocks = makeScoresMock(3, 2);
    let call = 0;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table !== "quiz_answers") throw new Error(`tabella inattesa nel test: ${table}`);
      call += 1;
      return call === 1 ? mocks.mine : mocks.partner;
    });

    const result = await getQuizScores("partner-1");
    expect(result).toEqual({ mine: 3, partner: 2 });
  });

  it("ritorna 0 se count è null senza errore", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makeCountChain({ count: null, error: null }));

    const result = await getQuizScores("partner-1");
    expect(result).toEqual({ mine: 0, partner: 0 });
  });
});
