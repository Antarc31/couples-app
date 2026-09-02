-- =============================================================================
-- Pairing RPC functions
-- =============================================================================
-- Due funzioni SECURITY DEFINER, chiamabili dal client via
-- `supabase.rpc('create_pairing_invite')` / `supabase.rpc('accept_pairing_invite', { invite_code })`.
-- Sono l'UNICO modo per scrivere su `couples` e `pairing_invites` (vedi RLS in
-- 20260831120000_core_schema.sql, che non concede INSERT/UPDATE a
-- `authenticated` su quelle tabelle).
--
-- Contratto per il frontend:
--   create_pairing_invite() -> text
--     Codice a 8 caratteri alfanumerici (maiuscolo, senza caratteri
--     ambigui 0/O/1/I) da mostrare/condividere. Genera errore se l'utente è
--     già accoppiato. Invalida automaticamente eventuali inviti precedenti
--     ancora pendenti dello stesso utente (un solo codice attivo alla volta).
--
--   accept_pairing_invite(invite_code text) -> uuid (couple_id)
--     Valida il codice (esistente, stato 'pending', non scaduto), crea la
--     riga `couples`, aggiorna `profiles.couple_id` per entrambi i partner e
--     marca l'invito come 'accepted'. Solleva un'eccezione leggibile se il
--     codice non è valido/è scaduto, se l'utente prova ad accoppiarsi con se
--     stesso, o se uno dei due utenti è già accoppiato.
--
-- Entrambe le funzioni si aspettano un utente autenticato (auth.uid() non
-- null); vanno chiamate solo da un client Supabase con sessione valida.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper interno: genera un codice leggibile e ne verifica l'unicità.
-- -----------------------------------------------------------------------------
create or replace function public._generate_invite_code()
returns text
language plpgsql
as $$
declare
  -- Alfabeto senza 0/O/1/I per evitare ambiguità quando il codice viene
  -- letto/digitato a mano dal partner.
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
    end loop;

    if not exists (select 1 from public.pairing_invites where code = candidate) then
      return candidate;
    end if;
    -- altrimenti ripeti il loop e genera un altro candidato
  end loop;
end;
$$;

-- Funzione interna, non pensata per essere chiamata dal client: nessun ruolo
-- applicativo la deve poter eseguire direttamente (viene invocata solo da
-- create_pairing_invite, che gira come owner della funzione e quindi la può
-- eseguire indipendentemente dai GRANT).
revoke execute on function public._generate_invite_code() from public;

-- -----------------------------------------------------------------------------
-- create_pairing_invite
-- -----------------------------------------------------------------------------
create or replace function public.create_pairing_invite()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
  my_couple_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Utente non autenticato';
  end if;

  select couple_id into my_couple_id from public.profiles where id = auth.uid();
  if my_couple_id is not null then
    raise exception 'Sei già accoppiato/a con un partner';
  end if;

  -- Un solo codice attivo per utente: invalida eventuali inviti pendenti
  -- precedenti creati dallo stesso utente.
  update public.pairing_invites
    set status = 'cancelled'
    where created_by = auth.uid()
      and status = 'pending';

  new_code := public._generate_invite_code();

  insert into public.pairing_invites (code, created_by)
  values (new_code, auth.uid());

  return new_code;
end;
$$;

comment on function public.create_pairing_invite() is
  'Genera un nuovo codice di invito pairing per l''utente autenticato. Invalida eventuali codici pendenti precedenti dello stesso utente.';

revoke execute on function public.create_pairing_invite() from public;
grant execute on function public.create_pairing_invite() to authenticated;

-- -----------------------------------------------------------------------------
-- accept_pairing_invite
-- -----------------------------------------------------------------------------
create or replace function public.accept_pairing_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite record;
  my_id uuid := auth.uid();
  my_couple_id uuid;
  inviter_couple_id uuid;
  new_couple_id uuid;
begin
  if my_id is null then
    raise exception 'Utente non autenticato';
  end if;

  -- Blocca la riga dell'invito per evitare doppie accettazioni concorrenti.
  select * into invite
    from public.pairing_invites
    where code = invite_code
    for update;

  if not found then
    raise exception 'Codice invito non valido';
  end if;

  if invite.status <> 'pending' then
    raise exception 'Questo codice invito non è più valido';
  end if;

  if invite.expires_at <= now() then
    update public.pairing_invites set status = 'expired' where id = invite.id;
    raise exception 'Questo codice invito è scaduto';
  end if;

  if invite.created_by = my_id then
    raise exception 'Non puoi accoppiarti usando un tuo stesso codice';
  end if;

  select couple_id into my_couple_id from public.profiles where id = my_id;
  if my_couple_id is not null then
    raise exception 'Sei già accoppiato/a con un partner';
  end if;

  select couple_id into inviter_couple_id from public.profiles where id = invite.created_by;
  if inviter_couple_id is not null then
    raise exception 'Chi ha creato questo invito è già accoppiato/a con un partner';
  end if;

  insert into public.couples (partner_1_id, partner_2_id)
  values (invite.created_by, my_id)
  returning id into new_couple_id;

  update public.profiles
    set couple_id = new_couple_id
    where id in (invite.created_by, my_id);

  update public.pairing_invites
    set status = 'accepted',
        accepted_by = my_id,
        accepted_at = now()
    where id = invite.id;

  return new_couple_id;
end;
$$;

comment on function public.accept_pairing_invite(text) is
  'Accetta un codice di invito pairing: crea la riga couples, collega i due profiles, invalida il codice. Solleva eccezione se il codice non è valido/scaduto o se uno dei due utenti è già accoppiato.';

revoke execute on function public.accept_pairing_invite(text) from public;
grant execute on function public.accept_pairing_invite(text) to authenticated;
