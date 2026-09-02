-- =============================================================================
-- Fix: "infinite recursion detected in policy" su quiz_answers/mood_checkins
-- =============================================================================
-- Bug: le policy SELECT di entrambe le tabelle contenevano un `exists (select
-- 1 from <stessa tabella> mine where ...)` diretto — una sottoquery che
-- interroga la STESSA tabella protetta dalla policy che la contiene. Postgres
-- deve rivalutare la policy per ogni riga toccata dalla sottoquery, che a sua
-- volta rientra nella stessa policy, all'infinito: "infinite recursion
-- detected in policy for relation".
--
-- Fix, stesso principio già usato per current_couple_id() (SECURITY DEFINER
-- per evitare ricorsione, 20260831120000_core_schema.sql:152-156): la verifica
-- "ho già risposto oggi anch'io" va dentro una funzione SECURITY DEFINER, che
-- gira con i privilegi del proprietario (bypassa la RLS su quella query
-- interna) invece che con quelli del chiamante — rompe la catena di
-- auto-riferimento diretto che scatena la ricorsione.
-- =============================================================================

create or replace function public._has_answered_quiz_today(p_couple_id uuid, p_answer_date date)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.quiz_answers
    where couple_id = p_couple_id
      and answer_date = p_answer_date
      and profile_id = auth.uid()
  );
$$;

comment on function public._has_answered_quiz_today(uuid, date) is
  'Vero se auth.uid() ha già scritto la sua risposta/ipotesi per la data indicata. SECURITY DEFINER per evitare la ricorsione RLS su quiz_answers (vedi commento in testa al file) — chiamata dalla policy SELECT di quiz_answers, va per questo concessa ad authenticated.';

revoke execute on function public._has_answered_quiz_today(uuid, date) from public;
grant execute on function public._has_answered_quiz_today(uuid, date) to authenticated;

drop policy "quiz_answers_select_own_or_revealed" on public.quiz_answers;
create policy "quiz_answers_select_own_or_revealed"
  on public.quiz_answers for select
  to authenticated
  using (
    couple_id = public.current_couple_id()
    and (
      profile_id = auth.uid()
      or public._has_answered_quiz_today(couple_id, answer_date)
    )
  );

create or replace function public._has_checked_in_mood_today(p_couple_id uuid, p_checkin_date date)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.mood_checkins
    where couple_id = p_couple_id
      and checkin_date = p_checkin_date
      and profile_id = auth.uid()
  );
$$;

comment on function public._has_checked_in_mood_today(uuid, date) is
  'Stesso schema di _has_answered_quiz_today, per mood_checkins.';

revoke execute on function public._has_checked_in_mood_today(uuid, date) from public;
grant execute on function public._has_checked_in_mood_today(uuid, date) to authenticated;

drop policy "mood_checkins_select_own_or_revealed" on public.mood_checkins;
create policy "mood_checkins_select_own_or_revealed"
  on public.mood_checkins for select
  to authenticated
  using (
    couple_id = public.current_couple_id()
    and (
      profile_id = auth.uid()
      or public._has_checked_in_mood_today(couple_id, checkin_date)
    )
  );
