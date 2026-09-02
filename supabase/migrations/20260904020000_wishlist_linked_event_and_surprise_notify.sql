-- =============================================================================
-- Fase D: sorpresa wishlist collegabile (opzionale) a un evento calendario
-- + fix: le sorprese ora notificano il partner (testo generico, mai il contenuto)
-- =============================================================================
-- Su richiesta esplicita dell'utente, che ribalta una scelta di design
-- precedente: la migration 20260901090000_notifications.sql escludeva
-- deliberatamente le sorprese dalle notifiche ("WHEN not new.is_surprise"),
-- per non rivelarne l'esistenza. L'utente vuole invece un avviso generico
-- ("hai una sorpresa in arrivo"), che non svela cosa sia — coerente con la
-- RLS/masking di wishlist_feed, che continua a proteggere il contenuto.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Colonna opzionale: collega una sorpresa a un evento calendario esistente.
-- -----------------------------------------------------------------------------
alter table public.wishlist_items
  add column linked_calendar_event_id uuid references public.calendar_events (id) on delete set null;

comment on column public.wishlist_items.linked_calendar_event_id is
  'Collegamento opzionale a un evento calendario della coppia (mai obbligatorio) — usato per anticipare "c''è una sorpresa legata a questo giorno" senza rivelarne il contenuto. on delete set null: cancellare l''evento non cancella la sorpresa, solo il collegamento.';

-- Passthrough nella view mascherata: NON va nascosto come title/price/ecc,
-- è proprio il punto della feature anticipare "a quale evento è legata" —
-- coerente col principio "Anticipazione" del design. CREATE OR REPLACE VIEW
-- con la colonna aggiunta in coda: nessun drop necessario (l'ordine/tipo
-- delle colonne esistenti resta invariato, requisito Postgres per il replace
-- di una view).
create or replace view public.wishlist_feed
  with (security_invoker = false, security_barrier = true)
as
select
  w.id,
  w.couple_id,
  w.created_by,
  w.category,
  w.target,
  w.priority,
  w.is_surprise,
  w.status,
  (w.is_surprise and w.status = 'attivo' and w.created_by <> auth.uid()) as is_hidden_surprise,
  case when (w.is_surprise and w.status = 'attivo' and w.created_by <> auth.uid())
    then null else w.title end as title,
  case when (w.is_surprise and w.status = 'attivo' and w.created_by <> auth.uid())
    then null else w.description end as description,
  case when (w.is_surprise and w.status = 'attivo' and w.created_by <> auth.uid())
    then null else w.price end as price,
  case when (w.is_surprise and w.status = 'attivo' and w.created_by <> auth.uid())
    then null else w.link end as link,
  case when (w.is_surprise and w.status = 'attivo' and w.created_by <> auth.uid())
    then null else w.photo_url end as photo_url,
  w.completed_at,
  w.completed_by,
  w.created_at,
  w.updated_at,
  w.linked_calendar_event_id
from public.wishlist_items w
where w.couple_id = public.current_couple_id();

-- -----------------------------------------------------------------------------
-- 2. Fix notifiche: le sorprese notificano ora, con testo generico (mai
--    titolo/prezzo/dettagli); se collegate a un evento, il nome dell'evento
--    è ok da citare (non rivela IL REGALO, solo A CHE GIORNO è legato).
-- -----------------------------------------------------------------------------
create or replace function public.notify_wishlist_item_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other_partner_id uuid;
  actor_name text;
  linked_event_title text;
begin
  other_partner_id := public._other_partner_id(new.couple_id, new.created_by);
  if other_partner_id is null then
    return new;
  end if;

  select display_name into actor_name from public.profiles where id = new.created_by;

  if new.is_surprise then
    if new.linked_calendar_event_id is not null then
      select title into linked_event_title from public.calendar_events where id = new.linked_calendar_event_id;
    end if;

    insert into public.notifications (couple_id, recipient_id, actor_id, type, title, body, source_table, source_id)
    values (
      new.couple_id, other_partner_id, new.created_by, 'wishlist',
      'Una sorpresa per te 🎁',
      case when linked_event_title is not null
        then coalesce(actor_name, 'Il tuo partner') || ' ha una sorpresa per te, legata a "' || linked_event_title || '"'
        else coalesce(actor_name, 'Il tuo partner') || ' ha una sorpresa in arrivo per te'
      end,
      'wishlist_items', new.id
    );
  else
    insert into public.notifications (couple_id, recipient_id, actor_id, type, title, body, source_table, source_id)
    values (
      new.couple_id, other_partner_id, new.created_by, 'wishlist',
      'Nuovo elemento in wishlist',
      coalesce(actor_name, 'Il tuo partner') || ' ha aggiunto "' || new.title || '" alla wishlist',
      'wishlist_items', new.id
    );
  end if;

  return new;
end;
$$;

comment on function public.notify_wishlist_item_created() is
  'Trigger AFTER INSERT su wishlist_items: notifica sempre l''altro partner. Per le sorprese, testo generico che non rivela mai titolo/prezzo/descrizione — solo, se collegata, il nome dell''evento a cui è legata.';

-- Il trigger va ricreato (non solo la funzione): il WHEN precedente
-- ("not new.is_surprise") va rimosso, e il WHEN di un trigger esistente non
-- si può ALTERare in place.
drop trigger wishlist_items_notify_created on public.wishlist_items;
create trigger wishlist_items_notify_created
  after insert on public.wishlist_items
  for each row
  execute function public.notify_wishlist_item_created();
