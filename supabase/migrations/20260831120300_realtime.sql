-- =============================================================================
-- Realtime
-- =============================================================================
-- Abilita la pubblicazione Realtime (postgres_changes) sulle tabelle di cui
-- il frontend deve ricevere aggiornamenti live tra i due partner, senza
-- polling. Supabase Realtime applica la RLS della tabella per ogni utente
-- connesso: chi non ha una policy SELECT che copre una riga non riceverà
-- eventi su quella riga, quindi è sicuro abilitarlo anche su tabelle con dati
-- privati (es. pairing_invites, calendar_events con eventi 'ciclo' privati).
--
-- Tabelle incluse e perché:
--   - calendar_events: sincronizzazione live del calendario condiviso
--     (richiesto esplicitamente dal piano di fase 1).
--   - couples: il partner che ha creato l'invito vede in tempo reale la
--     comparsa della riga couples/aggiornamenti (es. relationship_start_date
--     modificata dall'altro partner in Profilo) senza dover ricaricare.
--   - profiles: Home mostra avatar/nome/colore del partner; utile riceverli
--     live se il partner li aggiorna mentre l'app è aperta.
--   - pairing_invites: la schermata di pairing di chi ha generato il codice
--     può passare automaticamente allo stato "accoppiato" quando l'altro
--     partner accetta, senza bisogno di polling (la RLS "pairing_invites_
--     select_own" limita comunque la visibilità al creatore/accettante).
--
-- Vedi supabase/README.md -> "Pattern di subscription Realtime (frontend)"
-- per il codice client di esempio.
-- =============================================================================

alter publication supabase_realtime add table public.calendar_events;
alter publication supabase_realtime add table public.couples;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.pairing_invites;

-- REPLICA IDENTITY FULL: necessario per ricevere l'intera riga "old" negli
-- eventi UPDATE/DELETE (altrimenti Realtime invia solo la chiave primaria per
-- le colonne non-toast). Utile ad es. per rimuovere lato client un evento di
-- calendario cancellato senza dover rifare una fetch.
alter table public.calendar_events replica identity full;
alter table public.couples replica identity full;
alter table public.profiles replica identity full;
alter table public.pairing_invites replica identity full;
