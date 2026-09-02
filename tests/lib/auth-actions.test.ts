/**
 * Unit test per lib/auth-actions.ts.
 *
 * Il client Supabase reale (@/lib/supabase/client) viene mockato: qui NON
 * verifichiamo che Supabase funzioni (serve un'istanza reale/Docker per
 * quello, vedi tests/integration/rls-pairing.integration.test.ts), ma che
 * auth-actions.ts orchestri correttamente le chiamate al client e mappi
 * risposta/errore nella forma attesa dal frontend (AuthResult | AuthError).
 *
 * Nota su `jest` globale (non importato da `@jest/globals`): con il
 * transform SWC di `next/jest`, `jest.mock(...)` viene hoistato sopra gli
 * `import` sottostanti solo quando `jest` è il global ambient fornito da
 * `@types/jest`/jest-environment — non quando è un binding locale importato
 * da `@jest/globals`. Verificato empiricamente: con `import { jest } from
 * "@jest/globals"` il modulo reale (@/lib/supabase/client, che richiede le
 * env var Supabase) veniva comunque caricato prima del mock, e tutti i test
 * fallivano a runtime nonostante il typecheck passasse. Usare il global
 * ambient (stesso pattern già in tests/setup.smoke.test.tsx) risolve anche
 * questo, non solo il typecheck.
 */

import { makeQueryBuilderMock } from "../helpers/supabase-query-mock";

/**
 * Tipi di supporto per i mock Jest del client Supabase.
 *
 * Bug noto: `jest.fn()` senza generico produce una `Mock<T=any, Y=any>`
 * dove il tipo del valore ritornato/risolto non è vincolato alla forma
 * reale della funzione mockata, quindi TypeScript non riesce a validare
 * (o, con i typing moderni di `@jest/globals`, collassa a `never`) gli
 * argomenti di `mockResolvedValue`/`mockRejectedValue` — da cui l'errore
 * "Argument of type '...' is not assignable to parameter of type 'never'".
 * La fix è dare a ogni `jest.fn<ReturnType, ArgsTuple>()` la firma reale
 * della funzione che sta mockando (stile `@types/jest`: primo generico è il
 * tipo di ritorno, secondo la tupla degli argomenti).
 */

type MockAuthUser = {
  id: string;
  email?: string;
  user_metadata?: { display_name: string };
};

type MockAuthResponse = {
  data: { user: MockAuthUser | null };
  error: { message: string } | null;
};

type MockGetUserResponse = {
  data: { user: MockAuthUser | null };
};

type MockSignOutResponse = {
  error: { message: string } | null;
};

type MockRpcResponse = {
  data: unknown;
  error: { message: string } | null;
};

type MockSupabase = {
  auth: {
    signUp: jest.Mock<Promise<MockAuthResponse>, [params: unknown]>;
    signInWithPassword: jest.Mock<Promise<MockAuthResponse>, [params: unknown]>;
    signOut: jest.Mock<Promise<MockSignOutResponse>, []>;
    getUser: jest.Mock<Promise<MockGetUserResponse>, []>;
  };
  from: jest.Mock<ReturnType<typeof makeQueryBuilderMock>, [table: string]>;
  rpc: jest.Mock<Promise<MockRpcResponse>, [fn: string, args?: unknown]>;
};

function makeMockSupabase(): MockSupabase {
  return {
    auth: {
      signUp: jest.fn<Promise<MockAuthResponse>, [params: unknown]>(),
      signInWithPassword: jest.fn<Promise<MockAuthResponse>, [params: unknown]>(),
      signOut: jest.fn<Promise<MockSignOutResponse>, []>(),
      getUser: jest.fn<Promise<MockGetUserResponse>, []>(),
    },
    from: jest.fn<ReturnType<typeof makeQueryBuilderMock>, [table: string]>(),
    rpc: jest.fn<Promise<MockRpcResponse>, [fn: string, args?: unknown]>(),
  };
}

let mockSupabase: MockSupabase;

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

// Import dinamico DOPO il mock (jest.mock viene hoisted, ma manteniamo
// l'import in cima al modulo tramite require per chiarezza).
import {
  signUp,
  signIn,
  signOut,
  getSession,
  createPairingInvite,
  acceptPairingInvite,
} from "@/lib/auth-actions";

beforeEach(() => {
  mockSupabase = makeMockSupabase();
});

