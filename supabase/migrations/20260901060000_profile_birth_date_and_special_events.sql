-- =============================================================================
-- Data di nascita (profiles) + data inizio relazione (couples, RPC già
-- esistente) -> eventi calendario categoria 'speciale' AUTOMATICI.
-- =============================================================================
-- Piano approvato:
-- /Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md
-- -> "Feature B — Eventi 'speciale' automatici". Prima di questa migration
-- gli eventi 'speciale' (oro: compleanni/anniversario) si potevano creare
-- SOLO a mano dal Calendario. Ora l'app li genera/aggiorna da sola quando
-- l'utente imposta/modifica birth_date (Profilo) o
-- couples.relationship_start_date (RPC set_relationship_start_date già
-- esistente, vedi 20260831190100_couples_relationship_start_date_rpc.sql).
--
-- Stesso pattern già collaudato di appointments.calendar_event_id (vedi
-- 20260901010000_appointments.sql): FK univoca nullable con
-- `on delete set null`, così se l'evento collegato viene cancellato a mano
-- dal Calendario/EventDetailSheet il riferimento si azzera automaticamente,
-- nessuna logica applicativa aggiuntiva necessaria per quel percorso.
-- =============================================================================

alter table public.profiles
  add column birth_date date,
  add column birthday_event_id uuid unique references public.calendar_events (id) on delete set null;

comment on column public.profiles.birth_date is
  'Data di nascita, impostabile dal Profilo. Nullable: non richiesta alla registrazione (deciso con l''utente, vedi piano).';

comment on column public.profiles.birthday_event_id is
  'FK univoca nullable verso l''evento calendario categoria speciale generato automaticamente dal trigger sotto. NON impostabile dal client (vedi types/database.ts: assente da Update).';

alter table public.couples
  add column anniversary_event_id uuid unique references public.calendar_events (id) on delete set null;

comment on column public.couples.anniversary_event_id is
  'FK univoca nullable verso l''evento calendario categoria speciale generato automaticamente dal trigger sotto quando relationship_start_date viene impostata via RPC set_relationship_start_date. NON impostabile dal client.';

