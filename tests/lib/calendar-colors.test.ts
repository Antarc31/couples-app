/**
 * Unit test per lib/calendar-colors.ts (eventColor) — logica pura di
 * mappatura categoria evento -> colore, secondo il contratto descritto in
 * supabase/migrations/20260831120100_calendar_events.sql: le categorie
 * coppia/speciale/ciclo hanno un colore fisso, mentre "personale" usa il
 * colore del profilo che ha creato l'evento (self o partner).
 */

import { eventColor, type ColorContext } from "@/lib/calendar-colors";

const ctx: ColorContext = {
  selfId: "me",
  selfColor: "#F7A6C4",
  partnerId: "partner-1",
  partnerColor: "#A6C8F0",
};

describe("eventColor", () => {
  it("eventi di coppia sono sempre corallo, a prescindere dal creatore", () => {
    expect(eventColor({ category: "coppia", created_by: "me" }, ctx)).toBe("var(--color-couple)");
    expect(eventColor({ category: "coppia", created_by: "partner-1" }, ctx)).toBe("var(--color-couple)");
  });

  it("eventi speciali sono sempre oro", () => {
    expect(eventColor({ category: "speciale", created_by: "me" }, ctx)).toBe("var(--color-special)");
  });

  it("eventi ciclo sono sempre lavanda", () => {
    expect(eventColor({ category: "ciclo", created_by: "me" }, ctx)).toBe("var(--color-cycle)");
  });

  it("evento personale creato da 'self' usa selfColor", () => {
    expect(eventColor({ category: "personale", created_by: "me" }, ctx)).toBe("#F7A6C4");
  });

  it("evento personale creato dal partner usa partnerColor", () => {
    expect(eventColor({ category: "personale", created_by: "partner-1" }, ctx)).toBe("#A6C8F0");
  });

  it("evento personale del partner senza partnerColor impostato usa il default CSS var partner-b", () => {
    const ctxNoPartnerColor: ColorContext = { ...ctx, partnerColor: null };
    expect(eventColor({ category: "personale", created_by: "partner-1" }, ctxNoPartnerColor)).toBe(
      "var(--color-partner-b)",
    );
  });

  it("evento personale non ancora accoppiato (partnerId null) usa selfColor anche se created_by non è self", () => {
    const ctxSolo: ColorContext = { selfId: "me", selfColor: "#F7A6C4", partnerId: null, partnerColor: null };
    expect(eventColor({ category: "personale", created_by: "qualcun-altro" }, ctxSolo)).toBe("#F7A6C4");
  });
});
