-- =============================================================================
-- Quiz giornaliero "quanto mi conosci" + check-in emotivo quotidiano
-- =============================================================================
-- Fase B del piano approvato
-- (/Users/antonioarcucci/.claude/plans/ho-notato-delle-cose-mossy-sketch.md).
-- Le due tabelle condividono la stessa forma di RLS: la mia riga è sempre
-- visibile a me, quella del partner solo se anche io ho già risposto/loggato
-- oggi (rivelazione reciproca e simmetrica) — a differenza della wishlist,
-- qui la riga nascosta può semplicemente non esistere per chi legge, RLS pura
-- sulla tabella base, nessuna vista di mascheramento necessaria (nessuna
-- posizione fissa in lista da preservare con un placeholder).
--
-- "Domanda di oggi" globale (stessa per tutte le coppie in un dato giorno,
-- confermato con l'utente): NON serve una funzione/tabella di stato lato DB
-- per calcolarla — l'indice è deterministico (data mod numero domande) e
-- viene calcolato lato client in lib/quiz-actions.ts, stesso principio già
-- seguito per traguardi/throwback (nessun cron nel progetto, tutto ciò che
-- dipende da "che giorno è" si calcola in lettura). question_id resta
-- comunque salvato per riga (denormalizzato) così una risposta passata resta
-- tracciabile anche se il pool di domande cambia in futuro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- quiz_questions: pool statico, seedato qui. Contenuto non sensibile.
-- -----------------------------------------------------------------------------
create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  created_at timestamptz not null default now()
);

comment on table public.quiz_questions is
  'Pool di domande per il quiz "quanto mi conosci". Stessa domanda per tutte le coppie in un dato giorno, indice calcolato lato client (vedi lib/quiz-actions.ts). Lettura aperta a tutti gli utenti autenticati, nessuna scrittura dal client.';

alter table public.quiz_questions enable row level security;

create policy "quiz_questions_select_all"
  on public.quiz_questions for select
  to authenticated
  using (true);

grant select on public.quiz_questions to authenticated;

insert into public.quiz_questions (prompt) values
  ('Qual è il mio colore preferito?'),
  ('Qual è il mio piatto preferito?'),
  ('Qual è la mia canzone preferita in assoluto?'),
  ('Qual è il mio film preferito?'),
  ('Se potessi vivere in una città diversa, quale sceglierei?'),
  ('Qual è la mia più grande paura?'),
  ('Cosa mi fa ridere di sicuro, anche in una brutta giornata?'),
  ('Qual è il tuo ricordo preferito di noi due?'),
  ('Cosa vorrei fare nel prossimo anno che non ho ancora fatto?'),
  ('Qual è il regalo che mi ha fatto più piacere ricevere da te?'),
  ('Se potessi avere una qualità in più, quale sceglierei?'),
  ('Qual è la mia serie TV preferita del momento?'),
  ('Cosa faccio appena mi sveglio la mattina?'),
  ('Qual è il mio animale preferito?'),
  ('Cosa mi stressa di più nella vita quotidiana?'),
  ('Qual è il posto dove sono stato/a più felice in vita mia?'),
  ('Qual è la mia più grande ambizione?'),
  ('Cosa mi fa arrabbiare più velocemente?'),
  ('Qual è il mio dolce preferito?'),
  ('Cosa pensi sia la cosa più romantica che io abbia mai fatto?'),
  ('Se facessimo un viaggio a sorpresa, dove vorrei andare?'),
  ('Qual è la mia più grande mania/abitudine strana?'),
  ('Qual è il mio sport preferito da guardare o praticare?'),
  ('Cosa mi rende geloso/a?'),
  ('Qual è il libro che mi ha segnato di più?'),
  ('Come preferisco passare una serata tranquilla?'),
  ('Qual è il mio più grande rimpianto, piccolo o grande?'),
  ('Cosa pensi sia la mia dote migliore?'),
  ('Qual è la stagione dell''anno che preferisco?'),
  ('Cosa vorrei che tu facessi più spesso per me?'),
  ('Qual è il mio momento preferito della giornata?'),
  ('Se vincessi alla lotteria, quale sarebbe la prima cosa che farei?'),
  ('Qual è la mia bevanda preferita?'),
  ('Cosa penso della prima volta che ci siamo visti?'),
  ('Qual è una cosa che voglio imparare a fare?'),
  ('Cosa mi rilassa di più dopo una giornata pesante?'),
  ('Qual è il mio superpotere ideale, se potessi sceglierne uno?'),
  ('Qual è il mio profumo/odore preferito?'),
  ('Cosa penso sia l''ingrediente segreto di una relazione felice?'),
  ('Qual è la mia più grande soddisfazione, professionale o personale, finora?'),
  ('Qual è il mio modo preferito di ricevere affetto?'),
  ('Cosa mi mette di buon umore in pochi secondi?'),
  ('Qual è il mio ricordo d''infanzia preferito?'),
  ('Se potessi cenare con una persona, viva o no, chi sceglierei?'),
  ('Qual è la canzone che mi ricorda noi due?'),
  ('Cosa penso sia la cosa più difficile della vita di coppia?'),
  ('Qual è il mio piano perfetto per un weekend libero?'),
  ('Cosa ti rende orgoglioso/a di me?'),
  ('Qual è la mia più grande paura per il nostro futuro insieme?'),
  ('Se dovessi descrivermi in tre parole, quali useresti?');

