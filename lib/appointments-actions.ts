"use client";

/**
 * Azioni per la sezione Appuntamenti (docs/PLAN.md, Fase 2): idee (senza
 * data) e confermati (collegati a un calendar_event).
 *
 * Stesso pattern di lib/auth-actions.ts / lib/messages-actions.ts: client
 * browser Supabase, chiamato da componenti client-side, non da Server
 * Actions.
 *
 * ATTENZIONE per chi consuma questo modulo (frontend2): la tabella
 * `appointments` esiste in supabase/migrations/20260901010000_appointments.sql
 * ma non è "live" finché backend2 non conferma che main l'ha applicata
 * (`supabase db push`) — vedi HANDOFF.md. Prima di allora queste funzioni
 * compilano ma ogni chiamata fallirà con un errore Postgres ("relation
 * appointments does not exist" o simile) contro un progetto reale.
 */

import { createClient } from "@/lib/supabase/client";
import type { AppointmentStatus, Database, EventRecurrence } from "@/types/database";

type AppointmentUpdate = Database["public"]["Tables"]["appointments"]["Update"];

export interface Appointment {
  id: string;
  coupleId: string;
  createdBy: string;
  title: string;
  location: string | null;
  cost: number | null;
  notes: string | null;
  photoUrl: string | null;
  tag: string | null;
  status: AppointmentStatus;
  calendarEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActionError {
  error: string;
}

const SELECT_COLUMNS =
  "id, couple_id, created_by, title, location, cost, notes, photo_url, tag, status, calendar_event_id, created_at, updated_at";

function mapRow(row: {
  id: string;
  couple_id: string;
  created_by: string;
  title: string;
  location: string | null;
  cost: number | null;
  notes: string | null;
  photo_url: string | null;
  tag: string | null;
  status: AppointmentStatus;
  calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
}): Appointment {
  return {
    id: row.id,
    coupleId: row.couple_id,
    createdBy: row.created_by,
    title: row.title,
    location: row.location,
    cost: row.cost,
    notes: row.notes,
    photoUrl: row.photo_url,
    tag: row.tag,
    status: row.status,
    calendarEventId: row.calendar_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Tutti gli appuntamenti della coppia corrente (idee + confermati), più recenti prima. */
export async function listAppointments(): Promise<Appointment[] | ActionError> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };
  return (data ?? []).map(mapRow);
}

export interface CreateIdeaInput {
  title: string;
  location?: string;
  cost?: number;
  notes?: string;
  photoUrl?: string;
  tag?: string;
}

/** Crea una nuova "idea" (status = 'idea', senza calendar_event collegato). */
export async function createAppointmentIdea(
  input: CreateIdeaInput,
): Promise<Appointment | ActionError> {
  const title = input.title.trim();
  if (!title) return { error: "Il titolo non può essere vuoto." };

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { error: "Utente non autenticato" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("couple_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.couple_id) return { error: "Non sei accoppiato/a con un partner." };

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      couple_id: profile.couple_id,
      created_by: user.id,
      title,
      location: input.location ?? null,
      cost: input.cost ?? null,
      notes: input.notes ?? null,
      photo_url: input.photoUrl ?? null,
      tag: input.tag ?? null,
      // status resta 'idea' (default DB).
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) return { error: error.message };
  return mapRow(data);
}

export interface ConfirmAppointmentEventInput {
  /** starts_at dell'evento calendario da creare, ISO 8601. */
  startsAt: string;
  endsAt?: string;
  allDay?: boolean;
  /** Categoria dell'evento collegato: di default 'coppia' (un appuntamento è per natura condiviso). */
  category?: "personale" | "coppia" | "speciale" | "ciclo";
  /**
   * Gap colmato per il piano UX "Gruppo Calendario/Appuntamenti" (punto 4,
   * unificazione Calendario -> Appuntamenti): l'insert su `calendar_events`
   * qui sotto includeva solo title/category/starts_at/ends_at/all_day, non
   * tag/notes — che invece EventFormModal.tsx raccoglie già in creazione.
   * Passati qui per non perderli quando la categoria "coppia" viene creata
   * dal Calendario (che ora chiama createConfirmedAppointment invece
   * dell'insert diretto).
   */
  tag?: string | null;
  notes?: string | null;
  /** Ricorrenza generale (piano "ricorrenza generale"): default 'nessuna' se omessa, stesso schema di lib/calendar-actions.ts. */
  recurrence?: EventRecurrence;
  recurrenceInterval?: number;
  recurrenceUntil?: string | null;
  recurrenceCount?: number | null;
}

/**
 * "Trasforma in appuntamento": crea il calendar_event collegato, poi
 * aggiorna la riga appointments (status='confermato', calendar_event_id).
 * Due scritture separate lato client (non una RPC/trigger DB, per scelta di
 * design — vedi commento in testa alla migration): se la seconda fallisce
 * dopo che la prima è riuscita, proviamo a fare un best-effort rollback del
 * calendar_event appena creato per non lasciare un evento orfano.
 */
export async function confirmAppointment(
  appointmentId: string,
  eventInput: ConfirmAppointmentEventInput,
  title: string,
): Promise<Appointment | ActionError> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { error: "Utente non autenticato" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("couple_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.couple_id) return { error: "Non sei accoppiato/a con un partner." };

  const { data: event, error: eventError } = await supabase
    .from("calendar_events")
    .insert({
      couple_id: profile.couple_id,
      created_by: user.id,
      title,
      category: eventInput.category ?? "coppia",
      tag: eventInput.tag ?? null,
      notes: eventInput.notes ?? null,
      starts_at: eventInput.startsAt,
      ends_at: eventInput.endsAt ?? null,
      all_day: eventInput.allDay ?? false,
      recurrence: eventInput.recurrence ?? "nessuna",
      recurrence_interval: eventInput.recurrenceInterval ?? 1,
      recurrence_until: eventInput.recurrenceUntil ?? null,
      recurrence_count: eventInput.recurrenceCount ?? null,
    })
    .select("id")
    .single();

  if (eventError) return { error: eventError.message };

  const { data, error } = await supabase
    .from("appointments")
    .update({ status: "confermato", calendar_event_id: event.id })
    .eq("id", appointmentId)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    // Best-effort: non lasciare un calendar_event orfano se il secondo
    // passo fallisce (es. RLS inattesa, id non trovato). Non blocchiamo la
    // segnalazione dell'errore originale se anche il rollback fallisce.
    await supabase.from("calendar_events").delete().eq("id", event.id);
    return { error: error.message };
  }

  return mapRow(data);
}

/**
 * Crea direttamente un appuntamento CONFERMATO (FAB "nuovo appuntamento",
 * senza partire da un'idea esistente) — aggiunta su richiesta di frontend2,
 * che stava ottenendo lo stesso risultato componendo
 * `createAppointmentIdea()` + `confirmAppointment()`: funzionava (nessun bug,
 * il vincolo DB regge comunque), ma passava per uno stato 'idea'
 * intermedio inutile, con un INSERT + un UPDATE in più e due eventi
 * Realtime invece di uno per il partner. Questa funzione fa lo stesso
 * lavoro di `confirmAppointment` (calendar_event prima, poi la riga
 * appointments, con lo stesso rollback best-effort se il secondo passo
 * fallisce) ma scrive `appointments` con UN SOLO INSERT già con
 * status='confermato' + calendar_event_id, invece di idea->update. Nessuna
 * modifica a `createAppointmentIdea`/`confirmAppointment`: restano corrette
 * e vanno usate per il flusso "idea esistente -> trasforma in
 * appuntamento" (frontend2 punto 2), che AGGIUNGE dati a una riga già
 * esistente e quindi ha davvero bisogno di due passaggi.
 */
export async function createConfirmedAppointment(
  input: CreateIdeaInput,
  eventInput: ConfirmAppointmentEventInput,
): Promise<Appointment | ActionError> {
  const title = input.title.trim();
  if (!title) return { error: "Il titolo non può essere vuoto." };

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { error: "Utente non autenticato" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("couple_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.couple_id) return { error: "Non sei accoppiato/a con un partner." };

  const { data: event, error: eventError } = await supabase
    .from("calendar_events")
    .insert({
      couple_id: profile.couple_id,
      created_by: user.id,
      title,
      category: eventInput.category ?? "coppia",
      tag: eventInput.tag ?? null,
      notes: eventInput.notes ?? null,
      starts_at: eventInput.startsAt,
      ends_at: eventInput.endsAt ?? null,
      all_day: eventInput.allDay ?? false,
      recurrence: eventInput.recurrence ?? "nessuna",
      recurrence_interval: eventInput.recurrenceInterval ?? 1,
      recurrence_until: eventInput.recurrenceUntil ?? null,
      recurrence_count: eventInput.recurrenceCount ?? null,
    })
    .select("id")
    .single();

  if (eventError) return { error: eventError.message };

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      couple_id: profile.couple_id,
      created_by: user.id,
      title,
      location: input.location ?? null,
      cost: input.cost ?? null,
      notes: input.notes ?? null,
      photo_url: input.photoUrl ?? null,
      tag: input.tag ?? null,
      status: "confermato",
      calendar_event_id: event.id,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    // Stesso ragionamento di confirmAppointment: non lasciare un
    // calendar_event orfano se l'insert dell'appuntamento fallisce.
    await supabase.from("calendar_events").delete().eq("id", event.id);
    return { error: error.message };
  }

  return mapRow(data);
}

export interface UpdateAppointmentInput {
  title?: string;
  location?: string | null;
  cost?: number | null;
  notes?: string | null;
  photoUrl?: string | null;
  tag?: string | null;
}

/** Modifica un'idea o un appuntamento confermato (campi descrittivi, non lo status). */
export async function updateAppointment(
  id: string,
  input: UpdateAppointmentInput,
): Promise<Appointment | ActionError> {
  const supabase = createClient();
  const patch: AppointmentUpdate = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.location !== undefined) patch.location = input.location;
  if (input.cost !== undefined) patch.cost = input.cost;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.photoUrl !== undefined) patch.photo_url = input.photoUrl;
  if (input.tag !== undefined) patch.tag = input.tag;

  const { data, error } = await supabase
    .from("appointments")
    .update(patch)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) return { error: error.message };
  return mapRow(data);
}

/**
 * Elimina un appuntamento/idea. Consentito a entrambi i partner (piano di
 * coppia, vedi RLS `appointments_delete_couple`). Non elimina il
 * calendar_event collegato: se serve rimuovere anche l'evento dal
 * calendario, farlo esplicitamente da lì (calendar_event_id resterà NULL
 * qui, l'evento resta indipendente).
 */
export async function deleteAppointment(id: string): Promise<true | ActionError> {
  const supabase = createClient();
  const { error } = await supabase.from("appointments").delete().eq("id", id);
  if (error) return { error: error.message };
  return true;
}
