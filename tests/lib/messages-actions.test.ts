/**
 * Unit test per lib/messages-actions.ts (listRecentThoughts, sendThought,
 * toggleThoughtReaction) — la card "Pensiero del giorno"/FAB di Home.
 *
 * Il client Supabase reale (@/lib/supabase/client) viene mockato: qui NON
 * verifichiamo che la tabella `messages`/la RPC `toggle_message_reaction`
 * funzionino davvero (scritte e revisionate ma non ancora collaudate su un
 * Postgres reale, vedi HANDOFF.md), ma che messages-actions.ts orchestri
 * correttamente le chiamate e mappi risposta/errore nella forma attesa dal
 * frontend (Thought[] | ActionError).
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest`
 * globale ambient (non `import { jest } from "@jest/globals"`) — stesso
 * bug di hoisting, stesso fix.
 */

import { makeQueryBuilderMock } from "../helpers/supabase-query-mock";

type MockGetUserResponse = { data: { user: { id: string } | null } };

/** Mock della catena `.from("messages").select(...).order(...).limit(n)`. */
function makeSelectOrderLimitMock(response: { data: unknown[] | null; error: { message: string } | null }) {
  const limit = jest.fn<Promise<typeof response>, [number]>().mockResolvedValue(response);
  const order = jest
    .fn<{ limit: typeof limit }, [column: string, opts?: unknown]>()
    .mockReturnValue({ limit });
  const select = jest.fn<{ order: typeof order }, [columns: string]>().mockReturnValue({ order });
  return { select, order, limit };
}

/**
 * Mock della catena usata da listPhotoMemories:
 * `.from("messages").select(...).eq("type","photo")[.lt("created_at", before)].order(...).limit(n)`.
 * `.eq()` ritorna un builder che espone sia `.lt` (pagina successiva, con
 * cursore) sia `.order` direttamente (prima pagina, nessun cursore) — così
 * lo stesso mock copre entrambi i rami senza duplicazione.
 */
function makePhotoQueryMock(response: { data: unknown[] | null; error: { message: string } | null }) {
  const limit = jest.fn<Promise<typeof response>, [number]>().mockResolvedValue(response);
  const order = jest
    .fn<{ limit: typeof limit }, [column: string, opts?: unknown]>()
    .mockReturnValue({ limit });
  const lt = jest.fn<{ order: typeof order }, [column: string, value: string]>().mockReturnValue({ order });
  const eq = jest
    .fn<{ lt: typeof lt; order: typeof order }, [column: string, value: string]>()
    .mockReturnValue({ lt, order });
  const select = jest.fn<{ eq: typeof eq }, [columns: string]>().mockReturnValue({ eq });
  return { select, eq, lt, order, limit };
}

/** Mock della catena `.from("messages").insert(row).select(...).single()`. */
function makeInsertSelectSingleMock(response: { data: unknown; error: { message: string } | null }) {
  const single = jest.fn<Promise<typeof response>, []>().mockResolvedValue(response);
  const select = jest.fn<{ single: typeof single }, [columns: string]>().mockReturnValue({ single });
  const insert = jest.fn<{ select: typeof select }, [row: unknown]>().mockReturnValue({ select });
  return { insert, select, single };
}

type FromReturn =
  | ReturnType<typeof makeQueryBuilderMock>
  | ReturnType<typeof makeSelectOrderLimitMock>
  | ReturnType<typeof makePhotoQueryMock>
  | ReturnType<typeof makeInsertSelectSingleMock>
  | ReturnType<typeof makeThrowbackMessagesMock>
  | ReturnType<typeof makeThrowbackGiftsMock>;

type SignedUrlResponse = { data: { signedUrl: string } | null; error: { message: string } | null };
type UploadResponse = { data: { path: string } | null; error: { message: string } | null };
type RemoveResponse = { data: unknown; error: { message: string } | null };

/** Mock di `.storage.from(bucket)` — createSignedUrl/upload/remove usati da sendPhotoThought/listRecentThoughts. */
type StorageBucketMock = {
  createSignedUrl: jest.Mock<Promise<SignedUrlResponse>, [path: string, expiresIn: number]>;
  upload: jest.Mock<Promise<UploadResponse>, [path: string, file: unknown, opts?: unknown]>;
  remove: jest.Mock<Promise<RemoveResponse>, [paths: string[]]>;
};

