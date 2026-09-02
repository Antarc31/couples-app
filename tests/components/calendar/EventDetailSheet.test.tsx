/**
 * Unit test per components/calendar/EventDetailSheet.tsx — piano UX
 * "Gruppo Calendario/Appuntamenti", punto 3 (dettaglio/modifica/elimina
 * evento — prima non si poteva fare nessuna delle due).
 *
 * Copre: canEdit lato client (creatore sempre, partner solo per categoria
 * 'coppia' — stesso contratto della RLS calendar_events_update_own_or_couple_category
 * / _delete_own_or_couple_category, vedi supabase/migrations/
 * 20260831120100_calendar_events.sql — qui testiamo solo che la UI
 * rispecchi quel contratto, non la RLS stessa, già verificata altrove), il
 * flusso "Modifica" (chiama onEdit), e la conferma a due step prima della
 * delete (niente window.confirm): un primo tap su "Elimina" NON deve
 * cancellare nulla, serve un secondo tap su "Conferma eliminazione".
 *
 * lib/calendar-actions.ts è mockato: qui non testiamo Supabase/RLS (vedi
 * tests/lib/calendar-actions.test.ts per quello), solo l'orchestrazione
 * della UI. Vedi tests/lib/auth-actions.test.ts per il perché si usa il
 * `jest` globale ambient (non `import { jest } from "@jest/globals"`), e
 * tests/components/home/ThoughtsSection.test.tsx per la convenzione sui
 * nomi `mock*` richiesta dall'hoisting di jest.mock.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ColorContext } from "@/lib/calendar-colors";
import type { Database } from "@/types/database";
import type { ActionError } from "@/lib/calendar-actions";

type CalendarEventRow = Database["public"]["Tables"]["calendar_events"]["Row"];

const mockDeleteCalendarEvent = jest.fn<Promise<true | ActionError>, [string]>();

jest.mock("@/lib/calendar-actions", () => ({
  deleteCalendarEvent: (...args: [string]) => mockDeleteCalendarEvent(...args),
}));

import EventDetailSheet from "@/components/calendar/EventDetailSheet";

function makeEvent(overrides: Partial<CalendarEventRow> = {}): CalendarEventRow {
  return {
    id: "ev1",
    couple_id: "c1",
    created_by: "me",
    title: "Cena da Marco",
    tag: "ristorante",
    notes: null,
    category: "personale",
    starts_at: "2026-09-10T20:00:00.000Z",
    ends_at: "2026-09-10T22:00:00.000Z",
    all_day: false,
    recurrence: "nessuna",
    is_shared_with_partner: false,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const ctx: ColorContext = { selfId: "me", selfColor: "#F7A6C4", partnerId: "partner-1", partnerColor: "#A6C8F0" };

beforeEach(() => {
  mockDeleteCalendarEvent.mockReset();
});

describe("EventDetailSheet — canEdit", () => {
  it("mostra Modifica/Elimina per il creatore dell'evento", () => {
    const event = makeEvent({ created_by: "me", category: "personale" });
    render(<EventDetailSheet event={event} selfId="me" colorCtx={ctx} onClose={jest.fn()} onEdit={jest.fn()} onDeleted={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Modifica" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elimina" })).toBeInTheDocument();
  });

  it("nasconde Modifica/Elimina per il partner su un evento 'personale' altrui", () => {
    const event = makeEvent({ created_by: "partner-1", category: "personale" });
    render(<EventDetailSheet event={event} selfId="me" colorCtx={ctx} onClose={jest.fn()} onEdit={jest.fn()} onDeleted={jest.fn()} />);

    expect(screen.queryByRole("button", { name: "Modifica" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elimina" })).not.toBeInTheDocument();
    expect(screen.getByText(/Solo chi ha creato questo evento/)).toBeInTheDocument();
  });

  it("mostra Modifica/Elimina per il partner su un evento categoria 'coppia' (condiviso per natura)", () => {
    const event = makeEvent({ created_by: "partner-1", category: "coppia" });
    render(<EventDetailSheet event={event} selfId="me" colorCtx={ctx} onClose={jest.fn()} onEdit={jest.fn()} onDeleted={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Modifica" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elimina" })).toBeInTheDocument();
  });
});

describe("EventDetailSheet — Modifica", () => {
  it("chiama onEdit al tap su 'Modifica' senza toccare Supabase", async () => {
    const user = userEvent.setup();
    const onEdit = jest.fn();
    const event = makeEvent();
    render(<EventDetailSheet event={event} selfId="me" colorCtx={ctx} onClose={jest.fn()} onEdit={onEdit} onDeleted={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: "Modifica" }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(mockDeleteCalendarEvent).not.toHaveBeenCalled();
  });
});

describe("EventDetailSheet — Elimina (conferma a due step)", () => {
  it("il primo tap su 'Elimina' mostra la conferma ma NON cancella nulla", async () => {
    const user = userEvent.setup();
    const onDeleted = jest.fn();
    const event = makeEvent();
    render(<EventDetailSheet event={event} selfId="me" colorCtx={ctx} onClose={jest.fn()} onEdit={jest.fn()} onDeleted={onDeleted} />);

    await user.click(screen.getByRole("button", { name: "Elimina" }));

    expect(mockDeleteCalendarEvent).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByText("Eliminare definitivamente questo evento?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conferma eliminazione" })).toBeInTheDocument();
  });

  it("'Annulla' nel passo di conferma torna indietro senza cancellare", async () => {
    const user = userEvent.setup();
    const event = makeEvent();
    render(<EventDetailSheet event={event} selfId="me" colorCtx={ctx} onClose={jest.fn()} onEdit={jest.fn()} onDeleted={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: "Elimina" }));
    await user.click(screen.getByRole("button", { name: "Annulla" }));

    expect(mockDeleteCalendarEvent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Elimina" })).toBeInTheDocument();
  });

  it("il secondo tap ('Conferma eliminazione') chiama deleteCalendarEvent e poi onDeleted", async () => {
    mockDeleteCalendarEvent.mockResolvedValue(true);
    const user = userEvent.setup();
    const onDeleted = jest.fn();
    const event = makeEvent({ id: "ev42" });
    render(<EventDetailSheet event={event} selfId="me" colorCtx={ctx} onClose={jest.fn()} onEdit={jest.fn()} onDeleted={onDeleted} />);

    await user.click(screen.getByRole("button", { name: "Elimina" }));
    await user.click(screen.getByRole("button", { name: "Conferma eliminazione" }));

    expect(mockDeleteCalendarEvent).toHaveBeenCalledWith("ev42");
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("mostra il messaggio d'errore e NON chiama onDeleted se la delete fallisce (es. RLS)", async () => {
    mockDeleteCalendarEvent.mockResolvedValue({ error: "Non autorizzato" });
    const user = userEvent.setup();
    const onDeleted = jest.fn();
    const event = makeEvent();
    render(<EventDetailSheet event={event} selfId="me" colorCtx={ctx} onClose={jest.fn()} onEdit={jest.fn()} onDeleted={onDeleted} />);

    await user.click(screen.getByRole("button", { name: "Elimina" }));
    await user.click(screen.getByRole("button", { name: "Conferma eliminazione" }));

    expect(screen.getByText("Non autorizzato")).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe("EventDetailSheet — dettagli mostrati", () => {
  it("mostra orario, categoria, tag e note quando presenti", () => {
    const event = makeEvent({ notes: "Portare il vino", tag: "ristorante", category: "coppia" });
    render(<EventDetailSheet event={event} selfId="me" colorCtx={ctx} onClose={jest.fn()} onEdit={jest.fn()} onDeleted={jest.fn()} />);

    expect(screen.getByText(event.title)).toBeInTheDocument();
    expect(screen.getByText(/Di coppia/)).toBeInTheDocument();
    expect(screen.getByText(/ristorante/)).toBeInTheDocument();
    expect(screen.getByText(/Portare il vino/)).toBeInTheDocument();
  });

  it("mostra 'Tutto il giorno' per un evento all_day", () => {
    const event = makeEvent({ all_day: true, ends_at: null });
    render(<EventDetailSheet event={event} selfId="me" colorCtx={ctx} onClose={jest.fn()} onEdit={jest.fn()} onDeleted={jest.fn()} />);

    expect(screen.getByText(/Tutto il giorno/)).toBeInTheDocument();
  });

  it("chiama onClose al tap sulla ✕", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<EventDetailSheet event={makeEvent()} selfId="me" colorCtx={ctx} onClose={onClose} onEdit={jest.fn()} onDeleted={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("nessun badge di ricorrenza per un evento non ricorrente", () => {
    const event = makeEvent({ recurrence: "nessuna" });
    render(<EventDetailSheet event={event} selfId="me" colorCtx={ctx} onClose={jest.fn()} onEdit={jest.fn()} onDeleted={jest.fn()} />);

    expect(screen.queryByText(/Si ripete/)).not.toBeInTheDocument();
  });

  it("mostra 'Si ripete ogni anno' per un evento con recurrence='annuale' (compleanno/anniversario)", () => {
    const event = makeEvent({ title: "Anniversario", category: "speciale", recurrence: "annuale" });
    render(<EventDetailSheet event={event} selfId="me" colorCtx={ctx} onClose={jest.fn()} onEdit={jest.fn()} onDeleted={jest.fn()} />);

    expect(screen.getByText(/Si ripete ogni anno/)).toBeInTheDocument();
  });

  it("mostra 'Si ripete ogni mese' per un evento con recurrence='mensile' (mesiversario)", () => {
    const event = makeEvent({ title: "Mesiversario", category: "speciale", recurrence: "mensile" });
    render(<EventDetailSheet event={event} selfId="me" colorCtx={ctx} onClose={jest.fn()} onEdit={jest.fn()} onDeleted={jest.fn()} />);

    expect(screen.getByText(/Si ripete ogni mese/)).toBeInTheDocument();
  });
});
