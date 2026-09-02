-- =============================================================================
-- messages
-- =============================================================================
-- Gap segnalato dal teammate "frontend": docs/PLAN.md (sezione "Architettura
-- tecnica" e "Home") richiede una tabella `messages` per la card "Pensiero
-- del giorno" / FAB "Manda un pensiero" di Home, ma non era stata creata nei
-- 6 task originali di backend. Aggiunta ora dal lead per chiudere questo gap
-- di Fase 1 (esplicitamente nello scope MVP: "Home con invio messaggi/foto
-- semplice").
--
-- Contratto per il frontend (vedi anche lib/messages-actions.ts):
--   - `type`: 'text' | 'photo' | 'reminder'. Per Fase 1 il frontend invia solo
--     'text' (niente Storage bucket configurato ancora per le foto); 'photo'/
--     'reminder' sono già supportati a schema per non dover fare un'altra
--     migration quando arriveranno.
--   - `photo_url`: NULL per i messaggi di testo. Popolato solo quando type =
--     'photo' (URL nello Storage bucket, da configurare separatamente).
--   - `scheduled_for`: NULL per l'invio immediato. Riservato ai "messaggi
--     programmati" di Fase 3 (docs/PLAN.md), non usato dal frontend in Fase 1.
--   - Reazione a cuore: NON è una colonna aggiornabile via UPDATE diretto dal
--     client (stesso ragionamento RLS di couples/pairing_invites: evitare che
--     un client possa alterare `content`/`sender_id` mascherandolo da
--     reazione). Passa dalla RPC `toggle_message_reaction`, unico modo per
--     scrivere su `liked_by`.
-- =============================================================================

create type public.message_type as enum ('text', 'photo', 'reminder');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,

  type public.message_type not null default 'text',
  content text not null,
  -- Rilevante solo per type = 'photo', vedi nota sopra.
  photo_url text,

  -- Invii programmati (Fase 3), non usato dal frontend in Fase 1.
  scheduled_for timestamptz,

  -- Chi ha reagito con un cuore. Scritto solo dalla RPC toggle_message_reaction.
  liked_by uuid[] not null default '{}',

  created_at timestamptz not null default now(),

  constraint messages_content_not_blank check (length(trim(content)) > 0)
);

comment on table public.messages is
  'Messaggi/pensieri/foto scambiati tra i due partner in Home. Reazioni a cuore solo via RPC toggle_message_reaction.';

comment on column public.messages.liked_by is
  'Elenco profiles.id di chi ha messo un cuore. Scritto solo da toggle_message_reaction (SECURITY DEFINER).';

create index messages_couple_created_idx
  on public.messages (couple_id, created_at desc);

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.messages enable row level security;

create policy "messages_select_couple"
  on public.messages for select
  to authenticated
  using (couple_id = public.current_couple_id());

create policy "messages_insert_own"
  on public.messages for insert
  to authenticated
  with check (
    couple_id = public.current_couple_id()
    and sender_id = auth.uid()
  );

-- Il mittente può eliminare il proprio messaggio (es. inviato per errore).
create policy "messages_delete_own"
  on public.messages for delete
  to authenticated
  using (sender_id = auth.uid());

-- Nessuna policy UPDATE per `authenticated`: content/liked_by si modificano
-- solo tramite la RPC toggle_message_reaction (SECURITY DEFINER), vedi sotto.
-- Questo impedisce a un client di alterare un messaggio già inviato.

-- =============================================================================
-- RPC: toggle_message_reaction
-- =============================================================================
-- Aggiunge/rimuove auth.uid() da messages.liked_by per il messaggio indicato.
-- Unico modo per scrivere su liked_by (vedi RLS sopra, nessuna policy UPDATE).
create or replace function public.toggle_message_reaction(message_id uuid)
returns boolean -- true se ora il messaggio piace all'utente, false se la reazione è stata rimossa
language plpgsql
security definer
set search_path = public
as $$
declare
  my_id uuid := auth.uid();
  msg_couple_id uuid;
  my_couple_id uuid;
  currently_liked boolean;
begin
  if my_id is null then
    raise exception 'Utente non autenticato';
  end if;

  select couple_id into msg_couple_id from public.messages where id = message_id;
  if not found then
    raise exception 'Messaggio non trovato';
  end if;

  select couple_id into my_couple_id from public.profiles where id = my_id;
  if my_couple_id is null or my_couple_id <> msg_couple_id then
    raise exception 'Non hai accesso a questo messaggio';
  end if;

  select my_id = any(liked_by) into currently_liked from public.messages where id = message_id;

  if currently_liked then
    update public.messages set liked_by = array_remove(liked_by, my_id) where id = message_id;
  else
    update public.messages set liked_by = array_append(liked_by, my_id) where id = message_id;
  end if;

  return not currently_liked;
end;
$$;

comment on function public.toggle_message_reaction(uuid) is
  'Aggiunge/rimuove auth.uid() da messages.liked_by per il messaggio indicato. Ritorna true se ora piace, false se la reazione è stata tolta.';

revoke execute on function public.toggle_message_reaction(uuid) from public;
grant execute on function public.toggle_message_reaction(uuid) to authenticated;

-- =============================================================================
-- Realtime
-- =============================================================================
-- Stesso ragionamento di 20260831120300_realtime.sql: la RLS si applica anche
-- alle subscription, quindi è sicuro abilitarlo. Necessario perché Home (il
-- "cuore emotivo" dell'app, docs/PLAN.md) deve mostrare i pensieri del
-- partner senza bisogno di ricaricare.
alter publication supabase_realtime add table public.messages;
alter table public.messages replica identity full;
