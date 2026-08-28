-- 250 — The question corpus.
--
-- Handoff number 219; see 248 for why the series starts at 248.
--
-- Two kinds of question live here and they must never be confused with each
-- other. A `paper_questions` row is a real CXC question transcribed from a
-- licensed document — it carries a source and a licence, and it is the reason
-- `past_papers.license_status` exists. A `generated_questions` row is something
-- a model wrote; it is ours, it is free of licence risk, and it is also the one
-- a student must not see until a human has looked at it (rule 3).
--
-- Keeping them in separate tables rather than one table with a flag is
-- deliberate. A flag gets defaulted wrong once and licensed exam content leaks
-- into a generated quiz; two tables cannot make that mistake silently, and the
-- quiz row records which table each question came from.
--
-- Add-only.

-- ── Papers ─────────────────────────────────────────────────────────────────

create table if not exists public.past_papers (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  source_id uuid references public.curriculum_sources(id) on delete set null,

  title text not null,
  exam_year int,
  exam_sitting text check (exam_sitting is null or exam_sitting in ('JANUARY','MAY_JUNE','SPECIMEN')),
  paper_number int,

  -- Mirrors curriculum_sources.license with the same CHECK-constraint discipline.
  -- A paper that is not clearly licensed cannot be used to build a quiz; the
  -- corpus reader filters on this, it is not advisory.
  license_status text not null default 'UNKNOWN'
    check (license_status in ('CXC_OFFICIAL','CXC_STORE','PUBLIC_DOMAIN','TUTOR_SUPPLIED','UNKNOWN','UNLICENSED')),
  license_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists past_papers_subject_idx
  on public.past_papers (subject_id, exam_year desc);
create index if not exists past_papers_license_idx
  on public.past_papers (license_status);

-- ── Questions from those papers ────────────────────────────────────────────

create table if not exists public.paper_questions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.past_papers(id) on delete cascade,

  -- '3(b)(ii)' — kept as text because CXC numbering is not decimal and the
  -- subject reports refer to questions by exactly this string.
  question_reference text not null,
  order_index int not null default 0,

  question_text text not null,
  -- Diagrams and figures that the text alone loses. Path into the private
  -- curriculum-source bucket, never a public URL.
  figure_path text,

  marks int check (marks is null or marks >= 0),
  question_type text not null default 'EXTENDED'
    check (question_type in ('MCQ','SHORT','EXTENDED','STRUCTURED')),
  -- 'Calculate', 'Explain', 'Determine' — drives the marking profile's
  -- command_word_map and how strictly an answer is read.
  command_word text,

  source_page int,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint paper_questions_unique_ref unique (paper_id, question_reference)
);

create index if not exists paper_questions_paper_idx
  on public.paper_questions (paper_id, order_index);

-- ── Topic tagging ──────────────────────────────────────────────────────────
--
-- Many-to-many on purpose: a CSEC question about the area of a bearing diagram
-- is Measurement and Geometry and Trigonometry at once, and mastery evidence
-- should land on all of them.

create table if not exists public.question_topics (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.syllabus_topics(id) on delete cascade,

  -- Exactly one of these is set; the CHECK below enforces it.
  paper_question_id uuid references public.paper_questions(id) on delete cascade,
  generated_question_id uuid,

  -- Model confidence in the tag. A weak tag is still recorded — dropping it
  -- would quietly shrink the corpus a topic can draw on.
  confidence numeric(4,3)
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  is_primary boolean not null default false,

  created_at timestamptz not null default now(),

  constraint question_topics_exactly_one_target check (
    (paper_question_id is not null and generated_question_id is null)
    or (paper_question_id is null and generated_question_id is not null)
  )
);

create index if not exists question_topics_topic_idx
  on public.question_topics (topic_id);
create index if not exists question_topics_paper_q_idx
  on public.question_topics (paper_question_id);
create index if not exists question_topics_generated_q_idx
  on public.question_topics (generated_question_id);

-- ── Mark scheme ────────────────────────────────────────────────────────────
--
-- One row per awardable mark, not one blob per question. This is what lets the
-- marker say "you lost the M1 for the method" instead of "5/8", and what the
-- tutor override diff is computed against.