function makeStorageBucketMock(): StorageBucketMock {
  return {
    // Default "felice": ogni path risolve a una signed URL derivata dal path stesso.
    createSignedUrl: jest
      .fn<Promise<SignedUrlResponse>, [string, number]>()
      .mockImplementation((path) => Promise.resolve({ data: { signedUrl: `https://signed.example/${path}` }, error: null })),
    upload: jest.fn<Promise<UploadResponse>, [string, unknown, unknown?]>().mockResolvedValue({ data: { path: "" }, error: null }),
    remove: jest.fn<Promise<RemoveResponse>, [string[]]>().mockResolvedValue({ data: null, error: null }),
  };
}

type MockSupabase = {
  auth: {
    getUser: jest.Mock<Promise<MockGetUserResponse>, []>;
  };
  from: jest.Mock<FromReturn, [table: string]>;
  rpc: jest.Mock<Promise<{ data: unknown; error: { message: string } | null }>, [fn: string, args?: unknown]>;
  storage: {
    from: jest.Mock<StorageBucketMock, [bucket: string]>;
  };
};

function makeMockSupabase(): MockSupabase {
  const bucket = makeStorageBucketMock();
  return {
    auth: {
      getUser: jest.fn<Promise<MockGetUserResponse>, []>(),
    },
    from: jest.fn<FromReturn, [table: string]>(),
    rpc: jest.fn<Promise<{ data: unknown; error: { message: string } | null }>, [fn: string, args?: unknown]>(),
    storage: {
      from: jest.fn<StorageBucketMock, [bucket: string]>().mockReturnValue(bucket),
    },
  };
}

let mockSupabase: MockSupabase;

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

import {
  listRecentThoughts,
  listPhotoMemories,
  sendThought,
  sendPhotoThought,
  toggleThoughtReaction,
  getThrowbackForToday,
} from "@/lib/messages-actions";

/** Mock della catena `.from("messages").select(...).gte(...).lt(...).order(...)` usata da getThrowbackForToday. */
function makeThrowbackMessagesMock(response: { data: unknown[] | null; error: { message: string } | null }) {
  const order = jest.fn<Promise<typeof response>, [string, unknown?]>().mockResolvedValue(response);
  const lt = jest.fn<{ order: typeof order }, [string, string]>().mockReturnValue({ order });
  const gte = jest.fn<{ lt: typeof lt }, [string, string]>().mockReturnValue({ lt });
  const select = jest.fn<{ gte: typeof gte }, [string]>().mockReturnValue({ gte });
  return { select, gte, lt, order };
}

/** Mock della catena `.from("wishlist_feed").select(...).eq(...).gte(...).lt(...)` usata da getThrowbackForToday. */
function makeThrowbackGiftsMock(response: { data: unknown[] | null; error: { message: string } | null }) {
  const lt = jest.fn<Promise<typeof response>, [string, string]>().mockResolvedValue(response);
  const gte = jest.fn<{ lt: typeof lt }, [string, string]>().mockReturnValue({ lt });
  const eq = jest.fn<{ gte: typeof gte }, [string, string]>().mockReturnValue({ gte });
  const select = jest.fn<{ eq: typeof eq }, [string]>().mockReturnValue({ eq });
  return { select, eq, gte, lt };
}

beforeEach(() => {
  mockSupabase = makeMockSupabase();
});

