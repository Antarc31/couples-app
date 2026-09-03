/**
 * Unit test per components/calendar/SlotSuggestions.tsx — blocco condiviso
 * "quanto tempo ti serve?" + risultati, parte del piano "buchi comuni" (vedi
 * /Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md).
 *
 * Copre: lo step "scegli una durata" viene prima di qualunque fetch, la
 * scelta della durata interroga listCoupleEventsInRange con from/daysAhead
 * corretti, uno slot scelto chiama onPick con `end = start + durata scelta`
 * — MAI l'intera fascia libera trovata (requisito esplicito dell'utente:
 * "magari uno non vuole coprire tutta la fascia libera") — e che
 * excludeEventId tolga l'evento in modifica dal calcolo. lib/calendar-dates.ts
 * NON è mockato (funzioni pure, già testate a parte in
 * tests/lib/calendar-dates.test.ts): qui verifichiamo solo l'orchestrazione
 * della UI attorno a listCoupleEventsInRange, che invece è mockato — stesso
 * pattern di tests/components/calendar/EventDetailSheet.test.tsx.
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
}));

import SlotSuggestions from "@/components/calendar/SlotSuggestions";

beforeEach(() => {
  mockListCoupleEventsInRange.mockReset();
});

// Giorno completamente vuoto: dalle 06:00 (DAY_START_HOUR) fino a mezzanotte
// del giorno dopo, un'unica fascia libera lunghissima — comoda per isolare
// "quanto tempo ti serve" dal calcolo delle fasce vero e proprio (già
// coperto a parte in tests/lib/calendar-dates.test.ts).
const from = new Date(2026, 5, 10, 6, 0);

describe("SlotSuggestions — step 1: scelta della durata", () => {
  it("mostra i chip di durata rapida come primo step, prima di qualunque fetch", () => {
    render(<SlotSuggestions coupleId="c1" from={from} daysAhead={1} onPick={jest.fn()} />);

    expect(screen.getByText("Quanto tempo ti serve?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 min" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 ora" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1h 30" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 ore" })).toBeInTheDocument();
    expect(mockListCoupleEventsInRange).not.toHaveBeenCalled();
  });
});

describe("SlotSuggestions — step 2: risultati", () => {
  it("selezionando una durata interroga listCoupleEventsInRange con coupleId/from/daysAhead e mostra i risultati", async () => {
    mockListCoupleEventsInRange.mockResolvedValue([]);
    render(<SlotSuggestions coupleId="c1" from={from} daysAhead={14} onPick={jest.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "1 ora" }));

    await waitFor(() => expect(mockListCoupleEventsInRange).toHaveBeenCalledWith("c1", from, new Date(2026, 5, 24, 6, 0)));
    expect(await screen.findByText("Slot liberi da 1 ora")).toBeInTheDocument();
    // Nessun evento in 14 giorni -> ogni giorno è interamente libero (06:00 -> mezzanotte).
    expect(screen.getAllByText("06:00 – 00:00").length).toBe(14);
  });

  it("mostra un messaggio esplicito quando non trova nessuno slot libero", async () => {
    mockListCoupleEventsInRange.mockResolvedValue([
      { starts_at: "2026-06-10T00:00:00", ends_at: null, all_day: true },
    ]);
    render(<SlotSuggestions coupleId="c1" from={from} daysAhead={1} onPick={jest.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "30 min" }));

    expect(await screen.findByText("Nessuno slot libero trovato, prova una durata più corta.")).toBeInTheDocument();
  });

  it("mostra l'errore se il fetch fallisce", async () => {
    mockListCoupleEventsInRange.mockResolvedValue({ error: "Errore di rete" });
    render(<SlotSuggestions coupleId="c1" from={from} daysAhead={1} onPick={jest.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "30 min" }));

    expect(await screen.findByText("Errore di rete")).toBeInTheDocument();
  });

  it("esclude excludeEventId dagli eventi considerati (l'evento in modifica non conta come impegno contro se stesso)", async () => {
    // Un evento all_day che occuperebbe l'intera giornata, ma è proprio
    // quello in modifica (stesso id passato come excludeEventId): deve
    // essere ignorato, la giornata deve risultare comunque libera.
    mockListCoupleEventsInRange.mockResolvedValue([
      { id: "self", starts_at: "2026-06-10T00:00:00", ends_at: null, all_day: true },
    ]);
    render(<SlotSuggestions coupleId="c1" from={from} daysAhead={1} excludeEventId="self" onPick={jest.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "30 min" }));

    expect(await screen.findByText("06:00 – 00:00")).toBeInTheDocument();
    expect(screen.queryByText("Nessuno slot libero trovato, prova una durata più corta.")).not.toBeInTheDocument();
  });

  it("tap su un risultato chiama onPick con end = start + durata scelta, MAI l'intera fascia libera trovata", async () => {
    mockListCoupleEventsInRange.mockResolvedValue([]);
    const onPick = jest.fn();
    render(<SlotSuggestions coupleId="c1" from={from} daysAhead={1} onPick={onPick} />);

    await userEvent.click(screen.getByRole("button", { name: "30 min" }));
    const result = await screen.findByRole("button", { name: /06:00/ });
    await userEvent.click(result);

    expect(onPick).toHaveBeenCalledTimes(1);
    const [start, end] = onPick.mock.calls[0];
    expect(start.getTime()).toBe(new Date(2026, 5, 10, 6, 0).getTime());
    // 30 minuti dopo, non mezzanotte (fine reale dell'intera fascia libera trovata).
    expect(end.getTime()).toBe(new Date(2026, 5, 10, 6, 30).getTime());
  });

  it("'Cambia durata' torna al picker e scarta i risultati precedenti", async () => {
    mockListCoupleEventsInRange.mockResolvedValue([]);
    render(<SlotSuggestions coupleId="c1" from={from} daysAhead={1} onPick={jest.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "30 min" }));
    expect(await screen.findByText("06:00 – 00:00")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cambia durata" }));

    expect(screen.getByText("Quanto tempo ti serve?")).toBeInTheDocument();
    expect(screen.queryByText("06:00 – 00:00")).not.toBeInTheDocument();
  });
});
