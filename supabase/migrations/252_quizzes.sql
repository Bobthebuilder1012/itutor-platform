-- 252 — Quizzes.
--
-- Handoff number 221; see 248 for why the series starts at 248.
--
-- The load-bearing decision: questions live in OUR tables regardless of where
-- the quiz is taken. Google Forms is one value of delivery_channel, not the
-- system of record.
--
-- It would be quicker to push a quiz into Forms and read the score back. It
-- would also mean the marks live in someone else's product, student_topic_mastery
-- gets nothing to learn from, native delivery is a rewrite rather than a new
-- channel, and a Google outage loses not just delivery but the quiz itself.
-- Hence quiz_questions referencing our corpus, and quiz_responses holding the
-- marks even when Forms computed them.
--
-- Add-only.

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,

  title text not null,
  level text,

  status text not null default 'DRAFT'
    check (status in ('DRAFT','PUBLISHED','CLOSED','ARCHIVED')),

  delivery_channel text not null default 'GOOGLE_FORMS'
    check (delivery_channel in ('GOOGLE_FORMS','NATIVE')),

  external_form_id text,
  external_url text,
  -- The response-watch registration, so it can be renewed and torn down.
  -- Watches, not polling: a poll that runs often enough to feel live costs a
  -- request per quiz per interval forever.
  external_watch_id text,
  external_watch_expires_at timestamptz,

  -- Forms created through the API after 30 June 2026 are unpublished by default
  -- and silently accept no responses. This column is what the prototype's
  -- "Draft — this quiz accepts no responses" state reads, and it is set from
  -- forms.setPublishSettings(), never assumed.
  external_accepts_responses boolean not null default false,

  time_limit_minutes int check (time_limit_minutes is null or time_limit_minutes > 0),
  published_at timestamptz,
  closed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quizzes_tutor_idx
  on public.quizzes (tutor_id, created_at desc);
create unique index if not exists quizzes_external_form_unique
  on public.quizzes (external_form_id)
  where external_form_id is not null;

-- ── Questions on a quiz ────────────────────────────────────────────────────
--
-- source_table names which of our two corpora the question came from. The
-- CHECK pairs it with the matching id column, so a row cannot claim to be a
-- past-paper question while pointing at a generated one.

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,

  source_table text not null
    check (source_table in ('paper_questions','generated_questions')),
  paper_question_id uuid references public.paper_questions(id) on delete restrict,
  generated_question_id uuid references public.generated_questions(id) on delete restrict,

  order_index int not null default 0,
  marks int not null default 1 check (marks >= 0),
  question_type text not null default 'EXTENDED'
    check (question_type in ('MCQ','SHORT','EXTENDED','STRUCTURED')),

  -- Which item in the external form this became, so a response can be mapped
  -- back to our question rather than matched on text.
  external_item_id text,

  created_at timestamptz not null default now(),

  constraint quiz_questions_source_matches_id check (
    (source_table = 'paper_questions'
       and paper_question_id is not null and generated_question_id is null)
    or (source_table = 'generated_questions'
       and generated_question_id is not null and paper_question_id is null)
  )
);

create index if not exists quiz_questions_quiz_idx
  on public.quiz_questions (quiz_id, order_index);

-- ── Assignment and responses ───────────────────────────────────────────────

create table if not exists public.quiz_assignments (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,

  assigned_at timestamptz not null default now(),

  constraint quiz_assignments_unique unique (quiz_id, student_id)
);

create index if not exists quiz_assignments_student_idx
  on public.quiz_assignments (student_id, assigned_at desc);

create table if not exists public.quiz_responses (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,

  -- Nullable: respondent email collection can return someone who does not match
  -- an iTutor account. That response is kept and assigned by hand rather than
  -- discarded, which is why this is not NOT NULL.
  student_id uuid references public.profiles(id) on delete set null,
  respondent_email text,

  external_response_id text,
  submitted_at timestamptz,

  -- Three scores, deliberately separate. auto_score is what Forms graded (MCQ),
  -- ai_score is what the model suggested for written answers, final_score is
  -- what the tutor stands behind. Collapsing them would erase the override
  -- delta, which rule 5 calls the only honest quality metric.
  auto_score numeric(6,2),
  ai_score numeric(6,2),
  final_score numeric(6,2),

  needs_manual_marking boolean not null default false,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,

  -- Rule 5: nothing reaches the student until a tutor publishes.
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists quiz_responses_external_unique
  on public.quiz_responses (quiz_id, external_response_id)
  where external_response_id is not null;
create index if not exists quiz_responses_quiz_idx
  on public.quiz_responses (quiz_id, submitted_at desc);
create index if not exists quiz_responses_student_idx
  on public.quiz_responses (student_id, submitted_at desc);
-- The tutor's "written answers wait for you" queue.
create index if not exists quiz_responses_pending_review_idx
  on public.quiz_responses (quiz_id)
  where needs_manual_marking = true and reviewed_at is null;

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.quiz_responses(id) on delete cascade,
  quiz_question_id uuid not null references public.quiz_questions(id) on delete cascade,

  answer_text text,

  auto_grade boolean,
  ai_suggested_marks numeric(4,1),
  ai_rationale text,
  final_marks numeric(4,1),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint quiz_answers_unique unique (response_id, quiz_question_id)
);

