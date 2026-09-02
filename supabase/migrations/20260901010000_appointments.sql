-- =============================================================================
-- appointments
-- =============================================================================
-- Fase 2, docs/PLAN.md -> "Screen-by-screen" / "Appuntamenti" e "Architettura
-- tecnica": appointments (stato confermato/idea, collegato a un
-- calendar_event quando confermato).
--
-- IMPORTANTE — questa NON è la stessa tabella di calendar_events, a
-- differenza di quanto lasciato scritto (in modo volutamente provvisorio, poi
-- superato da questa migration) nei commenti di
-- 20260831120100_calendar_events.sql e in supabase/README.md. Le "idee" non
-- hanno necessariamente una data (niente starts_at qui: la data vive solo su
-- calendar_events, e solo per gli appuntamenti confermati), hanno invece
-- foto/titolo/tag (viaggio/attività/ristorante/...) tipici di una scheda
-- "cosa vorremmo fare", non di un evento di calendario.
--
-- Relazione con calendar_events: un'idea diventa "confermata" quando
-- l'utente preme "Trasforma in appuntamento" in UI. Quel flusso applicativo,
-- lato frontend (vedi lib/appointments-actions.ts), fa DUE scritture
-- collegate ma non atomiche via trigger DB:
--   1. INSERT su calendar_events (titolo/data/categoria scelti in quel
--      momento — tipicamente categoria 'coppia', dato che un appuntamento è
--      per natura un piano condiviso).
--   2. UPDATE su questa riga appointments: status = 'confermato',
--      calendar_event_id = <id appena creato>.
-- Non serve un trigger/RPC dedicato per questo perché entrambe le scritture
-- passano già dalle RLS ordinarie (insert su calendar_events, update su
-- appointments) con lo stesso autore autenticato — non c'è un salto di
-- privilegio da colmare con SECURITY DEFINER, a differenza del pairing.
--
-- Contratto per il frontend:
--   - `status`: 'idea' | 'confermato'. Le "idee" hanno calendar_event_id
--     NULL; i "confermati" lo hanno valorizzato (vincolo DB sotto, non solo
--     convenzione applicativa).
--   - `tag`: etichetta libera (es. "viaggio", "attività", "ristorante", ma
--     non è un enum chiuso — stesso pattern di calendar_events.tag) per la
--     grid "Idee" in UI.
--   - `location`/`cost`/`notes`: mostrati nelle card "Confermati"
--     (docs/PLAN.md: "titolo, data, luogo, costo, countdown"); la data non è
--     qui, si legge dal calendar_event collegato.
--   - `photo_url`: singola foto (come messages.photo_url), Storage non
--     ancora configurato in questa fase — resta NULL finché non c'è un
--     bucket. Non blocca lo schema, stesso ragionamento di messages.
-- =============================================================================

