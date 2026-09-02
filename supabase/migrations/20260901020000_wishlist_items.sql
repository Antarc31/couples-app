-- =============================================================================
-- wishlist_items
-- =============================================================================
-- Fase 2, docs/PLAN.md -> "Screen-by-screen" / "Wishlist" e "Architettura
-- tecnica". Il punto delicato di questa tabella è la MODALITA' SORPRESA (vedi
-- sezione dedicata più sotto, dopo la definizione della tabella) — leggila
-- per intero prima di toccare RLS o la view qui sotto, è facile introdurre
-- una fuga di dati sottile modificandole senza capire perché sono scritte
-- così.
--
-- Contratto per il frontend:
--   - `category`: 'regalo' | 'attivita' (attività di coppia). Filtri UI
--     "Regali" | "Attività di coppia" | "Tutto" (docs/PLAN.md).
--   - `target`: 'self' | 'partner' | 'entrambi' — per chi è pensato l'item.
--     Non richiesto: nessun default, il client deve sceglierlo esplicitamente.
--   - `priority`: 'bassa' | 'media' | 'alta', default 'media'.
--   - `status`: 'attivo' | 'completato'. **MAI delete secco** (vedi
--     docs/PLAN.md: "archivio Completati... mantiene memoria di cosa è stato
--     fatto insieme") — applicato anche a livello DB: nessuna policy/grant
--     DELETE su questa tabella per `authenticated`, vedi sotto. L'unico modo
--     di "rimuovere" un item dalla vista attiva è marcarlo completato.
--   - `completed_by`: aggiunto per giudizio (non esplicitamente nel piano),
--     utile per l'archivio ("completato da Nome" invece di dedurlo da chi ha
--     fatto l'ultima update) — NON usato per RLS, solo informativo.
--   - `is_surprise`: rilevante solo se `target` include il partner
--     ('partner' o 'entrambi') — vincolo DB sotto lo impone. Un item con
--     target = 'self' non può essere "a sorpresa" (per chi sarebbe la
--     sorpresa? sei tu che lo aggiungi per te stesso).
-- =============================================================================

create type public.wishlist_category as enum ('regalo', 'attivita');
create type public.wishlist_target as enum ('self', 'partner', 'entrambi');
create type public.wishlist_priority as enum ('bassa', 'media', 'alta');
create type public.wishlist_status as enum ('attivo', 'completato');

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,

  category public.wishlist_category not null,
  target public.wishlist_target not null,

  title text not null,
  description text,
  price numeric(10, 2),
  link text,
  photo_url text,

  priority public.wishlist_priority not null default 'media',

  is_surprise boolean not null default false,

  status public.wishlist_status not null default 'attivo',
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint wishlist_items_title_not_blank check (length(trim(title)) > 0),
  constraint wishlist_items_price_non_negative check (price is null or price >= 0),

  -- Un item può essere "a sorpresa" solo se il partner è tra i destinatari.
  constraint wishlist_items_surprise_requires_partner_target
    check (not is_surprise or target in ('partner', 'entrambi')),

  -- Coerenza stato <-> completamento, stesso pattern di
  -- appointments_status_calendar_event_consistency.
  constraint wishlist_items_completed_consistency
    check ((status = 'completato') = (completed_at is not null))
);

comment on table public.wishlist_items is
  'Wishlist regali/attività di coppia. Righe MAI cancellate: il completamento (status=completato) è l''unico modo di archiviare un item. Vedi commento esteso sotto sulla modalità sorpresa.';

create index wishlist_items_couple_status_idx
  on public.wishlist_items (couple_id, status);

create index wishlist_items_couple_category_idx
  on public.wishlist_items (couple_id, category);

create trigger wishlist_items_set_updated_at
  before update on public.wishlist_items
  for each row
  execute function public.set_updated_at();

