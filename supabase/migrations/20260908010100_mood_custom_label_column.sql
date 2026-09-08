-- =============================================================================
-- Mood check-in: colonna per l'etichetta personalizzata di mood = 'altro'.
-- =============================================================================
-- Parte 2, vedi 20260908010000_mood_angry_and_custom.sql per il perché dello
-- split. Nessun check constraint qui: la validazione "altro richiede
-- un'etichetta non vuota" vive lato applicazione in lib/mood-actions.ts.
-- =============================================================================

alter table public.mood_checkins add column mood_custom_label text;

comment on column public.mood_checkins.mood_custom_label is
  'Etichetta personalizzata quando mood = ''altro''. NULL per tutti gli altri valori.';
