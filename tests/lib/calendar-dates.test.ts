/**
 * Unit test per lib/calendar-dates.ts — helper puri di date per il
 * Calendario (nessuna dipendenza da Supabase/rete, quindi nessun mock
 * necessario). Copre la logica non banale: griglia mese con code dei mesi
 * adiacenti, calcolo differenza in giorni "a calendario" (non a millisecondi
 * grezzi, per evitare bug da DST), e la prossima occorrenza per eventi
 * ricorrenti annuali (compleanni/anniversari).
 */

import {
  addDays,
  addMonths,
  DAY_END_HOUR,
  DAY_START_HOUR,
  daysBetween,
  findFreeSlotsForDay,
  findUpcomingFreeSlots,
  formatWeekRangeLabel,
  isSameDay,
  momentIsBusy,
  monthGrid,
  nextMilestone,
  nextOccurrence,
  overlapsAnyEvent,
  projectOccurrences,
  startOfDay,
  startOfWeek,
  toDateKey,
  weekDays,
  type BusyEvent,
} from "@/lib/calendar-dates";

describe("toDateKey", () => {
  it("formatta yyyy-mm-dd in ora locale, non UTC", () => {
    // 23:30 locale del 5 gennaio non deve "scivolare" al 6 se convertito in UTC.
    const d = new Date(2026, 0, 5, 23, 30);
    expect(toDateKey(d)).toBe("2026-01-05");
  });

  it("fa lo zero-padding di mese e giorno", () => {
    const d = new Date(2026, 2, 4); // 4 marzo 2026
    expect(toDateKey(d)).toBe("2026-03-04");
  });
});

describe("startOfDay", () => {
  it("azzera ore/minuti/secondi/millisecondi mantenendo il giorno", () => {
    const d = new Date(2026, 5, 10, 18, 45, 30, 500);
    const r = startOfDay(d);
    expect(toDateKey(r)).toBe(toDateKey(d));
    expect(r.getHours()).toBe(0);
    expect(r.getMinutes()).toBe(0);
    expect(r.getSeconds()).toBe(0);
    expect(r.getMilliseconds()).toBe(0);
  });
});

describe("addDays / addMonths", () => {
  it("addDays avanza attraverso il cambio mese", () => {
    const d = new Date(2026, 0, 30); // 30 gennaio
    expect(toDateKey(addDays(d, 3))).toBe("2026-02-02");
  });

  it("addDays con delta negativo va indietro", () => {
    const d = new Date(2026, 1, 2);
    expect(toDateKey(addDays(d, -3))).toBe("2026-01-30");
  });

  it("addMonths si ancora al giorno 1 per evitare overflow di fine mese", () => {
    // 31 gennaio + 1 mese: se non si ancorasse al giorno 1, Date "trabocca"
    // a marzo (perché febbraio non ha 31 giorni).
    const d = new Date(2026, 0, 31);
    expect(toDateKey(addMonths(d, 1))).toBe("2026-02-01");
  });

  it("addMonths con delta negativo torna indietro di mese", () => {
    const d = new Date(2026, 2, 15);
    expect(toDateKey(addMonths(d, -1))).toBe("2026-02-01");
  });
});

describe("isSameDay", () => {
  it("true per stessa data anche con orari diversi", () => {
    const a = new Date(2026, 3, 1, 8, 0);
    const b = new Date(2026, 3, 1, 22, 0);
    expect(isSameDay(a, b)).toBe(true);
  });

  it("false per giorni diversi", () => {
    const a = new Date(2026, 3, 1);
    const b = new Date(2026, 3, 2);
    expect(isSameDay(a, b)).toBe(false);
  });
});

