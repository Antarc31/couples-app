/**
 * Unit test per lib/wishlist-actions.ts (listWishlistFeed,
 * createWishlistItem, updateWishlistItem, completeWishlistItem,
 * reopenWishlistItem) — sezione Wishlist (docs/PLAN.md), consegnata da
 * backend2 in Fase 2.
 *
 * PUNTO PIÙ DELICATO DI TUTTA LA FASE (vedi brief del lead): la modalità
 * sorpresa. backend2 ha confermato (vedi messaggio + commento esteso in
 * supabase/migrations/20260901020000_wishlist_items.sql) un meccanismo a due
 * livelli:
 *   1. RLS sulla tabella base `wishlist_items`: nega DEL TUTTO la riga (non
 *      solo campi) a chi non è il creatore quando la sorpresa è attiva. Non
 *      testabile qui (è RLS Postgres, non logica di questo modulo) — vedi
 *      nota "non testabile qui" più sotto.
 *   2. View `wishlist_feed` (letta da `listWishlistFeed`): espone la riga
 *      SEMPRE, ma con i 5 campi sensibili forzati a null e
 *      `is_hidden_surprise: true` quando la riga è una sorpresa attiva non
 *      tua. Anche questo mascheramento è calcolato lato server (dentro la
 *      view SQL), non da questo modulo: qui verifichiamo che
 *      wishlist-actions.ts MAPPI fedelmente ciò che il server restituisce
 *      (incluso il caso "campi già null perché mascherati dal server", che
 *      NON va confuso con "campo non compilato"), senza reintrodurre o
 *      rimuovere mascheramento lato client.
 *
 * Il client Supabase reale (@/lib/supabase/client) viene mockato — non
 * verifichiamo Postgres/RLS/la view SQL stessa (non "live", vedi
 * HANDOFF.md), solo l'orchestrazione di questo modulo.
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest` globale
 * ambient (non `import { jest } from "@jest/globals"`).
 */

import { makeQueryBuilderMock } from "../helpers/supabase-query-mock";

type MockGetUserResponse = { data: { user: { id: string } | null } };
type QueryResponse<T> = { data: T; error: { message: string } | null };

/** Mock della catena `.from("wishlist_feed").select(cols).order(col, opts)` (senza .limit). */
function makeSelectOrderMock(response: QueryResponse<unknown[] | null>) {
  const order = jest
    .fn<Promise<typeof response>, [column: string, opts?: unknown]>()
    .mockResolvedValue(response);
  const select = jest.fn<{ order: typeof order }, [columns: string]>().mockReturnValue({ order });
  return { select, order };
}

/** Mock della catena `.from(table).insert(row).select(cols).single()`. */
function makeInsertSelectSingleMock(response: QueryResponse<unknown>) {
  const single = jest.fn<Promise<typeof response>, []>().mockResolvedValue(response);
  const select = jest.fn<{ single: typeof single }, [columns: string]>().mockReturnValue({ single });
  const insert = jest.fn<{ select: typeof select }, [row: unknown]>().mockReturnValue({ select });
  return { insert, select, single };
}

/** Mock della catena `.from(table).update(patch).eq(col, val).select(cols).single()`. */
function makeUpdateEqSelectSingleMock(response: QueryResponse<unknown>) {
  const single = jest.fn<Promise<typeof response>, []>().mockResolvedValue(response);
  const select = jest.fn<{ single: typeof single }, [columns: string]>().mockReturnValue({ single });
  const eq = jest
    .fn<{ select: typeof select }, [column: string, value: string]>()
    .mockReturnValue({ select });
  const update = jest.fn<{ eq: typeof eq }, [patch: unknown]>().mockReturnValue({ eq });
  return { update, eq, select, single };
}

type FromReturn =
  | ReturnType<typeof makeQueryBuilderMock>
  | ReturnType<typeof makeSelectOrderMock>
  | ReturnType<typeof makeInsertSelectSingleMock>
  | ReturnType<typeof makeUpdateEqSelectSingleMock>;

type MockSupabase = {
  auth: { getUser: jest.Mock<Promise<MockGetUserResponse>, []> };
  from: jest.Mock<FromReturn, [table: string]>;
};

function makeMockSupabase(): MockSupabase {
  return {
    auth: { getUser: jest.fn<Promise<MockGetUserResponse>, []>() },
    from: jest.fn<FromReturn, [table: string]>(),
  };
}

let mockSupabase: MockSupabase;

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

