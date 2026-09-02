-- =============================================================================
-- Aggiunge i valori enum 'quiz' e 'mood_checkin' a public.notification_type.
-- =============================================================================
-- Migration DELIBERATAMENTE separata da quella che introduce i trigger che li
-- usano (20260903010000_daily_quiz_and_mood.sql): un valore appena aggiunto
-- con `ALTER TYPE ... ADD VALUE` non può essere usato come letterale nella
-- STESSA transazione in cui è stato aggiunto — stesso vincolo Postgres già
-- rispettato per 'mensile' (vedi 20260901070000_monthly_anniversary_and_recurrence.sql).
alter type public.notification_type add value 'quiz';
alter type public.notification_type add value 'mood_checkin';