describe("signUp", () => {
  it("ritorna AuthResult con i dati utente quando Supabase ha successo", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.com" } },
      error: null,
    });

    const result = await signUp({
      email: "a@b.com",
      password: "secret123",
      displayName: "Anna",
    });

    expect(result).toEqual({
      userId: "u1",
      email: "a@b.com",
      displayName: "Anna",
    });
    expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "secret123",
      options: { data: { display_name: "Anna" } },
    });
  });

  it("propaga il messaggio di errore di Supabase come AuthError", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: null },
      error: { message: "Email già registrata" },
    });

    const result = await signUp({
      email: "a@b.com",
      password: "secret123",
      displayName: "Anna",
    });

    expect(result).toEqual({ error: "Email già registrata" });
  });
});

describe("signIn", () => {
  it("ritorna AuthResult con displayName preso da user_metadata", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: "u1",
          email: "a@b.com",
          user_metadata: { display_name: "Anna" },
        },
      },
      error: null,
    });

    const result = await signIn({ email: "a@b.com", password: "secret123" });

    expect(result).toEqual({
      userId: "u1",
      email: "a@b.com",
      displayName: "Anna",
    });
  });

  it("ritorna AuthError su credenziali errate", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Credenziali non valide" },
    });

    const result = await signIn({ email: "a@b.com", password: "wrong" });

    expect(result).toEqual({ error: "Credenziali non valide" });
  });
});

describe("signOut", () => {
  it("chiama supabase.auth.signOut()", async () => {
    mockSupabase.auth.signOut.mockResolvedValue({ error: null });
    await signOut();
    expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(1);
  });
});

describe("getSession", () => {
  it("ritorna null se non c'è utente autenticato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const session = await getSession();
    expect(session).toBeNull();
  });

  it("ritorna userId/email/displayName/coupleId quando l'utente è loggato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.com" } },
    });
    mockSupabase.from.mockReturnValue(
      makeQueryBuilderMock({ display_name: "Anna", couple_id: "c1" }),
    );

    const session = await getSession();

    expect(mockSupabase.from).toHaveBeenCalledWith("profiles");
    expect(session).toEqual({
      userId: "u1",
      email: "a@b.com",
      displayName: "Anna",
      coupleId: "c1",
    });
  });

  it("ritorna coupleId null quando l'utente non è ancora accoppiato", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.com" } },
    });
    mockSupabase.from.mockReturnValue(
      makeQueryBuilderMock({ display_name: "Anna", couple_id: null }),
    );

    const session = await getSession();
    expect(session?.coupleId).toBeNull();
  });
});

describe("createPairingInvite", () => {
  it("ritorna il codice generato dalla RPC", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: "7K4QXPMN", error: null });
    const result = await createPairingInvite();
    expect(result).toEqual({ code: "7K4QXPMN" });
    expect(mockSupabase.rpc).toHaveBeenCalledWith("create_pairing_invite");
  });

  it("propaga l'errore RPC (es. utente già accoppiato)", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: "Sei già accoppiato/a con un partner" },
    });
    const result = await createPairingInvite();
    expect(result).toEqual({ error: "Sei già accoppiato/a con un partner" });
  });
});

describe("acceptPairingInvite", () => {
  it("ritorna coupleId e partnerName risolto quando la RPC ha successo", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: "couple-1", error: null });
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "me" } } });

    const coupleQuery = makeQueryBuilderMock({
      partner_1_id: "partner-1",
      partner_2_id: "me",
    });
    const profileQuery = makeQueryBuilderMock({ display_name: "Marco" });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "couples") return coupleQuery;
      if (table === "profiles") return profileQuery;
      throw new Error(`tabella inattesa nel test: ${table}`);
    });

    const result = await acceptPairingInvite(" ABC12345 ");

    // Il codice va trimmato prima di chiamare la RPC.
    expect(mockSupabase.rpc).toHaveBeenCalledWith("accept_pairing_invite", {
      invite_code: "ABC12345",
    });
    expect(result).toEqual({ coupleId: "couple-1", partnerName: "Marco" });
  });

  it("ritorna AuthError su codice non valido/scaduto", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: "Codice invito non valido" },
    });
    const result = await acceptPairingInvite("BADCODE1");
    expect(result).toEqual({ error: "Codice invito non valido" });
  });

  it("non fallisce l'intera chiamata se la risoluzione del nome partner va in errore", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: "couple-1", error: null });
    mockSupabase.auth.getUser.mockRejectedValue(new Error("network error"));

    const result = await acceptPairingInvite("ABC12345");

    expect(result).toEqual({ coupleId: "couple-1", partnerName: "il tuo partner" });
  });
});
