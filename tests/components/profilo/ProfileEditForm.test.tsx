/**
 * Unit test per components/profilo/ProfileEditForm.tsx. lib/profile-actions.ts
 * e lib/auth-actions.ts sono mockati: qui non testiamo Supabase/RLS/trigger
 * (vedi tests/lib/profile-actions.test.ts e tests/lib/auth-actions.test.ts
 * per quello), solo l'orchestrazione della UI:
 *   - precompilazione dei quattro campi dalle prop iniziali;
 *   - submit di ciascuna sezione chiama l'azione giusta con l'input giusto;
 *   - Nickname/Data di nascita/Data di inizio relazione fanno
 *     `router.refresh()` dopo un salvataggio riuscito — Email NO (il cambio
 *     non è effettivo finché non si conferma dal link, vedi il commento in
 *     testa al componente), mostra invece un messaggio che lo spiega;
 *   - la sezione anniversario è del tutto assente dal DOM se `isPaired` è
 *     false (non solo nascosta via CSS — coerente con la RPC che fallirebbe
 *     esplicitamente per un utente non accoppiato).
 *
 * `next/navigation` non ha un mock globale in questo progetto: mockato qui
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
const mockUpdateDisplayName = jest.fn<Promise<true | { error: string }>, [string]>();

jest.mock("@/lib/profile-actions", () => ({
  updateBirthDate: (...args: [string | null]) => mockUpdateBirthDate(...args),
  setRelationshipStartDate: (...args: [string]) => mockSetRelationshipStartDate(...args),
  updateDisplayName: (...args: [string]) => mockUpdateDisplayName(...args),
}));

const mockUpdateEmail = jest.fn<Promise<{ success: true } | { error: string }>, [string]>();

jest.mock("@/lib/auth-actions", () => ({
  updateEmail: (...args: [string]) => mockUpdateEmail(...args),
}));

import ProfileEditForm from "@/components/profilo/ProfileEditForm";

const baseProps = {
  displayName: "Anna" as string | null,
  email: "anna@example.com",
  birthDate: null as string | null,
  isPaired: false,
  relationshipStartDate: null as string | null,
};

beforeEach(() => {
  mockRefresh.mockReset();
  mockPush.mockReset();
  mockUpdateBirthDate.mockReset();
  mockSetRelationshipStartDate.mockReset();
  mockUpdateDisplayName.mockReset();
  mockUpdateEmail.mockReset();
});

describe("ProfileEditForm", () => {
  it("precompila i campi dalle prop iniziali", () => {
    render(
      <ProfileEditForm
        {...baseProps}
        birthDate="1998-03-14"
        isPaired
        relationshipStartDate="2022-05-14"
      />,
    );

    expect(screen.getByLabelText("Nickname")).toHaveValue("Anna");
    expect(screen.getByLabelText("Email")).toHaveValue("anna@example.com");
    expect(screen.getByLabelText("Data di nascita")).toHaveValue("1998-03-14");
    expect(screen.getByLabelText("Data di inizio relazione")).toHaveValue("2022-05-14");
  });

  it("precompila i campi data vuoti e il nickname vuoto se non ancora impostati", () => {
    render(<ProfileEditForm {...baseProps} displayName={null} isPaired relationshipStartDate={null} />);

    expect(screen.getByLabelText("Nickname")).toHaveValue("");
    expect(screen.getByLabelText("Data di nascita")).toHaveValue("");
    expect(screen.getByLabelText("Data di inizio relazione")).toHaveValue("");
  });

  it("nasconde del tutto la sezione anniversario se l'utente non è accoppiato", () => {
    render(<ProfileEditForm {...baseProps} isPaired={false} />);

    expect(screen.getByLabelText("Data di nascita")).toBeInTheDocument();
    expect(screen.queryByLabelText("Data di inizio relazione")).not.toBeInTheDocument();
    expect(screen.queryByText("Data di inizio relazione")).not.toBeInTheDocument();
  });

  it("submit del nickname chiama updateDisplayName e fa router.refresh() in caso di successo", async () => {
    const user = userEvent.setup();
    mockUpdateDisplayName.mockResolvedValue(true);
    render(<ProfileEditForm {...baseProps} />);

    fireEvent.change(screen.getByLabelText("Nickname"), { target: { value: "Anna Nuova" } });
    const saveButtons = screen.getAllByRole("button", { name: /salva/i });
    await user.click(saveButtons[0]);

    expect(mockUpdateDisplayName).toHaveBeenCalledWith("Anna Nuova");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Salvato ✓")).toBeInTheDocument();
  });

  it("mostra l'errore e NON chiama router.refresh() se updateDisplayName fallisce", async () => {
    const user = userEvent.setup();
    mockUpdateDisplayName.mockResolvedValue({ error: "Il nickname non può essere vuoto." });
    render(<ProfileEditForm {...baseProps} />);

    fireEvent.change(screen.getByLabelText("Nickname"), { target: { value: "x" } });
    const saveButtons = screen.getAllByRole("button", { name: /salva/i });
    await user.click(saveButtons[0]);

    expect(await screen.findByText("Il nickname non può essere vuoto.")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("il bottone email è disabilitato finché il valore non cambia rispetto a quello attuale", () => {
    render(<ProfileEditForm {...baseProps} />);

    const saveButtons = screen.getAllByRole("button", { name: /salva|invio/i });
    expect(saveButtons[1]).toBeDisabled();
  });

  it("submit dell'email chiama updateEmail, NON fa router.refresh(), e mostra il messaggio di conferma", async () => {
    const user = userEvent.setup();
    mockUpdateEmail.mockResolvedValue({ success: true });
    render(<ProfileEditForm {...baseProps} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "nuova@example.com" } });
    const saveButtons = screen.getAllByRole("button", { name: /salva|invio/i });
    await user.click(saveButtons[1]);

    expect(mockUpdateEmail).toHaveBeenCalledWith("nuova@example.com");
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(await screen.findByText(/email di conferma al nuovo indirizzo/)).toBeInTheDocument();
  });

  it("mostra l'errore se updateEmail fallisce", async () => {
    const user = userEvent.setup();
    mockUpdateEmail.mockResolvedValue({ error: "Esiste già un account con questa email." });
    render(<ProfileEditForm {...baseProps} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "partner@example.com" } });
    const saveButtons = screen.getAllByRole("button", { name: /salva|invio/i });
    await user.click(saveButtons[1]);

    expect(await screen.findByText("Esiste già un account con questa email.")).toBeInTheDocument();
  });

  it("submit della sezione data di nascita chiama updateBirthDate e fa router.refresh() in caso di successo", async () => {
    const user = userEvent.setup();
    mockUpdateBirthDate.mockResolvedValue(true);
    render(<ProfileEditForm {...baseProps} />);

    fireEvent.change(screen.getByLabelText("Data di nascita"), { target: { value: "1998-03-14" } });
    const saveButtons = screen.getAllByRole("button", { name: /salva/i });
    await user.click(saveButtons[2]);

    expect(mockUpdateBirthDate).toHaveBeenCalledWith("1998-03-14");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Salvata ✓")).toBeInTheDocument();
  });

  it("mostra l'errore e NON chiama router.refresh() se updateBirthDate fallisce", async () => {
    const user = userEvent.setup();
    mockUpdateBirthDate.mockResolvedValue({ error: "Errore di rete" });
    render(<ProfileEditForm {...baseProps} />);

    fireEvent.change(screen.getByLabelText("Data di nascita"), { target: { value: "1998-03-14" } });
    const saveButtons = screen.getAllByRole("button", { name: /salva/i });
    await user.click(saveButtons[2]);

    expect(await screen.findByText("Errore di rete")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("submit della sezione anniversario chiama setRelationshipStartDate e fa router.refresh() in caso di successo", async () => {
    const user = userEvent.setup();
    mockSetRelationshipStartDate.mockResolvedValue(true);
    render(<ProfileEditForm {...baseProps} isPaired relationshipStartDate={null} />);

    fireEvent.change(screen.getByLabelText("Data di inizio relazione"), { target: { value: "2022-05-14" } });
    // Nickname, Email, Data di nascita, Data di inizio relazione: la quarta.
    const saveButtons = screen.getAllByRole("button", { name: /salva/i });
    await user.click(saveButtons[3]);

    expect(mockSetRelationshipStartDate).toHaveBeenCalledWith("2022-05-14");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("mostra l'errore della RPC se setRelationshipStartDate fallisce (es. non accoppiato)", async () => {
    const user = userEvent.setup();
    mockSetRelationshipStartDate.mockResolvedValue({ error: "Non sei accoppiato/a con un partner" });
    render(<ProfileEditForm {...baseProps} isPaired relationshipStartDate={null} />);

    fireEvent.change(screen.getByLabelText("Data di inizio relazione"), { target: { value: "2022-05-14" } });
    const saveButtons = screen.getAllByRole("button", { name: /salva/i });
    await user.click(saveButtons[3]);

    expect(await screen.findByText("Non sei accoppiato/a con un partner")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
