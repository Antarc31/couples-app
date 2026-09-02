/**
 * Unit test per components/wishlist/WishlistFormModal.tsx — nessun test
 * esisteva prima per questo componente; aggiunto insieme al selettore
 * "collega a un evento" opzionale (Fase D). lib/wishlist-actions.ts e
 * lib/calendar-actions.ts sono mockati.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WishlistFeedItem, CreateWishlistItemInput } from "@/lib/wishlist-actions";
import type { UpcomingEventOption } from "@/lib/calendar-actions";

type ActionError = { error: string };

const mockCreateWishlistItem = jest.fn<Promise<WishlistFeedItem | ActionError>, [CreateWishlistItemInput]>();

jest.mock("@/lib/wishlist-actions", () => ({
  createWishlistItem: (input: CreateWishlistItemInput) => mockCreateWishlistItem(input),
}));

const mockListUpcomingCoupleEvents = jest.fn<Promise<UpcomingEventOption[] | ActionError>, []>();

jest.mock("@/lib/calendar-actions", () => ({
  listUpcomingCoupleEvents: () => mockListUpcomingCoupleEvents(),
}));

import WishlistFormModal from "@/components/wishlist/WishlistFormModal";

beforeEach(() => {
  mockCreateWishlistItem.mockReset();
  mockListUpcomingCoupleEvents.mockReset();
  mockListUpcomingCoupleEvents.mockResolvedValue([]);
});

describe("WishlistFormModal", () => {
  it("non mostra il selettore evento se il target è 'Per me' (niente sorpresa possibile)", () => {
    render(<WishlistFormModal onClose={jest.fn()} onSaved={jest.fn()} />);
    expect(screen.queryByText("Collega a un evento del calendario (opzionale)")).not.toBeInTheDocument();
  });

  it("non mostra il selettore evento finché la modalità sorpresa non è attiva", async () => {
    const user = userEvent.setup();
    render(<WishlistFormModal onClose={jest.fn()} onSaved={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: "Per il partner" }));
    expect(screen.queryByText("Collega a un evento del calendario (opzionale)")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/Modalità sorpresa/));
    expect(await screen.findByText("Collega a un evento del calendario (opzionale)")).toBeInTheDocument();
  });

  it("carica gli eventi futuri solo quando la modalità sorpresa viene attivata, non prima", async () => {
    mockListUpcomingCoupleEvents.mockResolvedValue([
      { id: "ev1", title: "Cena romantica", startsAt: "2026-09-10T20:00:00.000Z" },
    ]);
    const user = userEvent.setup();
    render(<WishlistFormModal onClose={jest.fn()} onSaved={jest.fn()} />);

    expect(mockListUpcomingCoupleEvents).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Per il partner" }));
    await user.click(screen.getByLabelText(/Modalità sorpresa/));

    await waitFor(() => expect(mockListUpcomingCoupleEvents).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Cena romantica/)).toBeInTheDocument();
  });

  it("invia linkedCalendarEventId solo se un evento è stato selezionato", async () => {
    mockListUpcomingCoupleEvents.mockResolvedValue([
      { id: "ev1", title: "Cena romantica", startsAt: "2026-09-10T20:00:00.000Z" },
    ]);
    mockCreateWishlistItem.mockResolvedValue({
      id: "wl1",
      coupleId: "c1",
      createdBy: "me",
      category: "regalo",
      target: "partner",
      priority: "media",
      isSurprise: true,
      status: "attivo",
      isHiddenSurprise: false,
      title: "Sorpresa",
      description: null,
      price: null,
      link: null,
      photoUrl: null,
      completedAt: null,
      completedBy: null,
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
      linkedCalendarEventId: "ev1",
    });
    const user = userEvent.setup();
    const onSaved = jest.fn();
    render(<WishlistFormModal onClose={jest.fn()} onSaved={onSaved} />);

    await user.type(screen.getByPlaceholderText("Titolo (es. Cuffie wireless)"), "Sorpresa");
    await user.click(screen.getByRole("button", { name: "Per il partner" }));
    await user.click(screen.getByLabelText(/Modalità sorpresa/));
    await screen.findByText(/Cena romantica/);
    await user.selectOptions(screen.getByRole("combobox"), "ev1");
    await user.click(screen.getByRole("button", { name: "Aggiungi" }));

    await waitFor(() =>
      expect(mockCreateWishlistItem).toHaveBeenCalledWith(
        expect.objectContaining({ isSurprise: true, linkedCalendarEventId: "ev1" }),
      ),
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("non invia linkedCalendarEventId se resta su 'Nessun evento collegato'", async () => {
    mockListUpcomingCoupleEvents.mockResolvedValue([]);
    mockCreateWishlistItem.mockResolvedValue({
      id: "wl1",
      coupleId: "c1",
      createdBy: "me",
      category: "regalo",
      target: "partner",
      priority: "media",
      isSurprise: true,
      status: "attivo",
      isHiddenSurprise: false,
      title: "Sorpresa",
      description: null,
      price: null,
      link: null,
      photoUrl: null,
      completedAt: null,
      completedBy: null,
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
      linkedCalendarEventId: null,
    });
    const user = userEvent.setup();
    render(<WishlistFormModal onClose={jest.fn()} onSaved={jest.fn()} />);

    await user.type(screen.getByPlaceholderText("Titolo (es. Cuffie wireless)"), "Sorpresa");
    await user.click(screen.getByRole("button", { name: "Per il partner" }));
    await user.click(screen.getByLabelText(/Modalità sorpresa/));
    await user.click(screen.getByRole("button", { name: "Aggiungi" }));

    await waitFor(() =>
      expect(mockCreateWishlistItem).toHaveBeenCalledWith(
        expect.objectContaining({ linkedCalendarEventId: undefined }),
      ),
    );
  });
});
