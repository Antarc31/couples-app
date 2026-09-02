/**
 * Unit test per components/profilo/ProfileEditForm.tsx — piano "Feature B —
 * Eventi 'speciale' automatici". lib/profile-actions.ts è mockato: qui non
 * testiamo Supabase/RLS/trigger (vedi tests/lib/profile-actions.test.ts per
 * quello), solo l'orchestrazione della UI:
 *   - precompilazione dei due campi data dalle prop iniziali;
 *   - submit di entrambe le sezioni chiama l'azione giusta con l'input
 *     giusto e fa `router.refresh()` dopo un salvataggio riuscito;
 *   - la sezione anniversario è del tutto assente dal DOM se `isPaired` è
 *     false (non solo nascosta via CSS — coerente con la RPC che fallirebbe
 *     esplicitamente per un utente non accoppiato).
 *
 * `next/navigation` non ha un mock globale in questo progetto (nessun altro
 * test finora esercitava un componente che chiama useRouter): mockato qui
 * localmente, stesso pattern di jest.mock per i moduli lib/*.
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest`
 * globale ambient (non `import { jest } from "@jest/globals"`).
 */

import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = jest.fn<void, []>();
const mockPush = jest.fn<void, [string]>();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));

const mockUpdateBirthDate = jest.fn<Promise<true | { error: string }>, [string | null]>();
const mockSetRelationshipStartDate = jest.fn<Promise<true | { error: string }>, [string]>();

jest.mock("@/lib/profile-actions", () => ({
  updateBirthDate: (...args: [string | null]) => mockUpdateBirthDate(...args),
  setRelationshipStartDate: (...args: [string]) => mockSetRelationshipStartDate(...args),
}));

import ProfileEditForm from "@/components/profilo/ProfileEditForm";

beforeEach(() => {
  mockRefresh.mockReset();
  mockPush.mockReset();
  mockUpdateBirthDate.mockReset();
  mockSetRelationshipStartDate.mockReset();
});

describe("ProfileEditForm", () => {
  it("precompila i due campi data dalle prop iniziali", () => {
    render(
      <ProfileEditForm birthDate="1998-03-14" isPaired relationshipStartDate="2022-05-14" />,
    );

    expect(screen.getByLabelText("Data di nascita")).toHaveValue("1998-03-14");
    expect(screen.getByLabelText("Data di inizio relazione")).toHaveValue("2022-05-14");
  });

  it("precompila i campi vuoti se le date non sono ancora impostate", () => {
    render(<ProfileEditForm birthDate={null} isPaired relationshipStartDate={null} />);

    expect(screen.getByLabelText("Data di nascita")).toHaveValue("");
    expect(screen.getByLabelText("Data di inizio relazione")).toHaveValue("");
  });

  it("nasconde del tutto la sezione anniversario se l'utente non è accoppiato", () => {
    render(<ProfileEditForm birthDate={null} isPaired={false} relationshipStartDate={null} />);

    expect(screen.getByLabelText("Data di nascita")).toBeInTheDocument();
    expect(screen.queryByLabelText("Data di inizio relazione")).not.toBeInTheDocument();
    expect(screen.queryByText("Data di inizio relazione")).not.toBeInTheDocument();
  });

  it("submit della sezione data di nascita chiama updateBirthDate e fa router.refresh() in caso di successo", async () => {
    const user = userEvent.setup();
    mockUpdateBirthDate.mockResolvedValue(true);
    render(<ProfileEditForm birthDate={null} isPaired={false} relationshipStartDate={null} />);

    fireEvent.change(screen.getByLabelText("Data di nascita"), { target: { value: "1998-03-14" } });
    await user.click(screen.getByRole("button", { name: /salva/i }));

    expect(mockUpdateBirthDate).toHaveBeenCalledWith("1998-03-14");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Salvata ✓")).toBeInTheDocument();
  });

  it("mostra l'errore e NON chiama router.refresh() se updateBirthDate fallisce", async () => {
    const user = userEvent.setup();
    mockUpdateBirthDate.mockResolvedValue({ error: "Errore di rete" });
    render(<ProfileEditForm birthDate={null} isPaired={false} relationshipStartDate={null} />);

    fireEvent.change(screen.getByLabelText("Data di nascita"), { target: { value: "1998-03-14" } });
    await user.click(screen.getByRole("button", { name: /salva/i }));

    expect(await screen.findByText("Errore di rete")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("submit della sezione anniversario chiama setRelationshipStartDate e fa router.refresh() in caso di successo", async () => {
    const user = userEvent.setup();
    mockSetRelationshipStartDate.mockResolvedValue(true);
    render(<ProfileEditForm birthDate={null} isPaired relationshipStartDate={null} />);

    fireEvent.change(screen.getByLabelText("Data di inizio relazione"), { target: { value: "2022-05-14" } });
    // Due sezioni, due bottoni "Salva": prendiamo il secondo (anniversario).
    const saveButtons = screen.getAllByRole("button", { name: /salva/i });
    await user.click(saveButtons[1]);

    expect(mockSetRelationshipStartDate).toHaveBeenCalledWith("2022-05-14");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("mostra l'errore della RPC se setRelationshipStartDate fallisce (es. non accoppiato)", async () => {
    const user = userEvent.setup();
    mockSetRelationshipStartDate.mockResolvedValue({ error: "Non sei accoppiato/a con un partner" });
    render(<ProfileEditForm birthDate={null} isPaired relationshipStartDate={null} />);

    fireEvent.change(screen.getByLabelText("Data di inizio relazione"), { target: { value: "2022-05-14" } });
    const saveButtons = screen.getAllByRole("button", { name: /salva/i });
    await user.click(saveButtons[1]);

    expect(await screen.findByText("Non sei accoppiato/a con un partner")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
