-- =============================================================================
-- calendar_events
-- =============================================================================
-- Vedi docs/PLAN.md -> "Screen-by-screen" / "Calendario" e "Architettura
-- tecnica". Nota di design importante (dal piano): gli "appuntamenti
-- confermati" NON sono una tabella separata, sono calendar_events filtrati/
-- arricchiti dal frontend (fase 2 aggiungerà eventuali colonne
-- luogo/costo/note specifiche degli appuntamenti come estensione di questa
-- stessa tabella, non come tabella duplicata).
--
-- Contratto per il frontend:
--   - `category` determina il colore in UI (mapping colori è responsabilità
--     del frontend/design system, NON è salvato in DB):
--       personale -> colore del partner che ha creato l'evento (profiles.color)
--       coppia    -> rosso corallo
--       speciale  -> oro/ambra
--       ciclo     -> lavanda
--   - `tag` è un'etichetta libera testuale (es. "amici", "uni", "sport",
--     "lavoro", "famiglia") INDIPENDENTE da categoria/colore, mostrata come
--     piccola etichetta/icona sull'evento. Può essere NULL.
--   - `recurrence` gestisce solo la ricorrenza annuale semplice per
--     compleanni/anniversari (categoria tipicamente 'speciale'): il frontend
--     calcola le occorrenze a runtime dalla data di `starts_at` (stesso
--     giorno/mese ogni anno), NON vengono materializzate righe per anno.
--   - Eventi categoria 'ciclo': privati di default. Sono visibili al partner
--     SOLO se `is_shared_with_partner = true`. La RLS sotto lo impone anche
--     lato server, non fidarti solo del frontend per nasconderli.
-- =============================================================================

create type public.event_category as enum ('personale', 'coppia', 'speciale', 'ciclo');

create type public.event_recurrence as enum ('nessuna', 'annuale');

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,

  title text not null,
  -- Etichetta/descrizione libera indipendente da categoria e colore.
  tag text,
  notes text,

  category public.event_category not null default 'personale',

  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,

  recurrence public.event_recurrence not null default 'nessuna',

  -- Rilevante solo per category = 'ciclo'. Default privato (false): il
  -- partner NON vede l'evento finché il creatore non attiva esplicitamente
  -- la condivisione. Per le altre categorie il valore è ignorato (gli eventi
  -- 'personale' sono comunque visibili al partner per il calcolo dei "buchi
  -- comuni": vedi RLS sotto, la privacy riguarda solo il ciclo).
  is_shared_with_partner boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_events_ends_after_starts
    check (ends_at is null or ends_at >= starts_at)
);

comment on table public.calendar_events is
  'Eventi di calendario condivisi di coppia. Gli appuntamenti confermati (fase 2) sono la stessa entità, non una tabella separata.';

comment on column public.calendar_events.tag is
  'Etichetta libera (es. amici/uni/sport), indipendente da categoria e colore.';

comment on column public.calendar_events.is_shared_with_partner is
  'Rilevante solo per category = ciclo. Default privato; il partner vede l''evento solo se true.';

create index calendar_events_couple_starts_idx
  on public.calendar_events (couple_id, starts_at);

create index calendar_events_category_idx
  on public.calendar_events (category);

create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row
  execute function public.set_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.calendar_events enable row level security;

-- SELECT: visibile a chi appartiene alla stessa coppia, tranne gli eventi
-- 'ciclo' non condivisi, visibili solo al creatore.
create policy "calendar_events_select_couple_respecting_cycle_privacy"
  on public.calendar_events for select
  to authenticated
  using (
    couple_id = public.current_couple_id()
    and (
      category <> 'ciclo'
      or created_by = auth.uid()
      or is_shared_with_partner = true
    )
  );

-- INSERT: solo per la propria coppia e solo a proprio nome (non si può creare
-- un evento "per conto" del partner).
create policy "calendar_events_insert_own"
  on public.calendar_events for insert
  to authenticated
  with check (
    couple_id = public.current_couple_id()
    and created_by = auth.uid()
  );

-- UPDATE/DELETE: il creatore può sempre modificare/eliminare il proprio
-- evento; per gli eventi di categoria 'coppia' (pianificati insieme) anche il
-- partner può modificarli/eliminarli, dato che sono condivisi per natura.
-- Eventi 'personale' e 'ciclo' restano modificabili solo dal creatore.
create policy "calendar_events_update_own_or_couple_category"
  on public.calendar_events for update
  to authenticated
  using (
    created_by = auth.uid()
    or (category = 'coppia' and couple_id = public.current_couple_id())
  )
  with check (
    couple_id = public.current_couple_id()
    and (
      created_by = auth.uid()
      or category = 'coppia'
    )
  );

create policy "calendar_events_delete_own_or_couple_category"
  on public.calendar_events for delete
  to authenticated
  using (
    created_by = auth.uid()
    or (category = 'coppia' and couple_id = public.current_couple_id())
  );
