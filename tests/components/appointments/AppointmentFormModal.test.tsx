/**
 * Unit test per components/appointments/AppointmentFormModal.tsx — SOLO il
 * pezzo aggiunto dal piano "buchi comuni" (vedi
 * /Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md):
 * il controllo automatico di sovrapposizione, versione puntuale
 * (momentIsBusy, non overlapsAnyEvent) perché questo form non raccoglie mai
 * un orario di fine. Non esisteva ancora un test file per questo componente
 * prima di questo piano — copre solo l'orchestrazione nuova, non l'intero
 * form (creazione idea/confermato/trasforma/modifica, già coperti
 * indirettamente da tests/lib/appointments-actions.test.ts e da
 * tests/components/appointments/AppointmentsView.test.tsx).
 *
 * lib/calendar-actions.ts (listCoupleEventsInRange) e lib/supabase/client
 * (per la derivazione di coupleId via auth.getUser()+profiles) sono
 * mockati. lib/calendar-dates.ts (momentIsBusy) NON è mockato — già testato
 * a parte in tests/lib/calendar-dates.test.ts.
 *
 * Vedi tests/lib/auth-actions.test.ts per il perché si usa il `jest` globale
 * ambient, e tests/components/home/ThoughtsSection.test.tsx per la
 * convenzione sui nomi `mock*` richiesta dall'hoisting di jest.mock.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActionError } from "@/lib/calendar-actions";
import type { BusyEvent } from "@/lib/calendar-dates";

const mockListCoupleEventsInRange = jest.fn<Promise<BusyEvent[] | ActionError>, [string, Date, Date]>();

jest.mock("@/lib/calendar-actions", () => ({
  listCoupleEventsInRange: (...args: [string, Date, Date]) => mockListCoupleEventsInRange(...args),
  updateCalendarEvent: jest.fn(),
}));

jest.mock("@/lib/appointments-actions", () => ({
  createAppointmentIdea: jest.fn(),
  createConfirmedAppointment: jest.fn(),
  confirmAppointment: jest.fn(),
  updateAppointment: jest.fn(),
}));

const mockGetUser = jest.fn<Promise<{ data: { user: { id: string } | null } }>, []>();
const mockMaybeSingle = jest.fn<Promise<{ data: { couple_id: string | null } | null }>, []>();
const mockFrom = jest.fn((table: string) => {
  if (table === "profiles") {
    return { select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) };
  }
  throw new Error(`tabella inattesa nel test: ${table}`);
});

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: mockGetUser }, from: mockFrom }),
}));

import AppointmentFormModal from "@/components/appointments/AppointmentFormModal";

beforeEach(() => {
  mockListCoupleEventsInRange.mockReset();
  mockListCoupleEventsInRange.mockResolvedValue([]);
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: "me" } } });
  mockMaybeSingle.mockReset();
  mockMaybeSingle.mockResolvedValue({ data: { couple_id: "c1" } });
});

describe("AppointmentFormModal — modalità 'idea' (senza data/ora)", () => {
  it("non deriva coupleId né interroga listCoupleEventsInRange: il form non ha campi data/ora", async () => {
    render(<AppointmentFormModal mode="idea" onClose={jest.fn()} onSaved={jest.fn()} />);

    expect(screen.queryByRole("button", { name: /Suggerisci slot orario/ })).not.toBeInTheDocument();
    await waitFor(() => {}); // lascia girare eventuali microtask pendenti
    expect(mockListCoupleEventsInRange).not.toHaveBeenCalled();
  });
});

describe("AppointmentFormModal — modalità 'confermato' (con data/ora): controllo automatico di sovrapposizione", () => {
  it("nessun avviso se il momento scelto non è occupato", async () => {
    mockListCoupleEventsInRange.mockResolvedValue([]);
    render(<AppointmentFormModal mode="confirmed" onClose={jest.fn()} onSaved={jest.fn()} />);

    await waitFor(() => expect(mockListCoupleEventsInRange).toHaveBeenCalledWith("c1", expect.any(Date), expect.any(Date)));
    expect(screen.queryByText(/Si sovrappone/)).not.toBeInTheDocument();
  });

  it("mostra l'avviso quando il momento scelto cade dentro un impegno esistente", async () => {
    // Default del form (mode 'confirmed', creazione): ora 20:00. Impegno
    // esistente 19:30–20:30 dello stesso giorno -> 20:00 ci cade dentro.
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    mockListCoupleEventsInRange.mockResolvedValue([
      { id: "busy", starts_at: `${y}-${m}-${d}T19:30:00`, ends_at: `${y}-${m}-${d}T20:30:00`, all_day: false },
    ]);
    render(<AppointmentFormModal mode="confirmed" onClose={jest.fn()} onSaved={jest.fn()} />);

    expect(await screen.findByText("⚠️ Si sovrappone a un impegno già in calendario")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggerisci slot orario" })).toBeInTheDocument();
  });

  it("'Suggerisci slot orario' espande i chip di durata (stesso blocco condiviso SlotSuggestions)", async () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    mockListCoupleEventsInRange.mockResolvedValue([
      { id: "busy", starts_at: `${y}-${m}-${d}T19:30:00`, ends_at: `${y}-${m}-${d}T20:30:00`, all_day: false },
    ]);
    const user = userEvent.setup();
    render(<AppointmentFormModal mode="confirmed" onClose={jest.fn()} onSaved={jest.fn()} />);

    await screen.findByText("⚠️ Si sovrappone a un impegno già in calendario");
    await user.click(screen.getByRole("button", { name: "Suggerisci slot orario" }));

    expect(screen.getByText("Quanto tempo ti serve?")).toBeInTheDocument();
  });

  it("in modifica di un confermato, l'appuntamento aperto non genera un falso conflitto con se stesso (escluso per calendarEventId)", async () => {
    const initialEvent = { startsAt: "2026-09-10T20:00:00.000Z", endsAt: "2026-09-10T21:00:00.000Z", allDay: false };
    const initial = {
      id: "ap1",
      coupleId: "c1",
      createdBy: "me",
      title: "Cena",
      location: null,
      cost: null,
      notes: null,
      photoUrl: null,
      tag: null,
      status: "confermato" as const,
      calendarEventId: "ev1",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    // La query ritorna ANCHE la riga collegata a questo stesso appuntamento
    // (come farebbe davvero Supabase): deve essere filtrata via calendarEventId.
    mockListCoupleEventsInRange.mockResolvedValue([
      { id: "ev1", starts_at: initialEvent.startsAt, ends_at: initialEvent.endsAt, all_day: false },
    ]);
    render(
      <AppointmentFormModal
        mode="edit"
        initial={initial}
        initialEvent={initialEvent}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockListCoupleEventsInRange).toHaveBeenCalled());
    expect(screen.queryByText(/Si sovrappone/)).not.toBeInTheDocument();
  });
});
