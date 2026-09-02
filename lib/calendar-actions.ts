"use client";

/**
 * Azioni per la sezione Calendario (docs/PLAN.md), stesso pattern di
 * lib/appointments-actions.ts / lib/messages-actions.ts: client browser
 * Supabase, chiamato da componenti client-side.
 *
 * Prima di questo modulo, il Calendario era l'unica feature dell'app senza
 * un modulo azioni dedicato: l'insert era inline in EventFormModal.tsx.
 * Estratto qui (piano UX, "Gruppo Calendario", punto 3) insieme a
 * update/delete, prima mancanti del tutto (non si poteva né modificare né
 * eliminare un evento).
 *
 * A differenza di lib/appointments-actions.ts, qui NON deriviamo
 * user/couple via `auth.getUser()` + query su `profiles`: i chiamanti
 * (componenti calendario) hanno già `coupleId`/`createdBy` disponibili come
 * prop (passati da CalendarView, che li riceve a sua volta dalla pagina
 * server-side già autenticata) — evita una query ridondante ad ogni
 * creazione/modifica.
 *
 * RLS (supabase/migrations/20260831120100_calendar_events.sql):
 *   - insert: solo a proprio nome, nella propria coppia.
 *   - update/delete: il creatore sempre; per categoria 'coppia' anche il
 *     partner (evento condiviso per natura). Eventi 'personale'/'ciclo'
 *     restano modificabili solo dal creatore. Nessuna migration necessaria
 *     per questo modulo: la RLS esistente basta per tutto.
 */

import { createClient } from "@/lib/supabase/client";
import type { CalendarEventRow } from "@/lib/calendar-colors";
import type { Database, EventCategory } from "@/types/database";

type CalendarEventUpdate = Database["public"]["Tables"]["calendar_events"]["Update"];

export interface ActionError {
  error: string;
}

export interface CreateCalendarEventInput {
  coupleId: string;
  createdBy: string;
  title: string;
  category: EventCategory;
  tag?: string | null;
  notes?: string | null;
  /** ISO 8601. */
  startsAt: string;
  endsAt?: string | null;
  allDay?: boolean;
}

/** Crea un nuovo evento calendario (insert diretto su `calendar_events`). */
export async function createCalendarEvent(
  input: CreateCalendarEventInput,
): Promise<CalendarEventRow | ActionError> {
  const title = input.title.trim();
  if (!title) return { error: "Il titolo non può essere vuoto." };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      couple_id: input.coupleId,
      created_by: input.createdBy,
      title,
      category: input.category,
      tag: input.tag ?? null,
      notes: input.notes ?? null,
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? null,
      all_day: input.allDay ?? false,
    })
    .select("*")
    .single();

  if (error) return { error: error.message };
  return data;
}

export interface UpdateCalendarEventInput {
  title?: string;
  category?: EventCategory;
  tag?: string | null;
  notes?: string | null;
  /** ISO 8601. */
  startsAt?: string;
  endsAt?: string | null;
  allDay?: boolean;
}

/**
 * Modifica un evento esistente. Aggiorna solo i campi passati. Nota di
 * scope (piano UX, punto 4): per un evento categoria 'coppia' già collegato
 * a un appuntamento, questa funzione tocca SOLO `calendar_events` — non
 * l'appuntamento collegato (Luogo/Costo restano modificabili solo da
 * Appuntamenti → Confermati). Il chiamante (EventFormModal) è responsabile
 * di mostrare l'hint testuale relativo, questa funzione resta agnostica.
 */
export async function updateCalendarEvent(
  id: string,
  input: UpdateCalendarEventInput,
): Promise<CalendarEventRow | ActionError> {
  const supabase = createClient();
  const patch: CalendarEventUpdate = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.category !== undefined) patch.category = input.category;
  if (input.tag !== undefined) patch.tag = input.tag;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.startsAt !== undefined) patch.starts_at = input.startsAt;
  if (input.endsAt !== undefined) patch.ends_at = input.endsAt;
  if (input.allDay !== undefined) patch.all_day = input.allDay;

  const { data, error } = await supabase
    .from("calendar_events")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { error: error.message };
  return data;
}

/**
 * Elimina un evento calendario. Si affida interamente alla RLS esistente
 * (`calendar_events_delete_own_or_couple_category`) — nessuna migration
 * necessaria. Se l'evento aveva un appuntamento collegato
 * (`appointments.calendar_event_id`), il trigger DB già esistente
 * (`appointments_status_sync_trigger`, verificato in Fase 2) degrada
 * automaticamente l'appuntamento a status='idea': nessun lavoro lato client
 * aggiuntivo qui.
 */
export async function deleteCalendarEvent(id: string): Promise<true | ActionError> {
  const supabase = createClient();
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) return { error: error.message };
  return true;
}
