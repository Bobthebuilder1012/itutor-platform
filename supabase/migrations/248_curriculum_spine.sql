-- 248 — The curriculum spine for iTutor AI v2.
--
-- The build handoff numbers this migration 217. That number, and 218-222 with
-- it, belong to shipped features (profiles_privileged_column_guard,
-- attendance_read_only, parent_approval_booking_requests, attendance_derivation,
-- feedback_requests, feedback). The AI series therefore starts at 248.
--
-- Everything the AI generates has to be traceable to a document a human can
-- open. That is the point of this migration: a topic is not a string in a
-- prompt, it is a row with a source_id and a source_page, and until a reviewer
-- signs it off it does not reach a learner. Rule 3 in CLAUDE.md depends
-- entirely on `verified_at` being NULL by default here.
--
-- Add-only. Nothing here changes an existing table.

-- ── Sources ────────────────────────────────────────────────────────────────
--
-- One row per document. Registered BEFORE the file arrives, so a source can be
-- tracked as "we need this and do not have it" rather than existing only once
-- someone remembers to upload it. license is not decorative: rule 4 forbids
-- unlicensed past-paper content anywhere in the repo, and this column is where
-- that claim is recorded and stays auditable.

create table if not exists public.curriculum_sources (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.subjects(id) on delete restrict,

  -- What kind of document this is. Extraction behaves differently per kind: a
  -- syllabus yields topics, a subject report yields examiner notes and the
  -- errors candidates actually make.
  source_type text not null
    check (source_type in ('SYLLABUS','SPECIMEN_PAPER','MARK_SCHEME','SUBJECT_REPORT','PAST_PAPER')),

  title text not null,
  exam_year int,
  paper_number int,

  -- Provenance. CXC_OFFICIAL is the syllabus CXC publishes free on cxc.org;
  -- CXC_STORE is a paid download. Those two are the only origins that may carry
  -- exam content.
  -- UNLICENSED exists so a mistaken upload can be recorded and quarantined
  -- rather than quietly deleted and forgotten about.
  license text not null default 'UNKNOWN'
    check (license in ('CXC_OFFICIAL','CXC_STORE','PUBLIC_DOMAIN','TUTOR_SUPPLIED','UNKNOWN','UNLICENSED')),
  license_note text,

  -- Filled by scripts/ingest/upload-source.ts once the file is stored.
  storage_path text,
  file_sha256 text,
  page_count int,

  ingest_status text not null default 'REGISTERED'
    check (ingest_status in ('REGISTERED','STORED','EXTRACTING','EXTRACTED','FAILED')),
  ingest_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The same PDF uploaded twice is the same source. Partial, because many rows
-- legitimately sit at REGISTERED with no file and therefore no hash.
create unique index if not exists curriculum_sources_sha_unique
  on public.curriculum_sources (file_sha256)
  where file_sha256 is not null;

create index if not exists curriculum_sources_subject_idx
  on public.curriculum_sources (subject_id, source_type);
create index if not exists curriculum_sources_status_idx
  on public.curriculum_sources (ingest_status);

-- ── The tree ───────────────────────────────────────────────────────────────
--
-- Units and their sections, as the syllabus presents them. Self-referencing
-- rather than two tables, because CSEC and CAPE nest to different depths and a
-- fixed unit/section pair would not hold CAPE.

create table if not exists public.curriculum_tree (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  parent_id uuid references public.curriculum_tree(id) on delete cascade,

  node_type text not null default 'UNIT'
    check (node_type in ('UNIT','SECTION')),

  code text,
  title text not null,
  order_index int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists curriculum_tree_subject_idx
  on public.curriculum_tree (subject_id, order_index);
create index if not exists curriculum_tree_parent_idx
  on public.curriculum_tree (parent_id, order_index);

-- ── Topics ─────────────────────────────────────────────────────────────────
--
-- The unit of everything downstream: a lesson-plan row, a quiz question's tag,
-- a mastery score. Written by extraction with verified_at NULL and a model
-- confidence; promoted by a human.

create table if not exists public.syllabus_topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  node_id uuid references public.curriculum_tree(id) on delete set null,

  code text,
  title text not null,
  objective text,

  -- Roughly how long this takes to teach. The lesson planner needs a number
  -- here or it cannot lay a syllabus against a calendar; null means "the
  -- reviewer has not said", not "zero".
  estimated_minutes int,

  -- Traceability. A topic with no source cannot be defended to a tutor who asks
  -- where it came from, so both halves are recorded.
  source_id uuid references public.curriculum_sources(id) on delete set null,
  source_page int,

  -- 0..1 from the extraction model. The review queue sorts on this ascending,
  -- so the least trustworthy rows are seen first.
  extraction_confidence numeric(4,3)
    check (extraction_confidence is null
           or (extraction_confidence >= 0 and extraction_confidence <= 1)),

  -- Rule 3. Null here means this row is invisible to learners, full stop.
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists syllabus_topics_subject_idx
  on public.syllabus_topics (subject_id);
create index if not exists syllabus_topics_node_idx
  on public.syllabus_topics (node_id);
-- The reviewer's queue: unverified, least confident first.
create index if not exists syllabus_topics_review_queue_idx
  on public.syllabus_topics (extraction_confidence asc nulls first)
  where verified_at is null;

-- ── Prerequisite edges ─────────────────────────────────────────────────────
--
-- Hand-drawn by a reviewer. The syllabus is ordered for presentation, not for
-- teaching, so this cannot be extracted — you cannot teach Bearings before
-- Trigonometry, but nothing in the document says so.

create table if not exists public.topic_prerequisites (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.syllabus_topics(id) on delete cascade,
  prerequisite_id uuid not null references public.syllabus_topics(id) on delete cascade,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint topic_prerequisites_no_self check (topic_id <> prerequisite_id),
  constraint topic_prerequisites_unique unique (topic_id, prerequisite_id)
);

create index if not exists topic_prerequisites_topic_idx
  on public.topic_prerequisites (topic_id);
create index if not exists topic_prerequisites_prereq_idx
  on public.topic_prerequisites (prerequisite_id);

-- The cycle guard. A teaching order containing a cycle is not a teaching order,
-- and a planner asked to topologically sort one will either loop or silently
-- drop topics. Write time is the only place this can be caught cheaply, and a
-- rejection here is a correctness signal, not an obstacle to route around: it
-- means two topics have been drawn as depending on each other.
create or replace function public.topic_prerequisites_reject_cycle()
returns trigger
language plpgsql
as $fn$
begin
  -- Walk up from the proposed prerequisite. If the topic the edge is being
  -- added FOR is reachable, the new edge closes a loop.
  if exists (
    with recursive chain as (
      select new.prerequisite_id as node
      union
      select tp.prerequisite_id
        from public.topic_prerequisites tp
        join chain c on tp.topic_id = c.node
    )
    select 1 from chain where node = new.topic_id
  ) then
    raise exception
      'topic_prerequisites: % -> % would create a prerequisite cycle',
      new.prerequisite_id, new.topic_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_topic_prerequisites_reject_cycle on public.topic_prerequisites;
create trigger trg_topic_prerequisites_reject_cycle
  before insert or update on public.topic_prerequisites
  for each row
  execute function public.topic_prerequisites_reject_cycle();

-- ── Examiner knowledge ─────────────────────────────────────────────────────
--
-- Extracted from subject reports. This is what lets generated feedback sound
-- like a teacher who has read the examiner's comments, rather than a model
-- guessing at what candidates get wrong.

create table if not exists public.common_errors (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.syllabus_topics(id) on delete cascade,

  description text not null,
  misconception text,
  question_reference text,

  source_id uuid references public.curriculum_sources(id) on delete set null,
  source_page int,
  extraction_confidence numeric(4,3)
    check (extraction_confidence is null
           or (extraction_confidence >= 0 and extraction_confidence <= 1)),

  -- A low-confidence topic match parks here rather than being dropped. Rule 3
  -- again: flagged for review, never silently discarded.
  needs_review boolean not null default true,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists common_errors_topic_idx
  on public.common_errors (topic_id);
create index if not exists common_errors_review_idx
  on public.common_errors (extraction_confidence asc nulls first)
  where verified_at is null;

create table if not exists public.examiner_notes (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.syllabus_topics(id) on delete cascade,

  note text not null,
  exam_year int,
  question_reference text,

  source_id uuid references public.curriculum_sources(id) on delete set null,
  source_page int,
  extraction_confidence numeric(4,3)
    check (extraction_confidence is null
           or (extraction_confidence >= 0 and extraction_confidence <= 1)),

  needs_review boolean not null default true,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists examiner_notes_topic_idx
  on public.examiner_notes (topic_id);
create index if not exists examiner_notes_review_idx
  on public.examiner_notes (extraction_confidence asc nulls first)
  where verified_at is null;

-- ── updated_at ─────────────────────────────────────────────────────────────
--
-- Per-table function plus trigger, matching 222 and 245. There is no shared
-- touch_updated_at() helper in this project, despite what the handoff assumes.

create or replace function public.curriculum_touch_updated_at()
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
    'curriculum_sources','curriculum_tree','syllabus_topics',
    'common_errors','examiner_notes'
  ] loop
    execute format('drop trigger if exists trg_%1$s_touch_updated_at on public.%1$I', t, t);
    execute format(
      'create trigger trg_%1$s_touch_updated_at
         before update on public.%1$I
         for each row execute function public.curriculum_touch_updated_at()', t, t);
  end loop;
end $do$;

-- ── RLS ────────────────────────────────────────────────────────────────────
--
-- On for every table, because an unprotected table on this project has been a
-- defect more than once (see 244).
--
-- Reads: any signed-in user may read VERIFIED curriculum. Unverified drafts are
-- visible only to reviewers and admins — rule 3 enforced in the database rather
-- than trusted to every query that ever selects a topic.
--
-- Writes: service-role only. Extraction and reviewer approval both run
-- server-side, and the service role bypasses RLS, so no write policy is granted
-- to anyone else on purpose.

alter table public.curriculum_sources enable row level security;
alter table public.curriculum_tree enable row level security;
alter table public.syllabus_topics enable row level security;
alter table public.topic_prerequisites enable row level security;
alter table public.common_errors enable row level security;
alter table public.examiner_notes enable row level security;

create or replace function public.is_curriculum_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and (is_reviewer = true or role = 'admin')
  );
$fn$;

-- Sources are reviewer/admin only, in full. A tutor has no need to enumerate
-- the document library, and the storage bucket behind it is private for the
-- same reason.
drop policy if exists curriculum_sources_reviewer_read on public.curriculum_sources;
create policy curriculum_sources_reviewer_read
  on public.curriculum_sources for select
  using (public.is_curriculum_reviewer());

drop policy if exists curriculum_tree_read on public.curriculum_tree;
create policy curriculum_tree_read
  on public.curriculum_tree for select
  using (auth.uid() is not null);

drop policy if exists syllabus_topics_verified_read on public.syllabus_topics;
create policy syllabus_topics_verified_read
  on public.syllabus_topics for select
  using (verified_at is not null or public.is_curriculum_reviewer());

drop policy if exists topic_prerequisites_read on public.topic_prerequisites;
create policy topic_prerequisites_read
  on public.topic_prerequisites for select
  using (auth.uid() is not null);

drop policy if exists common_errors_verified_read on public.common_errors;
create policy common_errors_verified_read
  on public.common_errors for select
  using (verified_at is not null or public.is_curriculum_reviewer());

drop policy if exists examiner_notes_verified_read on public.examiner_notes;
create policy examiner_notes_verified_read
  on public.examiner_notes for select
  using (verified_at is not null or public.is_curriculum_reviewer());

-- ── Sanity ─────────────────────────────────────────────────────────────────

do $do$
declare missing text[];
begin
  select array_agg(t) into missing
    from unnest(array[
      'curriculum_sources','curriculum_tree','syllabus_topics',
      'topic_prerequisites','common_errors','examiner_notes'
    ]) t
   where to_regclass('public.' || t) is null;

  if missing is not null then
    raise exception '248: tables missing after migration: %', missing;
  end if;

  raise notice '248: curriculum spine ready (6 tables, cycle guard armed, RLS on)';
end $do$;
