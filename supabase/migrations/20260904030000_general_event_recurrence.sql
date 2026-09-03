-- =============================================================================
-- Ricorrenza generale degli eventi (stile Google Calendar, versione
-- "semplice": frequenza + intervallo + fine) — piano approvato in
-- /Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md.
-- =============================================================================
-- Estende lo STESSO campo `recurrence` (non un modello parallelo): due nuovi
-- valori enum ('giornaliera'/'settimanale', oltre ai già esistenti
-- 'nessuna'/'annuale'/'mensile') più tre nuove colonne, usate sia dagli
-- eventi creati dall'utente sia (con i default) da quelli di sistema
-- (compleanno/anniversario/mesiversario, generati da
-- 20260901060000_profile_birth_date_and_special_events.sql e
-- 20260901070100_monthly_anniversary_and_recurrence_part2.sql) — quei
-- trigger continuano a funzionare identici, senza modifiche: intervallo 1 e
-- nessuna fine sono già i default.
--
-- `recurrence_until`/`recurrence_count` entrambi NULL = "mai" (perpetuo,
-- comportamento di oggi). Solo uno dei due può essere valorizzato — imposto
-- lato form (radio a 3 stati: mai/in data/dopo N volte) e rinforzato qui
-- dalla constraint di mutua esclusione come rete di sicurezza.
--
-- Sicura in un'unica transazione: nessuna delle nuove colonne/constraint
-- sotto usa i due valori enum aggiunti come letterale (a differenza di una
-- funzione/trigger che li scrivesse in un INSERT nella stessa migration,
-- vietato da Postgres — vedi commento in
-- 20260901070000_monthly_anniversary_and_recurrence.sql per il precedente
-- già incontrato in questo progetto).
-- =============================================================================

alter type public.event_recurrence add value 'giornaliera';
alter type public.event_recurrence add value 'settimanale';

alter table public.calendar_events
  add column recurrence_interval smallint not null default 1,
  add column recurrence_until timestamptz,
  add column recurrence_count integer;

alter table public.calendar_events
  add constraint calendar_events_recurrence_interval_positive
    check (recurrence_interval >= 1),
  add constraint calendar_events_recurrence_count_positive
    check (recurrence_count is null or recurrence_count >= 1),
  add constraint calendar_events_recurrence_until_after_starts
    check (recurrence_until is null or recurrence_until >= starts_at),
  add constraint calendar_events_recurrence_end_mutually_exclusive
    check (recurrence_until is null or recurrence_count is null);

comment on column public.calendar_events.recurrence_interval is
  'Ogni quanti "passi" della frequenza (es. 2 = ogni 2 settimane). 1 = ogni occorrenza, default/comportamento invariato per gli eventi già esistenti.';
comment on column public.calendar_events.recurrence_until is
  'Fine ricorrenza "a una data" (inclusiva). NULL insieme a recurrence_count = ricorrenza perpetua ("mai").';
comment on column public.calendar_events.recurrence_count is
  'Fine ricorrenza "dopo N volte" (numero totale di occorrenze, ancora inclusa). Mutuamente esclusivo con recurrence_until.';