import {
  listWishlistFeed,
  createWishlistItem,
  updateWishlistItem,
  completeWishlistItem,
  reopenWishlistItem,
} from "@/lib/wishlist-actions";

beforeEach(() => {
  mockSupabase = makeMockSupabase();
});

const visibleFeedRow = {
  id: "wl1",
  couple_id: "c1",
  created_by: "partner-1",
  category: "regalo" as const,
  target: "self" as const,
  priority: "media" as const,
  is_surprise: false,
  status: "attivo" as const,
  is_hidden_surprise: false,
  title: "Cuffie wireless",
  description: "Con cancellazione del rumore",
  price: 80,
  link: null,
  photo_url: null,
  completed_at: null,
  completed_by: null,
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
};

/** Riga come la restituirebbe wishlist_feed per una sorpresa attiva creata dal partner, vista da "me". */
const hiddenSurpriseFeedRow = {
  id: "wl2",
  couple_id: "c1",
  created_by: "partner-1",
  category: "regalo" as const,
  target: "partner" as const,
  priority: "alta" as const,
  is_surprise: true,
  status: "attivo" as const,
  is_hidden_surprise: true,
  // Il server ha già forzato questi 5 campi a null: NON è "dato mancante",
  // è mascheramento intenzionale (vedi commento in testa al file).
  title: null,
  description: null,
  price: null,
  link: null,
  photo_url: null,
  completed_at: null,
  completed_by: null,
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
};

describe("listWishlistFeed — mascheramento modalità sorpresa", () => {
  it("legge dalla view wishlist_feed (non dalla tabella base wishlist_items)", async () => {
    mockSupabase.from.mockReturnValue(makeSelectOrderMock({ data: [visibleFeedRow], error: null }));
    await listWishlistFeed();
    expect(mockSupabase.from).toHaveBeenCalledWith("wishlist_feed");
    expect(mockSupabase.from).not.toHaveBeenCalledWith("wishlist_items");
  });

  it("mappa una riga visibile (non sorpresa) con tutti i campi popolati", async () => {
    mockSupabase.from.mockReturnValue(makeSelectOrderMock({ data: [visibleFeedRow], error: null }));
    const result = await listWishlistFeed();

    expect(result).toEqual([
      {
        id: "wl1",
        coupleId: "c1",
        createdBy: "partner-1",
        category: "regalo",
        target: "self",
        priority: "media",
        isSurprise: false,
        status: "attivo",
        isHiddenSurprise: false,
        title: "Cuffie wireless",
        description: "Con cancellazione del rumore",
        price: 80,
        link: null,
        photoUrl: null,
        completedAt: null,
        completedBy: null,
        createdAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T10:00:00.000Z",
      },
    ]);
  });

  it("DESTINATARIO — una sorpresa attiva non tua arriva con isHiddenSurprise=true e i 5 campi sensibili null: il mapping li lascia null, non li nasconde/ricalcola lui stesso", async () => {
    mockSupabase.from.mockReturnValue(
      makeSelectOrderMock({ data: [hiddenSurpriseFeedRow], error: null }),
    );
    const result = await listWishlistFeed();

    expect(result).toEqual([
      expect.objectContaining({
        id: "wl2",
        isHiddenSurprise: true,
        title: null,
        description: null,
        price: null,
        link: null,
        photoUrl: null,
        // Campi NON sensibili restano visibili anche mascherata (sai che
        // "sta arrivando qualcosa", non cosa): coerente col commento della
        // migration ("category/priority/target/status restano visibili").
        category: "regalo",
        target: "partner",
        priority: "alta",
        isSurprise: true,
        status: "attivo",
      }),
    ]);
  });

  it("CREATORE — la propria sorpresa attiva arriva con isHiddenSurprise=false e i campi pieni (la view non maschera mai il creatore)", async () => {
    const ownSurpriseRow = { ...hiddenSurpriseFeedRow, created_by: "me", is_hidden_surprise: false, title: "Weekend a sorpresa", description: "Shh", price: 200 };
    mockSupabase.from.mockReturnValue(makeSelectOrderMock({ data: [ownSurpriseRow], error: null }));

    const result = await listWishlistFeed();
    expect(result).toEqual([
      expect.objectContaining({ isHiddenSurprise: false, title: "Weekend a sorpresa", description: "Shh", price: 200 }),
    ]);
  });

  it("DOPO IL COMPLETAMENTO — una sorpresa completata torna con isHiddenSurprise=false e campi pieni anche per il destinatario", async () => {
    const completedRow = {
      ...hiddenSurpriseFeedRow,
      status: "completato" as const,
      is_hidden_surprise: false, // il server smaschera solo dopo il completamento
      title: "Weekend a sorpresa",
      description: "Sorpresa rivelata",
      price: 200,
      completed_at: "2026-09-05T10:00:00.000Z",
      completed_by: "partner-1",
    };
    mockSupabase.from.mockReturnValue(makeSelectOrderMock({ data: [completedRow], error: null }));

    const result = await listWishlistFeed();
    expect(result).toEqual([
      expect.objectContaining({
        status: "completato",
        isHiddenSurprise: false,
        title: "Weekend a sorpresa",
        description: "Sorpresa rivelata",
        price: 200,
        completedAt: "2026-09-05T10:00:00.000Z",
        completedBy: "partner-1",
      }),
    ]);
  });

  it("ritorna array vuoto se data è null senza errore", async () => {
    mockSupabase.from.mockReturnValue(makeSelectOrderMock({ data: null, error: null }));
    const result = await listWishlistFeed();
    expect(result).toEqual([]);
  });

  it("propaga l'errore della query", async () => {
    mockSupabase.from.mockReturnValue(makeSelectOrderMock({ data: null, error: { message: "Errore di rete" } }));
    const result = await listWishlistFeed();
    expect(result).toEqual({ error: "Errore di rete" });
  });
});

