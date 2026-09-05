/**
 * Unit test per components/home/QuizCard.tsx — quiz "indovina il partner"
 * (Fase B, redesign). lib/quiz-actions.ts è mockato (vedi
 * tests/lib/quiz-actions.test.ts per la copertura contro Supabase). Il
 * canale Realtime è mockato qui (stesso pattern di
 * tests/components/AppTopBar.test.tsx): non serve simularlo attivamente in
 * questi test, basta che non faccia fallire il mount.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TodaysQuiz, QuizScores } from "@/lib/quiz-actions";

type ActionError = { error: string };

const mockGetTodaysQuiz = jest.fn<Promise<TodaysQuiz | ActionError>, []>();
const mockSubmitTodaysQuiz = jest.fn<Promise<TodaysQuiz | ActionError>, [string, string, string]>();
const mockConfirmQuizGuess = jest.fn<Promise<TodaysQuiz | ActionError>, [string, boolean]>();
const mockGetQuizScores = jest.fn<Promise<QuizScores | ActionError>, [string]>();

jest.mock("@/lib/quiz-actions", () => ({
  getTodaysQuiz: () => mockGetTodaysQuiz(),
  submitTodaysQuiz: (questionId: string, truth: string, guess: string) =>
    mockSubmitTodaysQuiz(questionId, truth, guess),
  confirmQuizGuess: (answerId: string, correct: boolean) => mockConfirmQuizGuess(answerId, correct),
  getQuizScores: (partnerId: string) => mockGetQuizScores(partnerId),
}));

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => {
      const channelObj = { on: () => channelObj, subscribe: () => channelObj };
      return channelObj;
    },
    removeChannel: () => {},
  }),
}));

import QuizCard from "@/components/home/QuizCard";

beforeEach(() => {
  mockGetTodaysQuiz.mockReset();
  mockSubmitTodaysQuiz.mockReset();
  mockConfirmQuizGuess.mockReset();
  mockGetQuizScores.mockReset();
  mockGetQuizScores.mockResolvedValue({ mine: 1, partner: 2 });
});

function renderCard() {
  return render(
    <QuizCard partnerName="Sam" partnerId="partner-1" coupleId="c1" selfColor="#a6c8f0" partnerColor="#f7a6c4" />,
  );
}

describe("QuizCard", () => {
  it("mostra solo la domanda finché non si tocca per rispondere, poi i due campi (verità + ipotesi)", async () => {
    mockGetTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Qual è il mio colore preferito?",
      mine: null,
      partner: null,
      revealed: false,
    });
    const user = userEvent.setup();
    renderCard();

    expect(await screen.findByText("Qual è il mio colore preferito?")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("La verità su di te…")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rispondi alla domanda" }));

    expect(screen.getByPlaceholderText("La verità su di te…")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Cosa risponderebbe Sam?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rispondi" })).toBeDisabled();
  });

  it("mostra il punteggio in testa alla card, con il trofeo sul lato in vantaggio", async () => {
    mockGetTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Domanda",
      mine: null,
      partner: null,
      revealed: false,
    });
    renderCard();

    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Sam")).toBeInTheDocument();
    // scores.partner (2) > scores.mine (1): il trofeo compare solo sopra il suo punteggio.
    const partnerScoreBlock = screen.getByText("Sam").closest("div");
    const selfScoreBlock = screen.getByText("Tu").closest("div");
    expect(partnerScoreBlock?.querySelector("svg")).toBeInTheDocument();
    expect(selfScoreBlock?.querySelector("svg")).not.toBeInTheDocument();
  });

  it("mostra il blocco punteggio anche quando entrambi sono a zero (ci tiene l'utente, resta sempre visibile)", async () => {
    mockGetTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Domanda",
      mine: null,
      partner: null,
      revealed: false,
    });
    mockGetQuizScores.mockResolvedValue({ mine: 0, partner: 0 });
    renderCard();

    await screen.findByText("Domanda");
    expect(screen.getByText("Tu")).toBeInTheDocument();
  });

  it("mostra 'in attesa' quando ho scritto ma il partner no", async () => {
    mockGetTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Domanda",
      mine: { answerId: "a1", truth: "Rosso", guess: "Blu", guessCorrect: null },
      partner: null,
      revealed: false,
    });
    renderCard();

    expect(await screen.findByText("Domanda")).toBeInTheDocument();
    expect(await screen.findByText("Hai risposto! In attesa di Sam…")).toBeInTheDocument();
  });

  it("da rivelato, mostra la card coperta con solo la domanda finché non si tocca per scoprire le risposte", async () => {
    mockGetTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Domanda",
      mine: { answerId: "a1", truth: "Rosso", guess: "Blu", guessCorrect: true },
      partner: { answerId: "a2", truth: "Blu", guess: "Rosso", guessCorrect: null },
      revealed: true,
    });
    const user = userEvent.setup();
    renderCard();

    expect(await screen.findByRole("button", { name: "Scopri le risposte" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Scopri le risposte" }));

    expect(await screen.findByText("Hai indovinato!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ha indovinato" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No" })).toBeInTheDocument();
  });

  it("tap su 'Ha indovinato' chiama confirmQuizGuess con l'id della riga del partner", async () => {
    mockGetTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Domanda",
      mine: { answerId: "a1", truth: "Rosso", guess: "Blu", guessCorrect: null },
      partner: { answerId: "a2", truth: "Blu", guess: "Rosso", guessCorrect: null },
      revealed: true,
    });
    mockConfirmQuizGuess.mockResolvedValue({
      questionId: "q1",
      prompt: "Domanda",
      mine: { answerId: "a1", truth: "Rosso", guess: "Blu", guessCorrect: null },
      partner: { answerId: "a2", truth: "Blu", guess: "Rosso", guessCorrect: true },
      revealed: true,
    });
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole("button", { name: "Scopri le risposte" }));
    await user.click(screen.getByRole("button", { name: "Ha indovinato" }));

    await waitFor(() => expect(mockConfirmQuizGuess).toHaveBeenCalledWith("a2", true));
    expect(await screen.findByText("Hai confermato: ha indovinato")).toBeInTheDocument();
  });

  it("invia verità e ipotesi e torna alla card coperta con il messaggio di attesa", async () => {
    mockGetTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Domanda",
      mine: null,
      partner: null,
      revealed: false,
    });
    mockSubmitTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Domanda",
      mine: { answerId: "a1", truth: "Rosso", guess: "Blu", guessCorrect: null },
      partner: null,
      revealed: false,
    });
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole("button", { name: "Rispondi alla domanda" }));
    await user.type(screen.getByPlaceholderText("La verità su di te…"), "Rosso");
    await user.type(screen.getByPlaceholderText("Cosa risponderebbe Sam?"), "Blu");
    await user.click(screen.getByRole("button", { name: "Rispondi" }));

    await waitFor(() => expect(mockSubmitTodaysQuiz).toHaveBeenCalledWith("q1", "Rosso", "Blu"));
    expect(await screen.findByText("Hai risposto! In attesa di Sam…")).toBeInTheDocument();
    // La card torna "coperta": il form non è più visibile.
    expect(screen.queryByPlaceholderText("La verità su di te…")).not.toBeInTheDocument();
  });

  it("mostra l'errore di submit", async () => {
    mockGetTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Domanda",
      mine: null,
      partner: null,
      revealed: false,
    });
    mockSubmitTodaysQuiz.mockResolvedValue({ error: "Hai già risposto oggi" });
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole("button", { name: "Rispondi alla domanda" }));
    await user.type(screen.getByPlaceholderText("La verità su di te…"), "Rosso");
    await user.type(screen.getByPlaceholderText("Cosa risponderebbe Sam?"), "Blu");
    await user.click(screen.getByRole("button", { name: "Rispondi" }));

    expect(await screen.findByText("Hai già risposto oggi")).toBeInTheDocument();
  });
});
