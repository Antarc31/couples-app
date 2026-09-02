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
  return render(<QuizCard partnerName="Sam" partnerId="partner-1" coupleId="c1" />);
}

describe("QuizCard", () => {
  it("mostra i due campi (verità + ipotesi) quando non ho ancora scritto oggi", async () => {
    mockGetTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Qual è il mio colore preferito?",
      mine: null,
      partner: null,
      revealed: false,
    });
    renderCard();

    expect(await screen.findByText("Qual è il mio colore preferito?")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("La verità su di te…")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Cosa risponderebbe Sam?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rispondi" })).toBeDisabled();
  });

  it("mostra il punteggio in testa alla card", async () => {
    mockGetTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Domanda",
      mine: null,
      partner: null,
      revealed: false,
    });
    renderCard();

    expect(await screen.findByText("Tu 1 — 2 Sam")).toBeInTheDocument();
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

    expect(
      await screen.findByText("Hai scritto! Appena scrive anche Sam vedrete le ipotesi svelate."),
    ).toBeInTheDocument();
  });

  it("da rivelato, mostra entrambi i confronti e i due bottoni di conferma se la mia ipotesi su di me non è ancora confermata", async () => {
    mockGetTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Domanda",
      mine: { answerId: "a1", truth: "Rosso", guess: "Blu", guessCorrect: true },
      partner: { answerId: "a2", truth: "Blu", guess: "Rosso", guessCorrect: null },
      revealed: true,
    });
    renderCard();

    expect(await screen.findByText("✅ Hai indovinato!")).toBeInTheDocument();
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

    await user.click(await screen.findByRole("button", { name: "Ha indovinato" }));

    await waitFor(() => expect(mockConfirmQuizGuess).toHaveBeenCalledWith("a2", true));
    expect(await screen.findByText("✅ Hai confermato: ha indovinato")).toBeInTheDocument();
  });

  it("invia verità e ipotesi e aggiorna lo stato con il risultato del refetch", async () => {
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

    await user.type(await screen.findByPlaceholderText("La verità su di te…"), "Rosso");
    await user.type(screen.getByPlaceholderText("Cosa risponderebbe Sam?"), "Blu");
    await user.click(screen.getByRole("button", { name: "Rispondi" }));

    await waitFor(() => expect(mockSubmitTodaysQuiz).toHaveBeenCalledWith("q1", "Rosso", "Blu"));
    expect(
      await screen.findByText("Hai scritto! Appena scrive anche Sam vedrete le ipotesi svelate."),
    ).toBeInTheDocument();
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

    await user.type(await screen.findByPlaceholderText("La verità su di te…"), "Rosso");
    await user.type(screen.getByPlaceholderText("Cosa risponderebbe Sam?"), "Blu");
    await user.click(screen.getByRole("button", { name: "Rispondi" }));

    expect(await screen.findByText("Hai già risposto oggi")).toBeInTheDocument();
  });
});