describe("createWishlistItem", () => {
  it("ritorna errore senza chiamare Supabase se il titolo è vuoto/solo spazi", async () => {
    const result = await createWishlistItem({ category: "regalo", target: "self", title: "   " });
    expect(result).toEqual({ error: "Il titolo non può essere vuoto." });
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("VINCOLO SORPRESA — rifiuta isSurprise=true con target='self' senza chiamare Supabase (rispecchia il vincolo DB wishlist_items_surprise_requires_partner_target)", async () => {
    const result = await createWishlistItem({
      category: "regalo",
      target: "self",
      title: "Cuffie",
      isSurprise: true,
    });
    expect(result).toEqual({ error: "Un item 'solo per me' non può essere a sorpresa." });
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await createWishlistItem({ category: "regalo", target: "self", title: "Cuffie" });
    expect(result).toEqual({ error: "Utente non autenticato" });
  });

  it("ritorna errore se l'utente non è accoppiato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makeQueryBuilderMock({ couple_id: null }));

    const result = await createWishlistItem({ category: "regalo", target: "self", title: "Cuffie" });
    expect(result).toEqual({ error: "Non sei accoppiato/a con un partner." });
  });

  it("CREATORE — crea un item a sorpresa (target='partner') e ritorna sempre isHiddenSurprise=false: il creatore non maschera mai se stesso", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "wishlist_items") {
        return makeInsertSelectSingleMock({
          data: {
            id: "wl9",
            couple_id: "c1",
            created_by: "me",
            category: "regalo",
            target: "partner",
            priority: "media",
            is_surprise: true,
            status: "attivo",
            title: "Sorpresa per Sam",
            description: null,
            price: null,
            link: null,
            photo_url: null,
            completed_at: null,
            completed_by: null,
            created_at: "2026-09-01T10:00:00.000Z",
            updated_at: "2026-09-01T10:00:00.000Z",
          },
          error: null,
        });
      }
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await createWishlistItem({
      category: "regalo",
      target: "partner",
      title: "Sorpresa per Sam",
      isSurprise: true,
    });

    expect(result).toEqual(
      expect.objectContaining({ id: "wl9", title: "Sorpresa per Sam", isSurprise: true, isHiddenSurprise: false }),
    );
  });

  it("permette isSurprise=true con target='entrambi' (consentito dal vincolo DB, solo 'self' è bloccato)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "wishlist_items") {
        return makeInsertSelectSingleMock({
          data: {
            id: "wl10",
            couple_id: "c1",
            created_by: "me",
            category: "attivita",
            target: "entrambi",
            priority: "media",
            is_surprise: true,
            status: "attivo",
            title: "Weekend a sorpresa",
            description: null,
            price: null,
            link: null,
            photo_url: null,
            completed_at: null,
            completed_by: null,
            created_at: "2026-09-01T10:00:00.000Z",
            updated_at: "2026-09-01T10:00:00.000Z",
          },
          error: null,
        });
      }
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await createWishlistItem({
      category: "attivita",
      target: "entrambi",
      title: "Weekend a sorpresa",
      isSurprise: true,
    });

    expect(result).toEqual(expect.objectContaining({ target: "entrambi", isSurprise: true }));
  });

  it("propaga l'errore di insert (es. RLS)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ couple_id: "c1" });
      if (table === "wishlist_items") return makeInsertSelectSingleMock({ data: null, error: { message: "RLS violation" } });
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await createWishlistItem({ category: "regalo", target: "self", title: "Cuffie" });
    expect(result).toEqual({ error: "RLS violation" });
  });
});

