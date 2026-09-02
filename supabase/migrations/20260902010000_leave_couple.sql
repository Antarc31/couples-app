-- =============================================================================
-- leave_couple(): uscire da una coppia senza cancellare il proprio account
-- =============================================================================
-- Oggi l'unico modo per "disaccoppiarsi" è cancellare l'intero account
-- (delete_own_account, 20260902000000): manca un percorso più leggero per
-- chi vuole semplicemente lasciare la coppia mantenendo login/profilo.
-- Rilevante sia per l'uso quotidiano sia in vista di una pubblicazione
-- pubblica (linee guida Apple 1.2: un utente deve poter troncare il
-- collegamento con un altro utente).
--
-- Stessa semantica di cascata già in vigore quando un partner cancella
-- l'account: cancellare la riga `couples` fa scattare `on delete cascade` su
-- TUTTI i dati condivisi (messages, calendar_events, appointments,
-- wishlist_items, notifications) e `on delete set null` su
-- profiles.couple_id per entrambi i partner — quindi lasciare la coppia ha
-- le stesse conseguenze sui dati condivisi di una cancellazione account,
-- semplicemente senza cancellare login/profilo di chi se ne va.
-- Comportamento voluto, non un effetto collaterale: non avrebbe senso che
-- l'ex partner mantenga la cronologia condivisa con qualcuno che ha scelto
-- di andarsene.
create or replace function public.leave_couple()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_couple_id uuid;
begin
  select couple_id into my_couple_id from public.profiles where id = auth.uid();
  if my_couple_id is null then
    raise exception 'Non sei accoppiato/a con nessuno';
  end if;

  delete from public.couples where id = my_couple_id;
end;
$$;

comment on function public.leave_couple() is
  'Scioglie la coppia corrente del chiamante: cancella la riga couples (cascata su tutti i dati condivisi), profiles.couple_id torna NULL per entrambi i partner. Il proprio account/login resta intatto, a differenza di delete_own_account.';

revoke execute on function public.leave_couple() from public;
grant execute on function public.leave_couple() to authenticated;
