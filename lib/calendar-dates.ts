// =============================================================================
// Helper di date per il Calendario — puri, senza dipendenze da Supabase.
// =============================================================================

import type { EventRecurrence } from "@/types/database";

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