-- =============================================================================
-- MODALITA' SORPRESA — analisi e decisione di design
-- =============================================================================
-- Requisito (docs/PLAN.md, ripetuto due volte nel piano perché è il punto
-- che "l'app non deve rovinare le sorprese"): un item con is_surprise = true,
-- target che include il partner, e status ancora 'attivo', deve restare
-- COMPLETAMENTE nascosto NEI DETTAGLI al destinatario finché non è
-- completato.
--
-- Perché non basta una RLS "normale" a colonna: Postgres RLS filtra RIGHE
-- intere, non singole colonne — non esiste una "policy SELECT parziale" che
-- lasci passare id/category ma nasconda title/description/price/photo_url
-- della STESSA riga alla STESSA query. Le due alternative reali sono:
--   (a) negare la SELECT dell'intera riga a chi non è il creatore (la riga
--       sparisce del tutto dalla lista finché non è completata: perde però
--       la possibilità di mostrare in UI un placeholder "sorpresa in arrivo"
--       nella posizione/ordine giusto, dato che il client non sa nemmeno che
--       la riga esiste);
--   (b) una vista/RPC separata che il client legge per la lista, dove le
--       righe sorpresa-attive-non-mie tornano con i campi sensibili nulled
--       ma la riga resta presente (placeholder visibile: "🎁 sorpresa in
--       arrivo", con priorità/categoria per restare ordinabile in lista, ma
--       zero contenuto).
--
-- Scelta presa qui: ENTRAMBE, a due livelli (difesa in profondità, non
-- ridondanza inutile — proteggono contro errori client diversi):
--
--   1. La TABELLA BASE (`wishlist_items`) nega del tutto la SELECT diretta
--      di una riga sorpresa-attiva a chi non è il creatore (opzione (a) sopra,
--      vedi policy `wishlist_items_select_hide_active_surprise` sotto). Un
--      client che interroga `wishlist_items` direttamente (bug, query REST
--      manuale, futuro sviluppatore disattento) non riceve MAI quella riga,
--      punto — non serve fidarsi che nessuno dimentichi di usare la vista.
--
--   2. La VIEW `public.wishlist_feed` (opzione (b) sopra) è quella che il
--      frontend deve interrogare per renderizzare la lista Wishlist condivisa
--      (vedi lib/wishlist-actions.ts). Espone TUTTE le righe della coppia
--      (comprese quelle che la RLS di base nasconderebbe al destinatario),
--      ma con i campi sensibili (title/description/price/link/photo_url)
--      forzati a NULL quando la riga è una sorpresa attiva non tua, più un
--      flag `is_hidden_surprise` che il frontend usa per decidere di
--      renderizzare il placeholder invece della card normale. category,
--      priority, target, is_surprise, status, timestamp restano visibili
--      anche nascosta: non rivelano "cosa" è il regalo (solo che "arriva
--      qualcosa"), coerente con lo spirito del piano (sapere che è in arrivo
--      un regalo per il tuo compleanno non rovina la sorpresa; sapere cos'è,
--      sì).
--
-- COME funziona tecnicamente la vista (leggere con attenzione prima di
-- modificarla): le VIEW di Postgres, per default (`security_invoker = false`,
-- reso qui esplicito), eseguono la query sulla tabella sottostante con i
-- permessi/contesto RLS del PROPRIETARIO della vista, non di chi la
-- interroga — esattamente come una funzione SECURITY DEFINER, ma per le
-- view. Chi esegue questa migration (il ruolo `postgres`/owner delle
-- tabelle) possiede anche `wishlist_items`, quindi per lui la RLS della
-- tabella non si applica affatto (un owner senza `FORCE ROW LEVEL SECURITY`
-- — non impostato qui — bypassa sempre la propria RLS). Risultato: dentro la
-- definizione della vista si vedono TUTTE le righe di TUTTE le coppie, non
-- solo quelle della coppia di chi interroga la vista da client. Per questo
-- il `where couple_id = public.current_couple_id()` nella vista sotto NON è
-- opzionale/decorativo: sostituisce interamente la RLS che qui non scatta,
-- non la integra. `auth.uid()`/`current_couple_id()` restano comunque
-- corretti (risolvono l'utente autenticato reale che ha fatto la richiesta
-- HTTP, non il ruolo Postgres proprietario della vista): sono implementati
-- da Supabase leggendo il JWT della richiesta da una GUC di sessione
-- (`request.jwt.claims`), non da `current_user`/ruolo Postgres — per questo
-- possono essere usati in sicurezza sia dentro funzioni SECURITY DEFINER sia
-- dentro una vista owner-context come questa.
--
-- `security_barrier = true`: impedisce che condizioni/funzioni scritte da chi
-- interroga la vista (es. in un futuro filtro lato client passato come
-- ulteriore WHERE sulla vista) vengano "spinte" dal planner dentro la vista
-- PRIMA del mascheramento dei campi sensibili — protezione extra contro fughe
-- via side-channel (es. `where title ilike '%anello%'` eseguito prima del
-- CASE che maschera `title`).
-- =============================================================================

alter table public.wishlist_items enable row level security;

-- SELECT: visibile ai membri della coppia, tranne le righe sorpresa attive
-- create da qualcun altro (vedi analisi sopra). Una volta completata
-- (status = 'completato') la riga torna visibile a entrambi: è così che
-- l'archivio "Completati" rivela le sorprese passate.
create policy "wishlist_items_select_hide_active_surprise"
  on public.wishlist_items for select
  to authenticated
  using (
    couple_id = public.current_couple_id()
    and not (is_surprise and status = 'attivo' and created_by <> auth.uid())
  );

