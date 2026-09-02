/**
 * Unit test per lib/notifications-actions.ts (listNotifications,
 * getUnreadNotificationsCount, markNotificationRead,
 * markAllNotificationsRead) — centro notifiche (piano approvato in
 * /Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md).
 *
 * Il client Supabase reale (@/lib/supabase/client) viene mockato — non
 * verifichiamo Postgres/RLS/i trigger (non "live" in questo modulo di test),
 * solo l'orchestrazione di lib/notifications-actions.ts. Vedi
 * tests/lib/auth-actions.test.ts per il perché si usa il `jest` globale
 * ambient (non `import { jest } from "@jest/globals"`).
 */

type MockRpcResponse = { data: unknown; error: { message: string } | null };
type QueryResponse<T> = { data: T; error: { message: string } | null };
type CountResponse = { count: number | null; error: { message: string } | null };

/** Mock della catena `.from("notifications").select(cols).order(col, opts).limit(n)`. */
function makeSelectOrderLimitMock(response: QueryResponse<unknown[] | null>) {
  const limit = jest.fn<Promise<typeof response>, [count: number]>().mockResolvedValue(response);
  const order = jest
    .fn<{ limit: typeof limit }, [column: string, opts?: unknown]>()
    .mockReturnValue({ limit });
  const select = jest.fn<{ order: typeof order }, [columns: string]>().mockReturnValue({ order });
  return { select, order, limit };
}

/** Mock della catena `.from("notifications").select("id", { count, head }).is(col, val)`. */
function makeSelectCountIsMock(response: CountResponse) {
  const is = jest.fn<Promise<typeof response>, [column: string, value: null]>().mockResolvedValue(response);
  const select = jest
    .fn<{ is: typeof is }, [columns: string, opts?: unknown]>()
    .mockReturnValue({ is });
  return { select, is };
}

type FromReturn = ReturnType<typeof makeSelectOrderLimitMock> | ReturnType<typeof makeSelectCountIsMock>;

type MockSupabase = {
  from: jest.Mock<FromReturn, [table: string]>;
  rpc: jest.Mock<Promise<MockRpcResponse>, [name: string, args?: unknown]>;
};

function makeMockSupabase(): MockSupabase {
  return {
    from: jest.fn<FromReturn, [table: string]>(),
    rpc: jest.fn<Promise<MockRpcResponse>, [name: string, args?: unknown]>(),
  };
}

let mockSupabase: MockSupabase;

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

import {
  listNotifications,
  getUnreadNotificationsCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications-actions";

beforeEach(() => {
  mockSupabase = makeMockSupabase();
});

const notificationRow = {
  id: "n1",
  type: "reazione" as const,
  title: "Nuovo cuore ricevuto",
  body: "Sam ha messo un cuore a un tuo pensiero",
  source_table: "messages",
  source_id: "m1",
  read_at: null,
  created_at: "2026-09-01T10:00:00.000Z",
};

describe("listNotifications", () => {
  it("legge dalla tabella notifications, mappa snake_case -> camelCase", async () => {
    mockSupabase.from.mockReturnValue(makeSelectOrderLimitMock({ data: [notificationRow], error: null }));

    const result = await listNotifications();

    expect(mockSupabase.from).toHaveBeenCalledWith("notifications");
    expect(result).toEqual([
      {
        id: "n1",
        type: "reazione",
        title: "Nuovo cuore ricevuto",
        body: "Sam ha messo un cuore a un tuo pensiero",
        sourceTable: "messages",
        sourceId: "m1",
        readAt: null,
        createdAt: "2026-09-01T10:00:00.000Z",
      },
    ]);
  });

  it("ritorna array vuoto se data è null senza errore", async () => {
    mockSupabase.from.mockReturnValue(makeSelectOrderLimitMock({ data: null, error: null }));
    const result = await listNotifications();
    expect(result).toEqual([]);
  });

  it("propaga l'errore della query", async () => {
    mockSupabase.from.mockReturnValue(
      makeSelectOrderLimitMock({ data: null, error: { message: "Errore di rete" } }),
    );
    const result = await listNotifications();
    expect(result).toEqual({ error: "Errore di rete" });
  });
});

describe("getUnreadNotificationsCount", () => {
  it("ritorna il count dalla query head-only", async () => {
    mockSupabase.from.mockReturnValue(makeSelectCountIsMock({ count: 3, error: null }));
    const result = await getUnreadNotificationsCount();
    expect(result).toBe(3);
  });

  it("ritorna 0 se count è null senza errore", async () => {
    mockSupabase.from.mockReturnValue(makeSelectCountIsMock({ count: null, error: null }));
    const result = await getUnreadNotificationsCount();
    expect(result).toBe(0);
  });

  it("propaga l'errore della query", async () => {
    mockSupabase.from.mockReturnValue(makeSelectCountIsMock({ count: null, error: { message: "Non autorizzato" } }));
    const result = await getUnreadNotificationsCount();
    expect(result).toEqual({ error: "Non autorizzato" });
  });
});

describe("markNotificationRead", () => {
  it("chiama la RPC mark_notification_read con l'id giusto e ritorna true", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
    const result = await markNotificationRead("n1");
    expect(mockSupabase.rpc).toHaveBeenCalledWith("mark_notification_read", { notification_id: "n1" });
    expect(result).toBe(true);
  });

  it("propaga l'errore della RPC", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: "Non trovato" } });
    const result = await markNotificationRead("n1");
    expect(result).toEqual({ error: "Non trovato" });
  });
});

describe("markAllNotificationsRead", () => {
  it("chiama la RPC mark_all_notifications_read senza argomenti e ritorna true", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
    const result = await markAllNotificationsRead();
    expect(mockSupabase.rpc).toHaveBeenCalledWith("mark_all_notifications_read");
    expect(result).toBe(true);
  });

  it("propaga l'errore della RPC", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: "Errore di rete" } });
    const result = await markAllNotificationsRead();
    expect(result).toEqual({ error: "Errore di rete" });
  });
});