describe("monthGrid", () => {
  it("ritorna 6 settimane di 7 giorni ciascuna", () => {
    const weeks = monthGrid(new Date(2026, 1, 15)); // febbraio 2026
    expect(weeks).toHaveLength(6);
    weeks.forEach((week) => expect(week).toHaveLength(7));
  });

  it("ogni settimana inizia di lunedì", () => {
    const weeks = monthGrid(new Date(2026, 1, 15));
    weeks.forEach((week) => {
      // getDay(): 1 = lunedì
      expect(week[0].getDay()).toBe(1);
    });
  });

  it("include le code del mese precedente/successivo per riempire la griglia", () => {
    // Febbraio 2026 inizia di domenica 1: la prima cella della prima
    // settimana deve quindi essere lunedì 26 gennaio (coda mese precedente).
    const weeks = monthGrid(new Date(2026, 1, 15));
    expect(toDateKey(weeks[0][0])).toBe("2026-01-26");
  });

  it("la griglia è una sequenza continua di 42 giorni consecutivi", () => {
    const weeks = monthGrid(new Date(2026, 5, 1));
    const days = weeks.flat();
    for (let i = 1; i < days.length; i++) {
      expect(toDateKey(addDays(days[i - 1], 1))).toBe(toDateKey(days[i]));
    }
  });
});

describe("startOfWeek / weekDays", () => {
  it("startOfWeek ritorna il lunedì della settimana, a mezzanotte", () => {
    const d = new Date(2026, 8, 10, 15, 30); // giovedì 10 settembre 2026
    const start = startOfWeek(d);
    expect(toDateKey(start)).toBe("2026-09-07"); // lunedì
    expect(start.getHours()).toBe(0);
  });

  it("startOfWeek su un lunedì ritorna lo stesso giorno", () => {
    const monday = new Date(2026, 8, 7);
    expect(toDateKey(startOfWeek(monday))).toBe("2026-09-07");
  });

  it("startOfWeek gestisce correttamente la domenica (fine settimana, non inizio)", () => {
    const sunday = new Date(2026, 8, 13);
    expect(toDateKey(startOfWeek(sunday))).toBe("2026-09-07");
  });

  it("weekDays ritorna 7 giorni consecutivi che iniziano di lunedì", () => {
    const days = weekDays(new Date(2026, 8, 10));
    expect(days).toHaveLength(7);
    expect(toDateKey(days[0])).toBe("2026-09-07");
    expect(toDateKey(days[6])).toBe("2026-09-13");
    for (let i = 1; i < days.length; i++) {
      expect(toDateKey(addDays(days[i - 1], 1))).toBe(toDateKey(days[i]));
    }
  });

  it("weekDays a cavallo di un cambio mese", () => {
    // Domenica 4 ottobre 2026 -> la settimana inizia lunedì 28 settembre.
    const days = weekDays(new Date(2026, 9, 4));
    expect(toDateKey(days[0])).toBe("2026-09-28");
    expect(toDateKey(days[6])).toBe("2026-10-04");
  });
});

describe("formatWeekRangeLabel", () => {
  it("stesso mese: '8 – 14 settembre 2026'", () => {
    const label = formatWeekRangeLabel(new Date(2026, 8, 7), new Date(2026, 8, 13));
    expect(label).toBe("7 – 13 settembre 2026");
  });

  it("mesi diversi, stesso anno: usa il mese abbreviato su entrambi i lati", () => {
    const label = formatWeekRangeLabel(new Date(2026, 8, 28), new Date(2026, 9, 4));
    expect(label).toContain("set");
    expect(label).toContain("ott");
    expect(label).toContain("2026");
  });

  it("a cavallo di due anni: l'anno compare su entrambi i lati", () => {
    const label = formatWeekRangeLabel(new Date(2026, 11, 28), new Date(2027, 0, 3));
    expect(label).toContain("2026");
    expect(label).toContain("2027");
  });
});

describe("daysBetween", () => {
  it("conta i giorni di calendario tra due date, ignorando l'ora", () => {
    const from = new Date(2026, 0, 1, 23, 59);
    const to = new Date(2026, 0, 3, 0, 1);
    expect(daysBetween(from, to)).toBe(2);
  });

  it("ritorna un numero negativo se `to` precede `from`", () => {
    const from = new Date(2026, 0, 5);
    const to = new Date(2026, 0, 1);
    expect(daysBetween(from, to)).toBe(-4);
  });

  it("ritorna 0 per lo stesso giorno", () => {
    const from = new Date(2026, 0, 1, 3, 0);
    const to = new Date(2026, 0, 1, 21, 0);
    expect(daysBetween(from, to)).toBe(0);
  });
});

