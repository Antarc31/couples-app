-- =============================================================================
-- Toggle di coppia per quiz/check-in + meccanica quiz v2 ("indovina il partner")
-- =============================================================================
-- Redesign richiesto dall'utente dopo aver provato la prima versione (Fase B
-- del piano approvato). Tre cambi:
--   1. quiz e check-in diventano attivabili/disattivabili dalla coppia
--      (oggi sempre attivi, senza controllo).
--   2. il check-in resta con lo stesso schema (nessuna modifica qui,
--      cambia solo la UI/consegna lato client — prompt in primo piano +
--      realtime, vedi lib/mood-actions.ts invariato).
--   3. il quiz cambia meccanica: da "ognuno parla di sé" (nessun concetto di
--      giusto/sbagliato, nessun punteggio possibile) a "indovina il
--      partner" — ognuno scrive la propria verità E la propria ipotesi su
--      cosa risponderebbe il partner; una volta rivelato, chi possiede la
--      verità conferma manualmente se l'ipotesi dell'altro era corretta
--      (mai un match automatico su testo libero, inaffidabile). Il
--      punteggio individuale è il conteggio delle conferme positive,
--      calcolato in lettura (vedi lib/quiz-actions.ts), nessuna tabella
--      punteggio da tenere sincronizzata.
--
-- quiz_answers viene ricreata da zero (drop + create) invece di un ALTER
-- incrementale: verificato a runtime che avesse 0 righe su entrambi i
-- progetti Supabase prima di applicare questa migration (nessuno l'aveva
-- ancora usata), quindi nessun rischio di perdita dati.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Toggle di coppia
-- -----------------------------------------------------------------------------
alter table public.couples
  add column quiz_enabled boolean not null default false,
  add column mood_checkin_enabled boolean not null default false;

comment on column public.couples.quiz_enabled is
  'Impostazione di coppia (non del singolo utente): un solo interruttore condiviso, come relationship_start_date. Scrivibile solo via RPC set_quiz_enabled.';
comment on column public.couples.mood_checkin_enabled is
  'Come quiz_enabled: impostazione di coppia, scrivibile solo via RPC set_mood_checkin_enabled.';

create or replace function public.set_quiz_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_couple_id uuid;
begin
  select couple_id into my_couple_id from public.profiles where id = auth.uid();
  if my_couple_id is null then
    raise exception 'Non sei accoppiato/a con un partner.';
  end if;

  update public.couples set quiz_enabled = p_enabled where id = my_couple_id;
end;
$$;

comment on function public.set_quiz_enabled(boolean) is
  'Attiva/disattiva il quiz giornaliero per la coppia del chiamante. Necessaria: couples non ha policy UPDATE per authenticated.';

revoke execute on function public.set_quiz_enabled(boolean) from public;
grant execute on function public.set_quiz_enabled(boolean) to authenticated;

create or replace function public.set_mood_checkin_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_couple_id uuid;
begin
  select couple_id into my_couple_id from public.profiles where id = auth.uid();
  if my_couple_id is null then
    raise exception 'Non sei accoppiato/a con un partner.';
  end if;

  update public.couples set mood_checkin_enabled = p_enabled where id = my_couple_id;
end;
$$;

comment on function public.set_mood_checkin_enabled(boolean) is
  'Attiva/disattiva il check-in emotivo per la coppia del chiamante. Stesso schema di set_quiz_enabled.';

revoke execute on function public.set_mood_checkin_enabled(boolean) from public;
grant execute on function public.set_mood_checkin_enabled(boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. quiz_answers v2: "indovina il partner"
-- -----------------------------------------------------------------------------
drop table if exists public.quiz_answers cascade;

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  answer_date date not null,
  question_id uuid not null references public.quiz_questions (id),

  -- La verità del chiamante su se stesso, e la sua ipotesi su cosa
  -- risponderebbe il partner alla stessa domanda.
  my_truth text not null check (length(trim(my_truth)) > 0),
  my_guess text not null check (length(trim(my_guess)) > 0),

  -- Chi possiede la verità (il PARTNER di chi ha scritto questa riga)
  -- conferma se my_guess era corretta. NULL = non ancora confermata. Una
  -- volta impostata non si torna indietro (vedi confirm_quiz_guess sotto):
  -- il punteggio si basa su questo, niente ripensamenti che lo alterino.
  guess_correct boolean,

  created_at timestamptz not null default now(),

  constraint quiz_answers_one_per_day unique (couple_id, answer_date, profile_id)
);

comment on table public.quiz_answers is
  'Quiz "indovina il partner": ogni riga contiene sia la verità di chi risponde sia la sua ipotesi sulla risposta del partner. Immutabile lato contenuto (nessun update di my_truth/my_guess); guess_correct si scrive SOLO via confirm_quiz_guess, mai da un client diretto. RLS: la mia riga sempre visibile, quella del partner solo se ho scritto anch''io oggi (stesso pattern di mood_checkins).';

create index quiz_answers_couple_date_idx on public.quiz_answers (couple_id, answer_date);

alter table public.quiz_answers enable row level security;

