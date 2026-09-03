-- =============================================================================
-- Tetto massimo di 10 occorrenze per la fine ricorrenza "dopo N volte"
-- =============================================================================
-- Richiesto dall'utente dopo aver visto il form: "Dopo [N] volte" senza un
-- massimo permetteva numeri arbitrari. Il limite è già imposto lato client
-- (EventFormModal.tsx: input max=10 + clamp js), ma senza questo constraint
-- resterebbe solo un suggerimento UI aggirabile (devtools, un client futuro
-- diverso) — stesso principio di difesa in profondità già seguito per
-- recurrence_interval/recurrence_count >= 1 nella migration precedente
-- (20260904030000_general_event_recurrence.sql).
-- =============================================================================

alter table public.calendar_events
  add constraint calendar_events_recurrence_count_max
    check (recurrence_count is null or recurrence_count <= 10);
