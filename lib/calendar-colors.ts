import type { Database, EventCategory } from "@/types/database";

export type CalendarEventRow = Database["public"]["Tables"]["calendar_events"]["Row"];

export interface ColorContext {
  selfId: string;
  selfColor: string;
  partnerId: string | null;
  partnerColor: string | null;
}

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  personale: "Personale",
  coppia: "Di coppia",
  speciale: "Data speciale",
  ciclo: "Ciclo",
};

/**
 * Colore CSS (var(--color-*) o hex letterale) per un evento, secondo il
 * contratto di supabase/migrations/20260831120100_calendar_events.sql:
 *   personale -> colore del profilo che l'ha creato
 *   coppia    -> corallo
 *   speciale  -> oro
 *   ciclo     -> lavanda
 */
export function eventColor(ev: Pick<CalendarEventRow, "category" | "created_by">, ctx: ColorContext): string {
  switch (ev.category) {
    case "coppia":
      return "var(--color-couple)";
    case "speciale":
      return "var(--color-special)";
    case "ciclo":
      return "var(--color-cycle)";
    case "personale":
    default:
      if (ev.created_by === ctx.selfId) return ctx.selfColor;
      if (ctx.partnerId && ev.created_by === ctx.partnerId) return ctx.partnerColor ?? "var(--color-partner-b)";
      return ctx.selfColor;
  }
}
