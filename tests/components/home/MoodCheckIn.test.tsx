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
const mockLogTodaysMood = jest.fn<Promise<TodaysMood | ActionError>, [string, string?]>();

jest.mock("@/lib/mood-actions", () => ({
  getTodaysMood: () => mockGetTodaysMood(),
  logTodaysMood: (mood: string, customLabel?: string) => mockLogTodaysMood(mood, customLabel),
}));

import MoodCheckIn from "@/components/home/MoodCheckIn";

const emptyMood: TodaysMood = {
  myMood: null,
  myCustomLabel: null,
  partnerMood: null,
  partnerCustomLabel: null,
  partnerName: null,
  revealed: false,
};

beforeEach(() => {
  mockGetTodaysMood.mockReset();
  mockLogTodaysMood.mockReset();
  localStorage.clear();
});

describe("MoodCheckIn", () => {
  it("con initialMood mostra subito la card e non chiama getTodaysMood", async () => {
    render(<MoodCheckIn initialMood={emptyMood} />);

    expect(await screen.findByText("Come va oggi?")).toBeInTheDocument();
    expect(mockGetTodaysMood).not.toHaveBeenCalled();
  });

  it("non renderizza nulla mentre carica o se la chiamata fallisce", async () => {
    mockGetTodaysMood.mockResolvedValue({ error: "Errore di rete" });
    const { container } = render(<MoodCheckIn />);

    await waitFor(() => expect(mockGetTodaysMood).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra la card con le opzioni di mood (incluso Arrabbiato/a e Altro) se non ho ancora risposto oggi", async () => {
    mockGetTodaysMood.mockResolvedValue(emptyMood);
    render(<MoodCheckIn />);

    expect(await screen.findByText("Come va oggi?")).toBeInTheDocument();
    expect(screen.getByLabelText("Felice")).toBeInTheDocument();
    expect(screen.getByLabelText("Innamorato/a")).toBeInTheDocument();
    expect(screen.getByLabelText("Arrabbiato/a")).toBeInTheDocument();
    expect(screen.getByLabelText("Altro")).toBeInTheDocument();
  });

  it("non mostra nulla se ho già risposto oggi (nessun messaggio in Home, solo la notifica)", async () => {
    mockGetTodaysMood.mockResolvedValue({ ...emptyMood, myMood: "felice" });
    const { container } = render(<MoodCheckIn />);

    await waitFor(() => expect(mockGetTodaysMood).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("non mostra nulla se già rivelato (nessun messaggio in Home, solo la notifica)", async () => {
    mockGetTodaysMood.mockResolvedValue({ ...emptyMood, myMood: "felice", partnerMood: "stanco", revealed: true });
    const { container } = render(<MoodCheckIn />);

    await waitFor(() => expect(mockGetTodaysMood).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("tap su un'emoji invia il mood e la card sparisce, senza nessun messaggio in Home", async () => {
    mockGetTodaysMood.mockResolvedValue(emptyMood);
    mockLogTodaysMood.mockResolvedValue({ ...emptyMood, myMood: "felice" });
    const user = userEvent.setup();
    const { container } = render(<MoodCheckIn />);

    await user.click(await screen.findByLabelText("Felice"));

    await waitFor(() => expect(mockLogTodaysMood).toHaveBeenCalledWith("felice", undefined));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("tap su 'Altro' apre un campo di testo invece di inviare subito", async () => {
    mockGetTodaysMood.mockResolvedValue(emptyMood);
    const user = userEvent.setup();
    render(<MoodCheckIn />);

    await user.click(await screen.findByLabelText("Altro"));

    expect(screen.getByPlaceholderText("Come ti senti?")).toBeInTheDocument();
    expect(mockLogTodaysMood).not.toHaveBeenCalled();
    // Il bottone Salva è disabilitato finché il campo è vuoto.
    expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled();
  });

  it("scrivere ed 'Annulla' torna alla lista normale senza inviare nulla", async () => {
    mockGetTodaysMood.mockResolvedValue(emptyMood);
    const user = userEvent.setup();
    render(<MoodCheckIn />);

    await user.click(await screen.findByLabelText("Altro"));
    await user.type(screen.getByPlaceholderText("Come ti senti?"), "Nervoso per l'esame");
    await user.click(screen.getByRole("button", { name: "Annulla" }));

    expect(mockLogTodaysMood).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Felice")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Come ti senti?")).not.toBeInTheDocument();
  });

  it("scrivere un'etichetta e Salva invia mood='altro' con l'etichetta, poi la card sparisce", async () => {
    mockGetTodaysMood.mockResolvedValue(emptyMood);
    mockLogTodaysMood.mockResolvedValue({ ...emptyMood, myMood: "altro", myCustomLabel: "Nervoso per l'esame" });
    const user = userEvent.setup();
    const { container } = render(<MoodCheckIn />);

    await user.click(await screen.findByLabelText("Altro"));
    await user.type(screen.getByPlaceholderText("Come ti senti?"), "Nervoso per l'esame");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() => expect(mockLogTodaysMood).toHaveBeenCalledWith("altro", "Nervoso per l'esame"));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("mostra l'errore se logTodaysMood('altro', ...) fallisce, senza chiudere il campo", async () => {
    mockGetTodaysMood.mockResolvedValue(emptyMood);
    mockLogTodaysMood.mockResolvedValue({ error: "Scrivi come ti senti." });
    const user = userEvent.setup();
    render(<MoodCheckIn />);

    await user.click(await screen.findByLabelText("Altro"));
    await user.type(screen.getByPlaceholderText("Come ti senti?"), "x");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    expect(await screen.findByText("Scrivi come ti senti.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Come ti senti?")).toBeInTheDocument();
  });

  it("tap su 'Più tardi' nasconde la card senza inviare nulla", async () => {
    mockGetTodaysMood.mockResolvedValue(emptyMood);
    const user = userEvent.setup();
    render(<MoodCheckIn />);

    await user.click(await screen.findByText("Più tardi"));

    expect(mockLogTodaysMood).not.toHaveBeenCalled();
    expect(screen.queryByText("Come va oggi?")).not.toBeInTheDocument();
  });

  it("non mostra la card al mount successivo nello stesso giorno se già rimandata", async () => {
    mockGetTodaysMood.mockResolvedValue(emptyMood);
    const user = userEvent.setup();
    const { unmount } = render(<MoodCheckIn />);
    await user.click(await screen.findByText("Più tardi"));
    unmount();

    mockGetTodaysMood.mockResolvedValue(emptyMood);
    render(<MoodCheckIn />);

    await waitFor(() => expect(mockGetTodaysMood).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Come va oggi?")).not.toBeInTheDocument();
  });
});