describe("nextOccurrence", () => {
  it("senza ricorrenza ('nessuna') ritorna semplicemente la data originale", () => {
    const iso = "2026-03-10T18:00:00.000Z";
    const result = nextOccurrence(iso, "nessuna", new Date(2026, 5, 1));
    expect(result.toISOString()).toBe(new Date(iso).toISOString());
  });

  it("ricorrenza annuale: se la data di quest'anno è già passata, salta al prossimo anno", () => {
    // Compleanno il 14 maggio; "oggi" è il 1 giugno 2026 -> prossima
    // occorrenza deve essere il 14 maggio 2027.
    const from = new Date(2026, 5, 1);
    const result = nextOccurrence("2020-05-14T10:00:00", "annuale", from);
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(4); // maggio (0-indexed)
    expect(result.getDate()).toBe(14);
  });

  it("ricorrenza annuale: se la data di quest'anno non è ancora arrivata, resta sull'anno corrente", () => {
    // "oggi" è il 1 giugno 2026, il compleanno di dicembre non è ancora passato.
    const from = new Date(2026, 5, 1);
    const result = nextOccurrence("2020-12-25T10:00:00", "annuale", from);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(11);
    expect(result.getDate()).toBe(25);
  });

  it("ricorrenza annuale: il giorno stesso, alla stessa ora esatta, non fa scattare il salto d'anno (confronto è '<', non '<=')", () => {
    // "oggi" è esattamente il giorno e l'ora della ricorrenza: candidate e
    // now coincidono al millisecondo, quindi non deve scattare l'incremento
    // di anno (altrimenti l'evento sparirebbe dal giorno stesso in cui cade).
    const from = new Date(2026, 4, 14, 0, 0, 0, 0);
    const result = nextOccurrence("2020-05-14T00:00:00", "annuale", from);
    expect(result.getFullYear()).toBe(2026);
  });

  it("ricorrenza mensile: se il giorno di questo mese è già passato, salta al mese successivo", () => {
    // Mesiversario il 5; "oggi" è il 20 giugno 2026 -> prossima occorrenza
    // il 5 luglio 2026.
    const from = new Date(2026, 5, 20);
    const result = nextOccurrence("2025-01-05T09:00:00", "mensile", from);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6); // luglio
    expect(result.getDate()).toBe(5);
  });

  it("ricorrenza mensile: se il giorno di questo mese non è ancora arrivato, resta sul mese corrente", () => {
    const from = new Date(2026, 5, 3);
    const result = nextOccurrence("2025-01-20T09:00:00", "mensile", from);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(5); // giugno
    expect(result.getDate()).toBe(20);
  });

  it("ricorrenza mensile: clamp di fine mese, avvio 31 gennaio -> 28 febbraio (anno non bisestile)", () => {
    // "oggi" è il 15 febbraio 2026 (non bisestile) -> la prossima occorrenza
    // di un mesiversario ancorato al 31 deve clampare al 28 febbraio, non
    // traboccare a marzo.
    const from = new Date(2026, 1, 15);
    const result = nextOccurrence("2024-01-31T12:00:00", "mensile", from);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(1); // febbraio
    expect(result.getDate()).toBe(28);
  });
});

