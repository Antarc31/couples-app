-- =============================================================================
-- Core schema: profiles, couples, pairing_invites
-- =============================================================================
-- Fonte di verità per il modello dati: docs/PLAN.md -> "Architettura tecnica
-- (raccomandazione)". Non modificare lo schema senza aggiornare quel documento
-- e senza avvisare il team lead.
--
-- Contratto per il frontend (vedi anche lib/supabase/*.ts e types/database.ts):
--   - `profiles.id` == `auth.users.id` (1:1, creato automaticamente da un
--     trigger su signup, vedi sotto). Niente INSERT manuale su profiles.
--   - Un utente non accoppiato ha `profiles.couple_id IS NULL`.
--   - Una volta accoppiati, entrambi i partner condividono lo stesso
--     `couples.id` in `profiles.couple_id`.
--   - Non esiste (in questa fase) un modo diretto via client per creare/
--     modificare righe in `couples` o `pairing_invites`: passa tutto dalle
--     funzioni RPC definite in 20260831120200_pairing_functions.sql.
-- =============================================================================

-- pgcrypto per gen_random_uuid() (di solito già presente su Supabase, ma lo
-- rendiamo esplicito e idempotente per gli ambienti locali/nuovi progetti).
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Helper: updated_at automatico
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tabella: profiles (estende auth.users)
-- -----------------------------------------------------------------------------
-- couple_id viene aggiunto con ALTER TABLE più sotto, dopo aver creato
-- `couples`, per evitare la dipendenza circolare profiles<->couples in fase
-- di creazione tabelle.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  -- Colore personalizzabile per questo partner nel calendario condiviso
  -- (default rosa/azzurro tenue da docs/PLAN.md, non forzato per genere).
  color text not null default '#A6C8F0',
  couple_id uuid, -- FK aggiunta sotto dopo la creazione di `couples`
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Estende auth.users con i dati pubblici/di app di ciascun partner. Riga creata automaticamente dal trigger handle_new_user su signup.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Tabella: couples
-- -----------------------------------------------------------------------------
-- Creata SOLO dalla funzione RPC accept_pairing_invite (SECURITY DEFINER, vedi
-- 20260831120200_pairing_functions.sql). Nessuna policy INSERT/UPDATE/DELETE
-- per `authenticated`: con RLS abilitata e senza policy per un comando, quel
-- comando è negato per chiunque non sia owner della tabella. Le funzioni
-- SECURITY DEFINER (di proprietà di `postgres`) bypassano la RLS ed è così
-- che questa tabella viene popolata.
create table public.couples (
  id uuid primary key default gen_random_uuid(),
  partner_1_id uuid not null references public.profiles (id) on delete cascade,
  partner_2_id uuid not null references public.profiles (id) on delete cascade,
  -- Data di inizio relazione: usata per countdown anniversario e streak
  -- giorni-insieme in Home (docs/PLAN.md). Nullable: può essere impostata più
  -- avanti dal Profilo, non è richiesta al momento del pairing.
  relationship_start_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint couples_distinct_partners check (partner_1_id <> partner_2_id),
  constraint couples_unique_pair unique (partner_1_id, partner_2_id)
);

comment on table public.couples is
  'Una riga per coppia accoppiata. Creata esclusivamente da accept_pairing_invite().';

create trigger couples_set_updated_at
  before update on public.couples
  for each row
  execute function public.set_updated_at();

-- Ora che `couples` esiste, aggiungiamo il vincolo FK su profiles.couple_id.
alter table public.profiles
  add constraint profiles_couple_id_fkey
  foreign key (couple_id) references public.couples (id) on delete set null;

create index profiles_couple_id_idx on public.profiles (couple_id);

-- -----------------------------------------------------------------------------
-- Tabella: pairing_invites
-- -----------------------------------------------------------------------------
-- Creata/aggiornata esclusivamente dalle funzioni RPC create_pairing_invite()
-- e accept_pairing_invite(). Nessuna policy INSERT/UPDATE/DELETE per
-- `authenticated`: stesso ragionamento di `couples` sopra. Questo impedisce a
-- un utente di forgiare inviti o di "rubare" codici cambiando lo stato a mano.
create table public.pairing_invites (
  id uuid primary key default gen_random_uuid(),
  -- Codice breve, leggibile, da condividere (es. "7K4QXPMN"). Generato dalla
  -- funzione RPC, non dal client, per garantire unicità e alfabeto sicuro.
  code text not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'cancelled')),
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

comment on table public.pairing_invites is
  'Codici di invito per il pairing tra due account. Scrittura solo via RPC (create_pairing_invite / accept_pairing_invite).';

create index pairing_invites_created_by_idx on public.pairing_invites (created_by);
create index pairing_invites_code_idx on public.pairing_invites (code);

-- =============================================================================
-- Trigger: crea automaticamente un profilo alla creazione di un utente auth
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- =============================================================================
-- Helper RLS: couple_id dell'utente corrente (SECURITY DEFINER per evitare
-- ricorsione infinita quando referenziato da una policy sulla stessa tabella
-- `profiles`: la funzione bypassa la RLS internamente, la policy no).
-- =============================================================================
create or replace function public.current_couple_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select couple_id from public.profiles where id = auth.uid();
$$;

comment on function public.current_couple_id() is
  'Ritorna il couple_id del profilo dell''utente autenticato corrente, o NULL se non accoppiato. Usare nelle policy RLS invece di una subquery diretta su profiles per evitare ricorsione.';

-- Postgres concede EXECUTE a PUBLIC di default sulle funzioni nuove: lo
-- revochiamo esplicitamente e lo concediamo solo ad `authenticated` (least
-- privilege, l'app non ha accesso anonimo).
revoke execute on function public.current_couple_id() from public;
grant execute on function public.current_couple_id() to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- ---- profiles -----------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles_select_self_or_partner"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or couple_id = public.current_couple_id());

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Nessuna policy INSERT: le righe si creano solo via trigger handle_new_user
-- (SECURITY DEFINER, bypassa RLS). Nessuna policy DELETE: la cancellazione
-- avviene solo a cascata dalla cancellazione dell'utente auth.

-- ---- couples --------------------------------------------------------------
alter table public.couples enable row level security;

create policy "couples_select_members"
  on public.couples for select
  to authenticated
  using (auth.uid() in (partner_1_id, partner_2_id));

-- Nessuna policy INSERT/UPDATE/DELETE per `authenticated`: vedi commento sulla
-- tabella sopra, tutto passa dalla funzione RPC SECURITY DEFINER.

-- ---- pairing_invites --------------------------------------------------------
alter table public.pairing_invites enable row level security;

create policy "pairing_invites_select_own"
  on public.pairing_invites for select
  to authenticated
  using (created_by = auth.uid() or accepted_by = auth.uid());

-- Nessuna policy INSERT/UPDATE/DELETE per `authenticated`: creazione e
-- accettazione passano esclusivamente dalle funzioni RPC SECURITY DEFINER in
-- 20260831120200_pairing_functions.sql. Questo impedisce a un client di
-- leggere/indovinare il codice di un altro utente o di alterare lo status a
-- mano.
