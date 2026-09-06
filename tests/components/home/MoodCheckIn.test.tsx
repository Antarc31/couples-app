/**
 * Unit test per components/home/MoodCheckIn.tsx — check-in emotivo
 * quotidiano (in fondo alla Home). Su richiesta esplicita dell'utente,
 * nessun messaggio/toast in Home: appena rispondi la card sparisce del
 * tutto, il segnale "in attesa"/"svelato" arriva solo dalla campanella
 * notifiche (trigger DB già attivo, indipendente da questo componente) —
 * quindi niente più sottoscrizione realtime da testare qui.
 * lib/mood-actions.ts è mockato (vedi tests/lib/mood-actions.test.ts per
 * la copertura contro Supabase).
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

import MoodCheckIn from "@/components/home/MoodCheckIn";

beforeEach(() => {
  mockGetTodaysMood.mockReset();
  mockLogTodaysMood.mockReset();
  localStorage.clear();
});

describe("MoodCheckIn", () => {
  it("con initialMood mostra subito la card e non chiama getTodaysMood", async () => {
    render(
      <MoodCheckIn initialMood={{ myMood: null, partnerMood: null, partnerName: null, revealed: false }} />,
    );

    expect(await screen.findByText("come va oggi?")).toBeInTheDocument();
    expect(mockGetTodaysMood).not.toHaveBeenCalled();
  });

  it("non renderizza nulla mentre carica o se la chiamata fallisce", async () => {
    mockGetTodaysMood.mockResolvedValue({ error: "Errore di rete" });
    const { container } = render(<MoodCheckIn />);

    await waitFor(() => expect(mockGetTodaysMood).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra la card con le 6 opzioni di mood se non ho ancora risposto oggi", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, partnerName: null, revealed: false });
    render(<MoodCheckIn />);

    expect(await screen.findByText("come va oggi?")).toBeInTheDocument();
    expect(screen.getByLabelText("Felice")).toBeInTheDocument();
    expect(screen.getByLabelText("Innamorato/a")).toBeInTheDocument();
  });

  it("non mostra nulla se ho già risposto oggi (nessun messaggio in Home, solo la notifica)", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: "felice", partnerMood: null, partnerName: null, revealed: false });
    const { container } = render(<MoodCheckIn />);

    await waitFor(() => expect(mockGetTodaysMood).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("non mostra nulla se già rivelato (nessun messaggio in Home, solo la notifica)", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: "felice", partnerMood: "stanco", partnerName: null, revealed: true });
    const { container } = render(<MoodCheckIn />);

    await waitFor(() => expect(mockGetTodaysMood).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("tap su un'emoji invia il mood e la card sparisce, senza nessun messaggio in Home", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, partnerName: null, revealed: false });
    mockLogTodaysMood.mockResolvedValue({ myMood: "felice", partnerMood: null, partnerName: null, revealed: false });
    const user = userEvent.setup();
    const { container } = render(<MoodCheckIn />);

    await user.click(await screen.findByLabelText("Felice"));

    await waitFor(() => expect(mockLogTodaysMood).toHaveBeenCalledWith("felice"));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("tap su 'Più tardi' nasconde la card senza inviare nulla", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, partnerName: null, revealed: false });
    const user = userEvent.setup();
    render(<MoodCheckIn />);

    await user.click(await screen.findByText("Più tardi"));

    expect(mockLogTodaysMood).not.toHaveBeenCalled();
    expect(screen.queryByText("come va oggi?")).not.toBeInTheDocument();
  });

  it("non mostra la card al mount successivo nello stesso giorno se già rimandata", async () => {
    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, partnerName: null, revealed: false });
    const user = userEvent.setup();
    const { unmount } = render(<MoodCheckIn />);
    await user.click(await screen.findByText("Più tardi"));
    unmount();

    mockGetTodaysMood.mockResolvedValue({ myMood: null, partnerMood: null, partnerName: null, revealed: false });
    render(<MoodCheckIn />);

    await waitFor(() => expect(mockGetTodaysMood).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("come va oggi?")).not.toBeInTheDocument();
  });
});
