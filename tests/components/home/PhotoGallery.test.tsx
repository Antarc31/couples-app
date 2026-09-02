/**
 * Unit test per components/home/PhotoGallery.tsx — grid infinite-load della
 * galleria foto persistente (app/(app)/home/foto), vedi piano approvato
 * "Feature A — Galleria foto persistente".
 *
 * lib/messages-actions.ts viene mockato: qui non testiamo Supabase/Storage
 * (vedi tests/lib/messages-actions.test.ts per quello), solo l'orchestrazione
 * della UI (paginazione, IntersectionObserver, overlay fullscreen).
 *
 * Nota su jsdom: `IntersectionObserver` non è implementato in jsdom (stesso
 * tipo di buco già documentato per PointerEvent in
 * tests/components/home/MemoriesDeck.test.tsx). Qui lo si sostituisce con
 * una classe fake che registra l'ultima istanza creata e il suo callback,
 * così i test possono simulare "il sentinel è entrato nel viewport"
 * chiamando `triggerIntersect()` a mano invece di dipendere da un vero
 * scroll (impossibile da simulare in modo affidabile sotto jsdom).
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest`
 * globale ambient (non `import { jest } from "@jest/globals"`).
 */

import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Thought, PhotoMemoriesPage } from "@/lib/messages-actions";

type ActionError = { error: string };

/** Ultima istanza di IntersectionObserver creata dal componente sotto test. */
let lastObserverInstance: FakeIntersectionObserver | null = null;

class FakeIntersectionObserver {
  callback: IntersectionObserverCallback;
  observedElements: Element[] = [];
  disconnected = false;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    lastObserverInstance = this;
  }
  observe(el: Element) {
    this.observedElements.push(el);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  takeRecords() {
    return [];
  }
}

function triggerIntersect() {
  if (!lastObserverInstance) throw new Error("Nessun IntersectionObserver creato dal componente");
  // act(): il callback dell'observer aggiorna lo state React fuori da un
  // dispatch sintetico di testing-library, che altrimenti lo segnalerebbe
  // come update non wrappato.
  act(() => {
    lastObserverInstance!.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      lastObserverInstance as unknown as IntersectionObserver,
    );
  });
}

function photo(id: string, overrides: Partial<Thought> = {}): Thought {
  return {
    id,
    senderId: "partner-1",
    senderName: "Sam",
    type: "photo",
    content: "📷",
    photoUrl: `https://signed.example/${id}.jpg`,
    createdAt: new Date().toISOString(),
    likedByMe: false,
    ...overrides,
  };
}

const mockListPhotoMemories = jest.fn<Promise<PhotoMemoriesPage | ActionError>, [string | undefined, number]>();

jest.mock("@/lib/messages-actions", () => ({
  listPhotoMemories: (...args: [string | undefined, number]) => mockListPhotoMemories(...args),
}));

import PhotoGallery from "@/components/home/PhotoGallery";

beforeEach(() => {
  mockListPhotoMemories.mockReset();
  lastObserverInstance = null;
  (global as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIntersectionObserver;
});

describe("PhotoGallery", () => {
  it("mostra lo stato vuoto quando non ci sono foto", async () => {
    mockListPhotoMemories.mockResolvedValue({ items: [], nextCursor: null });
    render(<PhotoGallery selfId="me" />);
    expect(await screen.findByText(/Nessuna foto ancora/)).toBeInTheDocument();
    expect(mockListPhotoMemories).toHaveBeenCalledWith(undefined, 24);
  });

  it("propaga l'errore della prima pagina", async () => {
    mockListPhotoMemories.mockResolvedValue({ error: "Errore di rete" });
    render(<PhotoGallery selfId="me" />);
    expect(await screen.findByText("Errore di rete")).toBeInTheDocument();
  });

  it("mostra la grid con le foto caricate", async () => {
    mockListPhotoMemories.mockResolvedValue({
      items: [photo("p1"), photo("p2")],
      nextCursor: null,
    });
    render(<PhotoGallery selfId="me" />);
    const tiles = await screen.findAllByTestId("gallery-photo");
    expect(tiles).toHaveLength(2);
  });

  it("carica la pagina successiva quando il sentinel entra nel viewport, usando nextCursor come `before`", async () => {
    mockListPhotoMemories.mockResolvedValueOnce({ items: [photo("p1")], nextCursor: "2026-08-29T00:00:00.000Z" });
    render(<PhotoGallery selfId="me" />);
    await screen.findAllByTestId("gallery-photo");

    mockListPhotoMemories.mockResolvedValueOnce({ items: [photo("p2")], nextCursor: null });
    triggerIntersect();

    await waitFor(() => {
      expect(screen.getAllByTestId("gallery-photo")).toHaveLength(2);
    });
    expect(mockListPhotoMemories).toHaveBeenNthCalledWith(2, "2026-08-29T00:00:00.000Z", 24);
  });

  it("smette di osservare/richiedere altre pagine quando nextCursor è null", async () => {
    mockListPhotoMemories.mockResolvedValue({ items: [photo("p1")], nextCursor: null });
    render(<PhotoGallery selfId="me" />);
    await screen.findAllByTestId("gallery-photo");

    // Nessun sentinel renderizzato (hasMore false) -> nessun secondo observer creato per il caricamento successivo.
    expect(screen.queryByTestId("gallery-photo")).toBeInTheDocument();
    expect(mockListPhotoMemories).toHaveBeenCalledTimes(1);
  });

  it("tap su una foto apre l'overlay fullscreen con didascalia e mittente, chiudibile con la X", async () => {
    const user = userEvent.setup();
    mockListPhotoMemories.mockResolvedValue({
      items: [photo("p1", { content: "Guarda che tramonto", senderId: "partner-1", senderName: "Sam" })],
      nextCursor: null,
    });
    render(<PhotoGallery selfId="me" />);
    const tile = (await screen.findAllByTestId("gallery-photo"))[0];

    await user.click(tile);

    expect(screen.getByText("Guarda che tramonto")).toBeInTheDocument();
    expect(screen.getByText(/Sam ·/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByText("Guarda che tramonto")).not.toBeInTheDocument();
  });

  it("non mostra la didascalia di default (📷, senza caption) nell'overlay", async () => {
    const user = userEvent.setup();
    mockListPhotoMemories.mockResolvedValue({
      items: [photo("p1", { content: "📷" })],
      nextCursor: null,
    });
    render(<PhotoGallery selfId="me" />);
    const tile = (await screen.findAllByTestId("gallery-photo"))[0];

    await user.click(tile);

    // La card è aperta (mittente visibile) ma senza paragrafo di didascalia.
    expect(screen.getByText(/Sam ·/)).toBeInTheDocument();
    expect(screen.queryByText("📷", { selector: "p" })).not.toBeInTheDocument();
  });
});
