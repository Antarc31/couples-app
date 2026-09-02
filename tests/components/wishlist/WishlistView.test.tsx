/**
 * Unit test per components/wishlist/WishlistView.tsx — copre la logica non
 * banale del componente: i filtri Regali/Attività di coppia/Tutto, il
 * toggle archivio "Completati", e SOPRATTUTTO come il componente reagisce al
 * flag `isHiddenSurprise` già calcolato lato server (view `wishlist_feed`) —
 * il componente non ha NESSUNA logica di mascheramento propria, si limita a
 * leggere quel flag (a differenza della vecchia versione mock con
 * `isSurpriseHiddenFor`, sostituita nello swap a dati reali).
 *
 * lib/wishlist-actions.ts è mockato: qui non testiamo Supabase/RLS/la view
 * SQL (vedi tests/lib/wishlist-actions.test.ts per quello), solo
 * l'orchestrazione della UI.
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest` globale
 * ambient, e tests/components/home/ThoughtsSection.test.tsx per la
 * convenzione sui nomi `mock*` richiesta dall'hoisting di jest.mock.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WishlistFeedItem, ActionError } from "@/lib/wishlist-actions";

const mockListWishlistFeed = jest.fn<Promise<WishlistFeedItem[] | ActionError>, []>();
const mockCompleteWishlistItem = jest.fn<Promise<WishlistFeedItem | ActionError>, [string]>();
const mockReopenWishlistItem = jest.fn<Promise<WishlistFeedItem | ActionError>, [string]>();

jest.mock("@/lib/wishlist-actions", () => ({
  listWishlistFeed: (...args: []) => mockListWishlistFeed(...args),
  completeWishlistItem: (...args: [string]) => mockCompleteWishlistItem(...args),
  reopenWishlistItem: (...args: [string]) => mockReopenWishlistItem(...args),
}));

import WishlistView from "@/components/wishlist/WishlistView";

function makeItem(overrides: Partial<WishlistFeedItem>): WishlistFeedItem {
  return {
    id: "wl1",
    coupleId: "c1",
    createdBy: "me",
    category: "regalo",
    target: "self",
    priority: "media",
    isSurprise: false,
    status: "attivo",
    isHiddenSurprise: false,
    title: "Cuffie wireless",
    description: null,
    price: 80,
    link: null,
    photoUrl: null,
    completedAt: null,
    completedBy: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    linkedCalendarEventId: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockListWishlistFeed.mockReset();
  mockCompleteWishlistItem.mockReset();
  mockReopenWishlistItem.mockReset();
});

describe("WishlistView — filtri Regali / Attività di coppia / Tutto", () => {
  it("il filtro di default 'Tutto' mostra sia regali che attività attive", async () => {
    mockListWishlistFeed.mockResolvedValue([
      makeItem({ id: "wl1", category: "regalo", title: "Cuffie wireless" }),
      makeItem({ id: "wl2", category: "attivita", title: "Corso di ballo" }),
    ]);

    render(<WishlistView selfId="me" partnerName="Sam" />);

    expect(await screen.findByText("Cuffie wireless")).toBeInTheDocument();
    expect(screen.getByText("Corso di ballo")).toBeInTheDocument();
  });

  it("il filtro 'Regali' nasconde le attività, e viceversa per 'Attività di coppia'", async () => {
    const user = userEvent.setup();
    mockListWishlistFeed.mockResolvedValue([
      makeItem({ id: "wl1", category: "regalo", title: "Cuffie wireless" }),
      makeItem({ id: "wl2", category: "attivita", title: "Corso di ballo" }),
    ]);

    render(<WishlistView selfId="me" partnerName="Sam" />);
    await screen.findByText("Cuffie wireless");

    await user.click(screen.getByRole("button", { name: "Regali" }));
    expect(screen.getByText("Cuffie wireless")).toBeInTheDocument();
    expect(screen.queryByText("Corso di ballo")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Attività di coppia" }));
    expect(screen.queryByText("Cuffie wireless")).not.toBeInTheDocument();
    expect(screen.getByText("Corso di ballo")).toBeInTheDocument();
  });

  it("nasconde gli item completati dalla vista 'Attivi' e li mostra solo nell'archivio 'Completati'", async () => {
    const user = userEvent.setup();
    mockListWishlistFeed.mockResolvedValue([
      makeItem({ id: "wl1", title: "Attivo", status: "attivo" }),
      makeItem({ id: "wl2", title: "Fatto insieme", status: "completato", completedAt: "2026-08-20T10:00:00.000Z" }),
    ]);

    render(<WishlistView selfId="me" partnerName="Sam" />);
    await screen.findByText("Attivo");
    expect(screen.queryByText("Fatto insieme")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Completati 🗂" }));
    expect(screen.queryByText("Attivo")).not.toBeInTheDocument();
    expect(screen.getByText("Fatto insieme")).toBeInTheDocument();
    // In archivio i filtri categoria non hanno senso e spariscono dalla UI.
    expect(screen.queryByRole("button", { name: "Regali" })).not.toBeInTheDocument();
  });
});

describe("WishlistView — visibilità modalità sorpresa (il punto più delicato)", () => {
  it("DESTINATARIO — isHiddenSurprise=true: mostra solo il placeholder 'Sorpresa in arrivo…', MAI il titolo/prezzo reali, e nessun pulsante di completamento", async () => {
    mockListWishlistFeed.mockResolvedValue([
      makeItem({
        id: "wl8",
        title: null,
        description: null,
        price: null,
        isSurprise: true,
        target: "partner",
        createdBy: "partner-1",
        isHiddenSurprise: true,
      }),
    ]);

    render(<WishlistView selfId="me" partnerName="Sam" />);

    expect(await screen.findByText("Sorpresa in arrivo…")).toBeInTheDocument();
    expect(screen.getByText(/Sam sta preparando qualcosa per te/)).toBeInTheDocument();
    // Nessuna fuga di informazioni: nessun titolo reale nel DOM.
    expect(screen.queryByText("Weekend a sorpresa per te")).not.toBeInTheDocument();
    // Non può nemmeno tentare di completarla (rispecchia la RLS: il partner
    // non può scrivere su una sorpresa attiva non sua).
    expect(screen.queryByRole("button", { name: "Segna come completato" })).not.toBeInTheDocument();
  });

  it("CREATORE — la propria sorpresa attiva (isHiddenSurprise=false) mostra titolo/prezzo pieni e il badge 🎁 sorpresa", async () => {
    mockListWishlistFeed.mockResolvedValue([
      makeItem({
        id: "wl3",
        title: "Sorpresa per Sam",
        price: 200,
        isSurprise: true,
        target: "partner",
        createdBy: "me",
        isHiddenSurprise: false,
      }),
    ]);

    render(<WishlistView selfId="me" partnerName="Sam" />);

    expect(await screen.findByText("Sorpresa per Sam")).toBeInTheDocument();
    expect(screen.getByText("🎁 sorpresa")).toBeInTheDocument();
    expect(screen.getByText(/aggiunto da te/)).toBeInTheDocument();
    expect(screen.queryByText("Sorpresa in arrivo…")).not.toBeInTheDocument();
    // Il creatore PUÒ completarla.
    expect(screen.getByRole("button", { name: "Segna come completato" })).toBeInTheDocument();
  });

  it("DOPO IL COMPLETAMENTO — isHiddenSurprise=false anche per il destinatario: la sorpresa passata si rivela con titolo pieno", async () => {
    mockListWishlistFeed.mockResolvedValue([
      makeItem({
        id: "wl8",
        title: "Weekend a sorpresa per te",
        price: 200,
        status: "completato",
        isSurprise: true,
        target: "partner",
        createdBy: "partner-1",
        isHiddenSurprise: false,
        completedAt: "2026-09-01T10:00:00.000Z",
        completedBy: "partner-1",
      }),
    ]);

    render(<WishlistView selfId="me" partnerName="Sam" />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Completati 🗂" }));

    expect(await screen.findByText("Weekend a sorpresa per te")).toBeInTheDocument();
    expect(screen.queryByText("Sorpresa in arrivo…")).not.toBeInTheDocument();
  });
});

describe("WishlistView — completamento ottimistico", () => {
  it("rimuove subito l'item dalla vista attivi al click su 'Segna come completato' (ottimistico), poi conferma la chiamata reale", async () => {
    const user = userEvent.setup();
    mockListWishlistFeed.mockResolvedValue([makeItem({ id: "wl1", title: "Cuffie wireless" })]);
    mockCompleteWishlistItem.mockResolvedValue({
      ...makeItem({ id: "wl1", title: "Cuffie wireless" }),
      status: "completato",
    });

    render(<WishlistView selfId="me" partnerName="Sam" />);
    await screen.findByText("Cuffie wireless");

    await user.click(screen.getByRole("button", { name: "Segna come completato" }));

    // Sparisce subito dalla vista "Attivi" senza aspettare la risposta del server.
    await waitFor(() => expect(screen.queryByText("Cuffie wireless")).not.toBeInTheDocument());
    expect(mockCompleteWishlistItem).toHaveBeenCalledWith("wl1");
  });

  it("in caso di errore della RPC ricarica la lista dal server (rollback via refetch) — il rollback dei DATI funziona", async () => {
    const user = userEvent.setup();
    mockListWishlistFeed.mockResolvedValueOnce([makeItem({ id: "wl1", title: "Cuffie wireless" })]);
    mockCompleteWishlistItem.mockResolvedValue({ error: "Non autorizzato" });
    // Il refetch dopo l'errore ritorna di nuovo l'item attivo (come se il completamento non fosse mai avvenuto).
    mockListWishlistFeed.mockResolvedValueOnce([makeItem({ id: "wl1", title: "Cuffie wireless" })]);

    render(<WishlistView selfId="me" partnerName="Sam" />);
    await screen.findByText("Cuffie wireless");

    await user.click(screen.getByRole("button", { name: "Segna come completato" }));

    // Dopo il refetch l'item torna visibile tra gli attivi (rollback dei dati riuscito).
    await waitFor(() => expect(mockListWishlistFeed).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Cuffie wireless")).toBeInTheDocument();
  });

  it("BUG FISSATO da frontend2 (2026-09-01): in caso di errore della RPC, il messaggio ora persiste a schermo dopo il refetch. Causa originale: `complete()` chiamava `setError(result.error)` poi `load()` SENZA attenderlo; `load()` fa `setError(null)` in modo sincrono a inizio fetch, cancellando l'errore nello stesso batch React prima che l'utente potesse vederlo. Fix: `complete()` ora fa `await load()` e imposta l'errore DOPO che il resync è finito, così è l'ultima scrittura e resta visibile — vedi components/wishlist/WishlistView.tsx.", async () => {
    mockListWishlistFeed.mockResolvedValueOnce([makeItem({ id: "wl1", title: "Cuffie wireless" })]);
    mockCompleteWishlistItem.mockResolvedValue({ error: "Non autorizzato" });
    mockListWishlistFeed.mockResolvedValueOnce([makeItem({ id: "wl1", title: "Cuffie wireless" })]);

    render(<WishlistView selfId="me" partnerName="Sam" />);
    await screen.findByText("Cuffie wireless");
    await userEvent.setup().click(screen.getByRole("button", { name: "Segna come completato" }));

    await waitFor(() => expect(mockListWishlistFeed).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Non autorizzato")).toBeInTheDocument();
  });
});

describe("WishlistView — riapertura di un item completato per errore", () => {
  it("il bottone 'Riapri' compare solo nell'archivio, non tra gli attivi", async () => {
    mockListWishlistFeed.mockResolvedValue([
      makeItem({ id: "wl1", title: "Attivo", status: "attivo" }),
      makeItem({ id: "wl2", title: "Fatto insieme", status: "completato", completedAt: "2026-08-20T10:00:00.000Z" }),
    ]);

    render(<WishlistView selfId="me" partnerName="Sam" />);
    await screen.findByText("Attivo");
    expect(screen.queryByRole("button", { name: "Riapri" })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Completati 🗂" }));
    expect(await screen.findByRole("button", { name: "Riapri" })).toBeInTheDocument();
  });

  it("il tap su 'Riapri' rimuove subito l'item dall'archivio (ottimistico) e chiama reopenWishlistItem", async () => {
    const user = userEvent.setup();
    mockListWishlistFeed.mockResolvedValue([
      makeItem({ id: "wl2", title: "Fatto insieme", status: "completato", completedAt: "2026-08-20T10:00:00.000Z" }),
    ]);
    mockReopenWishlistItem.mockResolvedValue({
      ...makeItem({ id: "wl2", title: "Fatto insieme" }),
      status: "attivo",
    });

    render(<WishlistView selfId="me" partnerName="Sam" />);
    await user.click(screen.getByRole("button", { name: "Completati 🗂" }));
    await screen.findByText("Fatto insieme");

    await user.click(screen.getByRole("button", { name: "Riapri" }));

    expect(mockReopenWishlistItem).toHaveBeenCalledWith("wl2");
    // Rimosso subito dall'archivio (torna 'attivo' ottimisticamente, l'archivio mostra solo i completati).
    await waitFor(() => expect(screen.queryByText("Fatto insieme")).not.toBeInTheDocument());
  });
});

describe("WishlistView — badge destinatario (target, sempre relativo a chi guarda)", () => {
  it("target='entrambi' mostra 'Per voi due' indipendentemente da chi l'ha creato", async () => {
    mockListWishlistFeed.mockResolvedValue([makeItem({ id: "wl1", target: "entrambi", createdBy: "partner-1" })]);
    render(<WishlistView selfId="me" partnerName="Sam" />);
    expect(await screen.findByText("Per voi due")).toBeInTheDocument();
  });

  it("target='self' creato da te mostra 'Per te'", async () => {
    mockListWishlistFeed.mockResolvedValue([makeItem({ id: "wl1", target: "self", createdBy: "me" })]);
    render(<WishlistView selfId="me" partnerName="Sam" />);
    expect(await screen.findByText("Per te")).toBeInTheDocument();
  });

  it("target='self' creato dal partner (lo vuole per sé) mostra 'Per <nome partner>'", async () => {
    mockListWishlistFeed.mockResolvedValue([makeItem({ id: "wl1", target: "self", createdBy: "partner-1" })]);
    render(<WishlistView selfId="me" partnerName="Sam" />);
    expect(await screen.findByText("Per Sam")).toBeInTheDocument();
  });

  it("target='partner' creato da te (idea regalo per il partner) mostra 'Per <nome partner>'", async () => {
    mockListWishlistFeed.mockResolvedValue([makeItem({ id: "wl1", target: "partner", createdBy: "me" })]);
    render(<WishlistView selfId="me" partnerName="Sam" />);
    expect(await screen.findByText("Per Sam")).toBeInTheDocument();
  });

  it("target='partner' creato dal partner (per il SUO partner, cioè te) mostra 'Per te'", async () => {
    mockListWishlistFeed.mockResolvedValue([makeItem({ id: "wl1", target: "partner", createdBy: "partner-1" })]);
    render(<WishlistView selfId="me" partnerName="Sam" />);
    expect(await screen.findByText("Per te")).toBeInTheDocument();
  });
});
