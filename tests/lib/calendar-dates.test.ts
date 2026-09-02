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
  daysBetween,
  isSameDay,
  monthGrid,
  nextOccurrence,
  projectOccurrences,
  startOfDay,
  toDateKey,
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
