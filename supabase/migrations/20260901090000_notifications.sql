-- =============================================================================
-- notifications
-- =============================================================================
-- Centro notifiche in-app (campanella nella nuova top bar, vedi
-- app/(app)/layout.tsx + components/AppTopBar.tsx). Copertura round 1 (4
-- sorgenti): reazione a cuore su un pensiero, nuovo evento calendario
-- categoria 'coppia', nuovo appuntamento, nuovo elemento wishlist
-- (rispettando la modalità sorpresa, vedi trigger dedicato sotto).
-- Estendibile: `type` è un enum che può crescere in futuro (nuova sorgente =
-- nuovo valore enum + nuovo trigger, nessuna modifica qui). NON è collegato
-- al sistema di Web Push (push_subscriptions/send-push, non ancora
-- deployato, vedi 20260901030000_push_subscriptions.sql) — sono due canali
-- indipendenti; in futuro un trigger potrebbe fare entrambe le cose.
--
-- Stesso trattamento di messages.liked_by / couples / pairing_invites:
-- NESSUNA scrittura diretta dal client. Le righe si creano SOLO da funzioni
-- trigger SECURITY DEFINER (o, per la reazione a cuore, dentro la RPC
-- toggle_message_reaction esistente, estesa qui sotto). L'unica interazione
-- scrivibile dal client è "segna come letta", esposta come RPC
-- (mark_notification_read / mark_all_notifications_read), non come policy
-- UPDATE diretta — stesso ragionamento di messages: nessuna colonna
-- aggiornabile via UPDATE diretto dal client, per evitare che un client
-- alteri couple_id/recipient_id/type mascherandolo da "segna come letta".
-- =============================================================================

create type public.notification_type as enum ('reazione', 'evento_coppia', 'appuntamento', 'wishlist');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  -- Nullable: chi ha generato la notifica. NULL riservato a future notifiche
  -- non generate da un'azione del partner (es. eventuali "annunci"
  -- dell'app), esplicitamente fuori scope ora ma lo schema non lo impedisce.
  actor_id uuid references public.profiles (id) on delete set null,

  type public.notification_type not null,
  title text not null,
  body text,

  -- Riferimento "polimorfico" leggero alla riga sorgente (non una FK tipata:
  -- sorgenti diverse per tabella). Nullable perché la riga sorgente potrebbe
  -- essere cancellata in seguito (FK reale introdurrebbe on-delete complesso
  -- per poco valore: la notifica resta comunque leggibile come "storico").
  source_table text,
  source_id uuid,

  read_at timestamptz,

  created_at timestamptz not null default now(),

  constraint notifications_title_not_blank check (length(trim(title)) > 0),
  constraint notifications_source_table_known
    check (source_table is null or source_table in ('messages', 'calendar_events', 'appointments', 'wishlist_items'))
);

comment on table public.notifications is
  'Notifiche in-app per il partner destinatario. Scrittura solo via trigger/RPC SECURITY DEFINER, mai INSERT/UPDATE diretto dal client.';

comment on column public.notifications.actor_id is
  'Chi ha generato l''evento (il partner che ha messo il cuore/aggiunto l''evento/ecc). NULL riservato a future notifiche non generate da un partner.';

create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

-- Indice parziale per il conteggio non lette (badge del campanello): copre
-- esattamente la query "quante non lette ho", senza scansionare lo storico.
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id)
  where read_at is null;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (recipient_id = auth.uid());

-- Nessuna policy INSERT/UPDATE/DELETE per `authenticated`: scrittura solo da
-- funzioni SECURITY DEFINER (i trigger sotto + toggle_message_reaction
-- esteso + le due RPC mark_*_read sotto), stesso pattern di
-- couples/pairing_invites (vedi 20260831120000_core_schema.sql).

-- =============================================================================
-- Grant di base per `authenticated`
-- =============================================================================
-- Solo SELECT: nessuna policy INSERT/UPDATE/DELETE esiste per authenticated,
-- quindi non concediamo quei privilegi (stesso ragionamento di
-- wishlist_items, che non concede DELETE perché non ha la policy).
grant select on public.notifications to authenticated;