-- -----------------------------------------------------------------------------
-- quiz_answers
-- -----------------------------------------------------------------------------
create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  answer_date date not null,
  question_id uuid not null references public.quiz_questions (id),
  answer text not null check (length(trim(answer)) > 0),
  created_at timestamptz not null default now(),

  constraint quiz_answers_one_per_day unique (couple_id, answer_date, profile_id)
);

comment on table public.quiz_answers is
  'Risposte al quiz giornaliero. Immutabili (nessun update/delete, come messages): una volta risposto, non si cambia idea. RLS: la mia riga sempre visibile, quella del partner solo se ho risposto anch''io oggi stesso — vedi policy sotto.';

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

grant select, insert on public.quiz_answers to authenticated;

alter publication supabase_realtime add table public.quiz_answers;
alter table public.quiz_answers replica identity full;

-- -----------------------------------------------------------------------------
-- mood_checkins
-- -----------------------------------------------------------------------------
create type public.mood_type as enum ('felice', 'sereno', 'stanco', 'stressato', 'triste', 'innamorato');

create table public.mood_checkins (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  checkin_date date not null,
  mood public.mood_type not null,
  created_at timestamptz not null default now(),

  constraint mood_checkins_one_per_day unique (couple_id, checkin_date, profile_id)
);

comment on table public.mood_checkins is
  'Check-in emotivo giornaliero (un tap su una scala emoji). Immutabile, stesso trattamento di quiz_answers: RLS identica, la mia riga sempre visibile, quella del partner solo se ho loggato anch''io oggi.';

create index mood_checkins_couple_date_idx on public.mood_checkins (couple_id, checkin_date);

alter table public.mood_checkins enable row level security;

create policy "mood_checkins_select_own_or_revealed"
  on public.mood_checkins for select
  to authenticated
  using (
    couple_id = public.current_couple_id()
    and (
      profile_id = auth.uid()
      or exists (
        select 1 from public.mood_checkins mine
        where mine.couple_id = mood_checkins.couple_id
          and mine.checkin_date = mood_checkins.checkin_date
          and mine.profile_id = auth.uid()
      )
    )
  );

create policy "mood_checkins_insert_own"
  on public.mood_checkins for insert
  to authenticated
  with check (
    couple_id = public.current_couple_id()
    and profile_id = auth.uid()
  );

grant select, insert on public.mood_checkins to authenticated;

