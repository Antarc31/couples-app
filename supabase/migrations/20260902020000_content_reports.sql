-- =============================================================================
-- content_reports: segnalazione di contenuti (requisito Apple 1.2 UGC)
-- =============================================================================
-- Predisposta in vista di una pubblicazione pubblica sugli store: le linee
-- guida Apple sui contenuti generati dagli utenti richiedono un modo per
-- segnalare contenuti offensivi/inappropriati. Finché l'app resta a
-- distribuzione privata questo livello basta com'è; se/quando si pubblica
-- va aggiunta la UI (bottone "Segnala" sui contenuti) — volutamente NON
-- costruita ora insieme allo schema, per non investire tempo su una UI che
-- oggi non serve.
--
-- Sola scrittura dal client (insert-only, come pairing_invites/couples):
-- nessuna policy select/update/delete per `authenticated`, la revisione
-- delle segnalazioni la fa il titolare dell'app via accesso diretto al DB,
-- non c'è ancora (né serve ora) una schermata "le mie segnalazioni".
create type public.report_reason as enum ('contenuto_inappropriato', 'molestie', 'spam', 'altro');

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,

  -- Riferimento "polimorfico" leggero alla riga segnalata, stesso pattern di
  -- notifications.source_table/source_id (20260901090000_notifications.sql).
  source_table text not null
    check (source_table in ('messages', 'calendar_events', 'appointments', 'wishlist_items')),
  source_id uuid not null,

  reason public.report_reason not null,
  details text,

  created_at timestamptz not null default now()
);

comment on table public.content_reports is
  'Segnalazioni di contenuti inappropriati/molesti da parte degli utenti. Sola scrittura dal client: nessuna policy select/update/delete per authenticated, revisione manuale via DB. Predisposta per la pubblicazione pubblica (linee guida Apple 1.2), non ancora collegata a nessuna UI.';

alter table public.content_reports enable row level security;

create policy "content_reports_insert_own"
  on public.content_reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

grant insert on public.content_reports to authenticated;
