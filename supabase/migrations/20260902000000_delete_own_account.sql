-- =============================================================================
-- delete_own_account(): cancellazione account self-service
-- =============================================================================
-- Requisito App Store (Apple, obbligatorio dal 30 giugno 2022): un'app che
-- permette di creare un account deve permettere anche di cancellarlo
-- dall'interno dell'app stessa, non solo "contattaci via email".
--
-- Un utente `authenticated` non può cancellare la propria riga in
-- `auth.users` direttamente: quello schema è gestito da GoTrue, non ha grant
-- DELETE per `authenticated` né RLS pensata per questo. SECURITY DEFINER è
-- necessario esattamente come per mark_notification_read/toggle_message_reaction
-- (20260901090000_notifications.sql): la funzione gira coi privilegi di chi
-- l'ha creata (`postgres`, via migration), che su `auth.users` li ha.
--
-- Cancellare la riga in auth.users è sufficiente: ogni riga applicativa
-- collegata (profiles, couples via i due FK partner_*, messages, calendar_events,
-- appointments, wishlist_items, push_subscriptions, notifications) ha già
-- `on delete cascade` verso profiles/auth.users nelle migration precedenti,
-- quindi non serve cancellare nient'altro esplicitamente qui. Il partner
-- resta con `couple_id` invariato ma "orfano" (comportamento voluto: i suoi
-- dati/ricordi restano suoi, non vanno persi solo perché l'altro se ne va).
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

comment on function public.delete_own_account() is
  'Cancella permanentemente l''account del chiamante (auth.users + cascata su tutti i dati applicativi collegati). Nessun modo per annullare: la conferma va gestita lato client prima di chiamarla.';

revoke execute on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
