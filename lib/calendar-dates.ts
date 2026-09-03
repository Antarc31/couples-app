// =============================================================================
// Helper di date per il Calendario — puri, senza dipendenze da Supabase.
// =============================================================================

import type { EventRecurrence } from "@/types/database";

// Finestra oraria usata sia dalla vista Giorno (DayTimeline, che le importa
// da qui) sia dal calcolo dei "buchi comuni" sotto — unica fonte di verità,
// mai due window diverse tra la resa grafica e i suggerimenti di slot.
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 24; // esclusivo

/** yyyy-mm-dd locale (NON toISOString, che è UTC e può shiftare il giorno). */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setDate(1);
  r.setMonth(r.getMonth() + months);
  return r;
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

/**
 * Griglia mese: array di settimane (ognuna 7 Date), da lunedì a domenica,
 * comprese le code del mese precedente/successivo per riempire la griglia.
 */
export function monthGrid(monthAnchor: Date): Date[][] {
  const firstOfMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  // getDay(): 0=domenica..6=sabato -> vogliamo offset da lunedì
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = addDays(firstOfMonth, -mondayOffset);

  const weeks: Date[][] = [];
  let cursor = gridStart;
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

const WEEKDAY_LABELS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
export { WEEKDAY_LABELS };

export function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

/** HH:mm locale da un Date — per precompilare gli <input type="time"> da uno slot scelto (Date, non ISO). */
export function toTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" });
}

export function daysBetween(from: Date, to: Date): number {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.round((b - a) / 86400000);
}

/** Numero di giorni nel mese `month` (0-11) di `year`. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Clampa `day` (1-based, come da `starts_at` originale) all'ultimo giorno
 * valido del mese `month` (0-11) di `year` — comportamento standard per
 * ricorrenze mensili: un evento ancorato al 31 del mese cade il 28/29 a
 * febbraio, non "trabocca" a marzo.
 */
