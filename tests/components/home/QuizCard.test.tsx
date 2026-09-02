/**
 * Unit test per components/home/QuizCard.tsx — lib/quiz-actions.ts è
 * mockato (vedi tests/lib/quiz-actions.test.ts per la copertura contro
 * Supabase). Qui solo l'orchestrazione UI: i tre stati (rispondi / in
 * attesa / rivelato) e il submit.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TodaysQuiz } from "@/lib/quiz-actions";

type ActionError = { error: string };

const mockGetTodaysQuiz = jest.fn<Promise<TodaysQuiz | ActionError>, []>();
const mockAnswerTodaysQuiz = jest.fn<Promise<TodaysQuiz | ActionError>, [string, string]>();

jest.mock("@/lib/quiz-actions", () => ({
  getTodaysQuiz: () => mockGetTodaysQuiz(),
  answerTodaysQuiz: (questionId: string, answer: string) => mockAnswerTodaysQuiz(questionId, answer),
}));

import QuizCard from "@/components/home/QuizCard";

beforeEach(() => {
  mockGetTodaysQuiz.mockReset();
  mockAnswerTodaysQuiz.mockReset();
});

describe("QuizCard", () => {
  it("mostra il campo di risposta quando non ho ancora risposto", async () => {
    mockGetTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Qual è il mio colore preferito?",
      myAnswer: null,
      partnerAnswer: null,
      revealed: false,
    });
    render(<QuizCard partnerName="Sam" />);

    expect(await screen.findByText("Qual è il mio colore preferito?")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Scrivi la tua risposta…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rispondi" })).toBeDisabled();
  });

  it("mostra 'in attesa' quando ho risposto ma il partner no", async () => {
    mockGetTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Qual è il mio colore preferito?",
      myAnswer: "Rosso",
      partnerAnswer: null,
      revealed: false,
    });
    render(<QuizCard partnerName="Sam" />);

    expect(await screen.findByText("Hai risposto! Appena risponde anche Sam vedrete entrambe le risposte.")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Scrivi la tua risposta…")).not.toBeInTheDocument();
  });

  it("mostra entrambe le risposte quando rivelato", async () => {
    mockGetTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Qual è il mio colore preferito?",
      myAnswer: "Rosso",
      partnerAnswer: "Blu",
      revealed: true,
    });
    render(<QuizCard partnerName="Sam" />);

    expect(await screen.findByText("Rosso")).toBeInTheDocument();
    expect(screen.getByText("Blu")).toBeInTheDocument();
    expect(screen.getByText("Sam")).toBeInTheDocument();
  });

  it("invia la risposta e aggiorna lo stato con il risultato del refetch", async () => {
    mockGetTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Qual è il mio colore preferito?",
      myAnswer: null,
      partnerAnswer: null,
      revealed: false,
    });
    mockAnswerTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Qual è il mio colore preferito?",
      myAnswer: "Rosso",
      partnerAnswer: null,
      revealed: false,
    });
    const user = userEvent.setup();
    render(<QuizCard partnerName="Sam" />);

    const textarea = await screen.findByPlaceholderText("Scrivi la tua risposta…");
    await user.type(textarea, "Rosso");
    await user.click(screen.getByRole("button", { name: "Rispondi" }));

    await waitFor(() => expect(mockAnswerTodaysQuiz).toHaveBeenCalledWith("q1", "Rosso"));
    expect(await screen.findByText("Hai risposto! Appena risponde anche Sam vedrete entrambe le risposte.")).toBeInTheDocument();
  });

  it("mostra l'errore di submit senza perdere il testo scritto", async () => {
    mockGetTodaysQuiz.mockResolvedValue({
      questionId: "q1",
      prompt: "Qual è il mio colore preferito?",
      myAnswer: null,
      partnerAnswer: null,
      revealed: false,
    });
    mockAnswerTodaysQuiz.mockResolvedValue({ error: "Hai già risposto oggi" });
    const user = userEvent.setup();
    render(<QuizCard partnerName="Sam" />);

    const textarea = await screen.findByPlaceholderText("Scrivi la tua risposta…");
    await user.type(textarea, "Rosso");
    await user.click(screen.getByRole("button", { name: "Rispondi" }));

    expect(await screen.findByText("Hai già risposto oggi")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Scrivi la tua risposta…")).toHaveValue("Rosso");
  });
});