describe("listRecentThoughts", () => {
  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await listRecentThoughts();
    expect(result).toEqual({ error: "Utente non autenticato" });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("mappa le righe, risolve senderName da profiles e likedByMe da liked_by", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(
      makeSelectOrderLimitMock({
        data: [
          {
            id: "m1",
            sender_id: "partner-1",
            type: "text",
            content: "Ciao amore",
            photo_url: null,
            liked_by: ["me"],
            created_at: "2026-08-30T08:00:00.000Z",
            profiles: { display_name: "Sam" },
          },
          {
            id: "m2",
            sender_id: "me",
            type: "text",
            content: "Buongiorno",
            photo_url: null,
            liked_by: [],
            created_at: "2026-08-29T08:00:00.000Z",
            profiles: null,
          },
        ],
        error: null,
      }),
    );

    const result = await listRecentThoughts();

    expect(mockSupabase.from).toHaveBeenCalledWith("messages");
    expect(result).toEqual([
      {
        id: "m1",
        senderId: "partner-1",
        senderName: "Sam",
        type: "text",
        content: "Ciao amore",
        photoUrl: null,
        createdAt: "2026-08-30T08:00:00.000Z",
        likedByMe: true,
      },
      {
        id: "m2",
        senderId: "me",
        senderName: "Partner", // profiles null -> fallback
        type: "text",
        content: "Buongiorno",
        photoUrl: null,
        createdAt: "2026-08-29T08:00:00.000Z",
        likedByMe: false, // "me" non è in liked_by (vuoto)
      },
    ]);
  });

  it("propaga l'errore della query", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(
      makeSelectOrderLimitMock({ data: null, error: { message: "Errore di rete" } }),
    );

    const result = await listRecentThoughts();
    expect(result).toEqual({ error: "Errore di rete" });
  });

  it("ritorna array vuoto se data è null senza errore", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makeSelectOrderLimitMock({ data: null, error: null }));

    const result = await listRecentThoughts();
    expect(result).toEqual([]);
  });

  it("risolve photo_url (path nel bucket) in signed URL per le righe type='photo'", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(
      makeSelectOrderLimitMock({
        data: [
          {
            id: "m1",
            sender_id: "partner-1",
            type: "photo",
            content: "📷",
            photo_url: "couple-1/abc.jpg",
            liked_by: [],
            created_at: "2026-08-30T08:00:00.000Z",
            profiles: { display_name: "Sam" },
          },
          {
            id: "m2",
            sender_id: "me",
            type: "text",
            content: "Buongiorno",
            photo_url: null,
            liked_by: [],
            created_at: "2026-08-29T08:00:00.000Z",
            profiles: null,
          },
        ],
        error: null,
      }),
    );

    const result = await listRecentThoughts();

    expect(mockSupabase.storage.from).toHaveBeenCalledWith("couple-photos");
    const bucket = mockSupabase.storage.from.mock.results[0].value as StorageBucketMock;
    expect(bucket.createSignedUrl).toHaveBeenCalledWith("couple-1/abc.jpg", 3600);
    expect(result).toEqual([
      expect.objectContaining({ id: "m1", type: "photo", photoUrl: "https://signed.example/couple-1/abc.jpg" }),
      expect.objectContaining({ id: "m2", type: "text", photoUrl: null }),
    ]);
  });

  it("degrada a photoUrl: null se createSignedUrl fallisce, senza far fallire l'intera lista", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(
      makeSelectOrderLimitMock({
        data: [
          {
            id: "m1",
            sender_id: "partner-1",
            type: "photo",
            content: "📷",
            photo_url: "couple-1/missing.jpg",
            liked_by: [],
            created_at: "2026-08-30T08:00:00.000Z",
            profiles: null,
          },
        ],
        error: null,
      }),
    );
    const bucket = mockSupabase.storage.from("couple-photos") as StorageBucketMock;
    bucket.createSignedUrl.mockResolvedValue({ data: null, error: { message: "Object not found" } });

    const result = await listRecentThoughts();
    expect(result).toEqual([expect.objectContaining({ id: "m1", photoUrl: null })]);
  });
});

