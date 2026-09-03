/**
 * Unit test per components/calendar/EventFormModal.tsx — piano UX "Gruppo
 * Calendario/Appuntamenti", punti 3 e 4:
 *
 * - Punto 3: `mode`/`initial` per riusare lo stesso form in creazione e
 *   modifica (prima esisteva solo la creazione).
 * - Punto 4 (unificazione Calendario -> Appuntamenti): in creazione,
 *   categoria "coppia" mostra i campi Luogo/Costo e chiama
 *   `createConfirmedAppointment()` invece dell'insert diretto — così
 *   l'evento compare anche in Appuntamenti → Confermati. In modifica invece
 *   il salvataggio tocca SEMPRE E SOLO `calendar_events` via
 *   `updateCalendarEvent()`, qualunque sia la categoria selezionata (scelta
 *   di scope esplicita nel piano: niente collegamento/scollegamento
 *   retroattivo dell'appuntamento durante una modifica).
 *
 * lib/calendar-actions.ts e lib/appointments-actions.ts sono mockati: qui
 * non testiamo Supabase/RLS (vedi tests/lib/calendar-actions.test.ts e
 * tests/lib/appointments-actions.test.ts per quello), solo l'orchestrazione
 * della UI attorno a queste funzioni.
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest`
 * globale ambient, e tests/components/home/ThoughtsSection.test.tsx per la
 * convenzione sui nomi `mock*` richiesta dall'hoisting di jest.mock.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Database } from "@/types/database";
import type { CreateCalendarEventInput, UpdateCalendarEventInput } from "@/lib/calendar-actions";
import type { Appointment, CreateIdeaInput, ConfirmAppointmentEventInput } from "@/lib/appointments-actions";

type CalendarEventRow = Database["public"]["Tables"]["calendar_events"]["Row"];
type CalendarActionError = { error: string };

const mockCreateCalendarEvent = jest.fn<Promise<CalendarEventRow | CalendarActionError>, [CreateCalendarEventInput]>();
const mockUpdateCalendarEvent = jest.fn<
  Promise<CalendarEventRow | CalendarActionError>,
  [string, UpdateCalendarEventInput]
>();
// Controllo automatico di sovrapposizione ("buchi comuni"): risolto a [] di
// default nel beforeEach così l'avviso non scatta mai a meno che un test non
// lo sovrascriva esplicitamente per testarlo.
const mockListCoupleEventsInRange = jest.fn<Promise<CalendarEventRow[] | CalendarActionError>, [string, Date, Date]>();

jest.mock("@/lib/calendar-actions", () => ({
  createCalendarEvent: (...args: [CreateCalendarEventInput]) => mockCreateCalendarEvent(...args),
  updateCalendarEvent: (...args: [string, UpdateCalendarEventInput]) => mockUpdateCalendarEvent(...args),
  listCoupleEventsInRange: (...args: [string, Date, Date]) => mockListCoupleEventsInRange(...args),
}));

const mockCreateConfirmedAppointment = jest.fn<
  Promise<Appointment | CalendarActionError>,
  [CreateIdeaInput, ConfirmAppointmentEventInput]
>();

jest.mock("@/lib/appointments-actions", () => ({
  createConfirmedAppointment: (...args: [CreateIdeaInput, ConfirmAppointmentEventInput]) =>
    mockCreateConfirmedAppointment(...args),
}));

import EventFormModal from "@/components/calendar/EventFormModal";

function makeEventRow(overrides: Partial<CalendarEventRow> = {}): CalendarEventRow {
  return {
    id: "ev1",
    couple_id: "c1",
    created_by: "me",
    title: "Palestra",
    tag: null,
    notes: null,
    category: "personale",
    starts_at: "2026-09-10T09:00:00.000Z",
    ends_at: "2026-09-10T10:00:00.000Z",
    all_day: false,
    recurrence: "nessuna",
    recurrence_interval: 1,
    recurrence_until: null,
    recurrence_count: null,
    is_shared_with_partner: false,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "ap1",
    coupleId: "c1",
    createdBy: "me",
    title: "Cena romantica",
    location: "Trattoria da Gino",
    cost: 45,
    notes: "portare il vino",
    photoUrl: null,
    tag: "ristorante",
    status: "confermato",
    calendarEventId: "ev1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockCreateCalendarEvent.mockReset();
  mockUpdateCalendarEvent.mockReset();
  mockCreateConfirmedAppointment.mockReset();
  mockListCoupleEventsInRange.mockReset();
  mockListCoupleEventsInRange.mockResolvedValue([]);
});

describe("EventFormModal — creazione, categoria 'personale' (invariato)", () => {
  it("'Speciale' non è più tra le categorie selezionabili (piano: sparisce dal creatore/modificatore eventi)", () => {
    render(
      <EventFormModal coupleId="c1" createdBy="me" defaultDate={new Date()} onClose={jest.fn()} onSaved={jest.fn()} />,
    );

    expect(screen.queryByRole("button", { name: "Data speciale" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Personale" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Di coppia" })).toBeInTheDocument();
  });

  it("crea un evento chiamando createCalendarEvent, non createConfirmedAppointment", async () => {
    mockCreateCalendarEvent.mockResolvedValue(makeEventRow());
    const user = userEvent.setup();
    const onSaved = jest.fn();
    render(
      <EventFormModal
        coupleId="c1"
        createdBy="me"
        defaultDate={new Date("2026-09-10T00:00:00")}
        onClose={jest.fn()}
        onSaved={onSaved}
      />,
    );

    await user.type(screen.getByPlaceholderText("Titolo (es. Cena da Marco)"), "Palestra");
    await user.click(screen.getByRole("button", { name: "Crea evento" }));

    await waitFor(() => expect(mockCreateCalendarEvent).toHaveBeenCalledTimes(1));
    expect(mockCreateCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ coupleId: "c1", createdBy: "me", title: "Palestra", category: "personale" }),
    );
    expect(mockCreateConfirmedAppointment).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith("personale");
  });

  it("non chiama Supabase se il titolo è vuoto (submit disabilitato dal required nativo)", async () => {
    const user = userEvent.setup();
    render(
      <EventFormModal coupleId="c1" createdBy="me" defaultDate={new Date()} onClose={jest.fn()} onSaved={jest.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Crea evento" }));

    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
  });

  it("mostra l'errore e non chiama onSaved se createCalendarEvent fallisce", async () => {
    mockCreateCalendarEvent.mockResolvedValue({ error: "RLS violation" });
    const user = userEvent.setup();
    const onSaved = jest.fn();
    render(
      <EventFormModal coupleId="c1" createdBy="me" defaultDate={new Date()} onClose={jest.fn()} onSaved={onSaved} />,
    );

    await user.type(screen.getByPlaceholderText("Titolo (es. Cena da Marco)"), "Palestra");
    await user.click(screen.getByRole("button", { name: "Crea evento" }));

    expect(await screen.findByText("RLS violation")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("EventFormModal — creazione, categoria 'coppia' (piano punto 4, unificazione con Appuntamenti)", () => {
  it("selezionando 'Di coppia' compaiono i campi Luogo e Costo, assenti per le altre categorie", async () => {
    const user = userEvent.setup();
    render(
      <EventFormModal coupleId="c1" createdBy="me" defaultDate={new Date()} onClose={jest.fn()} onSaved={jest.fn()} />,
    );

    expect(screen.queryByPlaceholderText("Luogo (opzionale)")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Costo indicativo in € (opzionale)")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Di coppia" }));

    expect(screen.getByPlaceholderText("Luogo (opzionale)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Costo indicativo in € (opzionale)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Personale" }));
    expect(screen.queryByPlaceholderText("Luogo (opzionale)")).not.toBeInTheDocument();
  });

  it("il submit chiama createConfirmedAppointment (non createCalendarEvent) con luogo/costo/tag/note propagati", async () => {
    mockCreateConfirmedAppointment.mockResolvedValue(makeAppointment());
    const user = userEvent.setup();
    const onSaved = jest.fn();
    render(
      <EventFormModal
        coupleId="c1"
        createdBy="me"
        defaultDate={new Date("2026-09-10T00:00:00")}
        onClose={jest.fn()}
        onSaved={onSaved}
      />,
    );

    await user.type(screen.getByPlaceholderText("Titolo (es. Cena da Marco)"), "Cena romantica");
    await user.click(screen.getByRole("button", { name: "Di coppia" }));
    await user.type(screen.getByPlaceholderText("es. amici, sport…"), "ristorante");
    await user.type(screen.getByPlaceholderText("Luogo (opzionale)"), "Trattoria da Gino");
    await user.type(screen.getByPlaceholderText("Costo indicativo in € (opzionale)"), "45");
    await user.type(screen.getByPlaceholderText("Note (opzionale)"), "portare il vino");
    await user.click(screen.getByRole("button", { name: "Crea evento" }));

    await waitFor(() => expect(mockCreateConfirmedAppointment).toHaveBeenCalledTimes(1));
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();

    const [ideaInput, eventInput] = mockCreateConfirmedAppointment.mock.calls[0];
    expect(ideaInput).toEqual(
      expect.objectContaining({
        title: "Cena romantica",
        location: "Trattoria da Gino",
        cost: 45,
        notes: "portare il vino",
        tag: "ristorante",
      }),
    );
    expect(eventInput).toEqual(
      expect.objectContaining({ category: "coppia", tag: "ristorante", notes: "portare il vino" }),
    );
    expect(onSaved).toHaveBeenCalledWith("coppia");
  });

  it("Luogo/Costo restano opzionali: submit senza compilarli passa undefined, non stringhe vuote", async () => {
    mockCreateConfirmedAppointment.mockResolvedValue(makeAppointment());
    const user = userEvent.setup();
    render(
      <EventFormModal coupleId="c1" createdBy="me" defaultDate={new Date()} onClose={jest.fn()} onSaved={jest.fn()} />,
    );

    await user.type(screen.getByPlaceholderText("Titolo (es. Cena da Marco)"), "Cena romantica");
    await user.click(screen.getByRole("button", { name: "Di coppia" }));
    await user.click(screen.getByRole("button", { name: "Crea evento" }));

    await waitFor(() => expect(mockCreateConfirmedAppointment).toHaveBeenCalledTimes(1));
    const [ideaInput] = mockCreateConfirmedAppointment.mock.calls[0];
    expect(ideaInput.location).toBeUndefined();
    expect(ideaInput.cost).toBeUndefined();
  });
});

describe("EventFormModal — modifica (mode='edit')", () => {
  it("precompila i campi da 'initial' e mostra 'Modifica evento'/'Salva modifiche'", () => {
    const initial = makeEventRow({ title: "Cena da Marco", tag: "ristorante", notes: "nota", category: "personale" });
    render(
      <EventFormModal
        coupleId="c1"
        createdBy="me"
        defaultDate={new Date()}
        mode="edit"
        initial={initial}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    expect(screen.getByText("Modifica evento")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Cena da Marco")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ristorante")).toBeInTheDocument();
    expect(screen.getByDisplayValue("nota")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva modifiche" })).toBeInTheDocument();
  });

  it("il salvataggio chiama updateCalendarEvent(id, ...), mai createCalendarEvent/createConfirmedAppointment", async () => {
    mockUpdateCalendarEvent.mockResolvedValue(makeEventRow({ id: "ev9" }));
    const user = userEvent.setup();
    const onSaved = jest.fn();
    const initial = makeEventRow({ id: "ev9", title: "Palestra" });
    render(
      <EventFormModal
        coupleId="c1"
        createdBy="me"
        defaultDate={new Date()}
        mode="edit"
        initial={initial}
        onClose={jest.fn()}
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Salva modifiche" }));

    await waitFor(() => expect(mockUpdateCalendarEvent).toHaveBeenCalledTimes(1));
    expect(mockUpdateCalendarEvent).toHaveBeenCalledWith("ev9", expect.objectContaining({ title: "Palestra" }));
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
    expect(mockCreateConfirmedAppointment).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith("personale");
  });

  it("scegliere categoria 'coppia' in modifica NON mostra Luogo/Costo e mostra l'hint, e il salvataggio resta updateCalendarEvent (nessun collegamento retroattivo ad Appuntamenti)", async () => {
    mockUpdateCalendarEvent.mockResolvedValue(makeEventRow());
    const user = userEvent.setup();
    const onSaved = jest.fn();
    const initial = makeEventRow({ id: "ev9", category: "personale" });
    render(
      <EventFormModal
        coupleId="c1"
        createdBy="me"
        defaultDate={new Date()}
        mode="edit"
        initial={initial}
        onClose={jest.fn()}
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Di coppia" }));

    expect(screen.queryByPlaceholderText("Luogo (opzionale)")).not.toBeInTheDocument();
    expect(screen.getByText(/Luogo e costo si modificano da Appuntamenti/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Vai/ })).toHaveAttribute("href", "/appuntamenti");

    await user.click(screen.getByRole("button", { name: "Salva modifiche" }));

    await waitFor(() => expect(mockUpdateCalendarEvent).toHaveBeenCalledTimes(1));
    expect(mockUpdateCalendarEvent).toHaveBeenCalledWith("ev9", expect.objectContaining({ category: "coppia" }));
    expect(mockCreateConfirmedAppointment).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith("coppia");
  });

  it("aprire in modifica un evento 'speciale' auto-generato mostra la categoria come 'Personale' (stesso rimappaggio già in uso per 'ciclo')", () => {
    const initial = makeEventRow({ id: "ev-special", title: "Compleanno di Asia", category: "speciale" });
    render(
      <EventFormModal
        coupleId="c1"
        createdBy="me"
        defaultDate={new Date()}
        mode="edit"
        initial={initial}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Data speciale" })).not.toBeInTheDocument();
    const personaleButton = screen.getByRole("button", { name: "Personale" });
    expect(personaleButton.className).toContain("text-white");
  });

  it("salvare un evento 'speciale' aperto in modifica invia category: 'personale' a updateCalendarEvent", async () => {
    mockUpdateCalendarEvent.mockResolvedValue(makeEventRow({ id: "ev-special", category: "personale" }));
    const user = userEvent.setup();
    const onSaved = jest.fn();
    const initial = makeEventRow({ id: "ev-special", title: "Compleanno di Asia", category: "speciale" });
    render(
      <EventFormModal
        coupleId="c1"
        createdBy="me"
        defaultDate={new Date()}
        mode="edit"
        initial={initial}
        onClose={jest.fn()}
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Salva modifiche" }));

    await waitFor(() => expect(mockUpdateCalendarEvent).toHaveBeenCalledTimes(1));
    expect(mockUpdateCalendarEvent).toHaveBeenCalledWith("ev-special", expect.objectContaining({ category: "personale" }));
    expect(onSaved).toHaveBeenCalledWith("personale");
  });

  it("un evento già 'coppia' in modifica mostra subito l'hint, senza dover ri-selezionare la categoria", () => {
    const initial = makeEventRow({ id: "ev9", category: "coppia" });
    render(
      <EventFormModal
        coupleId="c1"
        createdBy="me"
        defaultDate={new Date()}
        mode="edit"
        initial={initial}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    expect(screen.getByText(/Luogo e costo si modificano da Appuntamenti/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Luogo (opzionale)")).not.toBeInTheDocument();
  });
});

// =============================================================================
// Controllo automatico di sovrapposizione ("buchi comuni", nessun checkbox —
// vedi piano approvato in
// /Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md).
// lib/calendar-dates.ts (overlapsAnyEvent) NON è mockato: già testato a
// parte in tests/lib/calendar-dates.test.ts, qui verifichiamo solo che
// EventFormModal lo interroghi/mostri correttamente.
// =============================================================================
describe("EventFormModal — controllo automatico di sovrapposizione", () => {
  it("nessun avviso se listCoupleEventsInRange non trova nulla nel giorno", async () => {
    mockListCoupleEventsInRange.mockResolvedValue([]);
    render(
      <EventFormModal coupleId="c1" createdBy="me" defaultDate={new Date(2026, 8, 10)} onClose={jest.fn()} onSaved={jest.fn()} />,
    );

    await waitFor(() => expect(mockListCoupleEventsInRange).toHaveBeenCalled());
    expect(screen.queryByText(/Si sovrappone/)).not.toBeInTheDocument();
  });

  it("mostra l'avviso quando l'orario scelto si sovrappone a un impegno esistente dello stesso giorno", async () => {
    // Default di creazione: 09:00–10:00 (nessun initialTimeRange) — impegno
    // esistente 09:30–10:30, sovrapposizione parziale.
    mockListCoupleEventsInRange.mockResolvedValue([
      makeEventRow({ id: "busy", starts_at: "2026-09-10T09:30:00", ends_at: "2026-09-10T10:30:00" }),
    ]);
    render(
      <EventFormModal coupleId="c1" createdBy="me" defaultDate={new Date(2026, 8, 10)} onClose={jest.fn()} onSaved={jest.fn()} />,
    );

    expect(await screen.findByText("⚠️ Si sovrappone a un impegno già in calendario")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggerisci slot orario" })).toBeInTheDocument();
  });

  it("'Suggerisci slot orario' espande i chip di durata e, scegliendo uno slot, chiude il pannello", async () => {
    mockListCoupleEventsInRange.mockResolvedValue([
      makeEventRow({ id: "busy", starts_at: "2026-09-10T09:30:00", ends_at: "2026-09-10T10:30:00" }),
    ]);
    const user = userEvent.setup();
    render(
      <EventFormModal coupleId="c1" createdBy="me" defaultDate={new Date(2026, 8, 10)} onClose={jest.fn()} onSaved={jest.fn()} />,
    );

    await screen.findByText("⚠️ Si sovrappone a un impegno già in calendario");
    await user.click(screen.getByRole("button", { name: "Suggerisci slot orario" }));
    expect(screen.getByText("Quanto tempo ti serve?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "30 min" }));
    const result = await screen.findAllByRole("button", { name: /–/ });
    await user.click(result[0]);

    await waitFor(() => expect(screen.queryByText("Quanto tempo ti serve?")).not.toBeInTheDocument());
  });

  it("in modifica, l'evento aperto non genera un falso conflitto con se stesso (escluso per id)", async () => {
    const initial = makeEventRow({ id: "ev1", starts_at: "2026-09-10T09:00:00.000Z", ends_at: "2026-09-10T10:00:00.000Z" });
    // La query di sovrapposizione ritorna ANCHE la riga stessa (come farebbe
    // davvero Supabase, che non sa che stiamo modificando proprio quella) —
    // deve essere filtrata via id, non generare l'avviso.
    mockListCoupleEventsInRange.mockResolvedValue([initial]);
    render(
      <EventFormModal
        coupleId="c1"
        createdBy="me"
        defaultDate={new Date(initial.starts_at)}
        mode="edit"
        initial={initial}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockListCoupleEventsInRange).toHaveBeenCalled());
    expect(screen.queryByText(/Si sovrappone/)).not.toBeInTheDocument();
  });
});

// =============================================================================
// Ricorrenza generale ("Ripeti", stile Google Calendar semplice — vedi piano
// approvato in /Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md).
// lib/calendar-dates.ts (formatRecurrenceSummary/pluralizeRecurrenceUnit) NON
// è mockato: già testato a parte in tests/lib/calendar-dates.test.ts.
// =============================================================================
describe("EventFormModal — ricorrenza generale ('Ripeti')", () => {
  it("di default mostra solo il selettore frequenza, nessun controllo aggiuntivo", () => {
    render(
      <EventFormModal coupleId="c1" createdBy="me" defaultDate={new Date(2026, 8, 10)} onClose={jest.fn()} onSaved={jest.fn()} />,
    );

    expect(screen.getByRole("combobox", { name: "Ripeti" })).toHaveValue("nessuna");
    expect(screen.queryByRole("spinbutton", { name: "Ogni quante unità" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Mai" })).not.toBeInTheDocument();
  });

  it("selezionare una frequenza mostra l'intervallo e le tre opzioni di fine (default 'Mai') più l'anteprima live", async () => {
    const user = userEvent.setup();
    render(
      <EventFormModal coupleId="c1" createdBy="me" defaultDate={new Date(2026, 8, 10)} onClose={jest.fn()} onSaved={jest.fn()} />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Ripeti" }), "settimanale");

    expect(screen.getByRole("spinbutton", { name: "Ogni quante unità" })).toHaveValue(1);
    expect(screen.getByRole("radio", { name: "Mai" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Fino al" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Dopo" })).not.toBeChecked();
    expect(screen.getByText("🔁 Ogni settimana")).toBeInTheDocument();
  });

  it("aumentare l'intervallo aggiorna l'anteprima con l'unità al plurale", async () => {
    const user = userEvent.setup();
    render(
      <EventFormModal coupleId="c1" createdBy="me" defaultDate={new Date(2026, 8, 10)} onClose={jest.fn()} onSaved={jest.fn()} />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Ripeti" }), "settimanale");
    const intervalInput = screen.getByRole("spinbutton", { name: "Ogni quante unità" });
    await user.clear(intervalInput);
    await user.type(intervalInput, "2");

    expect(screen.getByText("🔁 Ogni 2 settimane")).toBeInTheDocument();
  });

  it("'Non si ripete' (default): submit non passa recurrenceUntil/recurrenceCount", async () => {
    mockCreateCalendarEvent.mockResolvedValue(makeEventRow());
    const user = userEvent.setup();
    render(
      <EventFormModal coupleId="c1" createdBy="me" defaultDate={new Date(2026, 8, 10)} onClose={jest.fn()} onSaved={jest.fn()} />,
    );

    await user.type(screen.getByPlaceholderText("Titolo (es. Cena da Marco)"), "Palestra");
    await user.click(screen.getByRole("button", { name: "Crea evento" }));

    await waitFor(() => expect(mockCreateCalendarEvent).toHaveBeenCalledTimes(1));
    expect(mockCreateCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: "nessuna",
        recurrenceInterval: 1,
        recurrenceUntil: null,
        recurrenceCount: null,
      }),
    );
  });

  it("'Il [data]': submit passa recurrenceUntil a fine giornata e recurrenceCount null", async () => {
    mockCreateCalendarEvent.mockResolvedValue(makeEventRow());
    const user = userEvent.setup();
    render(
      <EventFormModal coupleId="c1" createdBy="me" defaultDate={new Date(2026, 8, 10)} onClose={jest.fn()} onSaved={jest.fn()} />,
    );

    await user.type(screen.getByPlaceholderText("Titolo (es. Cena da Marco)"), "Lezione di Analisi");
    await user.selectOptions(screen.getByRole("combobox", { name: "Ripeti" }), "settimanale");
    await user.click(screen.getByRole("radio", { name: "Fino al" }));
    fireEvent.change(screen.getByLabelText("Data di fine ricorrenza"), { target: { value: "2026-12-15" } });
    await user.click(screen.getByRole("button", { name: "Crea evento" }));

    await waitFor(() => expect(mockCreateCalendarEvent).toHaveBeenCalledTimes(1));
    expect(mockCreateCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: "settimanale",
        recurrenceInterval: 1,
        recurrenceUntil: new Date("2026-12-15T23:59:59").toISOString(),
        recurrenceCount: null,
      }),
    );
  });

  it("'Dopo [N] volte': submit passa recurrenceCount e recurrenceUntil null", async () => {
    mockCreateCalendarEvent.mockResolvedValue(makeEventRow());
    const user = userEvent.setup();
    render(
      <EventFormModal coupleId="c1" createdBy="me" defaultDate={new Date(2026, 8, 10)} onClose={jest.fn()} onSaved={jest.fn()} />,
    );

    await user.type(screen.getByPlaceholderText("Titolo (es. Cena da Marco)"), "Terapia");
    await user.selectOptions(screen.getByRole("combobox", { name: "Ripeti" }), "giornaliera");
    await user.click(screen.getByRole("radio", { name: "Dopo" }));
    const countInput = screen.getByRole("spinbutton", { name: "Numero di volte" });
    await user.clear(countInput);
    await user.type(countInput, "5");
    await user.click(screen.getByRole("button", { name: "Crea evento" }));

    await waitFor(() => expect(mockCreateCalendarEvent).toHaveBeenCalledTimes(1));
    expect(mockCreateCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: "giornaliera",
        recurrenceInterval: 1,
        recurrenceUntil: null,
        recurrenceCount: 5,
      }),
    );
  });

  it("'Dopo [N] volte' è limitato a un massimo di 10 anche se il browser permettesse di digitare oltre", async () => {
    mockCreateCalendarEvent.mockResolvedValue(makeEventRow());
    const user = userEvent.setup();
    render(
      <EventFormModal coupleId="c1" createdBy="me" defaultDate={new Date(2026, 8, 10)} onClose={jest.fn()} onSaved={jest.fn()} />,
    );

    await user.type(screen.getByPlaceholderText("Titolo (es. Cena da Marco)"), "Terapia");
    await user.selectOptions(screen.getByRole("combobox", { name: "Ripeti" }), "giornaliera");
    await user.click(screen.getByRole("radio", { name: "Dopo" }));
    const countInput = screen.getByRole("spinbutton", { name: "Numero di volte" });
    expect(countInput).toHaveAttribute("max", "10");
    await user.clear(countInput);
    await user.type(countInput, "50");
    await user.click(screen.getByRole("button", { name: "Crea evento" }));

    await waitFor(() => expect(mockCreateCalendarEvent).toHaveBeenCalledTimes(1));
    expect(mockCreateCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({ recurrenceCount: 10 }));
  });

  it("in modifica di un evento ricorrente, i campi sono precompilati da initial", () => {
    const initial = makeEventRow({
      recurrence: "settimanale",
      recurrence_interval: 2,
      // Costruito con lo stesso schema (locale, non un letterale "Z" già in
      // UTC) del componente reale (`new Date(\`${date}T23:59:59\`)`), così il
      // test resta deterministico a prescindere dal fuso orario di chi lo
      // esegue — vedi la nota sui timestamp in DayTimeline.test.tsx.
      recurrence_until: new Date("2026-12-15T23:59:59").toISOString(),
    });
    render(
      <EventFormModal
        coupleId="c1"
        createdBy="me"
        defaultDate={new Date(initial.starts_at)}
        mode="edit"
        initial={initial}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Ripeti" })).toHaveValue("settimanale");
    expect(screen.getByRole("spinbutton", { name: "Ogni quante unità" })).toHaveValue(2);
    expect(screen.getByRole("radio", { name: "Fino al" })).toBeChecked();
    expect(screen.getByLabelText("Data di fine ricorrenza")).toHaveValue("2026-12-15");
  });
});