create type public.appointment_status as enum ('idea', 'confermato');

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,

  title text not null,
  location text,
  cost numeric(10, 2),
  notes text,
  photo_url text,
  -- Etichetta libera indipendente (viaggio/attività/ristorante/...), stesso
  -- pattern di calendar_events.tag: non è un enum chiuso.
  tag text,

  status public.appointment_status not null default 'idea',

  -- Valorizzato solo quando status = 'confermato' (vedi vincolo sotto).
  -- `on delete set null`: se il calendar_event collegato viene cancellato
  -- dal calendario, l'appuntamento NON sparisce con esso — torna
  -- automaticamente allo stato 'idea' (vedi trigger
  -- appointments_sync_status_with_calendar_event sotto: NON può restare
  -- 'confermato' con calendar_event_id NULL, il vincolo
  -- appointments_status_calendar_event_consistency lo vieta esplicitamente —
  -- senza il trigger, il SET NULL della FK violerebbe quel vincolo e la
  -- DELETE su calendar_events fallirebbe con un errore invece di degradare
  -- correttamente l'appuntamento). Resta comunque nell'archivio Appuntamenti
  -- come idea, non sparisce: l'utente può ri-confermarlo su una nuova data.
  calendar_event_id uuid references public.calendar_events (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint appointments_cost_non_negative check (cost is null or cost >= 0),
  constraint appointments_title_not_blank check (length(trim(title)) > 0),

  -- Un solo appuntamento può rivendicare un dato calendar_event (evita che
  -- due "idee" diverse vengano confermate sullo stesso evento calendario per
  -- errore). NULL è ammesso più volte (semantica standard UNIQUE su NULL).
  constraint appointments_calendar_event_id_unique unique (calendar_event_id)
);

comment on table public.appointments is
  'Appuntamenti di coppia: idee (senza data) e confermati (collegati a un calendar_event). Tabella distinta da calendar_events, non una vista sugli stessi dati.';

comment on column public.appointments.calendar_event_id is
  'Popolato solo quando status = confermato. Scritto dal client in un secondo UPDATE dopo aver creato il calendar_event collegato (vedi lib/appointments-actions.ts), non da un trigger DB.';

-- Coerenza stato <-> collegamento: un appuntamento è "confermato" se e solo
-- se ha un calendar_event_id. Impedisce stati incoerenti anche se un client
-- bacato prova a scrivere solo metà della coppia di campi.
alter table public.appointments
  add constraint appointments_status_calendar_event_consistency
  check ((status = 'confermato') = (calendar_event_id is not null));

create index appointments_couple_status_idx
  on public.appointments (couple_id, status);

create index appointments_calendar_event_idx
  on public.appointments (calendar_event_id);

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row
  execute function public.set_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Decisione di design (richiesta esplicitamente nel task): un appuntamento è
-- per natura un piano di coppia, non un impegno personale come può esserlo un
-- calendar_event 'personale'. Seguiamo quindi lo stesso pattern già scelto
-- per calendar_events categoria 'coppia' (vedi commenti in
-- 20260831120100_calendar_events.sql): ENTRAMBI i partner possono
-- modificare/eliminare qualunque appuntamento della coppia, non solo il
-- proprio creatore. A differenza di calendar_events, qui non serve
-- distinguere per categoria (non esiste un equivalente 'personale' per gli
-- appuntamenti: un'idea di viaggio o un ristorante prenotato riguardano
-- sempre entrambi), quindi la policy è più semplice: basta l'appartenenza
-- alla coppia, senza il ramo "created_by = auth.uid() OR categoria coppia".
-- `created_by` resta comunque tracciato (NOT NULL) per audit/UI ("chi l'ha
-- aggiunto"), non per limitare i permessi di scrittura.
alter table public.appointments enable row level security;

create policy "appointments_select_couple"
  on public.appointments for select
  to authenticated
  using (couple_id = public.current_couple_id());

-- INSERT: solo per la propria coppia e a proprio nome (come calendar_events
-- e messages: non si crea un'idea "per conto" del partner, anche se poi
-- entrambi potranno modificarla).
create policy "appointments_insert_own"
  on public.appointments for insert
  to authenticated
  with check (
    couple_id = public.current_couple_id()
    and created_by = auth.uid()
  );

create policy "appointments_update_couple"
  on public.appointments for update
  to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

create policy "appointments_delete_couple"
  on public.appointments for delete
  to authenticated
  using (couple_id = public.current_couple_id());

-- =============================================================================
-- Grant di base per `authenticated`
-- =============================================================================
-- Vedi 20260901000000_grant_authenticated_table_privileges.sql: su questo
-- progetto le migration incollate a mano non hanno ricevuto i grant di
-- default che la piattaforma applica di solito in automatico. Lo rendiamo
-- esplicito qui direttamente (non solo nel file "grant" storico) così questa
-- migration è autosufficiente anche se applicata da sola.
grant select, insert, update, delete on public.appointments to authenticated;

-- =============================================================================
-- Realtime
-- =============================================================================
-- Stesso ragionamento delle altre tabelle (vedi 20260831120300_realtime.sql):
-- la RLS si applica anche alle subscription. Utile perché la sezione
-- Appuntamenti deve aggiornarsi live quando il partner aggiunge un'idea o
-- conferma un appuntamento, senza polling.
alter publication supabase_realtime add table public.appointments;
alter table public.appointments replica identity full;