create policy "quiz_answers_select_own_or_revealed"
  on public.quiz_answers for select
  to authenticated
  using (
    couple_id = public.current_couple_id()
    and (
      profile_id = auth.uid()
      or exists (
        select 1 from public.quiz_answers mine
        where mine.couple_id = quiz_answers.couple_id
          and mine.answer_date = quiz_answers.answer_date
          and mine.profile_id = auth.uid()
      )
    )
  );

create policy "quiz_answers_insert_own"
  on public.quiz_answers for insert
  to authenticated
  with check (
    couple_id = public.current_couple_id()
    and profile_id = auth.uid()
  );

-- Nessuna policy UPDATE/DELETE per authenticated: guess_correct si scrive
-- solo via confirm_quiz_guess (SECURITY DEFINER, sotto).
grant select, insert on public.quiz_answers to authenticated;

alter publication supabase_realtime add table public.quiz_answers;
alter table public.quiz_answers replica identity full;

-- -----------------------------------------------------------------------------
-- confirm_quiz_guess: chi possiede la verità conferma l'ipotesi del partner.
-- -----------------------------------------------------------------------------
create or replace function public.confirm_quiz_guess(p_answer_id uuid, p_correct boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  row_couple_id uuid;
  row_profile_id uuid;
  row_guess_correct boolean;
  my_couple_id uuid;
begin
  select couple_id, profile_id, guess_correct
    into row_couple_id, row_profile_id, row_guess_correct
    from public.quiz_answers
    where id = p_answer_id;

  if not found then
    raise exception 'Risposta non trovata.';
  end if;

  select couple_id into my_couple_id from public.profiles where id = auth.uid();
  if my_couple_id is null or my_couple_id <> row_couple_id then
    raise exception 'Non hai accesso a questa risposta.';
  end if;

  if row_profile_id = auth.uid() then
    raise exception 'Non puoi confermare la tua stessa ipotesi.';
  end if;

  if row_guess_correct is not null then
    raise exception 'Questa ipotesi è già stata confermata.';
  end if;

  update public.quiz_answers set guess_correct = p_correct where id = p_answer_id;

  insert into public.notifications (couple_id, recipient_id, actor_id, type, title, body, source_table, source_id)
  values (
    row_couple_id, row_profile_id, auth.uid(), 'quiz',
    case when p_correct then 'Hai indovinato!' else 'Ipotesi sbagliata' end,
    case when p_correct
      then 'Il tuo partner conferma: hai indovinato la sua risposta di oggi!'
      else 'Il tuo partner conferma: questa volta non hai indovinato.'
    end,
    'quiz_answers', p_answer_id
  );
end;
$$;

comment on function public.confirm_quiz_guess(uuid, boolean) is
  'Conferma se l''ipotesi del PARTNER su di te era corretta (solo chi possiede la verità può confermare, mai chi ha scritto l''ipotesi). Una tantum: guess_correct deve essere ancora NULL. Inserisce direttamente la notifica di risultato, stesso pattern di toggle_message_reaction.';

revoke execute on function public.confirm_quiz_guess(uuid, boolean) from public;
grant execute on function public.confirm_quiz_guess(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Trigger di notifica: stessa logica a due rami di prima, aggiornata ai
-- nuovi nomi colonna. Mai il contenuto di my_truth/my_guess nel testo.
-- -----------------------------------------------------------------------------
create or replace function public.notify_quiz_answered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other_partner_id uuid;
  actor_name text;
  partner_already_answered boolean;
begin
  other_partner_id := public._other_partner_id(new.couple_id, new.profile_id);
  if other_partner_id is null then
    return new;
  end if;

  select exists (
    select 1 from public.quiz_answers
    where couple_id = new.couple_id
      and answer_date = new.answer_date
      and profile_id = other_partner_id
  ) into partner_already_answered;

  select display_name into actor_name from public.profiles where id = new.profile_id;

  if partner_already_answered then
    insert into public.notifications (couple_id, recipient_id, actor_id, type, title, body, source_table, source_id)
    values (
      new.couple_id, other_partner_id, new.profile_id, 'quiz',
      'Ipotesi del quiz svelate',
      'Avete scritto entrambi: scopri se hai indovinato ' || coalesce(actor_name, 'il tuo partner'),
      'quiz_answers', new.id
    );
  else
    insert into public.notifications (couple_id, recipient_id, actor_id, type, title, body, source_table, source_id)
    values (
      new.couple_id, other_partner_id, new.profile_id, 'quiz',
      'Tocca a te: quiz di oggi',
      coalesce(actor_name, 'Il tuo partner') || ' ha già scritto la sua risposta di oggi',
      'quiz_answers', new.id
    );
  end if;

  return new;
end;
$$;

comment on function public.notify_quiz_answered() is
  'Trigger AFTER INSERT su quiz_answers: notifica l''altro partner (nudge o "ipotesi svelate" a seconda che sia la prima o la seconda riga del giorno). Mai il contenuto di my_truth/my_guess nel testo.';

create trigger quiz_answers_notify_answered
  after insert on public.quiz_answers
  for each row
  execute function public.notify_quiz_answered();
