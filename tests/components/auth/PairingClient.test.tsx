/**
 * Unit test per components/auth/PairingClient.tsx — copre SOLO il bug
 * segnalato dall'utente in produzione: chi genera il codice restava
 * bloccato sulla schermata anche quando il partner aveva già accettato
 * l'invito (verificato via query diretta sul DB che `accept_pairing_invite`
 * collega ENTRAMBI i profiles nella stessa transazione — il problema era
 * puramente lato client, nessun refresh/poll ricontrollava mai se nel
 * frattempo l'accoppiamento fosse avvenuto). Non copre l'intero componente
 * (generazione/accettazione codice, già implicitamente esercitate qui).
 *
 * lib/auth-actions.ts è mockato. Vedi tests/lib/auth-actions.test.ts per il
 * perché si usa il `jest` globale ambient, e
 * tests/components/home/ThoughtsSection.test.tsx per la convenzione sui
 * nomi `mock*` richiesta dall'hoisting di jest.mock.
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthError, Session } from "@/lib/auth-actions";

const mockPush = jest.fn<void, [string]>();
const mockRefresh = jest.fn<void, []>();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const mockCreatePairingInvite = jest.fn<Promise<{ code: string } | AuthError>, []>();
const mockAcceptPairingInvite = jest.fn<Promise<{ coupleId: string; partnerName: string } | AuthError>, [string]>();
const mockGetSession = jest.fn<Promise<Session | null>, []>();
const mockSignOut = jest.fn<Promise<void>, []>();

jest.mock("@/lib/auth-actions", () => ({
  createPairingInvite: () => mockCreatePairingInvite(),
  acceptPairingInvite: (code: string) => mockAcceptPairingInvite(code),
  getSession: () => mockGetSession(),
  signOut: () => mockSignOut(),
}));

import PairingClient from "@/components/auth/PairingClient";

beforeEach(() => {
  mockPush.mockReset();
  mockRefresh.mockReset();
  mockCreatePairingInvite.mockReset();
  mockAcceptPairingInvite.mockReset();
  mockGetSession.mockReset();
  mockSignOut.mockReset();
});

describe("PairingClient — poll automatico dopo aver generato un codice", () => {
  it("non interroga getSession finché non è stato generato un codice", () => {
    render(<PairingClient />);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("appena il partner accetta (couple_id compare), naviga in automatico a /home senza bisogno di ricaricare", async () => {
    jest.useFakeTimers();
    try {
      mockCreatePairingInvite.mockResolvedValue({ code: "7K4QXPMN" });
      // Prima del poll: ancora non accoppiato. Dopo: il partner ha accettato.
      mockGetSession
        .mockResolvedValueOnce({ userId: "me", email: "a@b.com", displayName: "Anna", coupleId: null })
        .mockResolvedValueOnce({ userId: "me", email: "a@b.com", displayName: "Anna", coupleId: "c1" });

      const user = userEvent.setup({ delay: null });
      render(<PairingClient />);

      // Il testo "Genera codice" compare due volte (tab dello switcher + il
      // bottone d'azione dentro la card): il secondo è quello vero.
      await user.click(screen.getAllByRole("button", { name: "Genera codice" })[1]);
      expect(await screen.findByText("7K4QXPMN")).toBeInTheDocument();
      expect(screen.getByText(/In attesa che il partner/)).toBeInTheDocument();

      // Primo giro di poll: ancora non accoppiato, nessuna navigazione.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      expect(mockPush).not.toHaveBeenCalled();

      // Secondo giro: couple_id è comparso -> naviga da sola alla Home.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      expect(mockPush).toHaveBeenCalledWith("/home");
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("smette di interrogare getSession dopo aver navigato (interval ripulito)", async () => {
    jest.useFakeTimers();
    try {
      mockCreatePairingInvite.mockResolvedValue({ code: "7K4QXPMN" });
      mockGetSession.mockResolvedValue({ userId: "me", email: "a@b.com", displayName: "Anna", coupleId: "c1" });

      const user = userEvent.setup({ delay: null });
      render(<PairingClient />);
      // Il testo "Genera codice" compare due volte (tab dello switcher + il
      // bottone d'azione dentro la card): il secondo è quello vero.
      await user.click(screen.getAllByRole("button", { name: "Genera codice" })[1]);
      await screen.findByText("7K4QXPMN");

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));

      const callsAfterNavigation = mockGetSession.mock.calls.length;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(9000);
      });
      // Nessuna chiamata in più: l'interval è stato ripulito, non continua a girare in background.
      expect(mockGetSession.mock.calls.length).toBe(callsAfterNavigation);
    } finally {
      jest.useRealTimers();
    }
  });
});
