-- =============================================================================
-- RPC: set_relationship_start_date
-- =============================================================================
-- Gap segnalato dal teammate "frontend": `couples` non ha nessuna policy
-- UPDATE per `authenticated` (per design, vedi 20260831120000_core_schema.sql
-- — tutte le scritture su couples passano da RPC SECURITY DEFINER). Questo
-- però significa che `relationship_start_date` non era impostabile in nessun
-- modo dal client, bloccando il countdown anniversario di Home e le
-- impostazioni di Profilo (Fase 2). Aggiunta ora dal lead, stesso pattern
-- delle RPC di pairing in 20260831120200_pairing_functions.sql: una funzione
-- dedicata invece di una policy UPDATE generica, così un partner non può
-- alterare partner_1_id/partner_2_id passando per la stessa via.
--
-- Contratto per il frontend: supabase.rpc('set_relationship_start_date',
-- { p_date: 'YYYY-MM-DD' }). Richiede utente autenticato e accoppiato;
-- solleva eccezione altrimenti. Non ancora chiamata da nessuna schermata in
-- Fase 1 (Profilo è un placeholder), sarà il punto di ingresso quando
-- Profilo/Fase 2 aggiungerà l'impostazione della data di inizio relazione.
-- =============================================================================

create or replace function public.set_relationship_start_date(p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_id uuid := auth.uid();
  my_couple_id uuid;
begin
  if my_id is null then
    raise exception 'Utente non autenticato';
  end if;

  select couple_id into my_couple_id from public.profiles where id = my_id;
  if my_couple_id is null then
    raise exception 'Non sei accoppiato/a con un partner';
  end if;

  update public.couples
    set relationship_start_date = p_date
    where id = my_couple_id;
end;
$$;

comment on function public.set_relationship_start_date(date) is
  'Imposta couples.relationship_start_date per la coppia dell''utente autenticato. Unico modo per scrivere quella colonna dal client.';

revoke execute on function public.set_relationship_start_date(date) from public;
grant execute on function public.set_relationship_start_date(date) to authenticated;
