-- =============================================================================
-- Fix: appointments — sincronizza status quando calendar_event_id diventa NULL
-- =============================================================================
-- Bug reale trovato da backend2 in revisione, DOPO che
-- 20260901010000_appointments.sql era già stata applicata da main (quindi
-- questa è una migration di correzione separata, non un edit del file
-- originale — stesso approccio già usato in Fase 1 per
-- 20260901000000_grant_authenticated_table_privileges.sql).
--
-- Il problema: `appointments.calendar_event_id` ha
-- `references public.calendar_events (id) on delete set null`, ma la
-- tabella ha anche il vincolo `appointments_status_calendar_event_consistency`
-- che impone `(status = 'confermato') = (calendar_event_id is not null)`.
-- Senza un trigger che tenga sincronizzati i due campi, cancellare un
-- calendar_event collegato a un appuntamento CONFERMATO avrebbe fatto sì che
-- la FK action `ON DELETE SET NULL` mettesse `calendar_event_id = NULL`
-- lasciando `status` invariato a `'confermato'` — violando immediatamente il
-- check constraint e facendo fallire l'intera DELETE su calendar_events con
-- un errore invece di degradare correttamente l'appuntamento a 'idea'.
--
-- Fix: un trigger BEFORE UPDATE su `appointments` che, ogni volta che
-- `calendar_event_id` diventa NULL (per QUALSIASI motivo: la FK action sopra,
-- o un futuro update manuale che lo azzera senza pensare allo status), forza
-- anche `status = 'idea'` nella stessa riga PRIMA che il vincolo venga
-- verificato — le FK action di Postgres sono implementate internamente come
-- UPDATE/DELETE ordinari sulla tabella referenziante, quindi attivano
-- normalmente i trigger BEFORE UPDATE su `appointments` come qualunque altro
-- UPDATE.
-- =============================================================================

create or replace function public._appointments_sync_status_with_calendar_event()
returns trigger
language plpgsql
as $$
begin
  if new.calendar_event_id is null then
    new.status := 'idea';
  end if;
  return new;
end;
$$;

comment on function public._appointments_sync_status_with_calendar_event() is
  'Trigger interno: se calendar_event_id diventa NULL (es. FK ON DELETE SET NULL quando il calendar_event collegato viene cancellato), forza status = idea nella stessa riga per rispettare appointments_status_calendar_event_consistency.';

create trigger appointments_sync_status_before_update
  before update on public.appointments
  for each row
  when (new.calendar_event_id is null)
  execute function public._appointments_sync_status_with_calendar_event();
