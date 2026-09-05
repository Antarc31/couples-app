/**
 * Unit test per components/AppTopBar.tsx — campanella notifiche nella top
 * bar persistente (piano approvato in
 * /Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md).
 *
 * lib/notifications-actions.ts viene mockato (vedi
 * tests/lib/notifications-actions.test.ts per quello). Il canale Realtime
 * (createClient().channel().on().subscribe()/removeChannel) è mockato qui:
 * catturiamo l'handler passato a `.on(...)` per poter simulare un evento
 * INSERT in arrivo dal partner senza un vero websocket.
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest`
 * globale ambient (non `import { jest } from "@jest/globals"`) e la
 * convenzione dei nomi `mock*` per le variabili referenziate dentro
 * `jest.mock(...)` (richiesta dal meccanismo di hoisting di Jest).
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppNotification } from "@/lib/notifications-actions";

type ActionError = { error: string };
type RealtimeHandler = (payload: { new: Record<string, unknown> }) => void;

/** Stesso pattern di tests/components/profilo/ProfileEditForm.test.tsx: nessun mock globale per next/navigation nel progetto. */
const mockPush = jest.fn<void, [string]>();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/home",
}));

const mockListNotifications = jest.fn<Promise<AppNotification[] | ActionError>, [limit?: number]>();
const mockGetUnreadNotificationsCount = jest.fn<Promise<number | ActionError>, []>();
const mockMarkNotificationRead = jest.fn<Promise<true | ActionError>, [id: string]>();
const mockMarkAllNotificationsRead = jest.fn<Promise<true | ActionError>, []>();

jest.mock("@/lib/notifications-actions", () => ({
  listNotifications: (...args: [number?]) => mockListNotifications(...args),
  getUnreadNotificationsCount: () => mockGetUnreadNotificationsCount(),
  markNotificationRead: (...args: [string]) => mockMarkNotificationRead(...args),
  markAllNotificationsRead: () => mockMarkAllNotificationsRead(),
}));

/** Cattura l'handler passato a `.on("postgres_changes", filter, handler)` per poterlo invocare a mano nei test. */
let capturedHandler: RealtimeHandler | null = null;
const mockRemoveChannel = jest.fn();

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => {
      const channelObj = {
        on: (_event: string, _filter: unknown, cb: RealtimeHandler) => {
          capturedHandler = cb;
          return channelObj;
        },
        subscribe: () => channelObj,
      };
      return channelObj;
    },
    removeChannel: mockRemoveChannel,
  }),
}));

/** Usato da MoodRevealSheet (montato dal tap su una notifica mood_checkin), non da AppTopBar direttamente. */
const mockGetMoodRevealForNotification = jest.fn<
  Promise<{ error: string } | { myMood: string; partnerMood: string; partnerName: string; revealed: true; checkinDate: string }>,
  [string]
>();

jest.mock("@/lib/mood-actions", () => ({
  getMoodRevealForNotification: (sourceId: string) => mockGetMoodRevealForNotification(sourceId),
}));

import AppTopBar from "@/components/AppTopBar";

const unreadReaction: AppNotification = {
  id: "n1",
  type: "reazione",
  title: "Nuovo cuore ricevuto",
  body: "Sam ha messo un cuore a un tuo pensiero",
  sourceTable: "messages",
  sourceId: "m1",
  readAt: null,
  createdAt: new Date().toISOString(),
};

const unreadMoodCheckin: AppNotification = {
  id: "n3",
  type: "mood_checkin",
  title: "Check-in di oggi svelato",
  body: "Avete fatto entrambi il check-in: guarda come sta Sam",
  sourceTable: "mood_checkins",
  sourceId: "mc1",
  readAt: null,
  createdAt: new Date().toISOString(),
};

const readWishlist: AppNotification = {
  id: "n2",
  type: "wishlist",
  title: "Nuovo elemento in wishlist",
  body: "Sam ha aggiunto \"Weekend alle terme\" alla wishlist",
  sourceTable: "wishlist_items",
  sourceId: "w1",
  readAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  mockPush.mockReset();
  mockListNotifications.mockReset();
  mockGetUnreadNotificationsCount.mockReset();
  mockMarkNotificationRead.mockReset();
  mockMarkAllNotificationsRead.mockReset();
  mockRemoveChannel.mockReset();
  mockGetMoodRevealForNotification.mockReset();
  capturedHandler = null;
});