describe("projectOccurrences", () => {
  it("'nessuna': ritorna la data letterale se cade nel range", () => {
    const result = projectOccurrences("2026-06-10T10:00:00", "nessuna", new Date(2026, 5, 1), new Date(2026, 5, 30));
    expect(result).toHaveLength(1);
    expect(toDateKey(result[0])).toBe("2026-06-10");
  });

  it("'nessuna': array vuoto se la data letterale è fuori dal range", () => {
    const result = projectOccurrences("2026-08-10T10:00:00", "nessuna", new Date(2026, 5, 1), new Date(2026, 5, 30));
    expect(result).toHaveLength(0);
  });

  it("'annuale': in-range — l'occorrenza dell'anno corrente compare anche se starts_at è di anni fa", () => {
    // Compleanno nato nel 2001, range = giugno 2026 -> deve trovare
    // l'occorrenza del 15 giugno 2026, non quella letterale del 2001.
    const result = projectOccurrences(
      "2001-06-15T00:00:00",
      "annuale",
      new Date(2026, 5, 1),
      new Date(2026, 5, 30),
    );
    expect(result).toHaveLength(1);
    expect(toDateKey(result[0])).toBe("2026-06-15");
  });

  it("'annuale': fuori-range — nessuna occorrenza se il giorno/mese non cade nella finestra", () => {
    const result = projectOccurrences(
      "2001-11-02T00:00:00",
      "annuale",
      new Date(2026, 5, 1),
      new Date(2026, 5, 30),
    );
    expect(result).toHaveLength(0);
  });

  it("'annuale': un range a cavallo di capodanno trova comunque l'occorrenza (±1 anno sui bordi)", () => {
    // Range dal 20 dicembre 2026 al 10 gennaio 2027, evento ancorato al 25
    // dicembre -> deve trovare il 25 dicembre 2026 anche se l'anno del
    // rangeEnd è il 2027.
    const result = projectOccurrences(
      "2010-12-25T00:00:00",
      "annuale",
      new Date(2026, 11, 20),
      new Date(2027, 0, 10),
    );
    expect(result).toHaveLength(1);
    expect(toDateKey(result[0])).toBe("2026-12-25");
  });

  it("'mensile': più occorrenze in un range di 6 settimane (giorno 1 e giorno 31 della finestra)", () => {
    // Range dal 20 gennaio al 3 marzo 2026 (~6 settimane): un mesiversario
    // ancorato al giorno 1 cade sia l'1 febbraio sia l'1 marzo -> 2 occorrenze.
    const result = projectOccurrences(
      "2024-05-01T08:00:00",
      "mensile",
      new Date(2026, 0, 20),
      new Date(2026, 2, 3),
    );
    const keys = result.map(toDateKey).sort();
    expect(keys).toEqual(["2026-02-01", "2026-03-01"]);
  });

  it("'mensile': clamp fine mese — avvio 31 gennaio produce 28/29 febbraio dentro il range, non trabocca a marzo", () => {
    const result = projectOccurrences(
      "2024-01-31T08:00:00",
      "mensile",
      new Date(2026, 1, 1),
      new Date(2026, 1, 28),
    );
    expect(result).toHaveLength(1);
    expect(toDateKey(result[0])).toBe("2026-02-28"); // 2026 non è bisestile
  });

  it("'mensile': array vuoto se il range non contiene nessun mese valido", () => {
    const result = projectOccurrences(
      "2024-05-15T08:00:00",
      "mensile",
      new Date(2026, 5, 1),
      new Date(2026, 5, 5),
    );
    expect(result).toHaveLength(0);
  });
});

describe("nextMilestone", () => {
  it("ritorna la prima soglia fissa non ancora raggiunta", () => {
    // Relazione iniziata 10 giorni fa -> prossima soglia è 30 giorni.
    const start = addDays(new Date(2026, 0, 1), 0).toISOString();
    const result = nextMilestone(start, new Date(2026, 0, 11));
    expect(result).toEqual({ days: 30, occursOn: new Date(2026, 0, 31) });
  });

  it("ritorna la soglia stessa quando cade esattamente oggi (daysUntil 0 dal chiamante)", () => {
    const start = new Date(2026, 0, 1).toISOString();
    const result = nextMilestone(start, new Date(2026, 0, 8)); // esattamente 7 giorni dopo
    expect(result).toEqual({ days: 7, occursOn: new Date(2026, 0, 8) });
  });

  it("oltre l'ultima soglia fissa, continua di anno in anno (365*n)", () => {
    const start = new Date(2010, 0, 1).toISOString();
    // 2026-06-01 è ben oltre 3650 giorni (~16 anni) dopo l'inizio.
    const result = nextMilestone(start, new Date(2026, 5, 1));
    expect(result?.days).toBeGreaterThan(3650);
    expect(result?.days).toBeDefined();
    expect((result?.days ?? 0) % 365).toBe(0);
  });

  it("ritorna null se la data di inizio è nel futuro", () => {
    const start = new Date(2027, 0, 1).toISOString();
    const result = nextMilestone(start, new Date(2026, 0, 1));
    expect(result).toBeNull();
  });
});

