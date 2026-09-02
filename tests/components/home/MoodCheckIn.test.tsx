/**
 * Unit test per components/home/MoodCheckIn.tsx — check-in emotivo
 * quotidiano (Fase B, redesign: overlay bottom-sheet invece di card
 * scrollabile). lib/mood-actions.ts è mockato (vedi
 * tests/lib/mood-actions.test.ts per la copertura contro Supabase). Il
 * canale Realtime è mockato come in tests/components/home/QuizCard.test.tsx.
 * localStorage è quello reale di jsdom, svuotato a ogni test (il componente
 * lo usa per "rimandato oggi", stato di comodo per-dispositivo).
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

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => {
      const channelObj = { on: () => channelObj, subscribe: () => channelObj };
      return channelObj;
    },
    removeChannel: () => {},
  }),
}));

import MoodCheckIn from "@/components/home/MoodCheckIn";

beforeEach(() => {
  mockGetTodaysMood.mockReset();
  mockLogTodaysMood.mockReset();
  localStorage.clear();
});

function renderPrompt() {
  return render(<MoodCheckIn partnerName="Sam" coupleId="c1" />);
}

describe("MoodCheckIn", () => {
  it("non renderizza nulla mentre carica o se la chiamata fallisce", async () => {
    mockGetTodaysMood.mockResolvedValue({ error: "Errore di rete" });
    const { container } = renderPrompt();

    await waitFor(() => expect(mockGetTodaysMood).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra l'overlay con le 6 emoji se non ho ancora risposto oggi", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, revealed: false });
    renderPrompt();

    expect(await screen.findByText("Come ti senti oggi?")).toBeInTheDocument();
    expect(screen.getByLabelText("Felice")).toBeInTheDocument();
    expect(screen.getByLabelText("Innamorato/a")).toBeInTheDocument();
  });

  it("tap su un'emoji invia il mood e mostra la card 'registrato'", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, revealed: false });
    mockLogTodaysMood.mockResolvedValue({ myMood: "felice", partnerMood: null, revealed: false });
    const user = userEvent.setup();
    renderPrompt();

    await user.click(await screen.findByLabelText("Felice"));

    await waitFor(() => expect(mockLogTodaysMood).toHaveBeenCalledWith("felice"));
    expect(
      await screen.findByText("😊 Registrato! Appena fa il check-in anche Sam vedrete entrambi."),
    ).toBeInTheDocument();
  });

  it("tap su 'Più tardi' chiude l'overlay senza inviare nulla e non lo riapre nello stesso render", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, revealed: false });
    const user = userEvent.setup();
    renderPrompt();

    await user.click(await screen.findByText("Più tardi"));

    expect(mockLogTodaysMood).not.toHaveBeenCalled();
    expect(screen.queryByText("Come ti senti oggi?")).not.toBeInTheDocument();
  });

  it("non mostra l'overlay al mount successivo nello stesso giorno se già rimandato", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, revealed: false });
    const user = userEvent.setup();
    const { unmount } = renderPrompt();
    await user.click(await screen.findByText("Più tardi"));
    unmount();

    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, revealed: false });
    renderPrompt();

    await waitFor(() => expect(mockGetTodaysMood).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Come ti senti oggi?")).not.toBeInTheDocument();
  });

  it("mostra entrambi i mood quando rivelato (nessun overlay)", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: "felice", partnerMood: "stanco", revealed: true });
    renderPrompt();

    expect(await screen.findByText("😊")).toBeInTheDocument();
    expect(screen.getByText("😴")).toBeInTheDocument();
    expect(screen.getByText("Sam")).toBeInTheDocument();
  });
});