describe("listPhotoMemories", () => {
  function photoRow(id: string, createdAt: string, photoUrl: string | null = `c1/${id}.jpg`) {
    return {
      id,
      sender_id: "partner-1",
      type: "photo",
      content: "📷",
      photo_url: photoUrl,
      liked_by: [],
      created_at: createdAt,
      profiles: { display_name: "Sam" },
    };
  }

  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await listPhotoMemories();
    expect(result).toEqual({ error: "Utente non autenticato" });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("filtra per type='photo', mappa le righe e risolve le signed URL", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const rows = [photoRow("p2", "2026-08-30T08:00:00.000Z"), photoRow("p1", "2026-08-29T08:00:00.000Z")];
    const mock = makePhotoQueryMock({ data: rows, error: null });
    mockSupabase.from.mockReturnValue(mock);

    const result = await listPhotoMemories(undefined, 24);

    expect(mockSupabase.from).toHaveBeenCalledWith("messages");
    expect(mock.eq).toHaveBeenCalledWith("type", "photo");
    expect(mock.lt).not.toHaveBeenCalled();
    expect(mock.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(mock.limit).toHaveBeenCalledWith(24);
    expect(result).toEqual({
      items: [
        expect.objectContaining({ id: "p2", type: "photo", photoUrl: "https://signed.example/c1/p2.jpg" }),
        expect.objectContaining({ id: "p1", type: "photo", photoUrl: "https://signed.example/c1/p1.jpg" }),
      ],
      // meno righe del limite richiesto -> nessuna pagina successiva
      nextCursor: null,
    });
  });

  it("passa `before` come filtro .lt(created_at) per la pagina successiva", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const mock = makePhotoQueryMock({ data: [photoRow("p1", "2026-08-20T08:00:00.000Z")], error: null });
    mockSupabase.from.mockReturnValue(mock);

    await listPhotoMemories("2026-08-29T08:00:00.000Z", 24);

    expect(mock.lt).toHaveBeenCalledWith("created_at", "2026-08-29T08:00:00.000Z");
  });

  it("ritorna nextCursor = created_at dell'ultima riga quando la pagina è piena (probabile altra pagina)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    const rows = [photoRow("p1", "2026-08-30T08:00:00.000Z"), photoRow("p2", "2026-08-29T08:00:00.000Z")];
    mockSupabase.from.mockReturnValue(makePhotoQueryMock({ data: rows, error: null }));

    const result = await listPhotoMemories(undefined, 2);

    expect(result).toEqual(
      expect.objectContaining({ nextCursor: "2026-08-29T08:00:00.000Z" }),
    );
  });

  it("propaga l'errore della query", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makePhotoQueryMock({ data: null, error: { message: "Errore di rete" } }));

    const result = await listPhotoMemories();
    expect(result).toEqual({ error: "Errore di rete" });
  });

  it("ritorna items vuoti e nextCursor null se data è null senza errore", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makePhotoQueryMock({ data: null, error: null }));

    const result = await listPhotoMemories();
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it("degrada a photoUrl: null se createSignedUrl fallisce, senza far fallire la pagina", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(
      makePhotoQueryMock({ data: [photoRow("p1", "2026-08-30T08:00:00.000Z", "c1/missing.jpg")], error: null }),
    );
    const bucket = mockSupabase.storage.from("couple-photos") as StorageBucketMock;
    bucket.createSignedUrl.mockResolvedValue({ data: null, error: { message: "Object not found" } });

    const result = await listPhotoMemories();
    expect(result).toEqual({ items: [expect.objectContaining({ id: "p1", photoUrl: null })], nextCursor: null });
  });
});

describe("sendThought", () => {
  it("ritorna errore senza chiamare Supabase se il contenuto è vuoto/solo spazi", async () => {
    const result = await sendThought("   ");
    expect(result).toEqual({ error: "Il messaggio non può essere vuoto." });
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await sendThought("Ciao");
    expect(result).toEqual({ error: "Utente non autenticato" });
  });

  it("ritorna errore se l'utente non è accoppiato (couple_id null)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(
      makeQueryBuilderMock({ display_name: "Anna", couple_id: null }),
    );

    const result = await sendThought("Ciao");
    expect(result).toEqual({ error: "Non sei accoppiato/a con un partner." });
  });

  it("inserisce il messaggio e ritorna il Thought risultante", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return makeQueryBuilderMock({ display_name: "Anna", couple_id: "c1" });
      }
      if (table === "messages") {
        return makeInsertSelectSingleMock({
          data: {
            id: "m9",
            sender_id: "me",
            type: "text",
            content: "Ti penso",
            photo_url: null,
            created_at: "2026-08-31T10:00:00.000Z",
          },
          error: null,
        });
      }
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await sendThought("  Ti penso  ");

    expect(result).toEqual({
      id: "m9",
      senderId: "me",
      senderName: "Anna",
      type: "text",
      content: "Ti penso",
      photoUrl: null,
      createdAt: "2026-08-31T10:00:00.000Z",
      likedByMe: false,
    });
  });

  it("propaga l'errore di insert", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ display_name: "Anna", couple_id: "c1" });
      if (table === "messages") {
        return makeInsertSelectSingleMock({ data: null, error: { message: "RLS violation" } });
      }
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await sendThought("Ciao");
    expect(result).toEqual({ error: "RLS violation" });
  });
});

