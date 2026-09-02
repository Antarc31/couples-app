/**
 * Unit test per components/auth/LeaveCoupleButton.tsx — stesso schema di
 * DeleteAccountButton.test.tsx (conferma a due step, redirect su successo,
 * errore senza redirect), lib/auth-actions.ts mockato.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = jest.fn<void, []>();
const mockPush = jest.fn<void, [string]>();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));

const mockLeaveCouple = jest.fn<Promise<{ error: string } | { success: true }>, []>();

jest.mock("@/lib/auth-actions", () => ({
  leaveCouple: () => mockLeaveCouple(),
}));

import LeaveCoupleButton from "@/components/auth/LeaveCoupleButton";

beforeEach(() => {
  mockRefresh.mockReset();
  mockPush.mockReset();
  mockLeaveCouple.mockReset();
});

describe("LeaveCoupleButton", () => {
  it("non chiama leaveCouple al primo tap, mostra solo la conferma", async () => {
    const user = userEvent.setup();
    render(<LeaveCoupleButton />);

    await user.click(screen.getByRole("button", { name: "Lascia la coppia" }));

    expect(screen.getByText("Conferma uscita")).toBeInTheDocument();
    expect(mockLeaveCouple).not.toHaveBeenCalled();
  });

  it("al secondo tap chiama leaveCouple e reindirizza a /pairing su successo", async () => {
    mockLeaveCouple.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<LeaveCoupleButton />);

    await user.click(screen.getByRole("button", { name: "Lascia la coppia" }));
    await user.click(screen.getByRole("button", { name: "Conferma uscita" }));

    expect(mockLeaveCouple).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/pairing");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("mostra l'errore e non reindirizza se leaveCouple fallisce", async () => {
    mockLeaveCouple.mockResolvedValue({ error: "Non sei accoppiato/a con nessuno" });
    const user = userEvent.setup();
    render(<LeaveCoupleButton />);

    await user.click(screen.getByRole("button", { name: "Lascia la coppia" }));
    await user.click(screen.getByRole("button", { name: "Conferma uscita" }));

    expect(await screen.findByText("Non sei accoppiato/a con nessuno")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