create table if not exists public.mark_scheme_points (
  id uuid primary key default gen_random_uuid(),
  paper_question_id uuid not null references public.paper_questions(id) on delete cascade,

  order_index int not null default 0,
  description text not null,
  marks numeric(4,1) not null default 1 check (marks >= 0),

  -- CXC's own vocabulary. M = method, A = accuracy, B = independent,
  -- FT = follow-through from an earlier wrong answer.
  point_type text not null default 'A'
    check (point_type in ('M','A','B','FT','SC')),

  -- Accepted alternatives, so a correct answer written differently is not
  -- marked wrong. Text array rather than jsonb: it is a list of strings and
  -- nothing more.
  accepted_alternatives text[],

  source_id uuid references public.curriculum_sources(id) on delete set null,
  source_page int,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mark_scheme_points_question_idx
  on public.mark_scheme_points (paper_question_id, order_index);

-- ── Generated questions ────────────────────────────────────────────────────
--
-- Ours, and invisible to a learner until reviewed. `verified_at` here does the
-- same job it does on syllabus_topics.

create table if not exists public.generated_questions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,

  -- The job that produced it, so a bad batch can be traced back to its prompt
  -- and model. FK added in 251, once ai_jobs exists.
  job_id uuid,

  question_text text not null,
  question_type text not null default 'EXTENDED'
    check (question_type in ('MCQ','SHORT','EXTENDED','STRUCTURED')),
  marks int check (marks is null or marks >= 0),
  difficulty text check (difficulty is null or difficulty in ('FOUNDATION','CORE','EXTENSION')),

  -- MCQ shape. Null for everything else.
  options jsonb,
  correct_answer text,
  worked_solution text,

  -- The style reference, NOT the content source. A generated question modelled
  -- on the shape of a past paper question is ours; the licensed original is
  -- not copied into this table.
  modelled_on_question_id uuid references public.paper_questions(id) on delete set null,

  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generated_questions_subject_idx
  on public.generated_questions (subject_id, created_at desc);
create index if not exists generated_questions_review_idx
  on public.generated_questions (created_at)
  where verified_at is null;

-- question_topics.generated_question_id could not be declared as a foreign key
-- above, because generated_questions did not exist yet. Added now.
do $do$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'question_topics_generated_question_fk'
  ) then
    alter table public.question_topics
      add constraint question_topics_generated_question_fk
      foreign key (generated_question_id)
      references public.generated_questions(id) on delete cascade;
  end if;
end $do$;

-- ── updated_at ─────────────────────────────────────────────────────────────

create or replace function public.corpus_touch_updated_at()
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
  foreach t in array array[
    'past_papers','paper_questions','mark_scheme_points','generated_questions'
  ] loop
    execute format('drop trigger if exists trg_%1$s_touch_updated_at on public.%1$I', t, t);
    execute format(
      'create trigger trg_%1$s_touch_updated_at
         before update on public.%1$I
         for each row execute function public.corpus_touch_updated_at()', t, t);
  end loop;
end $do$;

-- ── RLS ────────────────────────────────────────────────────────────────────
--
-- Licensed exam content is reviewer/admin only. It is not ours to redistribute,
-- and a tutor-facing feature reads it through the service role on the server,
-- never by selecting it in the browser.
--
-- Generated questions follow rule 3: verified ones are readable by any signed-in
-- user, drafts only by the tutor who made them and by reviewers.

alter table public.past_papers enable row level security;
alter table public.paper_questions enable row level security;
alter table public.question_topics enable row level security;
alter table public.mark_scheme_points enable row level security;
alter table public.generated_questions enable row level security;

drop policy if exists past_papers_reviewer_read on public.past_papers;
create policy past_papers_reviewer_read
  on public.past_papers for select
  using (public.is_curriculum_reviewer());

drop policy if exists paper_questions_reviewer_read on public.paper_questions;
create policy paper_questions_reviewer_read
  on public.paper_questions for select
  using (public.is_curriculum_reviewer());

drop policy if exists mark_scheme_points_reviewer_read on public.mark_scheme_points;
create policy mark_scheme_points_reviewer_read
  on public.mark_scheme_points for select
  using (public.is_curriculum_reviewer());

drop policy if exists question_topics_read on public.question_topics;
create policy question_topics_read
  on public.question_topics for select
  using (auth.uid() is not null);

drop policy if exists generated_questions_read on public.generated_questions;
create policy generated_questions_read
  on public.generated_questions for select
  using (
    verified_at is not null
    or created_by = auth.uid()
    or public.is_curriculum_reviewer()
  );

-- ── Sanity ─────────────────────────────────────────────────────────────────

do $do$
declare missing text[];
begin
  select array_agg(t) into missing
    from unnest(array[
      'past_papers','paper_questions','question_topics',
      'mark_scheme_points','generated_questions'
    ]) t
   where to_regclass('public.' || t) is null;

  if missing is not null then
    raise exception '250: tables missing after migration: %', missing;
  end if;

  raise notice '250: question corpus ready (5 tables, licensed and generated kept apart, RLS on)';
end $do$;