// =============================================================================
// "Buchi comuni" — piano approvato in
// /Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md
// =============================================================================

function ev(overrides: Partial<BusyEvent> = {}): BusyEvent {
  return { starts_at: "2026-06-10T10:00:00", ends_at: "2026-06-10T11:00:00", all_day: false, ...overrides };
}

describe("findFreeSlotsForDay", () => {
  const day = new Date(2026, 5, 10);

  it("nessun evento: un'unica fascia libera che copre tutta la finestra [DAY_START_HOUR, DAY_END_HOUR)", () => {
    const slots = findFreeSlotsForDay([], day);
    expect(slots).toHaveLength(1);
    expect(slots[0].start.getHours()).toBe(DAY_START_HOUR);
    // DAY_END_HOUR è 24 (esclusivo) -> normalizzato a mezzanotte del giorno dopo.
    expect(toDateKey(slots[0].end)).toBe("2026-06-11");
    expect(slots[0].end.getHours()).toBe(DAY_END_HOUR % 24);
  });

  it("un giorno con un evento all_day blocca l'intera finestra: nessuna fascia libera", () => {
    const slots = findFreeSlotsForDay([ev({ all_day: true, starts_at: "2026-06-10T00:00:00" })], day);
    expect(slots).toEqual([]);
  });

  it("un evento a metà giornata produce due fasce libere, una prima e una dopo", () => {
    const slots = findFreeSlotsForDay(
      [ev({ starts_at: "2026-06-10T12:00:00", ends_at: "2026-06-10T13:00:00" })],
      day,
    );
    expect(slots).toHaveLength(2);
    expect(slots[0].start.getHours()).toBe(DAY_START_HOUR);
    expect(slots[0].end.getHours()).toBe(12);
    expect(slots[1].start.getHours()).toBe(13);
  });

  it("eventi contigui senza buco tra loro vengono uniti, non lasciano una fascia libera di durata zero in mezzo", () => {
    const slots = findFreeSlotsForDay(
      [
        ev({ starts_at: "2026-06-10T09:00:00", ends_at: "2026-06-10T10:00:00" }),
        ev({ starts_at: "2026-06-10T10:00:00", ends_at: "2026-06-10T11:00:00" }),
      ],
      day,
    );
    // Un'unica fascia occupata 9-11, non due contigue con un varco a durata zero.
    expect(slots.some((s) => s.start.getHours() === 9)).toBe(false);
    expect(slots.some((s) => s.start.getHours() === 10)).toBe(false);
    expect(slots[0].start.getHours()).toBe(DAY_START_HOUR);
    expect(slots[0].end.getHours()).toBe(9);
    expect(slots[1].start.getHours()).toBe(11);
  });

  it("un evento senza ends_at usa la durata nominale di default (60 min) per bloccare lo slot", () => {
    const slots = findFreeSlotsForDay([ev({ starts_at: "2026-06-10T14:00:00", ends_at: null })], day);
    const afterGap = slots.find((s) => s.start.getHours() >= 14);
    expect(afterGap?.start.getHours()).toBe(15);
  });
});

