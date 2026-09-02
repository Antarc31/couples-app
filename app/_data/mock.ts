/**
 * Dati mock per la Fase 1 (MVP).
 *
 * Questi tipi rispecchiano il "Modello dati principale" in docs/PLAN.md così
 * che l'integrazione col backend reale (Supabase) richieda solo di sostituire
 * le funzioni `get*` qui sotto con chiamate vere — la UI non dovrebbe dover
 * cambiare forma. Non è lo schema DB definitivo: quello è di proprietà del
 * teammate backend (types/database.ts).
 */

export type ColorRole = "partnerA" | "partnerB" | "couple" | "special" | "cycle";

export type EventCategory = "personale" | "coppia" | "speciale" | "ciclo";

export interface CoupleUser {
  id: string;
  name: string;
  emoji: string;
  colorRole: "partnerA" | "partnerB";
}

export interface SpecialDate {
  id: string;
  label: string;
  /** ISO yyyy-mm-dd, anno indicativo — la ricorrenza è annuale */
  date: string;
  recurring: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  category: EventCategory;
  /** id utente proprietario, per eventi personale/ciclo */
  ownerId?: string;
  /** tag/descrizione libero, indipendente dal colore: amici, uni, sport... */
  tag?: string;
  /** ISO yyyy-mm-dd */
  date: string;
  /** "HH:mm", assente = tutto il giorno */
  startTime?: string;
  endTime?: string;
  recurring?: "yearly" | null;
  reminder?: boolean;
  /** solo per categoria "ciclo": condiviso col partner? default false (privacy opt-in) */
  visibleToPartner?: boolean;
  location?: string;
}

export interface ThoughtMessage {
  id: string;
  fromName: string;
  type: "text" | "photo" | "reminder";
  content: string;
  createdAtLabel: string;
  liked: boolean;
}

export const CURRENT_USER_ID = "u_me";

export const mockUsers: [CoupleUser, CoupleUser] = [
  { id: "u_me", name: "Tu", emoji: "🐣", colorRole: "partnerA" },
  { id: "u_partner", name: "Sam", emoji: "🦊", colorRole: "partnerB" },
];

export const mockCouple = {
  relationshipStartDate: "2022-05-14",
  specialDates: [
    { id: "sd_1", label: "Anniversario", date: "2026-05-14", recurring: true },
    { id: "sd_2", label: "Compleanno Sam", date: "2026-09-10", recurring: true },
  ] satisfies SpecialDate[],
};

const today = new Date();
function isoOffset(days: number) {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const mockEvents: CalendarEvent[] = [
  {
    id: "ev_1",
    title: "Corsa al parco",
    category: "personale",
    ownerId: "u_me",
    tag: "sport",
    date: isoOffset(0),
    startTime: "07:30",
    endTime: "08:30",
  },
  {
    id: "ev_2",
    title: "Lezione di francese",
    category: "personale",
    ownerId: "u_partner",
    tag: "uni",
    date: isoOffset(0),
    startTime: "10:00",
    endTime: "11:30",
  },
  {
    id: "ev_3",
    title: "Cena da Marco e Giulia",
    category: "coppia",
    tag: "amici",
    date: isoOffset(1),
    startTime: "20:00",
    endTime: "23:00",
  },
  {
    id: "ev_4",
    title: "Anniversario 🎉",
    category: "speciale",
    tag: "anniversario",
    date: "2026-05-14",
    recurring: "yearly",
    reminder: true,
  },
  {
    id: "ev_5",
    title: "Ciclo",
    category: "ciclo",
    ownerId: "u_me",
    date: isoOffset(2),
    visibleToPartner: false,
  },
  {
    id: "ev_6",
    title: "Weekend in montagna",
    category: "coppia",
    tag: "viaggio",
    date: isoOffset(4),
    startTime: "09:00",
    endTime: "18:00",
  },
  {
    id: "ev_7",
    title: "Riunione di lavoro",
    category: "personale",
    ownerId: "u_me",
    tag: "lavoro",
    date: isoOffset(0),
    startTime: "14:00",
    endTime: "15:00",
  },
  {
    id: "ev_8",
    title: "Palestra",
    category: "personale",
    ownerId: "u_partner",
    tag: "sport",
    date: isoOffset(1),
    startTime: "18:00",
    endTime: "19:30",
  },
  {
    id: "ev_9",
    title: "Pranzo con la famiglia",
    category: "coppia",
    tag: "famiglia",
    date: isoOffset(6),
    startTime: "13:00",
    endTime: "15:00",
  },
  {
    id: "ev_10",
    title: "Compleanno Sam",
    category: "speciale",
    tag: "compleanno",
    date: "2026-09-10",
    recurring: "yearly",
    reminder: true,
  },
];

/** Fasce orarie mock già libere per entrambi, per il toggle "disponibilità comune" */
export const mockCommonFreeSlots: Record<string, { start: string; end: string }[]> = {
  [isoOffset(0)]: [{ start: "16:00", end: "18:00" }, { start: "20:30", end: "23:00" }],
  [isoOffset(1)]: [{ start: "09:00", end: "12:00" }],
  [isoOffset(2)]: [{ start: "08:00", end: "22:00" }],
  [isoOffset(3)]: [{ start: "08:00", end: "22:00" }],
  [isoOffset(5)]: [{ start: "10:00", end: "20:00" }],
};

/** Giorni "liberi" a colpo d'occhio nella vista Mese (mock) */
export const mockFullyFreeDates = new Set([isoOffset(2), isoOffset(3)]);

export const mockThoughts: ThoughtMessage[] = [
  {
    id: "t_1",
    fromName: "Sam",
    type: "text",
    content: "Buongiorno amore ☀️ oggi pensavo a quella sera in cui abbiamo guardato le stelle, mi manchi già",
    createdAtLabel: "oggi, 08:12",
    liked: false,
  },
  {
    id: "t_2",
    fromName: "Sam",
    type: "reminder",
    content: "Non dimenticare l'ombrello, oggi piove dove sei tu 🌧️",
    createdAtLabel: "ieri, 19:40",
    liked: true,
  },
  {
    id: "t_3",
    fromName: "Sam",
    type: "text",
    content: "Ho prenotato il tavolo per sabato, sarà una sorpresa 😉",
    createdAtLabel: "2 giorni fa",
    liked: false,
  },
];

export function formatDateShort(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" });
}

export function daysUntil(iso: string) {
  const target = new Date(iso + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target2 = new Date(target);
  target2.setFullYear(now.getFullYear());
  if (target2 < now) target2.setFullYear(now.getFullYear() + 1);
  return Math.round((target2.getTime() - now.getTime()) / 86400000);
}

export function daysTogether(startIso: string) {
  const start = new Date(startIso + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86400000);
}

export const colorRoleToVar: Record<ColorRole, string> = {
  partnerA: "var(--color-partner-a)",
  partnerB: "var(--color-partner-b)",
  couple: "var(--color-couple)",
  special: "var(--color-special)",
  cycle: "var(--color-cycle)",
};

export function categoryColorRole(ev: CalendarEvent): ColorRole {
  if (ev.category === "coppia") return "couple";
  if (ev.category === "speciale") return "special";
  if (ev.category === "ciclo") return "cycle";
  // personale -> colore del proprietario
  const owner = mockUsers.find((u) => u.id === ev.ownerId);
  return owner?.colorRole ?? "partnerA";
}
