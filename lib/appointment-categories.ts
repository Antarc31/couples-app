import type { ComponentType } from "react";
import { Plane, UtensilsCrossed, Ticket, MoreHorizontal } from "@/components/ui/icons";

export interface AppointmentCategory {
  value: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

/**
 * Categorie fisse per idee/appuntamenti — su richiesta esplicita
 * dell'utente, sostituiscono il vecchio tag a testo libero (con 3
 * suggerimenti, ma comunque digitabile a mano). Restano le stesse 3
 * proposte di prima (viaggio/ristorante/attività), ora scelte obbligate
 * invece che suggerimenti — "Altro" copre tutto il resto con
 * un'etichetta scritta a mano invece di una categoria fissa (vedi
 * AppointmentFormModal.tsx). `appointments.tag`/`calendar_events.tag`
 * restano testo libero lato DB (nessuna migration): qui si vincola solo
 * COSA il form propone, non cosa la colonna accetta — un valore "altro"
 * viene salvato come il testo scritto a mano, non come la stringa "altro".
 */
export const APPOINTMENT_CATEGORIES: AppointmentCategory[] = [
  { value: "viaggio", label: "Viaggio", icon: Plane },
  { value: "ristorante", label: "Ristorante", icon: UtensilsCrossed },
  { value: "attivita", label: "Attività", icon: Ticket },
];

/** Icona per un tag salvato: quella della categoria nota, altrimenti l'icona generica "altro". */
export function iconForTag(tag: string | null): ComponentType<{ size?: number; strokeWidth?: number }> {
  const match = APPOINTMENT_CATEGORIES.find((c) => c.value === tag?.toLowerCase());
  return match?.icon ?? MoreHorizontal;
}
