import AppointmentsView from "@/components/appointments/AppointmentsView";

/**
 * Schermata Appuntamenti (Fase 2, docs/PLAN.md). Dati reali dal 2026-09-01
 * (tabella `appointments`, live e confermata da main). Nessun fetch qui:
 * l'auth/pairing guard è già fatto da app/(app)/layout.tsx, e
 * AppointmentsView carica i propri dati via lib/appointments-actions.ts
 * (l'utente autenticato è risolto internamente da ogni azione).
 */
export default function AppuntamentiPage() {
  return <AppointmentsView />;
}