describe("AppTopBar", () => {
  it("non mostra il badge quando non ci sono notifiche non lette", async () => {
    mockGetUnreadNotificationsCount.mockResolvedValue(0);
    render(<AppTopBar userId="me" />);

    await waitFor(() => expect(mockGetUnreadNotificationsCount).toHaveBeenCalled());
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("mostra il badge con il conteggio corretto, con cap '9+' oltre 9", async () => {
    mockGetUnreadNotificationsCount.mockResolvedValue(12);
    render(<AppTopBar userId="me" />);

    expect(await screen.findByText("9+")).toBeInTheDocument();
  });

  it("il tap sulla campanella apre il pannello e carica le notifiche", async () => {
    const user = userEvent.setup();
    mockGetUnreadNotificationsCount.mockResolvedValue(1);
    mockListNotifications.mockResolvedValue([unreadReaction, readWishlist]);

    render(<AppTopBar userId="me" />);
    await user.click(await screen.findByRole("button", { name: /Notifiche/ }));

    expect(mockListNotifications).toHaveBeenCalled();
    expect(await screen.findByText("Nuovo cuore ricevuto")).toBeInTheDocument();
    expect(screen.getByText("Nuovo elemento in wishlist")).toBeInTheDocument();
  });

  it("il tap su una notifica non letta la segna come letta, chiude il pannello e naviga alla schermata della sua sorgente", async () => {
    const user = userEvent.setup();
    mockGetUnreadNotificationsCount.mockResolvedValue(1);
    mockListNotifications.mockResolvedValue([unreadReaction, readWishlist]);
    mockMarkNotificationRead.mockResolvedValue(true);

    render(<AppTopBar userId="me" />);
    await user.click(await screen.findByRole("button", { name: /Notifiche/ }));
    await screen.findByText("Nuovo cuore ricevuto");

    // unreadReaction è type: "reazione" -> destinazione /home (vedi TYPE_DESTINATION).
    await user.click(screen.getByText("Nuovo cuore ricevuto"));

    expect(mockMarkNotificationRead).toHaveBeenCalledWith("n1");
    expect(mockPush).toHaveBeenCalledWith("/home");
    await waitFor(() => {
      expect(screen.queryByText("Nuovo cuore ricevuto")).not.toBeInTheDocument();
    });
  });

  it("il tap su una notifica già letta non richiama markNotificationRead ma naviga comunque", async () => {
    const user = userEvent.setup();
    mockGetUnreadNotificationsCount.mockResolvedValue(0);
    mockListNotifications.mockResolvedValue([readWishlist]);

    render(<AppTopBar userId="me" />);
    await user.click(await screen.findByRole("button", { name: /Notifiche/ }));
    await screen.findByText("Nuovo elemento in wishlist");

    await user.click(screen.getByText("Nuovo elemento in wishlist"));

    expect(mockMarkNotificationRead).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/wishlist");
  });

  it("il tap su una notifica mood_checkin apre il dettaglio invece di navigare, e non chiama router.push", async () => {
    const user = userEvent.setup();
    mockGetUnreadNotificationsCount.mockResolvedValue(1);
    mockListNotifications.mockResolvedValue([unreadMoodCheckin]);
    mockMarkNotificationRead.mockResolvedValue(true);
    mockGetMoodRevealForNotification.mockResolvedValue({
      myMood: "felice",
      partnerMood: "stanco",
      partnerName: "Sam",
      revealed: true,
      checkinDate: "2026-08-20",
    });

    render(<AppTopBar userId="me" />);
    await user.click(await screen.findByRole("button", { name: /Notifiche/ }));
    await user.click(await screen.findByText("Check-in di oggi svelato"));

    expect(mockMarkNotificationRead).toHaveBeenCalledWith("n3");
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockGetMoodRevealForNotification).toHaveBeenCalledWith("mc1");
    expect(await screen.findByText("😊")).toBeInTheDocument();
    expect(screen.getByText("😴")).toBeInTheDocument();
  });

  it("se il dettaglio mood_checkin non è ancora pronto (nudge), naviga a /home come fallback", async () => {
    const user = userEvent.setup();
    mockGetUnreadNotificationsCount.mockResolvedValue(1);
    mockListNotifications.mockResolvedValue([unreadMoodCheckin]);
    mockMarkNotificationRead.mockResolvedValue(true);
    mockGetMoodRevealForNotification.mockResolvedValue({ error: "not_ready" });

    render(<AppTopBar userId="me" />);
    await user.click(await screen.findByRole("button", { name: /Notifiche/ }));
    await user.click(await screen.findByText("Check-in di oggi svelato"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/home"));
  });

  it("'Segna tutte come lette' chiama markAllNotificationsRead e azzera il badge", async () => {
    const user = userEvent.setup();
    mockGetUnreadNotificationsCount.mockResolvedValue(2);
    mockListNotifications.mockResolvedValue([unreadReaction, { ...readWishlist, readAt: null }]);
    mockMarkAllNotificationsRead.mockResolvedValue(true);

    render(<AppTopBar userId="me" />);
    await user.click(await screen.findByRole("button", { name: /Notifiche/ }));
    await screen.findByText("Nuovo cuore ricevuto");

    await user.click(screen.getByRole("button", { name: "Segna tutte come lette" }));

    expect(mockMarkAllNotificationsRead).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText(/^[1-9]/)).not.toBeInTheDocument();
    });
  });

  it("un evento realtime INSERT in arrivo incrementa il badge", async () => {
    mockGetUnreadNotificationsCount.mockResolvedValue(0);
    render(<AppTopBar userId="me" />);

    await waitFor(() => expect(capturedHandler).not.toBeNull());

    act(() => {
      capturedHandler?.({
        new: {
          id: "n3",
          type: "evento_coppia",
          title: "Nuovo evento di coppia",
          body: "Sam ha aggiunto \"Cena\" al calendario",
          source_table: "calendar_events",
          source_id: "e1",
          read_at: null,
          created_at: new Date().toISOString(),
        },
      });
    });

    expect(await screen.findByText("1")).toBeInTheDocument();
  });
});