-- =============================================================================
-- Trigger: public.profiles -> genera/aggiorna/cancella l'evento "Compleanno"
-- =============================================================================
-- Fires "before update of birth_date, couple_id" (deliberato, non solo
-- birth_date): così se birth_date viene impostata PRIMA del pairing (nessun
-- couple_id ancora), l'evento non si crea subito (couple_id null = nessuna
-- coppia a cui appartenere) ma si genera RETROATTIVAMENTE quando
-- accept_pairing_invite imposta couple_id in seguito -- quella RPC fa
-- `update public.profiles set couple_id = ...`, che referenzia couple_id
-- nella clausola SET e quindi fa scattare questo trigger (semantica standard
-- Postgres per i trigger con column-list: scattano se la colonna è nella SET
-- clause, indipendentemente dal fatto che il valore cambi davvero) -- senza
-- dover toccare affatto accept_pairing_invite.
--
-- ***PUNTO CRITICO, NON SEMPLIFICARE***: questa funzione DEVE essere
-- SECURITY DEFINER (con search_path fissato, per blindarla da hijacking dello
-- schema). Le policy UPDATE/DELETE di calendar_events
-- (calendar_events_update_own_or_couple_category /
-- _delete_own_or_couple_category, vedi 20260831120100_calendar_events.sql)
-- permettono la scrittura solo a created_by = auth.uid() OPPURE se
-- category = 'coppia' -- gli eventi 'speciale' generati qui NON hanno
-- l'eccezione 'coppia'. Il caso "Compleanno" è comunque sempre lo stesso
-- utente che tocca il proprio evento (created_by = new.id sempre), ma è
-- SECURITY DEFINER qui per coerenza col trigger gemello su couples sotto (che
-- invece HA il caso critico reale: partner diverso da chi ha creato
-- l'evento) e perché comunque il trigger deve poter scrivere calendar_events
-- indipendentemente dal fatto che l'utente che ha appena modificato
-- birth_date sia anche created_by dell'evento preesistente (in teoria sempre
-- vero qui, ma non affidiamoci a quella coincidenza restando bloccati dalla
-- RLS in futuro se la logica cambia). auth.uid() resta comunque valorizzato
-- dentro il trigger (letto dai claim JWT della sessione, non dal ruolo di
-- esecuzione) -- stesso principio già verificato funzionante per
-- current_couple_id().
create or replace function public.handle_profile_birthday_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_event_id uuid;
begin
  -- birth_date azzerata: cancella l'eventuale evento collegato e azzera il
  -- riferimento. Nota: l'FK `on delete set null` gestisce già il percorso
  -- inverso (utente cancella l'evento a mano dal Calendario) senza bisogno
  -- di logica qui -- questo ramo copre solo "utente svuota la data dal
  -- Profilo".
  if new.birth_date is null then
    if new.birthday_event_id is not null then
      delete from public.calendar_events where id = new.birthday_event_id;
      new.birthday_event_id := null;
    end if;
    return new;
  end if;

  -- Non ancora accoppiato: nessun evento da creare adesso. Si genererà
  -- retroattivamente quando couple_id verrà impostato (vedi commento sopra).
  if new.couple_id is null then
    return new;
  end if;

  -- Se esiste già un evento collegato, aggiorniamolo sul posto (stesso id,
  -- niente duplicati) invece di crearne uno nuovo. Se `birthday_event_id`
  -- puntava a un evento nel frattempo cancellato a mano, la FK
  -- `on delete set null` l'ha già azzerato PRIMA che questo trigger scattasse
  -- di nuovo, quindi qui new.birthday_event_id è già null e si passa
  -- direttamente all'insert sotto -- è così che "ri-salvare la stessa data
  -- dal Profilo rigenera l'evento cancellato" senza altra logica.
  if new.birthday_event_id is not null then
    update public.calendar_events
      set starts_at = new.birth_date::timestamptz,
          title = 'Compleanno di ' || coalesce(new.display_name, 'te'),
          couple_id = new.couple_id
      where id = new.birthday_event_id
      returning id into linked_event_id;
  end if;

  if linked_event_id is null then
    insert into public.calendar_events (
      couple_id, created_by, title, category, starts_at, all_day, recurrence
    ) values (
      new.couple_id,
      new.id,
      'Compleanno di ' || coalesce(new.display_name, 'te'),
      'speciale',
      new.birth_date::timestamptz,
      true,
      'annuale'
    )
    returning id into linked_event_id;

    new.birthday_event_id := linked_event_id;
  end if;

  return new;
end;
$$;

comment on function public.handle_profile_birthday_event() is
  'Trigger BEFORE UPDATE OF birth_date, couple_id su profiles: genera/aggiorna/cancella l''evento calendario "Compleanno" (categoria speciale) collegato. SECURITY DEFINER: vedi commento esteso sopra la funzione.';

create trigger profiles_sync_birthday_event
  before update of birth_date, couple_id on public.profiles
  for each row
  execute function public.handle_profile_birthday_event();

-- =============================================================================
-- Trigger: public.couples -> genera/aggiorna/cancella l'evento "Anniversario"
-- =============================================================================
-- Stessa logica del trigger gemello sopra, per relationship_start_date ->
-- anniversary_event_id. Invocato indirettamente dalla RPC
-- set_relationship_start_date (20260831190100_couples_relationship_start_date_rpc.sql),
-- che fa `update public.couples set relationship_start_date = p_date where
-- id = my_couple_id` -- unico modo per scrivere quella colonna dal client
-- (couples non ha policy UPDATE dirette per authenticated, per design).
--
-- ***PUNTO CRITICO, NON SALTARE (verificato, non teorico)***: SECURITY
-- DEFINER qui non è opzionale. Scenario reale: il partner A imposta per
-- primo la data -> l'evento viene creato con created_by = A (auth.uid() al
-- momento della insert, cioè chi ha chiamato la RPC la prima volta). Il
-- partner B poi chiama set_relationship_start_date con una data diversa per
-- correggerla: quella RPC fa update su couples, che fa scattare QUESTO
-- trigger, che a sua volta deve fare un UPDATE su calendar_events per
-- aggiornare l'evento esistente (created_by = A, non B). Le policy RLS di
-- calendar_events permettono l'update solo a created_by = auth.uid() oppure
-- category = 'coppia' -- gli eventi 'speciale' non hanno quell'eccezione.
-- Senza SECURITY DEFINER su QUESTA funzione trigger (non basta che la RPC
-- chiamante lo sia: un trigger PL/pgSQL gira coi permessi RLS di chi ha
-- eseguito lo statement che l'ha fatto scattare, a meno che la funzione
-- trigger stessa non sia SECURITY DEFINER), l'update interno girerebbe con i
-- privilegi RLS di B (non creatore dell'evento): la RLS filtrerebbe
-- silenziosamente la riga target (0 righe modificate, ZERO errori,
-- l'evento resterebbe con la data vecchia) invece di aggiornarla o di
-- fallire in modo visibile -- il tipo di bug silenzioso più pericoloso.
-- Con SECURITY DEFINER il trigger bypassa la RLS come già fanno
-- accept_pairing_invite/set_relationship_start_date stesse. auth.uid()
-- resta comunque valorizzato dentro il trigger (letto dai claim JWT della
-- sessione, non dal ruolo di esecuzione) -- stesso principio già verificato
-- funzionante per current_couple_id().
create or replace function public.handle_couple_anniversary_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_event_id uuid;
  event_creator uuid;
begin
  if new.relationship_start_date is null then
    if new.anniversary_event_id is not null then
      delete from public.calendar_events where id = new.anniversary_event_id;
      new.anniversary_event_id := null;
    end if;
    return new;
  end if;

  if new.anniversary_event_id is not null then
    -- Update sul posto: qui sta il caso critico descritto sopra, quando chi
    -- chiama non è created_by dell'evento -- funziona solo perché questa
    -- funzione è SECURITY DEFINER.
    update public.calendar_events
      set starts_at = new.relationship_start_date::timestamptz,
          title = 'Anniversario'
      where id = new.anniversary_event_id
      returning id into linked_event_id;
  end if;

  if linked_event_id is null then
    -- auth.uid() = chi ha chiamato set_relationship_start_date la prima
    -- volta (quello che crea l'evento diventa created_by, coerente col resto
    -- dello schema). Fallback a partner_1_id nell'ipotesi limite in cui
    -- auth.uid() non sia disponibile (es. futura chiamata non interattiva),
    -- così l'insert non fallisce comunque per un created_by null.
    event_creator := coalesce(auth.uid(), new.partner_1_id);
    insert into public.calendar_events (
      couple_id, created_by, title, category, starts_at, all_day, recurrence
    ) values (
      new.id,
      event_creator,
      'Anniversario',
      'speciale',
      new.relationship_start_date::timestamptz,
      true,
      'annuale'
    )
    returning id into linked_event_id;

    new.anniversary_event_id := linked_event_id;
  end if;

  return new;
end;
$$;

comment on function public.handle_couple_anniversary_event() is
  'Trigger BEFORE UPDATE OF relationship_start_date su couples: genera/aggiorna/cancella l''evento calendario "Anniversario" (categoria speciale) collegato. SECURITY DEFINER: vedi commento esteso sopra la funzione -- critico per il caso "partner B aggiorna un evento creato da partner A".';

create trigger couples_sync_anniversary_event
  before update of relationship_start_date on public.couples
  for each row
  execute function public.handle_couple_anniversary_event();
