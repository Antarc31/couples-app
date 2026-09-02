-- =============================================================================
-- push_subscriptions
-- =============================================================================
-- Fase 2, docs/PLAN.md -> "Architettura tecnica": "Notifiche push: Web Push
-- standard (VAPID) via Supabase Edge Functions". Questa tabella memorizza le
-- PushSubscription del browser (una per dispositivo/browser installato) per
-- ogni utente, così l'Edge Function `send-push` (vedi
-- supabase/functions/send-push/index.ts) sa a chi/dove inviare.
--
-- IMPORTANTE (vedi anche HANDOFF.md): questa tabella e la Edge Function
-- collegata sono codice PRONTO ma NON ANCORA DEPLOYATO — backend2 non ha le
-- credenziali/non può fare un `supabase login` interattivo via browser in
-- questo ambiente. La migration stessa non richiede login (va applicata da
-- main come le altre, via `supabase db push` o SQL Editor); è solo la Edge
-- Function a restare non deployata finché l'utente non fa login di persona.
-- Vedi il commento in testa a supabase/functions/send-push/index.ts per i
-- passi esatti (generare chiavi VAPID, configurare i secrets, deploy).
--
-- Contratto per il frontend:
--   - Una riga per (endpoint) del browser — `endpoint` è già globalmente
--     unico per definizione della Push API (identifica univocamente
--     dispositivo+browser+installazione presso il push service, es. FCM/
--     Mozilla push service), non serve comporlo con user_id.
--   - `p256dh`/`auth_key`: le due chiavi della PushSubscription (`keys.p256dh`
--     e `keys.auth` nell'oggetto restituito da
--     `PushSubscription.toJSON()`) — rinominata `auth_key` (non `auth`) per
--     evitare qualunque ambiguità col nome dello schema `auth` di Supabase,
--     anche se essendo solo un nome di colonna non ci sarebbe stato conflitto
--     reale.
--   - Scrittura consigliata dal client: upsert con `onConflict: 'endpoint'`
--     (vedi lib/push-actions.ts) — se lo stesso browser si ri-sottoscrive
--     (es. permesso ridato dopo revoca) l'endpoint può ripetersi e vogliamo
--     aggiornare la riga esistente, non duplicarla. Nota: se l'endpoint
--     esisteva già ma apparteneva a un ALTRO utente (stesso browser, account
--     diverso), l'upsert fallisce per permessi (RLS UPDATE richiede
--     user_id = auth.uid() sulla riga esistente) — comportamento corretto,
--     non un bug: un utente non deve poter "rubare" la sottoscrizione push
--     registrata da un altro account sullo stesso dispositivo.
-- =============================================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,

  -- Informativo (debug/gestione multi-dispositivo in Profilo, es. "iPhone di
  -- Nome" derivato lato client), non usato per logica di invio.
  user_agent text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Sottoscrizioni Web Push (VAPID) per utente/dispositivo. Lette solo dalla Edge Function send-push (service role, bypassa RLS) per inviare notifiche al partner.';

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row
  execute function public.set_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Solo proprie righe, in ogni direzione: un utente gestisce solo le proprie
-- sottoscrizioni push. La lettura delle sottoscrizioni del PARTNER (necessaria
-- per inviargli una notifica) NON passa da qui: la Edge Function usa la
-- service_role key (bypassa RLS del tutto), dopo aver verificato lei stessa,
-- con il JWT del chiamante, che il destinatario è effettivamente il suo
-- partner (vedi supabase/functions/send-push/index.ts) — nessuna policy
-- RLS deve mai permettere a un utente di leggere le sottoscrizioni push di un
-- altro account direttamente dal client.
alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  to authenticated
  with check (user_id = auth.uid());

-- Serve per l'upsert onConflict:'endpoint' descritto sopra (ri-sottoscrizione
-- dello stesso endpoint da parte dello stesso utente).
create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Disiscrizione esplicita (es. l'utente disattiva le notifiche in Profilo).
create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  to authenticated
  using (user_id = auth.uid());

-- =============================================================================
-- Grant di base per `authenticated`
-- =============================================================================
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Nessun Realtime su questa tabella: non è dato che l'UI deve mostrare/
-- aggiornare live, è solo lo stato interno di consegna delle notifiche.
