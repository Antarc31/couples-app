-- =============================================================================
-- Colori partner distinti automatici al pairing
-- =============================================================================
-- Bug: `profiles.color` ha default `#A6C8F0` (blu cielo) per TUTTI i nuovi
-- account (vedi 20260831120000_core_schema.sql) e non è mai esistita una UI
-- per personalizzarlo — quindi due partner accoppiati risultano
-- indistinguibili in legenda (stesso colore) finché non viene aggiunta la
-- personalizzazione manuale (Fase 4, miglioramento futuro).
--
-- Fix: ridefinire `accept_pairing_invite` (`create or replace function`,
-- stesso pattern già usato per il trigger di sync appointments in
-- 20260901040000_appointments_status_sync_trigger.sql) aggiungendo un solo
-- passaggio alla fine, prima del return: se ENTRAMBI i profili hanno ancora
-- il colore di default `#A6C8F0` (nessuno dei due lo ha mai personalizzato),
-- assegna a chi ACCETTA l'invito il colore alternato `#F7A6C4` (rosa —
-- stesso valore già usato come colore "partner A"/primario di default nel
-- design system, vedi docs/PLAN.md sezione "Design system"). Chi ha creato
-- l'invito mantiene il blu di default.
--
-- La condizione controlla il colore di ENTRAMBI (non solo di chi invita) per
-- non sovrascrivere un'eventuale personalizzazione già fatta da chi accetta
-- prima del pairing (es. se in futuro venisse aggiunta la UI di
-- personalizzazione e uno dei due partner cambiasse colore prima di
-- accoppiarsi, quella scelta va rispettata).
--
-- Nessuna nuova colonna, nessuna nuova RPC: il corpo della funzione è
-- identico a quello in 20260831120200_pairing_functions.sql salvo
-- l'aggiunta descritta sopra.
--
-- Fix dati per la coppia già esistente (Asia/Antonio): NON retroattivo,
-- questa migration si applica solo ai pairing futuri. Il lead aggiorna
-- manualmente via SQL il colore di uno dei due partner esistenti dopo che
-- questa migration è live.
-- =============================================================================

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
  inviter_color text;
  accepter_color text;
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

  -- Colori distinti automatici (nuovo): se nessuno dei due ha mai
  -- personalizzato il colore (entrambi ancora sul default blu `#A6C8F0`),
  -- assegna a chi accetta il rosa `#F7A6C4` così la coppia è visivamente
  -- distinguibile fin dal primo pairing, senza dover chiedere nulla
  -- all'utente (niente domanda "uomo/donna" alla registrazione).
  select color into inviter_color from public.profiles where id = invite.created_by;
  select color into accepter_color from public.profiles where id = my_id;

  if inviter_color = '#A6C8F0' and accepter_color = '#A6C8F0' then
    update public.profiles
      set color = '#F7A6C4'
      where id = my_id;
  end if;

  update public.pairing_invites
    set status = 'accepted',
        accepted_by = my_id,
        accepted_at = now()
    where id = invite.id;

  return new_couple_id;
end;
$$;

comment on function public.accept_pairing_invite(text) is
  'Accetta un codice di invito pairing: crea la riga couples, collega i due profiles, invalida il codice. Se nessuno dei due partner ha personalizzato il colore, assegna a chi accetta il rosa #F7A6C4 (distinto dal blu di default #A6C8F0) così la coppia è visivamente distinguibile. Solleva eccezione se il codice non è valido/scaduto o se uno dei due utenti è già accoppiato/a.';

revoke execute on function public.accept_pairing_invite(text) from public;
grant execute on function public.accept_pairing_invite(text) to authenticated;
