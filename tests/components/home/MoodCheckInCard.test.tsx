/**
 * Unit test per components/home/MoodCheckInCard.tsx — lib/mood-actions.ts è
 * mockato. Stesso schema di QuizCard.test.tsx: i tre stati (scegli / in
 * attesa / rivelato) e il tap che invia il mood.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TodaysMood } from "@/lib/mood-actions";

type ActionError = { error: string };

const mockGetTodaysMood = jest.fn<Promise<TodaysMood | ActionError>, []>();
const mockLogTodaysMood = jest.fn<Promise<TodaysMood | ActionError>, [string]>();

jest.mock("@/lib/mood-actions", () => ({
  getTodaysMood: () => mockGetTodaysMood(),
  logTodaysMood: (mood: string) => mockLogTodaysMood(mood),
}));

import MoodCheckInCard from "@/components/home/MoodCheckInCard";

beforeEach(() => {
  mockGetTodaysMood.mockReset();
  mockLogTodaysMood.mockReset();
});

describe("MoodCheckInCard", () => {
  it("mostra i sei bottoni emoji quando non ho ancora fatto il check-in", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, revealed: false });
    render(<MoodCheckInCard partnerName="Sam" />);

    expect(await screen.findByLabelText("Felice")).toBeInTheDocument();
    expect(screen.getByLabelText("Innamorato/a")).toBeInTheDocument();
  });

  it("mostra 'registrato' quando ho fatto il check-in ma il partner no", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: "felice", partnerMood: null, revealed: false });
    render(<MoodCheckInCard partnerName="Sam" />);

    expect(
      await screen.findByText("😊 Registrato! Appena fa il check-in anche Sam vedrete entrambi."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Felice")).not.toBeInTheDocument();
  });

  it("mostra entrambi i mood quando rivelato", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: "felice", partnerMood: "stanco", revealed: true });
    render(<MoodCheckInCard partnerName="Sam" />);

    expect(await screen.findByText("😊")).toBeInTheDocument();
    expect(screen.getByText("😴")).toBeInTheDocument();
    expect(screen.getByText("Sam")).toBeInTheDocument();
  });

  it("il tap su un'emoji invia il mood e aggiorna lo stato con il risultato del refetch", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, revealed: false });
    mockLogTodaysMood.mockResolvedValue({ myMood: "felice", partnerMood: null, revealed: false });
    const user = userEvent.setup();
    render(<MoodCheckInCard partnerName="Sam" />);

    await user.click(await screen.findByLabelText("Felice"));

    await waitFor(() => expect(mockLogTodaysMood).toHaveBeenCalledWith("felice"));
    expect(
      await screen.findByText("😊 Registrato! Appena fa il check-in anche Sam vedrete entrambi."),
    ).toBeInTheDocument();
  });

  it("mostra l'errore di submit senza chiudere la scelta", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, revealed: false });
    mockLogTodaysMood.mockResolvedValue({ error: "Hai già fatto il check-in oggi" });
    const user = userEvent.setup();
    render(<MoodCheckInCard partnerName="Sam" />);

    await user.click(await screen.findByLabelText("Felice"));

    expect(await screen.findByText("Hai già fatto il check-in oggi")).toBeInTheDocument();
    expect(screen.getByLabelText("Felice")).toBeInTheDocument();
  });
});