describe("sendPhotoThought", () => {
  function makePhotoFile(name = "sunset.jpg", type = "image/jpeg") {
    return new File(["fake-bytes"], name, { type });
  }

  it("ritorna errore se l'utente non è autenticato, senza toccare lo storage", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await sendPhotoThought(makePhotoFile());
    expect(result).toEqual({ error: "Utente non autenticato" });
    expect(mockSupabase.storage.from).not.toHaveBeenCalled();
  });

  it("ritorna errore se l'utente non è accoppiato (couple_id null)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockReturnValue(makeQueryBuilderMock({ display_name: "Anna", couple_id: null }));

    const result = await sendPhotoThought(makePhotoFile());
    expect(result).toEqual({ error: "Non sei accoppiato/a con un partner." });
    expect(mockSupabase.storage.from).not.toHaveBeenCalled();
  });

  it("carica su couple-photos con path {couple_id}/{uuid}.{ext} e inserisce la riga messages", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ display_name: "Anna", couple_id: "c1" });
      if (table === "messages") {
        return makeInsertSelectSingleMock({
          data: {
            id: "m9",
            sender_id: "me",
            type: "photo",
            content: "📷",
            photo_url: "c1/some-uuid.jpg",
            created_at: "2026-08-31T10:00:00.000Z",
          },
          error: null,
        });
      }
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await sendPhotoThought(makePhotoFile("sunset.jpg", "image/jpeg"));

    expect(mockSupabase.storage.from).toHaveBeenCalledWith("couple-photos");
    const bucket = mockSupabase.storage.from.mock.results[0].value as StorageBucketMock;
    expect(bucket.upload).toHaveBeenCalledTimes(1);
    const [uploadPath, , uploadOpts] = bucket.upload.mock.calls[0];
    // Path generato da sendPhotoThought stesso (crypto.randomUUID()), non
    // quello ritornato dall'insert mockato — la signed URL viene creata sul
    // path appena caricato, non su un valore riletto dal DB.
    expect(uploadPath).toMatch(/^c1\/[0-9a-f-]+\.jpg$/);
    expect(uploadOpts).toMatchObject({ contentType: "image/jpeg", upsert: false });

    expect(mockSupabase.from).toHaveBeenCalledWith("messages");
    expect(bucket.createSignedUrl).toHaveBeenCalledWith(uploadPath, 3600);
    expect(result).toEqual({
      id: "m9",
      senderId: "me",
      senderName: "Anna",
      type: "photo",
      content: "📷",
      photoUrl: `https://signed.example/${uploadPath}`,
      createdAt: "2026-08-31T10:00:00.000Z",
      likedByMe: false,
    });
  });

  it("usa la caption fornita come content quando non è vuota", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ display_name: "Anna", couple_id: "c1" });
      return makeInsertSelectSingleMock({
        data: {
          id: "m9",
          sender_id: "me",
          type: "photo",
          content: "Guarda qui",
          photo_url: "c1/x.jpg",
          created_at: "2026-08-31T10:00:00.000Z",
        },
        error: null,
      });
    });

    await sendPhotoThought(makePhotoFile(), "  Guarda qui  ");

    const insertCall = mockSupabase.from.mock.results.find((r) => "insert" in r.value)
      ?.value as ReturnType<typeof makeInsertSelectSingleMock>;
    expect(insertCall.insert).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Guarda qui", type: "photo" }),
    );
  });

  it("propaga l'errore di upload senza chiamare insert su messages", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ display_name: "Anna", couple_id: "c1" });
      throw new Error(`tabella inattesa nel test: ${table}`);
    });
    const bucket = mockSupabase.storage.from("couple-photos") as StorageBucketMock;
    bucket.upload.mockResolvedValue({ data: null, error: { message: "Storage RLS violation" } });

    const result = await sendPhotoThought(makePhotoFile());
    expect(result).toEqual({ error: "Storage RLS violation" });
    expect(mockSupabase.from).not.toHaveBeenCalledWith("messages");
  });

  it("rimuove il file caricato (rollback best-effort) se l'insert su messages fallisce", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "profiles") return makeQueryBuilderMock({ display_name: "Anna", couple_id: "c1" });
      if (table === "messages") {
        return makeInsertSelectSingleMock({ data: null, error: { message: "RLS violation" } });
      }
      throw new Error(`tabella inattesa nel test: ${table}`);
    });
    const bucket = mockSupabase.storage.from("couple-photos") as StorageBucketMock;

    const result = await sendPhotoThought(makePhotoFile());

    expect(result).toEqual({ error: "RLS violation" });
    expect(bucket.remove).toHaveBeenCalledTimes(1);
    expect(bucket.remove.mock.calls[0][0]).toHaveLength(1);
    expect(bucket.remove.mock.calls[0][0][0]).toMatch(/^c1\/[0-9a-f-]+\.jpg$/);
  });
});

