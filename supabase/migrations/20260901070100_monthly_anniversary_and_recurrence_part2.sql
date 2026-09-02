-- =============================================================================
-- Mesiversario: couples.monthly_anniversary_event_id + trigger esteso.
-- =============================================================================
-- Piano approvato:
-- /Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md
-- -> "3. Fix proiezione ricorrenze nel Calendario + mesiversario".
--
-- Richiede che 20260901070000_monthly_anniversary_and_recurrence.sql
-- (`alter type public.event_recurrence add value 'mensile'`) sia già stata
-- applicata in una transazione precedente -- vedi il commento esteso in
-- quel file sul perché è stata splittata a parte.
--
-- Stesso pattern già collaudato di anniversary_event_id/birthday_event_id
-- (vedi 20260901060000_profile_birth_date_and_special_events.sql): FK
-- univoca nullable con `on delete set null`.
alter table public.couples
  add column monthly_anniversary_event_id uuid unique references public.calendar_events (id) on delete set null;

comment on column public.couples.monthly_anniversary_event_id is
  'FK univoca nullable verso l''evento calendario categoria speciale "Mesiversario" (ricorrenza mensile) generato/aggiornato automaticamente dallo stesso trigger di anniversary_event_id, quando relationship_start_date viene impostata via RPC set_relationship_start_date. NON impostabile dal client.';

-- =============================================================================
-- Trigger: public.couples -> genera/aggiorna/cancella ANCHE l'evento
-- "Mesiversario", insieme all'"Anniversario" già gestito.
-- =============================================================================
-- Ridefinizione completa (`create or replace function`, stesso nome/firma,
-- stesso trigger `couples_sync_anniversary_event` già collegato -- non
-- serve toccare il `create trigger`, la ridefinizione della funzione basta)
-- di handle_couple_anniversary_event(): stessa colonna sorgente
-- (relationship_start_date, stesso `before update of relationship_start_date`
-- già esistente), stessa logica di update-sul-posto/insert/cancellazione già
-- scritta per anniversary_event_id, ora duplicata per
-- monthly_anniversary_event_id con `recurrence: 'mensile'` e
-- `title: 'Mesiversario'`.
--
-- ***PUNTO CRITICO, NON SEMPLIFICARE, INVARIATO DALLA VERSIONE PRECEDENTE***:
-- questa funzione RESTA SECURITY DEFINER per lo stesso motivo già
-- documentato e verificato in 20260901060000_...: il partner che chiama
-- set_relationship_start_date per aggiornare una data già impostata da
-- created_by = altro partner deve poter scrivere comunque su
-- calendar_events (RLS permette update solo a created_by = auth.uid()
-- oppure category = 'coppia' -- 'speciale' non ha quell'eccezione). Senza
-- SECURITY DEFINER l'update del mesiversario fallirebbe silenziosamente
-- (0 righe modificate, RLS filtra, nessun errore) esattamente come
-- l'anniversario nello scenario già verificato dal lead.
create or replace function public.handle_couple_anniversary_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_event_id uuid;
  linked_monthly_event_id uuid;
  event_creator uuid;
begin
  if new.relationship_start_date is null then
    if new.anniversary_event_id is not null then
      delete from public.calendar_events where id = new.anniversary_event_id;
      new.anniversary_event_id := null;
    end if;
    if new.monthly_anniversary_event_id is not null then
      delete from public.calendar_events where id = new.monthly_anniversary_event_id;
      new.monthly_anniversary_event_id := null;
    end if;
    return new;
  end if;

  -- auth.uid() = chi ha chiamato set_relationship_start_date (chi crea gli
  -- eventi diventa created_by, coerente col resto dello schema). Fallback a
  -- partner_1_id nell'ipotesi limite in cui auth.uid() non sia disponibile.
  -- Stesso valore riusato per entrambi gli eventi (anniversario + mesiversario)
  -- se entrambi vanno creati nella stessa invocazione del trigger.
  event_creator := coalesce(auth.uid(), new.partner_1_id);

  -- ---- Anniversario (annuale) — logica invariata rispetto alla versione
  -- precedente di questa funzione (20260901060000_...). ----
  if new.anniversary_event_id is not null then
    update public.calendar_events
      set starts_at = new.relationship_start_date::timestamptz,
          title = 'Anniversario'
      where id = new.anniversary_event_id
      returning id into linked_event_id;
  end if;

  if linked_event_id is null then
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

  -- ---- Mesiversario (mensile) — stessa identica logica, nuovo ramo. ----
  if new.monthly_anniversary_event_id is not null then
    update public.calendar_events
      set starts_at = new.relationship_start_date::timestamptz,
          title = 'Mesiversario'
      where id = new.monthly_anniversary_event_id
      returning id into linked_monthly_event_id;
  end if;

  if linked_monthly_event_id is null then
    insert into public.calendar_events (
      couple_id, created_by, title, category, starts_at, all_day, recurrence
    ) values (
      new.id,
      event_creator,
      'Mesiversario',
      'speciale',
      new.relationship_start_date::timestamptz,
      true,
      'mensile'
    )
    returning id into linked_monthly_event_id;

    new.monthly_anniversary_event_id := linked_monthly_event_id;
  end if;

  return new;
end;
$$;

comment on function public.handle_couple_anniversary_event() is
  'Trigger BEFORE UPDATE OF relationship_start_date su couples: genera/aggiorna/cancella gli eventi calendario "Anniversario" (annuale) e "Mesiversario" (mensile) collegati. SECURITY DEFINER: vedi commento esteso sopra la funzione -- critico per il caso "partner B aggiorna un evento creato da partner A", stesso principio già verificato per l''anniversario.';

-- Nessuna modifica al `create trigger couples_sync_anniversary_event`
-- (20260901060000_...): resta `before update of relationship_start_date`,
-- la ridefinizione della funzione sopra basta.
