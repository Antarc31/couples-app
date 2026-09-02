/**
 * Unit test per components/auth/DeleteAccountButton.tsx — lib/auth-actions.ts
 * è mockato (vedi tests/lib/auth-actions.test.ts per la copertura di
 * deleteOwnAccount contro Supabase). Qui testiamo solo l'orchestrazione UI:
 *   - conferma a due step (niente cancellazione al primo tap, stesso pattern
 *     di EventDetailSheet/AppointmentDetailSheet);
 *   - su successo, redirect a /login + refresh;
 *   - su errore, il messaggio resta visibile e non c'è redirect.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = jest.fn<void, []>();
const mockPush = jest.fn<void, [string]>();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));

const mockDeleteOwnAccount =
  jest.fn<Promise<{ error: string } | { success: true }>, []>();

jest.mock("@/lib/auth-actions", () => ({
  deleteOwnAccount: () => mockDeleteOwnAccount(),
}));

import DeleteAccountButton from "@/components/auth/DeleteAccountButton";

beforeEach(() => {
  mockRefresh.mockReset();
  mockPush.mockReset();
  mockDeleteOwnAccount.mockReset();
});

describe("DeleteAccountButton", () => {
  it("non chiama deleteOwnAccount al primo tap, mostra solo la conferma", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountButton />);

    await user.click(screen.getByRole("button", { name: "Elimina account" }));

    expect(screen.getByText("Conferma eliminazione")).toBeInTheDocument();
    expect(mockDeleteOwnAccount).not.toHaveBeenCalled();
  });

  it("annullando la conferma torna allo stato iniziale senza chiamare nulla", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountButton />);

    await user.click(screen.getByRole("button", { name: "Elimina account" }));
    await user.click(screen.getByRole("button", { name: "Annulla" }));

    expect(screen.getByRole("button", { name: "Elimina account" })).toBeInTheDocument();
    expect(mockDeleteOwnAccount).not.toHaveBeenCalled();
  });

  it("al secondo tap chiama deleteOwnAccount e reindirizza a /login su successo", async () => {
    mockDeleteOwnAccount.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<DeleteAccountButton />);

    await user.click(screen.getByRole("button", { name: "Elimina account" }));
    await user.click(screen.getByRole("button", { name: "Conferma eliminazione" }));

    expect(mockDeleteOwnAccount).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/login");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("mostra l'errore e non reindirizza se deleteOwnAccount fallisce", async () => {
    mockDeleteOwnAccount.mockResolvedValue({ error: "Errore imprevisto" });
    const user = userEvent.setup();
    render(<DeleteAccountButton />);

    await user.click(screen.getByRole("button", { name: "Elimina account" }));
    await user.click(screen.getByRole("button", { name: "Conferma eliminazione" }));

    expect(await screen.findByText("Errore imprevisto")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