const wishlistWriteRow = {
  id: "wl1",
  couple_id: "c1",
  created_by: "me",
  category: "regalo" as const,
  target: "self" as const,
  priority: "media" as const,
  is_surprise: false,
  status: "attivo" as const,
  title: "Cuffie wireless",
  description: null,
  price: null,
  link: null,
  photo_url: null,
  completed_at: null,
  completed_by: null,
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
};

describe("updateWishlistItem", () => {
  it("aggiorna solo i campi passati (trim su title) e ritorna isHiddenSurprise=false", async () => {
    const updateMock = makeUpdateEqSelectSingleMock({
      data: { ...wishlistWriteRow, title: "Cuffie nuove" },
      error: null,
    });
    mockSupabase.from.mockReturnValue(updateMock);

    const result = await updateWishlistItem("wl1", { title: "  Cuffie nuove  " });

    expect(updateMock.update).toHaveBeenCalledWith({ title: "Cuffie nuove" });
    expect(result).toEqual(expect.objectContaining({ title: "Cuffie nuove", isHiddenSurprise: false }));
  });

  it("propaga l'errore della query (es. il partner prova ad aggiornare una sorpresa attiva non sua, negato da RLS)", async () => {
    mockSupabase.from.mockReturnValue(
      makeUpdateEqSelectSingleMock({ data: null, error: { message: "new row violates row-level security policy" } }),
    );
    const result = await updateWishlistItem("wl2", { title: "X" });
    expect(result).toEqual({ error: "new row violates row-level security policy" });
  });
});

describe("completeWishlistItem", () => {
  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await completeWishlistItem("wl1");
    expect(result).toEqual({ error: "Utente non autenticato" });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("segna come completato con completed_by/completed_at e ritorna isHiddenSurprise=false — è così che l'archivio rivela le sorprese passate", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const updateMock = makeUpdateEqSelectSingleMock({
      data: { ...wishlistWriteRow, status: "completato", completed_by: "me", completed_at: "2026-09-01T12:00:00.000Z" },
      error: null,
    });
    mockSupabase.from.mockReturnValue(updateMock);

    const result = await completeWishlistItem("wl1");

    expect(updateMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completato", completed_by: "me" }),
    );
    expect(result).toEqual(
      expect.objectContaining({ status: "completato", completedBy: "me", isHiddenSurprise: false }),
    );
  });

  it("propaga l'errore della query", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(
      makeUpdateEqSelectSingleMock({ data: null, error: { message: "Non trovato" } }),
    );
    const result = await completeWishlistItem("wl1");
    expect(result).toEqual({ error: "Non trovato" });
  });
});

describe("reopenWishlistItem", () => {
  it("azzera status/completed_at/completed_by", async () => {
    const updateMock = makeUpdateEqSelectSingleMock({
      data: { ...wishlistWriteRow, status: "attivo", completed_at: null, completed_by: null },
      error: null,
    });
    mockSupabase.from.mockReturnValue(updateMock);

    const result = await reopenWishlistItem("wl1");

    expect(updateMock.update).toHaveBeenCalledWith({ status: "attivo", completed_at: null, completed_by: null });
    expect(result).toEqual(expect.objectContaining({ status: "attivo", completedAt: null, completedBy: null }));
  });

  it("propaga l'errore della query", async () => {
    mockSupabase.from.mockReturnValue(
      makeUpdateEqSelectSingleMock({ data: null, error: { message: "Non autorizzato" } }),
    );
    const result = await reopenWishlistItem("wl1");
    expect(result).toEqual({ error: "Non autorizzato" });
  });
});

describe("nessuna funzione di delete esposta", () => {
  it("il modulo non esporta deleteWishlistItem (per design: nessuna policy/grant DELETE su wishlist_items, 'MAI delete secco')", async () => {
    const wishlistActions = await import("@/lib/wishlist-actions");
    expect((wishlistActions as Record<string, unknown>).deleteWishlistItem).toBeUndefined();
  });
});
