-- =============================================================================
-- Storage bucket: couple-photos
-- =============================================================================
-- Fix UX (redesign Home, vedi HANDOFF.md): il widget "Pensieri & Foto"
-- unificato ha bisogno di poter caricare foto vere via Supabase Storage.
-- Nessuna azione da dashboard: bucket e RLS creati interamente via SQL.
--
-- Contratto per il frontend (vedi lib/messages-actions.ts):
--   - Bucket PRIVATO (non `public`): l'accesso passa sempre dalla RLS sotto,
--     mai da un URL statico indovinabile. Le foto si mostrano con signed URL
--     generati al momento (`.storage.from('couple-photos').createSignedUrl(...)`),
--     non con un URL pubblico permanente.
--   - Convenzione path OBBLIGATORIA: `{couple_id}/{uuid}.{ext}`. Il primo
--     segmento del path DEVE essere il couple_id di chi carica, altrimenti le
--     policy sotto negano insert/select — non è una convenzione solo
--     applicativa, è la base su cui si fonda la RLS (vedi
--     `storage.foldername(name))[1]`, che estrae il primo segmento di path).
--   - `messages.photo_url` per i messaggi type='photo' contiene questo PATH
--     (non un URL pubblico) — va risolto in signed URL a runtime prima di
--     mostrarlo in un <img>.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('couple-photos', 'couple-photos', false)
on conflict (id) do nothing;

-- SELECT: solo membri della coppia proprietaria del path (primo segmento).
create policy "couple_photos_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'couple-photos'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

-- INSERT: solo per il proprio couple_id, stesso ragionamento delle altre
-- tabelle applicative (non si può caricare "nella cartella" di un'altra coppia).
create policy "couple_photos_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'couple-photos'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

-- DELETE: chi ha caricato la foto può rimuoverla (es. invio per errore).
-- Nota: storage.objects non ha una colonna "creato da" applicativa affidabile
-- lato RLS diversa da owner (gestita da Supabase Auth automaticamente
-- all'upload) — usiamo owner_id, popolato automaticamente da Supabase allo
-- upload con l'auth.uid() di chi carica.
create policy "couple_photos_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'couple-photos'
    and owner_id = auth.uid()::text
  );
