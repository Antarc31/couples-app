-- =============================================================================
-- Grant privilegi di base a `authenticated` sulle tabelle applicative
-- =============================================================================
-- Bug reale scoperto lanciando lo scenario e2e (e2e/pairing-calendar.spec.ts)
-- contro un progetto Supabase cloud vero: tutte le query fallivano con
-- "permission denied for table X" nonostante le RLS policy fossero corrette.
--
-- Causa: le RLS policy filtrano QUALI righe un ruolo può vedere/modificare,
-- ma non sostituiscono il privilegio di base a livello di tabella richiesto
-- da Postgres (GRANT). Su un progetto Supabase creato/gestito dalla piattaforma
-- questo privilegio di base viene normalmente concesso in automatico ad
-- `authenticated`/`anon` per ogni nuova tabella in `public`; su questo
-- progetto (o più in generale, se le migration vengono eseguite fuori dal
-- flusso "gestito" della piattaforma, es. incollate a mano in SQL Editor)
-- quel grant automatico non è scattato, quindi va reso esplicito qui.
--
-- Nota: gli RPC SECURITY DEFINER (create_pairing_invite, accept_pairing_invite,
-- toggle_message_reaction, set_relationship_start_date) non erano affetti da
-- questo bug, perché girano con i privilegi del proprietario della funzione
-- (che ha già pieno accesso alle tabelle), non con quelli di `authenticated`.
-- Il bug riguardava solo le query dirette del client via `.from(table)`.
--
-- Coerente con le RLS esistenti: si concede solo ciò che ha una policy
-- corrispondente (vedi commenti nelle singole tabelle nei file di migration
-- precedenti per il motivo di ogni scelta INSERT/UPDATE/DELETE assente).
-- =============================================================================

grant select, update on public.profiles to authenticated;
grant select on public.couples to authenticated;
grant select on public.pairing_invites to authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;
grant select, insert, delete on public.messages to authenticated;