describe("findUpcomingFreeSlots", () => {
  it("filtra le fasce più corte della durata minima richiesta", () => {
    const day = new Date(2026, 5, 10);
    const events = [
      // Lascia solo un buco di 20 minuti tra i due eventi: troppo corto per 30 min.
      ev({ starts_at: "2026-06-10T09:00:00", ends_at: "2026-06-10T10:00:00" }),
      ev({ starts_at: "2026-06-10T10:20:00", ends_at: "2026-06-10T18:00:00" }),
    ];
    const slots = findUpcomingFreeSlots(events, day, 1, 30);
    expect(slots.some((s) => s.start.getHours() === 10 && s.start.getMinutes() === 0)).toBe(false);
  });

  it("ritaglia la fascia del primo giorno a partire da 'from', non propone mai un orario già passato", () => {
    const from = new Date(2026, 5, 10, 15, 0); // oggi alle 15:00
    const slots = findUpcomingFreeSlots([], from, 1, 30);
    expect(slots[0].start.getTime()).toBe(from.getTime());
  });

  it("cerca su più giorni quando daysAhead > 1", () => {
    const from = new Date(2026, 5, 10, 6, 0);
    // Giornata di 'oggi' completamente occupata -> il primo slot utile è domani.
    const busyAllDay = ev({ all_day: true, starts_at: "2026-06-10T00:00:00" });
    const slots = findUpcomingFreeSlots([busyAllDay], from, 2, 30);
    expect(slots.length).toBeGreaterThan(0);
    expect(toDateKey(slots[0].start)).toBe("2026-06-11");
  });
});

describe("overlapsAnyEvent", () => {
  it("true se il range si sovrappone parzialmente a un evento esistente", () => {
    const events = [ev({ starts_at: "2026-06-10T10:00:00", ends_at: "2026-06-10T11:00:00" })];
    expect(overlapsAnyEvent(events, new Date(2026, 5, 10, 10, 30), new Date(2026, 5, 10, 11, 30))).toBe(true);
  });

  it("false se il range è adiacente ma non si sovrappone (si toccano solo ai bordi)", () => {
    const events = [ev({ starts_at: "2026-06-10T10:00:00", ends_at: "2026-06-10T11:00:00" })];
    expect(overlapsAnyEvent(events, new Date(2026, 5, 10, 11, 0), new Date(2026, 5, 10, 12, 0))).toBe(false);
  });

  it("true per qualunque orario dello stesso giorno di un evento all_day", () => {
    const events = [ev({ all_day: true, starts_at: "2026-06-10T00:00:00" })];
    expect(overlapsAnyEvent(events, new Date(2026, 5, 10, 8, 0), new Date(2026, 5, 10, 9, 0))).toBe(true);
  });

  it("false se nessun evento tocca il range", () => {
    const events = [ev({ starts_at: "2026-06-10T10:00:00", ends_at: "2026-06-10T11:00:00" })];
    expect(overlapsAnyEvent(events, new Date(2026, 5, 10, 14, 0), new Date(2026, 5, 10, 15, 0))).toBe(false);
  });
});

describe("momentIsBusy", () => {
  it("true se il momento cade dentro [starts_at, ends_at)", () => {
    const events = [ev({ starts_at: "2026-06-10T20:00:00", ends_at: "2026-06-10T21:00:00" })];
    expect(momentIsBusy(events, new Date(2026, 5, 10, 20, 30))).toBe(true);
  });

  it("false esattamente su ends_at (bordo escluso, intervallo semi-aperto)", () => {
    const events = [ev({ starts_at: "2026-06-10T20:00:00", ends_at: "2026-06-10T21:00:00" })];
    expect(momentIsBusy(events, new Date(2026, 5, 10, 21, 0))).toBe(false);
  });

  it("un evento senza ends_at usa la durata nominale di default (60 min)", () => {
    const events = [ev({ starts_at: "2026-06-10T20:00:00", ends_at: null })];
    expect(momentIsBusy(events, new Date(2026, 5, 10, 20, 30))).toBe(true);
    expect(momentIsBusy(events, new Date(2026, 5, 10, 21, 30))).toBe(false);
  });

  it("true per qualunque momento dello stesso giorno di un evento all_day", () => {
    const events = [ev({ all_day: true, starts_at: "2026-06-10T00:00:00" })];
    expect(momentIsBusy(events, new Date(2026, 5, 10, 23, 0))).toBe(true);
  });
});
