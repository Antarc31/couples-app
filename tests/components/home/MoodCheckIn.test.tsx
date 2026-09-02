/**
 * Unit test per components/home/MoodCheckIn.tsx — check-in emotivo
 * quotidiano (in fondo alla Home, non più un overlay: la card sparisce
 * appena rispondi, lasciando solo un Toast temporaneo — su richiesta
 * esplicita dell'utente). lib/mood-actions.ts è mockato (vedi
 * tests/lib/mood-actions.test.ts per la copertura contro Supabase). Il
 * canale Realtime è mockato come in tests/components/home/QuizCard.test.tsx.
 * localStorage è quello reale di jsdom, svuotato a ogni test.
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

function renderCard() {
  return render(<MoodCheckIn partnerName="Sam" coupleId="c1" />);
}

describe("MoodCheckIn", () => {
  it("non renderizza nulla mentre carica o se la chiamata fallisce", async () => {
    mockGetTodaysMood.mockResolvedValue({ error: "Errore di rete" });
    const { container } = renderCard();

    await waitFor(() => expect(mockGetTodaysMood).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra la card con le 6 emoji se non ho ancora risposto oggi (nessun overlay, card inline)", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, revealed: false });
    renderCard();

    expect(await screen.findByText("💛 Come ti senti oggi?")).toBeInTheDocument();
    expect(screen.getByLabelText("Felice")).toBeInTheDocument();
    expect(screen.getByLabelText("Innamorato/a")).toBeInTheDocument();
  });

  it("al primo caricamento, se ho già risposto oggi, non mostra nulla (nessun toast per uno stato già noto)", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: "felice", partnerMood: null, revealed: false });
    const { container } = renderCard();

    await waitFor(() => expect(mockGetTodaysMood).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("tap su un'emoji invia il mood, la card sparisce e appare un toast temporaneo 'in attesa'", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, revealed: false });
    mockLogTodaysMood.mockResolvedValue({ myMood: "felice", partnerMood: null, revealed: false });
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByLabelText("Felice"));

    await waitFor(() => expect(mockLogTodaysMood).toHaveBeenCalledWith("felice"));
    expect(await screen.findByText("In attesa della risposta di Sam…")).toBeInTheDocument();
    expect(screen.queryByText("💛 Come ti senti oggi?")).not.toBeInTheDocument();
  });

  it("tap su 'Più tardi' nasconde la card senza inviare nulla", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, revealed: false });
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByText("Più tardi"));

    expect(mockLogTodaysMood).not.toHaveBeenCalled();
    expect(screen.queryByText("💛 Come ti senti oggi?")).not.toBeInTheDocument();
  });

  it("non mostra la card al mount successivo nello stesso giorno se già rimandata", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, revealed: false });
    const user = userEvent.setup();
    const { unmount } = renderCard();
    await user.click(await screen.findByText("Più tardi"));
    unmount();

    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, revealed: false });
    renderCard();

    await waitFor(() => expect(mockGetTodaysMood).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("💛 Come ti senti oggi?")).not.toBeInTheDocument();
  });
});