alter publication supabase_realtime add table public.mood_checkins;
alter table public.mood_checkins replica identity full;

-- -----------------------------------------------------------------------------
-- notifications: amplia il whitelist source_table (già esistente, vedi
-- 20260901090000_notifications.sql) per includere le due nuove tabelle.
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_source_table_known;
alter table public.notifications add constraint notifications_source_table_known
  check (source_table is null or source_table in (
    'messages', 'calendar_events', 'appointments', 'wishlist_items',
    'quiz_answers', 'mood_checkins'
  ));

-- -----------------------------------------------------------------------------
-- Trigger notifica: quiz_answers. Due rami — se il partner non ha ancora
-- risposto oggi, un nudge "tocca a te"; se questo insert è il secondo
-- (il partner aveva già risposto), la notifica di rivelazione. Mai il
-- contenuto della risposta nel testo della notifica (si scoprirebbe senza
-- aver risposto a propria volta, aggirando la RLS via il canale notifiche).
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
      'Risposte del quiz svelate',
      'Avete risposto entrambi alla domanda di oggi: scopri cosa ha detto ' || coalesce(actor_name, 'il tuo partner'),
      'quiz_answers', new.id
    );
  else
    insert into public.notifications (couple_id, recipient_id, actor_id, type, title, body, source_table, source_id)
    values (
      new.couple_id, other_partner_id, new.profile_id, 'quiz',
      'Tocca a te: quiz di oggi',
      coalesce(actor_name, 'Il tuo partner') || ' ha già risposto alla domanda di oggi',
      'quiz_answers', new.id
    );
  end if;

  return new;
end;
$$;

comment on function public.notify_quiz_answered() is
  'Trigger AFTER INSERT su quiz_answers: notifica l''altro partner con testo diverso a seconda che sia la prima o la seconda risposta del giorno (nudge vs rivelazione). Mai il contenuto della risposta nel testo.';

create trigger quiz_answers_notify_answered
  after insert on public.quiz_answers
  for each row
  execute function public.notify_quiz_answered();

-- -----------------------------------------------------------------------------
-- Trigger notifica: mood_checkins. Stessa identica logica a due rami.
-- -----------------------------------------------------------------------------
create or replace function public.notify_mood_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other_partner_id uuid;
  actor_name text;
  partner_already_checked_in boolean;
begin
  other_partner_id := public._other_partner_id(new.couple_id, new.profile_id);
  if other_partner_id is null then
    return new;
  end if;

  select exists (
    select 1 from public.mood_checkins
    where couple_id = new.couple_id
      and checkin_date = new.checkin_date
      and profile_id = other_partner_id
  ) into partner_already_checked_in;

  select display_name into actor_name from public.profiles where id = new.profile_id;

  if partner_already_checked_in then
    insert into public.notifications (couple_id, recipient_id, actor_id, type, title, body, source_table, source_id)
    values (
      new.couple_id, other_partner_id, new.profile_id, 'mood_checkin',
      'Check-in di oggi svelato',
      'Avete fatto entrambi il check-in di oggi: guarda come sta ' || coalesce(actor_name, 'il tuo partner'),
      'mood_checkins', new.id
    );
  else
    insert into public.notifications (couple_id, recipient_id, actor_id, type, title, body, source_table, source_id)
    values (
      new.couple_id, other_partner_id, new.profile_id, 'mood_checkin',
      'Tocca a te: check-in di oggi',
      coalesce(actor_name, 'Il tuo partner') || ' ha già fatto il check-in di oggi',
      'mood_checkins', new.id
    );
  end if;

  return new;
end;
$$;

comment on function public.notify_mood_checkin() is
  'Trigger AFTER INSERT su mood_checkins: stessa logica a due rami di notify_quiz_answered(). Mai lo stato d''animo nel testo della notifica.';

create trigger mood_checkins_notify_checkin
  after insert on public.mood_checkins
  for each row
  execute function public.notify_mood_checkin();