-- =============================================================================
-- RPC: mark_notification_read / mark_all_notifications_read
-- =============================================================================
-- Uniche vie per scrivere read_at dal client (vedi nota sopra su niente
-- UPDATE diretto). SECURITY DEFINER necessario: senza una policy UPDATE per
-- authenticated, nemmeno il proprietario della riga potrebbe aggiornarla
-- direttamente — stesso principio di toggle_message_reaction.
create or replace function public.mark_notification_read(notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
    set read_at = now()
    where id = notification_id
      and recipient_id = auth.uid()
      and read_at is null;
end;
$$;

comment on function public.mark_notification_read(uuid) is
  'Segna come letta una notifica, solo se appartiene al chiamante. No-op se già letta o non tua (nessun errore, per semplicità lato client).';

revoke execute on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
    set read_at = now()
    where recipient_id = auth.uid()
      and read_at is null;
end;
$$;

comment on function public.mark_all_notifications_read() is
  'Segna come lette tutte le notifiche non lette del chiamante.';

revoke execute on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- =============================================================================
-- Helper comune ai trigger "after insert" sotto: trova l'altro partner.
-- =============================================================================
-- Non è un vero trigger, solo una funzione SQL riusabile per evitare di
-- ripetere la stessa subquery più volte. SECURITY DEFINER + search_path
-- fisso per lo stesso motivo di current_couple_id() (evita hijacking di
-- schema), anche se qui legge solo `profiles`, non scrive.
create or replace function public._other_partner_id(p_couple_id uuid, p_actor_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.profiles where couple_id = p_couple_id and id <> p_actor_id;
$$;

revoke execute on function public._other_partner_id(uuid, uuid) from public;
grant execute on function public._other_partner_id(uuid, uuid) to authenticated;

-- =============================================================================
-- Trigger 1/3: calendar_events (categoria 'coppia') -> notifica l'altro partner
-- =============================================================================
create or replace function public.notify_calendar_event_coppia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other_partner_id uuid;
  actor_name text;
begin
  other_partner_id := public._other_partner_id(new.couple_id, new.created_by);
  if other_partner_id is null then
    return new; -- coppia incompleta/dato incoerente: niente da notificare
  end if;

  select display_name into actor_name from public.profiles where id = new.created_by;

  insert into public.notifications (couple_id, recipient_id, actor_id, type, title, body, source_table, source_id)
  values (
    new.couple_id, other_partner_id, new.created_by, 'evento_coppia',
    'Nuovo evento di coppia',
    coalesce(actor_name, 'Il tuo partner') || ' ha aggiunto "' || new.title || '" al calendario',
    'calendar_events', new.id
  );

  return new;
end;
$$;

comment on function public.notify_calendar_event_coppia() is
  'Trigger AFTER INSERT su calendar_events (solo category = coppia): notifica l''altro partner. SECURITY DEFINER: chi inserisce l''evento non è il destinatario della notifica.';

create trigger calendar_events_notify_coppia
  after insert on public.calendar_events
  for each row
  when (new.category = 'coppia')
  execute function public.notify_calendar_event_coppia();

-- =============================================================================
-- Trigger 2/3: appointments (nuova idea/appuntamento) -> notifica l'altro partner
-- =============================================================================
create or replace function public.notify_appointment_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other_partner_id uuid;
  actor_name text;
begin
  other_partner_id := public._other_partner_id(new.couple_id, new.created_by);
  if other_partner_id is null then
    return new;
  end if;

  select display_name into actor_name from public.profiles where id = new.created_by;

  insert into public.notifications (couple_id, recipient_id, actor_id, type, title, body, source_table, source_id)
  values (
    new.couple_id, other_partner_id, new.created_by, 'appuntamento',
    'Nuova idea per un appuntamento',
    coalesce(actor_name, 'Il tuo partner') || ' ha aggiunto "' || new.title || '" tra gli appuntamenti',
    'appointments', new.id
  );

  return new;
end;
$$;

comment on function public.notify_appointment_created() is
  'Trigger AFTER INSERT su appointments: notifica l''altro partner. Fires su OGNI insert (sia un''"idea" sia un confermato inserito direttamente, vedi lib/appointments-actions.ts). Non confligge con appointments_sync_status_before_update (20260901040000): quello è BEFORE UPDATE, questo è AFTER INSERT. Il flusso "conferma di un''idea" (INSERT su calendar_events + UPDATE su questa riga) genera quindi una notifica appuntamento (da questo insert) più eventualmente una evento_coppia separata (dall''insert su calendar_events) — comportamento atteso, non un doppio conteggio della stessa azione.';

create trigger appointments_notify_created
  after insert on public.appointments
  for each row
  execute function public.notify_appointment_created();

-- =============================================================================
-- Trigger 3/3: wishlist_items (nuovo elemento, rispettando la sorpresa)
-- =============================================================================
-- Decisione di design sulla sorpresa (vedi analisi in
-- 20260901020000_wishlist_items.sql sulla modalità sorpresa): quando
-- is_surprise = true, il vincolo wishlist_items_surprise_requires_partner_target
-- garantisce che il target includa il partner — quindi l'UNICO destinatario
-- possibile di questa notifica (l'altro partner) è SEMPRE il bersaglio della
-- sorpresa. Scelta presa: SALTARE del tutto la notifica in quel caso (WHEN
-- clause sotto), non generarla con un testo generico — una notifica
-- "push-style" è un segnale più forte e più correlato nel tempo di quanto lo
-- sia già il placeholder "sorpresa in arrivo" nella wishlist_feed (che
-- richiede un'azione deliberata, aprire la Wishlist, per essere vista; una
-- notifica arriva subito e permette di dedurre più facilmente COSA sia
-- successo in quel momento preciso). Coerente con "l'app non deve rovinare
-- le sorprese", già ribadito nel progetto: qui si sceglie la lettura più
-- conservativa.
create or replace function public.notify_wishlist_item_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other_partner_id uuid;
  actor_name text;
begin
  other_partner_id := public._other_partner_id(new.couple_id, new.created_by);
  if other_partner_id is null then
    return new;
  end if;

  select display_name into actor_name from public.profiles where id = new.created_by;

  insert into public.notifications (couple_id, recipient_id, actor_id, type, title, body, source_table, source_id)
  values (
    new.couple_id, other_partner_id, new.created_by, 'wishlist',
    'Nuovo elemento in wishlist',
    coalesce(actor_name, 'Il tuo partner') || ' ha aggiunto "' || new.title || '" alla wishlist',
    'wishlist_items', new.id
  );

  return new;
end;
$$;

comment on function public.notify_wishlist_item_created() is
  'Trigger AFTER INSERT su wishlist_items (WHEN not is_surprise, vedi commento esteso sopra): notifica l''altro partner. Non fires per gli item a sorpresa, per non rivelarne l''esistenza appena aggiunta.';

create trigger wishlist_items_notify_created
  after insert on public.wishlist_items
  for each row
  when (not new.is_surprise)
  execute function public.notify_wishlist_item_created();

-- =============================================================================
-- Estensione: toggle_message_reaction -> notifica il mittente su "cuore aggiunto"
-- =============================================================================
-- CREATE OR REPLACE della RPC esistente (20260831190000_messages.sql), stessa
-- firma/comportamento di ritorno. Aggiunta: quando il cuore viene AGGIUNTO
-- (mai su rimozione, per non "spammare" chi toglie un cuore per errore) E chi
-- reagisce non è il mittente del messaggio (la RLS non lo impedisce
-- esplicitamente, un membro della coppia può in teoria reagire a qualunque
-- messaggio della coppia incluso il proprio), inserisce una notifica per il
-- mittente. Nessun nuovo GRANT necessario: CREATE OR REPLACE FUNCTION
-- preserva gli ACL esistenti quando la firma non cambia.
create or replace function public.toggle_message_reaction(message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  my_id uuid := auth.uid();
  msg_couple_id uuid;
  msg_sender_id uuid;
  my_couple_id uuid;
  currently_liked boolean;
  actor_name text;
begin
  if my_id is null then
    raise exception 'Utente non autenticato';
  end if;

  select couple_id, sender_id into msg_couple_id, msg_sender_id from public.messages where id = message_id;
  if not found then
    raise exception 'Messaggio non trovato';
  end if;

  select couple_id into my_couple_id from public.profiles where id = my_id;
  if my_couple_id is null or my_couple_id <> msg_couple_id then
    raise exception 'Non hai accesso a questo messaggio';
  end if;

  select my_id = any(liked_by) into currently_liked from public.messages where id = message_id;

  if currently_liked then
    update public.messages set liked_by = array_remove(liked_by, my_id) where id = message_id;
  else
    update public.messages set liked_by = array_append(liked_by, my_id) where id = message_id;

    if msg_sender_id <> my_id then
      select display_name into actor_name from public.profiles where id = my_id;
      insert into public.notifications (couple_id, recipient_id, actor_id, type, title, body, source_table, source_id)
      values (
        msg_couple_id, msg_sender_id, my_id, 'reazione',
        'Nuovo cuore ricevuto',
        coalesce(actor_name, 'Il tuo partner') || ' ha messo un cuore a un tuo pensiero',
        'messages', message_id
      );
    end if;
  end if;

  return not currently_liked;
end;
$$;

comment on function public.toggle_message_reaction(uuid) is
  'Aggiunge/rimuove auth.uid() da messages.liked_by. Ritorna true se ora piace, false se tolta. Su aggiunta (mai su rimozione), inserisce una notifica per messages.sender_id (skip se ti metti un cuore da solo/a).';

-- =============================================================================
-- Realtime
-- =============================================================================
alter publication supabase_realtime add table public.notifications;
alter table public.notifications replica identity full;
