-- =============================================================================
-- Mood check-in: aggiunge "arrabbiato" e uno stato personalizzato "altro".
-- =============================================================================
-- Su richiesta esplicita dell'utente: mancava un'opzione per la rabbia, e a
-- volte le 6 (ora 7) etichette fisse non bastano — "altro" permette di
-- scrivere un'etichetta libera al posto di sceglierne una fissa.
--
-- Solo l'ALTER TYPE qui: ALTER TYPE ... ADD VALUE non può essere usato nella
-- stessa transazione in cui il nuovo valore viene poi effettivamente USATO
-- (stesso motivo già documentato per 'mensile' in
-- 20260901070000_monthly_anniversary_and_recurrence.sql) — la colonna
-- mood_custom_label (parte 2, file successivo) non usa i nuovi valori in un
-- default/check quindi non sarebbe strettamente necessario lo split, ma
-- stessa precauzione già adottata altrove nel progetto, più sicura.
-- =============================================================================

alter type public.mood_type add value 'arrabbiato';
alter type public.mood_type add value 'altro';