function clampDayOfMonth(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

/**
 * Prossima occorrenza di un evento a partire da `from` (default: oggi):
 * - `"nessuna"`: ritorna semplicemente la data originale.
 * - `"annuale"`: prossimo giorno/mese uguale (compleanni/anniversario).
 * - `"mensile"`: prossimo stesso giorno-del-mese (mesiversario), clampato a
 *   fine mese se necessario (vedi `clampDayOfMonth`).
 * Nessuna ricorrenza è materializzata in DB — proiettata a runtime (vedi
 * commento in supabase/migrations/20260831120100_calendar_events.sql).
 * Per ottenere TUTTE le occorrenze in un range (non solo la prossima da
 * oggi), vedi `projectOccurrences` sotto — usata dal Calendario, non dal
 * countdown Home che invece resta su questa funzione.
 */
export function nextOccurrence(startsAtIso: string, recurrence: EventRecurrence, from: Date = new Date()): Date {
  const original = new Date(startsAtIso);
  if (recurrence === "nessuna") return original;

  const now = startOfDay(from);

  if (recurrence === "annuale") {
    const candidate = new Date(now.getFullYear(), original.getMonth(), original.getDate(), original.getHours(), original.getMinutes());
    if (candidate < now) candidate.setFullYear(candidate.getFullYear() + 1);
    return candidate;
  }

  // 'mensile': itera mese per mese da "oggi" finché non trova la prima
  // occorrenza >= now (quasi sempre 0 o 1 passo — il mese corrente o il
  // successivo, mai anni di distanza come per l'annuale).
  let year = now.getFullYear();
  let month = now.getMonth();
  for (let i = 0; i < 24; i++) {
    const day = clampDayOfMonth(year, month, original.getDate());
    const candidate = new Date(year, month, day, original.getHours(), original.getMinutes());
    if (candidate >= now) return candidate;
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  // Fallback teorico (non dovrebbe mai scattare: 24 iterazioni bastano
  // ampiamente a trovare una candidata >= now).
  return original;
}

// Soglie fisse per i "traguardi giorni insieme": dopo l'ultima, si continua
// di anno in anno (365*n) — vedi nextMilestone sotto.
const MILESTONE_DAYS = [7, 30, 100, 365, 500, 730, 1000, 1500, 2000, 2500, 3000, 3650];

/**
 * Prossimo traguardo cumulativo ("100 giorni insieme", "1 anno insieme", ...)
 * a partire da `startDate` (couples.relationship_start_date). Ritorna il
 * numero di giorni della soglia e la data in cui cade — il chiamante
 * (Home) calcola poi `daysUntil` con `daysBetween`, stesso schema già usato
 * per `nextSpecial` in app/(app)/home/page.tsx. `null` se `startDate` è nel
 * futuro (dato incoerente) o non fornita.
 */
export function nextMilestone(startDate: string, today: Date = new Date()): { days: number; occursOn: Date } | null {
  const start = startOfDay(new Date(startDate));
  const elapsed = daysBetween(start, today);
  if (elapsed < 0) return null;

  let target = MILESTONE_DAYS.find((d) => d >= elapsed);
  if (target === undefined) {
    // Oltre l'ultima soglia fissa: prossimo multiplo di un anno (365 giorni).
    target = Math.ceil(elapsed / 365) * 365;
  }

  return { days: target, occursOn: addDays(start, target) };
}

/**
 * Intervallo [inizio, fine) del giorno esatto un anno prima di `today`
 * (stesso mese/giorno) — usato dal throwback "un anno fa oggi" per filtrare
 * messaggi/regali completati quella data esatta, non una finestra.
 */
export function sameDayLastYear(today: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  return { start, end: addDays(start, 1) };
}

/**
 * Tutte le occorrenze proiettate di un evento (eventualmente ricorrente) che
 * cadono in `[rangeStart, rangeEnd]` (bordi inclusi, confrontati a livello di
 * giorno — non di millisecondi). A differenza di `nextOccurrence` (una sola
 * data, la prossima da oggi in poi — usata dal countdown Home), questa
 * ritorna un array: un range di poche settimane può contenere più di
 * un'occorrenza mensile (es. giorno 1 e giorno 31 della finestra), e viene
 * usata dalla vista Calendario per mostrare le occorrenze proiettate
 * sull'anno/mese effettivamente visualizzato, non solo sull'anno letterale
 * salvato in `starts_at` (es. l'anno di nascita per un compleanno).
 */
export function projectOccurrences(
  startsAtIso: string,
  recurrence: EventRecurrence,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const original = new Date(startsAtIso);
  const start = startOfDay(rangeStart);
  const end = startOfDay(rangeEnd);

  function inRange(d: Date): boolean {
    const day = startOfDay(d);
    return day >= start && day <= end;
  }

  if (recurrence === "nessuna") {
    return inRange(original) ? [original] : [];
  }

  if (recurrence === "annuale") {
    const results: Date[] = [];
    // ±1 anno rispetto ai bordi del range, per coprire correttamente i casi
    // limite (es. range a cavallo di capodanno, o starts_at vicino ai bordi).
    for (let year = start.getFullYear() - 1; year <= end.getFullYear() + 1; year++) {
      const candidate = new Date(year, original.getMonth(), original.getDate(), original.getHours(), original.getMinutes());
      if (inRange(candidate)) results.push(candidate);
    }
    return results;
  }

  // 'mensile': itera mese per mese, partendo un mese prima dell'inizio del
  // range (margine di sicurezza per non perdere un'occorrenza il cui giorno
  // clampato ricade comunque dentro il range) fino a superare la fine del
  // range, stesso giorno-del-mese di `starts_at`, clampato a fine mese.
  const results: Date[] = [];
  let year = start.getFullYear();
  let month = start.getMonth() - 1;
  if (month < 0) {
    month = 11;
    year -= 1;
  }
  for (let i = 0; i < 400; i++) {
    // Se anche il primo del mese è già oltre la fine del range, nessun mese
    // successivo potrà più produrre un'occorrenza in range: si può fermare.
    if (new Date(year, month, 1) > end) break;
    const day = clampDayOfMonth(year, month, original.getDate());
    const candidate = new Date(year, month, day, original.getHours(), original.getMinutes());
    if (inRange(candidate)) results.push(candidate);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return results;
}

// =============================================================================
// "Buchi comuni" — slot liberi condivisi + rilevamento sovrapposizioni.
// Nessuna dipendenza Supabase: il chiamante (lib/calendar-actions.ts) passa
// già gli eventi risolti (inclusi quelli ricorrenti, proiettati con
// projectOccurrences sopra). Vedi piano approvato in
// /Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md.
// =============================================================================

/** Forma minima strutturale: CalendarEventRow la soddisfa senza bisogno di importarlo qui (stesso disaccoppiamento del resto del file). */
export interface BusyEvent {
  id?: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
}

// Un appuntamento (AppointmentFormModal) non ha mai un orario di fine
// registrato — trattarlo come "punto" a durata zero farebbe sì che due
// appuntamenti allo stesso identico istante non risultino mai in conflitto
// (l'intervallo [start,start) è per definizione vuoto). Si assume quindi una
// durata nominale di default quando `ends_at` manca, qui e in tutte le
// funzioni sotto.
const DEFAULT_EVENT_DURATION_MINUTES = 60;

function resolvedEventEnd(ev: BusyEvent): Date {
  if (ev.ends_at) return new Date(ev.ends_at);
  return new Date(new Date(ev.starts_at).getTime() + DEFAULT_EVENT_DURATION_MINUTES * 60000);
}

function dayWindow(day: Date): { start: Date; end: Date } {
  const base = startOfDay(day);
  const start = new Date(base);
  start.setHours(DAY_START_HOUR, 0, 0, 0);
  const end = new Date(base);
  end.setHours(DAY_END_HOUR, 0, 0, 0); // 24 → normalizza a mezzanotte del giorno dopo (Date lo gestisce da sé)
  return { start, end };
}

/**
 * Fasce libere di `day` dentro `[DAY_START_HOUR, DAY_END_HOUR)`, escludendo
 * gli intervalli occupati da `events` (di entrambi i partner). Un evento
 * `all_day` quel giorno blocca l'intera finestra (nessuna fascia). Nessun
 * filtro di privacy qui: chi chiama ha già solo righe visibili per RLS.
 */
export function findFreeSlotsForDay(events: BusyEvent[], day: Date): { start: Date; end: Date }[] {
  const dayKey = toDateKey(day);
  const hasAllDayBlock = events.some((ev) => ev.all_day && toDateKey(new Date(ev.starts_at)) === dayKey);
  if (hasAllDayBlock) return [];

  const { start: windowStart, end: windowEnd } = dayWindow(day);

  const busy: { start: Date; end: Date }[] = [];
  for (const ev of events) {
    if (ev.all_day) continue;
    const evStart = new Date(ev.starts_at);
    const evEnd = resolvedEventEnd(ev);
    const clippedStart = evStart < windowStart ? windowStart : evStart;
    const clippedEnd = evEnd > windowEnd ? windowEnd : evEnd;
    if (clippedStart < clippedEnd) busy.push({ start: clippedStart, end: clippedEnd });
  }
  busy.sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: { start: Date; end: Date }[] = [];
  for (const b of busy) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) {
      if (b.end > last.end) last.end = b.end;
    } else {
      merged.push({ ...b });
    }
  }

  const free: { start: Date; end: Date }[] = [];
  let cursor = windowStart;
  for (const b of merged) {
    if (b.start > cursor) free.push({ start: cursor, end: b.start });
    if (b.end > cursor) cursor = b.end;
  }
  if (cursor < windowEnd) free.push({ start: cursor, end: windowEnd });

  return free;
}

/**
 * Fasce libere ≥ `minDurationMinutes` nei prossimi `daysAhead` giorni a
 * partire da `from` (giorno E ora: se `from` cade a metà di una fascia
 * libera del primo giorno, la fascia viene ritagliata a partire da `from`,
 * mai proposto un orario già passato). Ordine cronologico naturale, nessun
 * sort esplicito necessario. Usata sia dal pulsante indipendente "Trova
 * buchi liberi" (orizzonte 14gg da oggi) sia da "Suggerisci slot orario"
 * dentro un form (orizzonte 7gg dalla data corrente del form) — stessa
 * funzione, orizzonte diverso passato dal chiamante.
 */
export function findUpcomingFreeSlots(
  events: BusyEvent[],
  from: Date,
  daysAhead: number,
  minDurationMinutes = 30,
): { start: Date; end: Date }[] {
  const results: { start: Date; end: Date }[] = [];
  const minMs = minDurationMinutes * 60000;
  for (let i = 0; i < daysAhead; i++) {
    const day = addDays(startOfDay(from), i);
    for (const slot of findFreeSlotsForDay(events, day)) {
      const start = slot.start < from ? from : slot.start;
      if (start >= slot.end) continue;
      if (slot.end.getTime() - start.getTime() >= minMs) {
        results.push({ start, end: slot.end });
      }
    }
  }
  return results;
}

/** True se `[start, end)` si sovrappone a un evento qualunque (per EventFormModal, che ha sempre inizio+fine). */
export function overlapsAnyEvent(events: BusyEvent[], start: Date, end: Date): boolean {
  return events.some((ev) => {
    if (ev.all_day) return toDateKey(new Date(ev.starts_at)) === toDateKey(start);
    return start < resolvedEventEnd(ev) && end > new Date(ev.starts_at);
  });
}

/** True se `moment` cade dentro un evento esistente (per AppointmentFormModal, che ha solo un orario di inizio, mai una fine). */
export function momentIsBusy(events: BusyEvent[], moment: Date): boolean {
  return events.some((ev) => {
    if (ev.all_day) return toDateKey(new Date(ev.starts_at)) === toDateKey(moment);
    return moment >= new Date(ev.starts_at) && moment < resolvedEventEnd(ev);
  });
}
