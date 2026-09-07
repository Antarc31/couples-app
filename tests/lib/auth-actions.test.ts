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
  data: { user: MockAuthUser | null; session?: Record<string, unknown> | null };
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

type MockAuthErrorResponse = { error: { message: string } | null };

type MockSupabase = {
  auth: {
    signUp: jest.Mock<Promise<MockAuthResponse>, [params: unknown]>;
    signInWithPassword: jest.Mock<Promise<MockAuthResponse>, [params: unknown]>;
    signOut: jest.Mock<Promise<MockSignOutResponse>, []>;
    getUser: jest.Mock<Promise<MockGetUserResponse>, []>;
    resetPasswordForEmail: jest.Mock<Promise<MockAuthErrorResponse>, [email: string, options?: unknown]>;
    updateUser: jest.Mock<Promise<MockAuthErrorResponse>, [attrs: unknown, options?: unknown]>;
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
      resetPasswordForEmail: jest.fn<Promise<MockAuthErrorResponse>, [email: string, options?: unknown]>(),
      updateUser: jest.fn<Promise<MockAuthErrorResponse>, [attrs: unknown, options?: unknown]>(),
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
  deleteOwnAccount,
  leaveCouple,
  requestPasswordReset,
  updatePassword,
  updateEmail,
} from "@/lib/auth-actions";

beforeEach(() => {
  mockSupabase = makeMockSupabase();
});

describe("signUp", () => {
  it("needsEmailConfirmation=true quando Supabase non crea una sessione (progetto con conferma email obbligatoria)", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.com" }, session: null },
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
      needsEmailConfirmation: true,
    });
    expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "secret123",
      options: {
        data: { display_name: "Anna" },
        emailRedirectTo: expect.stringContaining("/auth/callback"),
      },
    });
  });

  it("needsEmailConfirmation=false quando Supabase crea subito una sessione", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.com" }, session: { access_token: "t" } },
      error: null,
    });

    const result = await signUp({ email: "a@b.com", password: "secret123", displayName: "Anna" });

    expect(result).toEqual(expect.objectContaining({ needsEmailConfirmation: false }));
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

  it("traduce l'elenco tecnico dei requisiti password in un messaggio comprensibile", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: null },
      error: {
        message:
          "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789",
      },
    });

    const result = await signUp({ email: "a@b.com", password: "debole", displayName: "Anna" });

    expect(result).toEqual({
      error: "La password deve contenere lettere maiuscole, minuscole e numeri (minimo 8 caratteri).",
    });
  });

  it("traduce 'User already registered' in un messaggio in italiano", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: null },
      error: { message: "User already registered" },
    });

    const result = await signUp({ email: "a@b.com", password: "secret123", displayName: "Anna" });

    expect(result).toEqual({ error: "Esiste già un account con questa email." });
  });
});

describe("signIn", () => {
  it("ritorna AuthResult con displayName preso da user_metadata e needsEmailConfirmation=false", async () => {
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
      needsEmailConfirmation: false,
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

  it("traduce 'Invalid login credentials' in un messaggio in italiano", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });

    const result = await signIn({ email: "a@b.com", password: "wrong" });

    expect(result).toEqual({ error: "Email o password non corretti." });
  });

  it("traduce 'Email not confirmed' in un messaggio azionabile in italiano", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Email not confirmed" },
    });

    const result = await signIn({ email: "a@b.com", password: "secret123" });

    expect(result).toEqual({
      error:
        "Devi prima confermare la tua email: controlla la posta (anche lo spam) e apri il link di conferma, poi riprova ad accedere.",
    });
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

describe("deleteOwnAccount", () => {
  it("chiama la RPC delete_own_account e poi signOut() su successo", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
    mockSupabase.auth.signOut.mockResolvedValue({ error: null });

    const result = await deleteOwnAccount();

    expect(mockSupabase.rpc).toHaveBeenCalledWith("delete_own_account");
    expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
  });

  it("propaga l'errore della RPC senza chiamare signOut()", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: "Errore imprevisto" },
    });

    const result = await deleteOwnAccount();

    expect(result).toEqual({ error: "Errore imprevisto" });
    expect(mockSupabase.auth.signOut).not.toHaveBeenCalled();
  });
});

describe("leaveCouple", () => {
  it("chiama la RPC leave_couple e NON fa signOut() su successo", async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

    const result = await leaveCouple();

    expect(mockSupabase.rpc).toHaveBeenCalledWith("leave_couple");
    expect(mockSupabase.auth.signOut).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("propaga l'errore della RPC (es. non accoppiato/a)", async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: "Non sei accoppiato/a con nessuno" },
    });

    const result = await leaveCouple();

    expect(result).toEqual({ error: "Non sei accoppiato/a con nessuno" });
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

describe("requestPasswordReset", () => {
  it("chiama resetPasswordForEmail con redirectTo verso /auth/callback?next=/reset-password e ritorna successo", async () => {
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });

    const result = await requestPasswordReset("a@b.com");

    expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.com", {
      redirectTo: expect.stringContaining("/auth/callback?next=/reset-password"),
    });
    expect(result).toEqual({ success: true });
  });

  it("propaga l'errore di Supabase (tradotto se riconosciuto)", async () => {
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({ error: { message: "Errore di rete" } });

    const result = await requestPasswordReset("a@b.com");

    expect(result).toEqual({ error: "Errore di rete" });
  });
});

describe("updatePassword", () => {
  it("chiama updateUser({password}) e ritorna successo", async () => {
    mockSupabase.auth.updateUser.mockResolvedValue({ error: null });

    const result = await updatePassword("NuovaPassword123");

    expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ password: "NuovaPassword123" });
    expect(result).toEqual({ success: true });
  });

  it("traduce l'errore requisiti password (stessa mappatura di signUp)", async () => {
    mockSupabase.auth.updateUser.mockResolvedValue({
      error: {
        message:
          "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789",
      },
    });

    const result = await updatePassword("debole");

    expect(result).toEqual({
      error: "La password deve contenere lettere maiuscole, minuscole e numeri (minimo 8 caratteri).",
    });
  });
});

describe("updateEmail", () => {
  it("ritorna errore se l'email è vuota, senza chiamare updateUser", async () => {
    const result = await updateEmail("   ");
    expect(result).toEqual({ error: "L'email non può essere vuota." });
    expect(mockSupabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it("chiama updateUser({email}, {emailRedirectTo}) con l'email trimmata e ritorna successo", async () => {
    mockSupabase.auth.updateUser.mockResolvedValue({ error: null });

    const result = await updateEmail("  nuova@example.com  ");

    expect(result).toEqual({ success: true });
    expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith(
      { email: "nuova@example.com" },
      { emailRedirectTo: expect.stringContaining("/auth/callback?next=/profilo") },
    );
  });

  it("traduce l'errore 'email già registrata'", async () => {
    mockSupabase.auth.updateUser.mockResolvedValue({
      error: { message: "A user with this email address has already been registered" },
    });

    const result = await updateEmail("partner@example.com");

    expect(result).toEqual({ error: "Esiste già un account con questa email." });
  });
});
