/**
 * Unit test per components/auth/LoginForm.tsx — lib/auth-actions.ts è
 * mockato (vedi tests/lib/auth-actions.test.ts per la copertura contro
 * Supabase, incluse le traduzioni dei messaggi d'errore). Qui solo
 * l'orchestrazione UI: il messaggio post-registrazione deve essere diverso
 * e inequivocabile a seconda che serva confermare l'email o no
 * (needsEmailConfirmation), non un generico "se richiesto".
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthResult, AuthError } from "@/lib/auth-actions";

const mockPush = jest.fn<void, [string]>();
const mockRefresh = jest.fn<void, []>();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const mockSignUp = jest.fn<Promise<AuthResult | AuthError>, [{ email: string; password: string; displayName: string }]>();
const mockSignIn = jest.fn<Promise<AuthResult | AuthError>, [{ email: string; password: string }]>();
const mockRequestPasswordReset = jest.fn<Promise<{ success: true } | AuthError>, [string]>();

jest.mock("@/lib/auth-actions", () => ({
  signUp: (params: { email: string; password: string; displayName: string }) => mockSignUp(params),
  signIn: (params: { email: string; password: string }) => mockSignIn(params),
  requestPasswordReset: (email: string) => mockRequestPasswordReset(email),
}));

import LoginForm from "@/components/auth/LoginForm";

beforeEach(() => {
  mockPush.mockReset();
  mockRefresh.mockReset();
  mockSignUp.mockReset();
  mockSignIn.mockReset();
  mockRequestPasswordReset.mockReset();
});

async function fillAndSubmitSignup(user: ReturnType<typeof userEvent.setup>, email = "a@b.com") {
  await user.click(screen.getByRole("button", { name: "Registrati" }));
  await user.type(screen.getByPlaceholderText("Come ti chiami?"), "Anna");
  await user.type(screen.getByPlaceholderText("Email"), email);
  await user.type(screen.getByPlaceholderText("Password"), "Secret123");
  await user.click(screen.getByRole("button", { name: "Crea account" }));
}

describe("LoginForm — registrazione", () => {
  it("se serve confermare l'email, mostra un messaggio inequivocabile (non 'se richiesto')", async () => {
    mockSignUp.mockResolvedValue({
      userId: "u1",
      email: "a@b.com",
      displayName: "Anna",
      needsEmailConfirmation: true,
    });
    const user = userEvent.setup();
    render(<LoginForm />);

    await fillAndSubmitSignup(user, "a@b.com");

    expect(
      await screen.findByText(
        "Ti abbiamo mandato un'email di conferma a a@b.com. Apri il link ricevuto (controlla anche lo spam) prima di accedere: senza quello il login non funzionerà.",
      ),
    ).toBeInTheDocument();
    // Torna sulla tab "Accedi", non resta su "Registrati".
    expect(screen.queryByPlaceholderText("Come ti chiami?")).not.toBeInTheDocument();
  });

  it("se NON serve confermare l'email, mostra un messaggio di successo semplice", async () => {
    mockSignUp.mockResolvedValue({
      userId: "u1",
      email: "a@b.com",
      displayName: "Anna",
      needsEmailConfirmation: false,
    });
    const user = userEvent.setup();
    render(<LoginForm />);

    await fillAndSubmitSignup(user);

    expect(await screen.findByText("Registrazione completata! Accedi qui sotto.")).toBeInTheDocument();
  });

  it("mostra il messaggio d'errore tradotto (es. requisiti password) senza cambiare tab", async () => {
    mockSignUp.mockResolvedValue({
      error: "La password deve contenere lettere maiuscole, minuscole e numeri (minimo 8 caratteri).",
    });
    const user = userEvent.setup();
    render(<LoginForm />);

    await fillAndSubmitSignup(user);

    expect(
      await screen.findByText("La password deve contenere lettere maiuscole, minuscole e numeri (minimo 8 caratteri)."),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Come ti chiami?")).toBeInTheDocument();
  });
});

describe("LoginForm — accesso", () => {
  it("mostra il messaggio 'email non confermata' tradotto se il login fallisce per quel motivo", async () => {
    mockSignIn.mockResolvedValue({
      error: "Devi prima confermare la tua email: controlla la posta (anche lo spam) e apri il link di conferma, poi riprova ad accedere.",
    });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByPlaceholderText("Email"), "a@b.com");
    await user.type(screen.getByPlaceholderText("Password"), "Secret123");
    await user.click(screen.getAllByRole("button", { name: "Accedi" })[1]);

    expect(
      await screen.findByText(
        "Devi prima confermare la tua email: controlla la posta (anche lo spam) e apri il link di conferma, poi riprova ad accedere.",
      ),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("naviga alla home su login riuscito", async () => {
    mockSignIn.mockResolvedValue({
      userId: "u1",
      email: "a@b.com",
      displayName: "Anna",
      needsEmailConfirmation: false,
    });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByPlaceholderText("Email"), "a@b.com");
    await user.type(screen.getByPlaceholderText("Password"), "Secret123");
    await user.click(screen.getAllByRole("button", { name: "Accedi" })[1]);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});

describe("LoginForm — recupero password", () => {
  it("'Password dimenticata?' mostra il form di recupero (solo email) e nasconde i tab Accedi/Registrati", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Password dimenticata?" }));

    expect(screen.getByRole("button", { name: "Invia link di recupero" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Password")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrati" })).not.toBeInTheDocument();
  });

  it("invio riuscito chiama requestPasswordReset con l'email, mostra il notice e torna al login", async () => {
    mockRequestPasswordReset.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Password dimenticata?" }));
    await user.type(screen.getByPlaceholderText("Email"), "a@b.com");
    await user.click(screen.getByRole("button", { name: "Invia link di recupero" }));

    expect(mockRequestPasswordReset).toHaveBeenCalledWith("a@b.com");
    expect(
      await screen.findByText(
        "Se a@b.com è registrata, ti abbiamo mandato un'email con il link per reimpostare la password.",
      ),
    ).toBeInTheDocument();
    // Torna sui tab Accedi/Registrati, non resta sul form di recupero.
    expect(screen.getByRole("button", { name: "Registrati" })).toBeInTheDocument();
  });

  it("mostra l'errore e resta sul form di recupero se la richiesta fallisce", async () => {
    mockRequestPasswordReset.mockResolvedValue({ error: "Errore di rete" });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Password dimenticata?" }));
    await user.type(screen.getByPlaceholderText("Email"), "a@b.com");
    await user.click(screen.getByRole("button", { name: "Invia link di recupero" }));

    expect(await screen.findByText("Errore di rete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invia link di recupero" })).toBeInTheDocument();
  });

  it("'Torna al login' esce dal recupero senza inviare nulla", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Password dimenticata?" }));
    await user.click(screen.getByRole("button", { name: "‹ Torna al login" }));

    expect(screen.getByRole("button", { name: "Registrati" })).toBeInTheDocument();
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });
});
