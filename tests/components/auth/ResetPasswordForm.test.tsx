/**
 * Unit test per components/auth/ResetPasswordForm.tsx — lib/auth-actions.ts
 * è mockato (vedi tests/lib/auth-actions.test.ts per la copertura contro
 * Supabase). Qui solo l'orchestrazione UI: la validazione "le due password
 * coincidono" è client-side e non deve chiamare updatePassword se fallisce.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthError } from "@/lib/auth-actions";

const mockPush = jest.fn<void, [string]>();
const mockRefresh = jest.fn<void, []>();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const mockUpdatePassword = jest.fn<Promise<{ success: true } | AuthError>, [string]>();

jest.mock("@/lib/auth-actions", () => ({
  updatePassword: (password: string) => mockUpdatePassword(password),
}));

import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

beforeEach(() => {
  mockPush.mockReset();
  mockRefresh.mockReset();
  mockUpdatePassword.mockReset();
});

describe("ResetPasswordForm", () => {
  it("mostra un errore e NON chiama updatePassword se le due password non coincidono", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await user.type(screen.getByPlaceholderText("Nuova password"), "Password123");
    await user.type(screen.getByPlaceholderText("Conferma nuova password"), "Password456");
    await user.click(screen.getByRole("button", { name: "Salva nuova password" }));

    expect(await screen.findByText("Le due password non coincidono.")).toBeInTheDocument();
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it("successo: chiama updatePassword e naviga a '/'", async () => {
    mockUpdatePassword.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await user.type(screen.getByPlaceholderText("Nuova password"), "Password123");
    await user.type(screen.getByPlaceholderText("Conferma nuova password"), "Password123");
    await user.click(screen.getByRole("button", { name: "Salva nuova password" }));

    expect(mockUpdatePassword).toHaveBeenCalledWith("Password123");
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("mostra l'errore tradotto se updatePassword fallisce, senza navigare", async () => {
    mockUpdatePassword.mockResolvedValue({
      error: "La password deve contenere lettere maiuscole, minuscole e numeri (minimo 8 caratteri).",
    });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);

    await user.type(screen.getByPlaceholderText("Nuova password"), "Password123");
    await user.type(screen.getByPlaceholderText("Conferma nuova password"), "Password123");
    await user.click(screen.getByRole("button", { name: "Salva nuova password" }));

    expect(
      await screen.findByText("La password deve contenere lettere maiuscole, minuscole e numeri (minimo 8 caratteri)."),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
