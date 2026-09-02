/**
 * Unit test per components/home/MemoriesDeck.tsx — widget unificato
 * "Pensieri & Foto" di Home (sostituisce ThoughtsSection + PhotoStrip, vedi
 * piano approvato, punto 7). Copre la logica non banale del componente
 * (non il markup puro): invio testo/foto che prepende una nuova card in
 * cima, swipe/drag che passa alla card successiva, reazione a cuore su
 * entrambi i tipi di card (testo e foto).
 *
 * lib/messages-actions.ts viene mockato: qui non testiamo Supabase/Storage
 * (vedi tests/lib/messages-actions.test.ts per quello), solo l'orchestrazione
 * della UI attorno alle sue funzioni.
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest`
 * globale ambient (non `import { jest } from "@jest/globals"`) e la
 * convenzione dei nomi `mock*` per le variabili referenziate dentro
 * `jest.mock(...)` (richiesta dal meccanismo di hoisting di Jest).
 *
 * Nota su jsdom: PointerEvent/setPointerCapture non sono implementati in
 * jsdom (verificato: `'PointerEvent' in window` è false). Il componente
 * chiama `setPointerCapture` in modo opzionale (`?.`) per questo motivo.
 * Per simulare il drag, NON si può usare `fireEvent.pointerDown(el, {
 * clientX, pointerId })`: dom-testing-library costruisce l'evento con
 * `new window.PointerEvent(...)`, ma siccome `window.PointerEvent` non
 * esiste in jsdom ricade su `new window.Event(type, eventInit)` — e il
 * costruttore nativo `Event` IGNORA silenziosamente le chiavi extra
 * dell'init dict (clientX/pointerId non fanno parte di `EventInit`),
 * quindi arrivano `undefined` al synthetic event di React (verificato con
 * un repro isolato prima di scrivere questi test). Fix: costruire l'evento
 * a mano e assegnare le proprietà via `Object.assign` PRIMA di passarlo al
 * `fireEvent(element, event)` "grezzo" (overload a due argomenti, che si
 * limita a `element.dispatchEvent(event)`) — a quel punto sono proprietà
 * dirette dell'istanza e i getter dei synthetic event di React (che fanno
 * `nativeEvent[propName]`) le leggono correttamente.
 */

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Thought } from "@/lib/messages-actions";

/** Vedi nota sopra: dom-testing-library non fa passare clientX/pointerId sotto jsdom. */
function firePointer(el: Element, type: "pointerdown" | "pointermove" | "pointerup", props: Record<string, unknown>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, props);
  fireEvent(el, event);
}

type ActionError = { error: string };

const textThought: Thought = {
  id: "t1",
  senderId: "partner-1",
  senderName: "Sam",
  type: "text",
  content: "Ciao amore",
  photoUrl: null,
  createdAt: new Date().toISOString(),
  likedByMe: false,
};

const secondTextThought: Thought = {
  ...textThought,
  id: "t2",
  content: "Buongiorno",
};

const photoThought: Thought = {
  id: "p1",
  senderId: "partner-1",
  senderName: "Sam",
  type: "photo",
  content: "📷",
  photoUrl: "https://signed.example/p1.jpg",
  createdAt: new Date().toISOString(),
  likedByMe: false,
};

const mockListRecentThoughts = jest.fn<Promise<Thought[] | ActionError>, [limit?: number]>();
const mockSendThought = jest.fn<Promise<Thought | ActionError>, [content: string]>();
const mockSendPhotoThought = jest.fn<Promise<Thought | ActionError>, [file: File, caption?: string]>();
const mockToggleThoughtReaction = jest.fn<Promise<boolean | ActionError>, [messageId: string]>();

jest.mock("@/lib/messages-actions", () => ({
  listRecentThoughts: (...args: [number?]) => mockListRecentThoughts(...args),
  sendThought: (...args: [string]) => mockSendThought(...args),
  sendPhotoThought: (...args: [File, string?]) => mockSendPhotoThought(...args),
  toggleThoughtReaction: (...args: [string]) => mockToggleThoughtReaction(...args),
}));

import MemoriesDeck from "@/components/home/MemoriesDeck";