-- INSERT: solo per la propria coppia e a proprio nome.
create policy "wishlist_items_insert_own"
  on public.wishlist_items for insert
  to authenticated
  with check (
    couple_id = public.current_couple_id()
    and created_by = auth.uid()
  );

-- UPDATE: il creatore può sempre modificare il proprio item (compreso
-- marcarlo completato). Il partner può modificare/completare un item SOLO se
-- non è (più) una sorpresa attiva — cioè se is_surprise = false, oppure se è
-- già stato completato. Mentre è una sorpresa attiva, il partner non può
-- scriverci (e comunque non può nemmeno vederla via SELECT diretta, questa è
-- una seconda barriera indipendente, non ridondante: protegge anche se in
-- futuro la SELECT venisse allentata per errore).
create policy "wishlist_items_update_own_or_not_hidden"
  on public.wishlist_items for update
  to authenticated
  using (
    couple_id = public.current_couple_id()
    and (created_by = auth.uid() or not (is_surprise and status = 'attivo'))
  )
  with check (
    couple_id = public.current_couple_id()
    and (created_by = auth.uid() or not (is_surprise and status = 'attivo'))
  );

-- Nessuna policy/grant DELETE per `authenticated`: "MAI delete secco" (vedi
-- commento in testa al file) è imposto qui a livello DB, non lasciato come
-- convenzione UI — un client non può cancellare un wishlist_item in nessun
-- caso, solo completarlo. Se in futuro servisse davvero rimuovere un item
-- inserito per errore, serve una decisione esplicita (nuova migration con
-- una RPC dedicata), non una policy DELETE generica.

-- =============================================================================
-- View: wishlist_feed (lettura per la lista — vedi analisi sopra)
-- =============================================================================
create or replace view public.wishlist_feed
  with (security_invoker = false, security_barrier = true)
as
select
  w.id,
  w.couple_id,
  w.created_by,
  w.category,
  w.target,
  w.priority,
  w.is_surprise,
  w.status,
  -- true se questa riga è una sorpresa attiva creata dal partner: il
  -- frontend la usa per decidere se renderizzare il placeholder "sorpresa in
  -- arrivo" invece della card normale.
  (w.is_surprise and w.status = 'attivo' and w.created_by <> auth.uid()) as is_hidden_surprise,
  case when (w.is_surprise and w.status = 'attivo' and w.created_by <> auth.uid())
    then null else w.title end as title,
  case when (w.is_surprise and w.status = 'attivo' and w.created_by <> auth.uid())
    then null else w.description end as description,
  case when (w.is_surprise and w.status = 'attivo' and w.created_by <> auth.uid())
    then null else w.price end as price,
  case when (w.is_surprise and w.status = 'attivo' and w.created_by <> auth.uid())
    then null else w.link end as link,
  case when (w.is_surprise and w.status = 'attivo' and w.created_by <> auth.uid())
    then null else w.photo_url end as photo_url,
  w.completed_at,
  w.completed_by,
  w.created_at,
  w.updated_at
from public.wishlist_items w
-- Sostituisce la RLS (non scatta qui, vedi analisi sopra): senza questa
-- riga la vista esporrebbe le wishlist di TUTTE le coppie del progetto.
where w.couple_id = public.current_couple_id();

comment on view public.wishlist_feed is
  'View di lettura per la lista Wishlist: come wishlist_items ma con i campi sensibili (title/description/price/link/photo_url) nulled per le righe sorpresa attive non tue (is_hidden_surprise=true). Il frontend deve leggere QUESTA vista per la lista, non wishlist_items direttamente (che comunque nega del tutto quelle righe, vedi RLS). Sola lettura: scritture sempre su wishlist_items.';

-- =============================================================================
-- Grant di base per `authenticated`
-- =============================================================================
grant select, insert, update on public.wishlist_items to authenticated;
-- Nessun grant DELETE, vedi commento sopra sulla policy assente.
grant select on public.wishlist_feed to authenticated;

-- =============================================================================
-- Realtime
-- =============================================================================
-- Abilitato sulla TABELLA BASE (le view non sono pubblicabili in logical
-- replication). Sicuro per lo stesso motivo di calendar_events/ciclo: la RLS
-- di wishlist_items si applica anche alle subscription, quindi un evento su
-- una riga sorpresa-attiva-non-tua semplicemente non arriva al destinatario
-- finché non viene completata — a quel punto la riga diventa visibile e
-- Realtime la notifica normalmente (bel side-effect: il destinatario scopre
-- "in diretta" la sorpresa appena rivelata, senza dover ricaricare). Il
-- frontend che sottoscrive dovrebbe comunque rileggere da `wishlist_feed`
-- (non fidarsi del payload grezzo dell'evento per i campi sensibili) per
-- restare coerente col mascheramento.
alter publication supabase_realtime add table public.wishlist_items;
alter table public.wishlist_items replica identity full;
