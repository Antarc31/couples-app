/**
 * Unit test per components/appointments/AppointmentsView.tsx — copre la
 * logica non banale del componente (non il markup puro): il countdown sugli
 * appuntamenti confermati (letto dal calendar_event collegato, non da un
 * campo data locale — `appointments` non duplica data/ora, vedi commento nel
 * componente) e la transizione "Trasforma in appuntamento" (idea -> update
 * campi + confirmAppointment, poi la lista si ricarica).
 *
 * lib/appointments-actions.ts e lib/supabase/client sono mockati: qui non
 * testiamo Supabase/RLS (vedi tests/lib/appointments-actions.test.ts per
 * quello), solo l'orchestrazione della UI attorno a queste funzioni.
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest` globale
 * ambient (non `import { jest } from "@jest/globals"`), e
 * tests/components/home/ThoughtsSection.test.tsx per la convenzione sui nomi
 * `mock*` richiesta dall'hoisting di jest.mock.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDays, toDateKey } from "@/lib/calendar-dates";
import type {
  Appointment,
  ActionError,
  CreateIdeaInput,
  ConfirmAppointmentEventInput,
  UpdateAppointmentInput,
} from "@/lib/appointments-actions";

const mockListAppointments = jest.fn<Promise<Appointment[] | ActionError>, []>();
const mockCreateAppointmentIdea = jest.fn<Promise<Appointment | ActionError>, [CreateIdeaInput]>();
const mockConfirmAppointment = jest.fn<
  Promise<Appointment | ActionError>,
  [string, ConfirmAppointmentEventInput, string]
>();
const mockUpdateAppointment = jest.fn<Promise<Appointment | ActionError>, [string, UpdateAppointmentInput]>();
const mockCreateConfirmedAppointment = jest.fn<
  Promise<Appointment | ActionError>,
  [CreateIdeaInput, ConfirmAppointmentEventInput]
>();
const mockDeleteAppointment = jest.fn<Promise<true | ActionError>, [string]>();

jest.mock("@/lib/appointments-actions", () => ({
  listAppointments: (...args: []) => mockListAppointments(...args),
  createAppointmentIdea: (...args: [CreateIdeaInput]) => mockCreateAppointmentIdea(...args),
  confirmAppointment: (
    ...args: [string, ConfirmAppointmentEventInput, string]
  ) => mockConfirmAppointment(...args),
  updateAppointment: (...args: [string, UpdateAppointmentInput]) => mockUpdateAppointment(...args),
  createConfirmedAppointment: (
    ...args: [CreateIdeaInput, ConfirmAppointmentEventInput]
  ) => mockCreateConfirmedAppointment(...args),
  deleteAppointment: (...args: [string]) => mockDeleteAppointment(...args),
}));

type CalendarActionError = { error: string };
type UpdateCalendarEventInput = { title?: string; startsAt?: string };
const mockUpdateCalendarEvent = jest.fn<
  Promise<{ id: string } | CalendarActionError>,
  [string, UpdateCalendarEventInput]
>();

// Controllo automatico di sovrapposizione ("buchi comuni") dentro
// AppointmentFormModal: risolto a [] di default nel beforeEach, nessun test
// qui verifica quel comportamento nel dettaglio (coperto da
// AppointmentFormModal.test.tsx), solo che non rompa il resto del form.
const mockListCoupleEventsInRange = jest.fn<
  Promise<CalendarEventRow[] | CalendarActionError>,
  [string, Date, Date]
>();

jest.mock("@/lib/calendar-actions", () => ({
  updateCalendarEvent: (...args: [string, UpdateCalendarEventInput]) => mockUpdateCalendarEvent(...args),
  listCoupleEventsInRange: (...args: [string, Date, Date]) => mockListCoupleEventsInRange(...args),
}));

type CalendarEventRow = { id: string; starts_at: string; ends_at: string | null; all_day: boolean };

const mockCalendarEventsIn = jest.fn<Promise<{ data: CalendarEventRow[] | null }>, [string, string[]]>();
// AppointmentFormModal deriva coupleId da sé (auth.getUser() + profiles) per
// il controllo di sovrapposizione: di default nessun utente loggato, così il
// codice ritorna prima di toccare la tabella "profiles" (mai mockata qui —
// coperta da AppointmentFormModal.test.tsx).
const mockGetUser = jest.fn<Promise<{ data: { user: { id: string } | null } }>, []>();
const mockFrom = jest.fn((table: string) => {
  if (table === "calendar_events") {
    return { select: () => ({ in: mockCalendarEventsIn }) };
  }
  throw new Error(`tabella inattesa nel test: ${table}`);
});

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mockFrom, auth: { getUser: mockGetUser } }),
}));

import AppointmentsView from "@/components/appointments/AppointmentsView";

function makeAppointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: "ap1",
    coupleId: "c1",
    createdBy: "me",
    title: "Cena romantica",
    location: null,
    cost: null,
    notes: null,
    photoUrl: null,
    tag: null,
    status: "idea",
    calendarEventId: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockListAppointments.mockReset();
  mockCreateAppointmentIdea.mockReset();
  mockConfirmAppointment.mockReset();
  mockUpdateAppointment.mockReset();
  mockCreateConfirmedAppointment.mockReset();
  mockDeleteAppointment.mockReset();
  mockUpdateCalendarEvent.mockReset();
  mockCalendarEventsIn.mockReset();
  mockFrom.mockClear();
  mockListCoupleEventsInRange.mockReset();
  mockListCoupleEventsInRange.mockResolvedValue([]);
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: null } });
});

describe("AppointmentsView — countdown sui confermati", () => {
  it("mostra 'oggi' e 'tra 5 giorni' in base allo starts_at del calendar_event collegato (non a un campo data locale)", async () => {
    mockListAppointments.mockResolvedValue([
      makeAppointment({ id: "ap1", title: "Cena oggi", status: "confermato", calendarEventId: "ev1" }),
      makeAppointment({ id: "ap2", title: "Weekend fra 5 giorni", status: "confermato", calendarEventId: "ev2" }),
    ]);
    mockCalendarEventsIn.mockResolvedValue({
      data: [
        { id: "ev1", starts_at: new Date().toISOString(), ends_at: null, all_day: false },
        { id: "ev2", starts_at: addDays(new Date(), 5).toISOString(), ends_at: null, all_day: false },
      ],
    });

    render(<AppointmentsView />);

    const cardOggi = (await screen.findByText("Cena oggi")).closest("div.flex-1") as HTMLElement;
    expect(within(cardOggi).getByText("oggi")).toBeInTheDocument();

    const cardFra5 = screen.getByText("Weekend fra 5 giorni").closest("div.flex-1") as HTMLElement;
    expect(within(cardFra5).getByText("tra 5 giorni")).toBeInTheDocument();

    // Verifica anche che il fetch dei calendar_event sia mirato ai soli id collegati.
    expect(mockCalendarEventsIn).toHaveBeenCalledWith("id", ["ev1", "ev2"]);
  });

  it("mostra 'senza data' per un confermato il cui calendar_event non è (ancora) risolto", async () => {
    mockListAppointments.mockResolvedValue([
      makeAppointment({ id: "ap1", title: "Orfano", status: "confermato", calendarEventId: "ev-mancante" }),
    ]);
    mockCalendarEventsIn.mockResolvedValue({ data: [] });

    render(<AppointmentsView />);

    await screen.findByText("Orfano");
    expect(screen.getByText("senza data")).toBeInTheDocument();
  });

  it("non chiama affatto la lookup calendar_events se non ci sono confermati con calendarEventId", async () => {
    mockListAppointments.mockResolvedValue([makeAppointment({ id: "ap1", title: "Solo idea", status: "idea" })]);

    render(<AppointmentsView />);

    await screen.findByRole("button", { name: "Idee" });
    expect(mockCalendarEventsIn).not.toHaveBeenCalled();
  });
});

describe("AppointmentsView — transizione 'Trasforma in appuntamento'", () => {
  it("dall'idea apre il form in modalità transform, e alla conferma chiama updateAppointment poi confirmAppointment con category 'coppia', poi ricarica la lista", async () => {
    const user = userEvent.setup();
    const idea = makeAppointment({ id: "ap1", title: "Corso di cucina", status: "idea", tag: "attivita" });
    mockListAppointments.mockResolvedValueOnce([idea]);
    mockUpdateAppointment.mockResolvedValue({ ...idea }); // campi descrittivi invariati in questo test
    mockConfirmAppointment.mockResolvedValue({ ...idea, status: "confermato", calendarEventId: "ev-new" });

    render(<AppointmentsView />);

    // Passa alla vista Idee e avvia la trasformazione.
    await user.click(await screen.findByRole("button", { name: "Idee" }));
    await user.click(await screen.findByRole("button", { name: "Trasforma in appuntamento" }));

    expect(await screen.findByRole("heading", { name: "Trasforma in appuntamento" })).toBeInTheDocument();
    // Il titolo dell'idea è precompilato.
    expect(screen.getByDisplayValue("Corso di cucina")).toBeInTheDocument();

    // La seconda listAppointments (dopo il salvataggio) ritorna l'item ora confermato,
    // con un calendar_event risolvibile per verificare che la UI si aggiorni davvero.
    mockListAppointments.mockResolvedValueOnce([
      { ...idea, status: "confermato", calendarEventId: "ev-new" },
    ]);
    mockCalendarEventsIn.mockResolvedValue({
      data: [{ id: "ev-new", starts_at: new Date().toISOString(), ends_at: null, all_day: false }],
    });

    await user.click(screen.getByRole("button", { name: "Conferma" }));

    await waitFor(() => expect(mockUpdateAppointment).toHaveBeenCalledWith("ap1", expect.any(Object)));
    expect(mockConfirmAppointment).toHaveBeenCalledWith(
      "ap1",
      expect.objectContaining({ category: "coppia" }),
      "Corso di cucina",
    );
    // updateAppointment va chiamato PRIMA di confirmAppointment (ordine delle due scritture).
    const updateOrder = mockUpdateAppointment.mock.invocationCallOrder[0];
    const confirmOrder = mockConfirmAppointment.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(confirmOrder);

    // Il form si chiude e la lista viene ricaricata: passando a "Confermati" l'item
    // trasformato appare ora lì (non più tra le idee).
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Trasforma in appuntamento" })).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Confermati" }));
    expect(await screen.findByText("Corso di cucina")).toBeInTheDocument();
  });

  it("mostra l'errore e NON chiude il form se confirmAppointment fallisce dopo l'update", async () => {
    const user = userEvent.setup();
    const idea = makeAppointment({ id: "ap1", title: "Viaggio in Islanda", status: "idea" });
    mockListAppointments.mockResolvedValue([idea]);
    mockUpdateAppointment.mockResolvedValue({ ...idea });
    mockConfirmAppointment.mockResolvedValue({ error: "Evento calendario non valido" });

    render(<AppointmentsView />);

    await user.click(await screen.findByRole("button", { name: "Idee" }));
    await user.click(await screen.findByRole("button", { name: "Trasforma in appuntamento" }));
    await user.click(await screen.findByRole("button", { name: "Conferma" }));

    expect(await screen.findByText("Evento calendario non valido")).toBeInTheDocument();
    // Il form resta aperto (l'utente può correggere/riprovare).
    expect(screen.getByRole("heading", { name: "Trasforma in appuntamento" })).toBeInTheDocument();
  });
});

describe("AppointmentsView — le idee sono in lista (Card), non più in una griglia 2 colonne", () => {
  it("più idee sono ciascuna una riga con titolo, categoria e azione, non una griglia", async () => {
    const user = userEvent.setup();
    mockListAppointments.mockResolvedValueOnce([
      makeAppointment({ id: "ap1", title: "Weekend a Roma", tag: "viaggio" }),
      makeAppointment({ id: "ap2", title: "Corso di sushi", tag: "ristorante" }),
    ]);

    render(<AppointmentsView />);
    await user.click(await screen.findByRole("button", { name: "Idee" }));

    expect(await screen.findByText("Weekend a Roma")).toBeInTheDocument();
    expect(screen.getByText("Corso di sushi")).toBeInTheDocument();
    expect(screen.getByText("viaggio")).toBeInTheDocument();
    expect(screen.getByText("ristorante")).toBeInTheDocument();
    // Una card per idea, ciascuna col proprio bottone di trasformazione.
    expect(screen.getAllByRole("button", { name: "Trasforma in appuntamento" })).toHaveLength(2);
  });
});

describe("AppointmentsView — FAB 'Appuntamento confermato' (mode 'confirmed', gap segnalato da frontend2)", () => {
  it("dal FAB apre il form 'Nuovo appuntamento' e alla conferma chiama createConfirmedAppointment (UN SOLO insert, non idea->conferma), poi ricarica la lista", async () => {
    const user = userEvent.setup();
    mockListAppointments.mockResolvedValueOnce([]);
    const created = makeAppointment({
      id: "ap-new",
      title: "Weekend a Firenze",
      status: "confermato",
      calendarEventId: "ev-new",
      location: "Firenze",
    });
    mockCreateConfirmedAppointment.mockResolvedValue(created);

    render(<AppointmentsView />);

    await screen.findByText(/Nessun appuntamento confermato/);
    await user.click(screen.getByRole("button", { name: "Aggiungi idea o appuntamento" }));
    await user.click(screen.getByRole("button", { name: "📍 Appuntamento confermato" }));

    expect(await screen.findByRole("heading", { name: "Nuovo appuntamento" })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Titolo (es. Cena da Marco)"), "Weekend a Firenze");
    await user.type(screen.getByPlaceholderText("Luogo (opzionale)"), "Firenze");

    mockListAppointments.mockResolvedValueOnce([created]);
    mockCalendarEventsIn.mockResolvedValue({
      data: [{ id: "ev-new", starts_at: new Date().toISOString(), ends_at: null, all_day: false }],
    });

    await user.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() =>
      expect(mockCreateConfirmedAppointment).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Weekend a Firenze", location: "Firenze" }),
        expect.objectContaining({ category: "coppia" }),
      ),
    );
    // Non passa mai per lo stato 'idea' intermedio: né createAppointmentIdea
    // né confirmAppointment/updateAppointment vengono chiamati per questo flusso.
    expect(mockCreateAppointmentIdea).not.toHaveBeenCalled();
    expect(mockConfirmAppointment).not.toHaveBeenCalled();
    expect(mockUpdateAppointment).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Nuovo appuntamento" })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("Weekend a Firenze")).toBeInTheDocument();
  });

  it("mostra l'errore e NON chiude il form se createConfirmedAppointment fallisce", async () => {
    const user = userEvent.setup();
    mockListAppointments.mockResolvedValue([]);
    mockCreateConfirmedAppointment.mockResolvedValue({ error: "Non sei accoppiato/a con un partner." });

    render(<AppointmentsView />);

    await screen.findByText(/Nessun appuntamento confermato/);
    await user.click(screen.getByRole("button", { name: "Aggiungi idea o appuntamento" }));
    await user.click(screen.getByRole("button", { name: "📍 Appuntamento confermato" }));
    await user.type(screen.getByPlaceholderText("Titolo (es. Cena da Marco)"), "Weekend a Firenze");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    expect(await screen.findByText("Non sei accoppiato/a con un partner.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nuovo appuntamento" })).toBeInTheDocument();
  });
});

describe("AppointmentsView — dettaglio/modifica/eliminazione (tap su una card, gap segnalato dall'utente)", () => {
  it("tap su una card confermata apre il detail sheet con titolo, stato, luogo e costo", async () => {
    const user = userEvent.setup();
    mockListAppointments.mockResolvedValue([
      makeAppointment({
        id: "ap1",
        title: "Cena romantica",
        status: "confermato",
        calendarEventId: "ev1",
        location: "Trattoria da Gino",
        cost: 45,
      }),
    ]);
    mockCalendarEventsIn.mockResolvedValue({
      data: [{ id: "ev1", starts_at: "2026-09-10T20:00:00.000Z", ends_at: null, all_day: false }],
    });

    render(<AppointmentsView />);
    await user.click(await screen.findByText("Cena romantica"));

    expect(await screen.findByRole("heading", { name: "Cena romantica" })).toBeInTheDocument();
    expect(screen.getByText("Confermato")).toBeInTheDocument();
    // "Trattoria da Gino"/"~45€" compaiono anche nella card sotto: qui basta
    // confermare che il detail sheet li mostri anche lui, non l'unicità.
    expect(screen.getAllByText(/Trattoria da Gino/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/~45€/).length).toBeGreaterThan(0);
  });

  it("il tap sul bottone 'Trasforma' di una card idea NON apre anche il detail sheet dell'idea", async () => {
    const user = userEvent.setup();
    mockListAppointments.mockResolvedValue([makeAppointment({ id: "ap1", title: "Corso di cucina", status: "idea" })]);

    render(<AppointmentsView />);
    await user.click(await screen.findByRole("button", { name: "Idee" }));
    await user.click(await screen.findByRole("button", { name: "Trasforma in appuntamento" }));

    // Si apre SOLO il form di trasformazione — se lo stopPropagation mancasse,
    // si aprirebbe ANCHE il detail sheet (secondo heading con lo stesso titolo).
    expect(screen.getByRole("heading", { name: "Trasforma in appuntamento" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Corso di cucina" })).not.toBeInTheDocument();
  });

  it("da un confermato, 'Modifica' precompila data/ora dal calendar_event collegato e il salvataggio chiama sia updateAppointment sia updateCalendarEvent", async () => {
    const user = userEvent.setup();
    const appointment = makeAppointment({
      id: "ap1",
      title: "Cena romantica",
      status: "confermato",
      calendarEventId: "ev1",
      location: "Trattoria da Gino",
    });
    const startsAt = "2026-09-10T20:00:00.000Z";
    mockListAppointments.mockResolvedValue([appointment]);
    mockCalendarEventsIn.mockResolvedValue({ data: [{ id: "ev1", starts_at: startsAt, ends_at: null, all_day: false }] });
    mockUpdateAppointment.mockResolvedValue(appointment);
    mockUpdateCalendarEvent.mockResolvedValue({ id: "ev1" });

    render(<AppointmentsView />);
    await user.click(await screen.findByText("Cena romantica"));
    await user.click(screen.getByRole("button", { name: "Modifica" }));

    expect(await screen.findByRole("heading", { name: "Modifica appuntamento" })).toBeInTheDocument();
    // Precompilato dal calendar_event collegato, non dalla data odierna di default.
    expect(screen.getByDisplayValue(toDateKey(new Date(startsAt)))).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Luogo (opzionale)")).toBeInTheDocument();

    mockListAppointments.mockResolvedValueOnce([appointment]);
    await user.click(screen.getByRole("button", { name: "Salva modifiche" }));

    await waitFor(() => expect(mockUpdateAppointment).toHaveBeenCalledWith("ap1", expect.any(Object)));
    expect(mockUpdateCalendarEvent).toHaveBeenCalledWith("ev1", expect.objectContaining({ title: "Cena romantica" }));
  });

  it("da un'idea, 'Modifica' non mostra campi data/luogo/costo e il salvataggio chiama SOLO updateAppointment", async () => {
    const user = userEvent.setup();
    const idea = makeAppointment({ id: "ap1", title: "Corso di cucina", status: "idea" });
    mockListAppointments.mockResolvedValue([idea]);
    mockUpdateAppointment.mockResolvedValue(idea);

    render(<AppointmentsView />);
    await user.click(await screen.findByRole("button", { name: "Idee" }));
    await user.click(await screen.findByText("Corso di cucina"));
    await user.click(screen.getByRole("button", { name: "Modifica" }));

    expect(await screen.findByRole("heading", { name: "Modifica appuntamento" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Luogo (opzionale)")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salva modifiche" }));

    await waitFor(() => expect(mockUpdateAppointment).toHaveBeenCalledWith("ap1", expect.any(Object)));
    expect(mockUpdateCalendarEvent).not.toHaveBeenCalled();
  });

  it("'Elimina' richiede un secondo tap di conferma prima di chiamare deleteAppointment, poi chiude il detail sheet e ricarica", async () => {
    const user = userEvent.setup();
    const appointment = makeAppointment({ id: "ap1", title: "Corso di cucina", status: "idea" });
    mockListAppointments.mockResolvedValueOnce([appointment]);
    mockDeleteAppointment.mockResolvedValue(true);

    render(<AppointmentsView />);
    await user.click(await screen.findByRole("button", { name: "Idee" }));
    await user.click(await screen.findByText("Corso di cucina"));

    await user.click(screen.getByRole("button", { name: "Elimina" }));
    expect(mockDeleteAppointment).not.toHaveBeenCalled();
    expect(screen.getByText("Eliminare definitivamente questo appuntamento?")).toBeInTheDocument();

    mockListAppointments.mockResolvedValueOnce([]);
    await user.click(screen.getByRole("button", { name: "Conferma eliminazione" }));

    expect(mockDeleteAppointment).toHaveBeenCalledWith("ap1");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Corso di cucina" })).not.toBeInTheDocument());
  });

  it("mostra l'errore e non chiude il detail sheet se deleteAppointment fallisce", async () => {
    const user = userEvent.setup();
    mockListAppointments.mockResolvedValue([makeAppointment({ id: "ap1", title: "Corso di cucina", status: "idea" })]);
    mockDeleteAppointment.mockResolvedValue({ error: "Non autorizzato" });

    render(<AppointmentsView />);
    await user.click(await screen.findByRole("button", { name: "Idee" }));
    await user.click(await screen.findByText("Corso di cucina"));
    await user.click(screen.getByRole("button", { name: "Elimina" }));
    await user.click(screen.getByRole("button", { name: "Conferma eliminazione" }));

    expect(await screen.findByText("Non autorizzato")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Corso di cucina" })).toBeInTheDocument();
  });
});