beforeEach(() => {
  mockListRecentThoughts.mockReset();
  mockSendThought.mockReset();
  mockSendPhotoThought.mockReset();
  mockToggleThoughtReaction.mockReset();
});

describe("MemoriesDeck", () => {
  it("invia un pensiero di testo e lo mostra come card in cima al mazzetto", async () => {
    const user = userEvent.setup();
    mockListRecentThoughts.mockResolvedValue([textThought]);
    const sent: Thought = {
      id: "t9",
      senderId: "me",
      senderName: "Tu",
      type: "text",
      content: "Ti penso",
      photoUrl: null,
      createdAt: new Date().toISOString(),
      likedByMe: false,
    };
    mockSendThought.mockResolvedValue(sent);

    render(<MemoriesDeck partnerName="Sam" selfId="me" />);
    await screen.findByText("Ciao amore");

    await user.click(screen.getByRole("button", { name: "Aggiungi un pensiero o una foto" }));
    await user.click(screen.getByRole("button", { name: /Manda un pensiero/ }));
    await user.type(screen.getByPlaceholderText("Scrivi qualcosa di carino…"), "Ti penso");
    await user.click(screen.getByRole("button", { name: /Invia/ }));

    expect(mockSendThought).toHaveBeenCalledWith("Ti penso");
    await screen.findByText("Ti penso");
    // La nuova card è la prima nell'ordine del mazzetto (in cima).
    const cards = screen.getAllByTestId("memory-card");
    expect(cards[0]).toHaveTextContent("Ti penso");
    // Il compose si chiude dopo l'invio riuscito.
    expect(screen.queryByPlaceholderText("Scrivi qualcosa di carino…")).not.toBeInTheDocument();
  });

  it("invia una foto (upload mockato) e la mostra come card in cima", async () => {
    const user = userEvent.setup();
    mockListRecentThoughts.mockResolvedValue([textThought]);
    const sentPhoto: Thought = {
      id: "p9",
      senderId: "me",
      senderName: "Tu",
      type: "photo",
      content: "Guarda qui",
      photoUrl: "https://signed.example/p9.jpg",
      createdAt: new Date().toISOString(),
      likedByMe: false,
    };
    mockSendPhotoThought.mockResolvedValue(sentPhoto);

    render(<MemoriesDeck partnerName="Sam" selfId="me" />);
    await screen.findByText("Ciao amore");

    await user.click(screen.getByRole("button", { name: "Aggiungi un pensiero o una foto" }));
    await user.click(screen.getByRole("button", { name: /Manda una foto/ }));

    const file = new File(["fake-bytes"], "sunset.jpg", { type: "image/jpeg" });
    const fileInput = screen.getByLabelText("Seleziona foto");
    await user.upload(fileInput, file);

    expect(mockSendPhotoThought).toHaveBeenCalledWith(file);
    const cards = await screen.findAllByTestId("memory-card");
    expect(cards[0]).toHaveTextContent("Guarda qui");
    expect(cards[0].querySelector("img")).toHaveAttribute("src", "https://signed.example/p9.jpg");
  });

  it("passa alla card successiva dopo uno swipe/drag oltre la soglia", async () => {
    mockListRecentThoughts.mockResolvedValue([textThought, secondTextThought]);

    render(<MemoriesDeck partnerName="Sam" selfId="me" />);
    await screen.findByText("Ciao amore");

    const topCard = screen.getAllByTestId("memory-card")[0];
    expect(topCard).toHaveTextContent("Ciao amore");

    firePointer(topCard, "pointerdown", { pointerId: 1, clientX: 0 });
    firePointer(topCard, "pointermove", { pointerId: 1, clientX: -160 });
    firePointer(topCard, "pointerup", { pointerId: 1, clientX: -160 });

    await waitFor(
      () => {
        expect(screen.getAllByTestId("memory-card")[0]).toHaveTextContent("Buongiorno");
      },
      { timeout: 2000 },
    );
  });

  it("swipe a destra torna alla card precedente (nessuna card va persa)", async () => {
    mockListRecentThoughts.mockResolvedValue([textThought, secondTextThought]);

    render(<MemoriesDeck partnerName="Sam" selfId="me" />);
    await screen.findByText("Ciao amore");

    // Avanza prima alla seconda card (swipe a sinistra, come nel test sopra).
    let topCard = screen.getAllByTestId("memory-card")[0];
    firePointer(topCard, "pointerdown", { pointerId: 1, clientX: 0 });
    firePointer(topCard, "pointermove", { pointerId: 1, clientX: -160 });
    firePointer(topCard, "pointerup", { pointerId: 1, clientX: -160 });
    await waitFor(() => {
      expect(screen.getAllByTestId("memory-card")[0]).toHaveTextContent("Buongiorno");
    });

    // Ora torna indietro con uno swipe a destra: la prima card, mai
    // rimossa dai dati, deve ricomparire in cima.
    topCard = screen.getAllByTestId("memory-card")[0];
    firePointer(topCard, "pointerdown", { pointerId: 2, clientX: 0 });
    firePointer(topCard, "pointermove", { pointerId: 2, clientX: 160 });
    firePointer(topCard, "pointerup", { pointerId: 2, clientX: 160 });

    await waitFor(() => {
      expect(screen.getAllByTestId("memory-card")[0]).toHaveTextContent("Ciao amore");
    });
  });

  it("non cambia card se il drag resta sotto la soglia (torna al centro)", async () => {
    mockListRecentThoughts.mockResolvedValue([textThought, secondTextThought]);

    render(<MemoriesDeck partnerName="Sam" selfId="me" />);
    await screen.findByText("Ciao amore");

    const topCard = screen.getAllByTestId("memory-card")[0];

    firePointer(topCard, "pointerdown", { pointerId: 1, clientX: 0 });
    firePointer(topCard, "pointermove", { pointerId: 1, clientX: -20 });
    firePointer(topCard, "pointerup", { pointerId: 1, clientX: -20 });

    // Nessun cambiamento atteso: la card in cima resta la stessa.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getAllByTestId("memory-card")[0]).toHaveTextContent("Ciao amore");
  });

  it("la reazione a cuore funziona sulla card testo in cima", async () => {
    const user = userEvent.setup();
    mockListRecentThoughts.mockResolvedValue([textThought]);
    mockToggleThoughtReaction.mockResolvedValue(true);

    render(<MemoriesDeck partnerName="Sam" selfId="me" />);
    const heartButton = await screen.findByRole("button", { name: "Reagisci con un cuore" });
    expect(heartButton).toHaveAttribute("data-liked", "false");

    await user.click(heartButton);

    expect(mockToggleThoughtReaction).toHaveBeenCalledWith("t1");
    const likedButton = await screen.findByRole("button", { name: "Togli reazione" });
    expect(likedButton).toHaveAttribute("data-liked", "true");
    // Il pop parte solo quando il cuore viene aggiunto (mai alla rimozione, vedi commento in MemoriesDeck.tsx).
    expect(likedButton).toHaveClass("animate-heart-pop");
  });

  it("la reazione a cuore funziona sulla card foto in cima", async () => {
    const user = userEvent.setup();
    mockListRecentThoughts.mockResolvedValue([photoThought]);
    mockToggleThoughtReaction.mockResolvedValue(true);

    render(<MemoriesDeck partnerName="Sam" selfId="me" />);
    const heartButton = await screen.findByRole("button", { name: "Reagisci con un cuore" });
    expect(heartButton).toHaveAttribute("data-liked", "false");

    await user.click(heartButton);

    expect(mockToggleThoughtReaction).toHaveBeenCalledWith("p1");
    expect(await screen.findByRole("button", { name: "Togli reazione" })).toHaveAttribute("data-liked", "true");
  });

  it("il pointerdown sul pulsante cuore non avvia il drag della card (altrimenti il browser reindirizza il click al pointer-capture della card e il tap sul cuore smette di funzionare)", async () => {
    mockListRecentThoughts.mockResolvedValue([textThought, secondTextThought]);

    render(<MemoriesDeck partnerName="Sam" selfId="me" />);
    await screen.findByText("Ciao amore");

    // Entrambe le card visibili nello stack hanno un cuore con lo stesso
    // aria-label: prendiamo quello della card in cima (l'unica interattiva).
    const heartButton = screen.getAllByRole("button", { name: "Reagisci con un cuore" })[0];
    const topCard = screen.getAllByTestId("memory-card")[0];

    // pointerdown parte dal cuore (non dalla card): senza stopPropagation
    // nel bottone, risalirebbe fino al handler di drag della card.
    firePointer(heartButton, "pointerdown", { pointerId: 5, clientX: 100 });
    // Se fosse risalito, questi eventi sulla card (delta ampio, oltre soglia)
    // farebbero scattare uno swipe.
    firePointer(topCard, "pointermove", { pointerId: 5, clientX: -60 });
    firePointer(topCard, "pointerup", { pointerId: 5, clientX: -60 });

    // Lo swipe (se scattasse) si risolve in modo asincrono dopo
    // RESOLVE_SWIPE_DELAY_MS (220ms) — attendiamo oltre quella soglia perché
    // il test sia un vero controllo di regressione, non un falso positivo.
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getAllByTestId("memory-card")[0]).toHaveTextContent("Ciao amore");
  });

  it("mostra lo stato vuoto quando non ci sono ancora ricordi", async () => {
    mockListRecentThoughts.mockResolvedValue([]);
    render(<MemoriesDeck partnerName="Sam" selfId="me" />);
    expect(await screen.findByText(/Ancora nessun ricordo/)).toBeInTheDocument();
  });

  it("mostra un link 'Vedi tutte le foto' verso /home/foto", async () => {
    mockListRecentThoughts.mockResolvedValue([textThought]);
    render(<MemoriesDeck partnerName="Sam" selfId="me" />);
    await screen.findByText("Ciao amore");

    const link = screen.getByRole("link", { name: "Vedi tutte le foto" });
    expect(link).toHaveAttribute("href", "/home/foto");
  });

  it("non mostra l'indicatore di posizione con un solo ricordo", async () => {
    mockListRecentThoughts.mockResolvedValue([textThought]);
    render(<MemoriesDeck partnerName="Sam" selfId="me" />);
    await screen.findByText("Ciao amore");

    expect(screen.queryByText("1/1")).not.toBeInTheDocument();
  });

  it("mostra e aggiorna l'indicatore di posizione con più ricordi", async () => {
    mockListRecentThoughts.mockResolvedValue([textThought, secondTextThought]);
    render(<MemoriesDeck partnerName="Sam" selfId="me" />);
    await screen.findByText("Ciao amore");

    expect(screen.getByText("1/2")).toBeInTheDocument();

    const topCard = screen.getAllByTestId("memory-card")[0];
    firePointer(topCard, "pointerdown", { pointerId: 1, clientX: 0 });
    firePointer(topCard, "pointermove", { pointerId: 1, clientX: -160 });
    firePointer(topCard, "pointerup", { pointerId: 1, clientX: -160 });

    await waitFor(() => expect(screen.getByText("2/2")).toBeInTheDocument());
  });

  it("sull'ultimo ricordo mostra l'invito 'Mandane uno nuovo', che apre lo stesso menu del '+'", async () => {
    const user = userEvent.setup();
    mockListRecentThoughts.mockResolvedValue([textThought]);
    render(<MemoriesDeck partnerName="Sam" selfId="me" />);
    await screen.findByText("Ciao amore");

    expect(screen.getByText(/Hai visto tutti i ricordi/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mandane uno nuovo" }));

    expect(screen.getByRole("button", { name: /Manda un pensiero/ })).toBeInTheDocument();
  });

  it("l'invito di fine mazzo sparisce quando non si è più sull'ultima card", async () => {
    mockListRecentThoughts.mockResolvedValue([textThought, secondTextThought]);
    render(<MemoriesDeck partnerName="Sam" selfId="me" />);
    await screen.findByText("Ciao amore");

    // Con 2 ricordi e topIndex=0 (prima card), non si è ancora sull'ultima.
    expect(screen.queryByText(/Hai visto tutti i ricordi/)).not.toBeInTheDocument();

    const topCard = screen.getAllByTestId("memory-card")[0];
    firePointer(topCard, "pointerdown", { pointerId: 1, clientX: 0 });
    firePointer(topCard, "pointermove", { pointerId: 1, clientX: -160 });
    firePointer(topCard, "pointerup", { pointerId: 1, clientX: -160 });

    await waitFor(() => expect(screen.getByText(/Hai visto tutti i ricordi/)).toBeInTheDocument());
  });
});