describe("getThrowbackForToday", () => {
  it("ritorna errore se l'utente non è autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await getThrowbackForToday();
    expect(result).toEqual({ error: "Utente non autenticato" });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("mappa pensieri e regali di un anno fa, filtrando i regali sorpresa non ancora rivelabili", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "messages") {
        return makeThrowbackMessagesMock({
          data: [
            {
              id: "m1",
              sender_id: "partner-1",
              type: "text",
              content: "Un anno fa qui",
              photo_url: null,
              liked_by: [],
              created_at: "2025-08-30T08:00:00.000Z",
              profiles: { display_name: "Sam" },
            },
          ],
          error: null,
        });
      }
      if (table === "wishlist_feed") {
        return makeThrowbackGiftsMock({
          data: [
            { title: "Un anello", is_hidden_surprise: false },
            { title: "Sorpresa nascosta", is_hidden_surprise: true },
          ],
          error: null,
        });
      }
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await getThrowbackForToday();

    expect(mockSupabase.from).toHaveBeenCalledWith("messages");
    expect(mockSupabase.from).toHaveBeenCalledWith("wishlist_feed");
    expect(result).toEqual({
      thoughts: [
        expect.objectContaining({ id: "m1", content: "Un anno fa qui", senderName: "Sam" }),
      ],
      giftTitles: ["Un anello"],
    });
  });

  it("ritorna liste vuote se non c'è nulla quel giorno, senza errore", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "messages") return makeThrowbackMessagesMock({ data: [], error: null });
      if (table === "wishlist_feed") return makeThrowbackGiftsMock({ data: [], error: null });
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await getThrowbackForToday();
    expect(result).toEqual({ thoughts: [], giftTitles: [] });
  });

  it("propaga l'errore della query messages", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "messages") return makeThrowbackMessagesMock({ data: null, error: { message: "Errore messages" } });
      if (table === "wishlist_feed") return makeThrowbackGiftsMock({ data: [], error: null });
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await getThrowbackForToday();
    expect(result).toEqual({ error: "Errore messages" });
  });

  it("propaga l'errore della query wishlist_feed", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "messages") return makeThrowbackMessagesMock({ data: [], error: null });
      if (table === "wishlist_feed") return makeThrowbackGiftsMock({ data: null, error: { message: "Errore wishlist" } });
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await getThrowbackForToday();
    expect(result).toEqual({ error: "Errore wishlist" });
  });
});

describe("toggleThoughtReaction", () => {
  it("ritorna il nuovo stato booleano dalla RPC", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
    const result = await toggleThoughtReaction("m1");
    expect(result).toBe(true);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("toggle_message_reaction", { message_id: "m1" });
  });

  it("ritorna false se la RPC non ha errore ma data è null/undefined", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
    const result = await toggleThoughtReaction("m1");
    expect(result).toBe(false);
  });

  it("propaga l'errore della RPC", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: "Non autorizzato" } });
    const result = await toggleThoughtReaction("m1");
    expect(result).toEqual({ error: "Non autorizzato" });
  });
});