create index if not exists quiz_answers_response_idx
  on public.quiz_answers (response_id);

-- ── updated_at ─────────────────────────────────────────────────────────────

create or replace function public.quiz_touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

do $do$
declare t text;
begin
  foreach t in array array['quizzes','quiz_responses','quiz_answers'] loop
    execute format('drop trigger if exists trg_%1$s_touch_updated_at on public.%1$I', t, t);
    execute format(
      'create trigger trg_%1$s_touch_updated_at
         before update on public.%1$I
         for each row execute function public.quiz_touch_updated_at()', t, t);
  end loop;
end $do$;

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_assignments enable row level security;
alter table public.quiz_responses enable row level security;
alter table public.quiz_answers enable row level security;

drop policy if exists quizzes_tutor_read on public.quizzes;
create policy quizzes_tutor_read
  on public.quizzes for select
  using (tutor_id = auth.uid());

-- A student sees a quiz they were assigned, and only once it is published.
drop policy if exists quizzes_assigned_student_read on public.quizzes;
create policy quizzes_assigned_student_read
  on public.quizzes for select
  using (
    status = 'PUBLISHED'
    and exists (
      select 1 from public.quiz_assignments qa
       where qa.quiz_id = quizzes.id and qa.student_id = auth.uid()
    )
  );

drop policy if exists quiz_questions_tutor_read on public.quiz_questions;
create policy quiz_questions_tutor_read
  on public.quiz_questions for select
  using (exists (
    select 1 from public.quizzes q
     where q.id = quiz_questions.quiz_id and q.tutor_id = auth.uid()
  ));

drop policy if exists quiz_assignments_read on public.quiz_assignments;
create policy quiz_assignments_read
  on public.quiz_assignments for select
  using (
    student_id = auth.uid()
    or exists (
      select 1 from public.quizzes q
       where q.id = quiz_assignments.quiz_id and q.tutor_id = auth.uid()
    )
  );

drop policy if exists quiz_responses_tutor_read on public.quiz_responses;
create policy quiz_responses_tutor_read
  on public.quiz_responses for select
  using (exists (
    select 1 from public.quizzes q
     where q.id = quiz_responses.quiz_id and q.tutor_id = auth.uid()
  ));

-- Rule 5 in a policy: a student reads their own result only after it is
-- published, not while an AI score is sitting in it awaiting review.
drop policy if exists quiz_responses_student_published_read on public.quiz_responses;
create policy quiz_responses_student_published_read
  on public.quiz_responses for select
  using (student_id = auth.uid() and published_at is not null);

drop policy if exists quiz_answers_tutor_read on public.quiz_answers;
create policy quiz_answers_tutor_read
  on public.quiz_answers for select
  using (exists (
    select 1 from public.quiz_responses r
     join public.quizzes q on q.id = r.quiz_id
     where r.id = quiz_answers.response_id and q.tutor_id = auth.uid()
  ));

drop policy if exists quiz_answers_student_published_read on public.quiz_answers;
create policy quiz_answers_student_published_read
  on public.quiz_answers for select
  using (exists (
    select 1 from public.quiz_responses r
     where r.id = quiz_answers.response_id
       and r.student_id = auth.uid()
       and r.published_at is not null
  ));

-- ── Sanity ─────────────────────────────────────────────────────────────────

do $do$
declare missing text[];
begin
  select array_agg(t) into missing
    from unnest(array[
      'quizzes','quiz_questions','quiz_assignments','quiz_responses','quiz_answers'
    ]) t
   where to_regclass('public.' || t) is null;

  if missing is not null then
    raise exception '252: tables missing after migration: %', missing;
  end if;

  raise notice '252: quizzes ready (questions held locally, Forms is a delivery channel)';
end $do$;
