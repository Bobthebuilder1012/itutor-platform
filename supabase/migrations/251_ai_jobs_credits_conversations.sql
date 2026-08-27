-- 251 — Jobs, credits, conversations, mastery.
--
-- Handoff number 220; see 248 for why the series starts at 248.
--
-- This migration is where rules 1 and 2 stop being prose and become schema.
--
-- Rule 1 — no model call inside a request handler — is only enforceable if
-- there is somewhere for the work to wait. `ai_jobs` is that place. A route
-- inserts a QUEUED row and returns; /api/cron/process-ai-jobs picks it up.
--
-- Rule 2 — no lifetime counter — is why `ai_credit_ledger` is append-only and
-- has no balance column of its own. v1 metered on profiles.ai_uses_count, an
-- integer that only ever went up, so nothing could be refunded, nothing could
-- be granted monthly, and nobody could say why a tutor was out of uses. A
-- ledger answers all three. That column is dropped at the end of this file,
-- now that 248's ground-clearing commit has stopped every write to it.
--
-- Add-only except for that one drop, which is called out explicitly below.

-- ── Jobs ───────────────────────────────────────────────────────────────────

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- A marking run fans out to one job per student paper. The parent is the run
  -- the tutor started and watches; the children are what actually execute, and
  -- what the queue screen shows a Retry button against, row by row.
  parent_run_id uuid references public.ai_jobs(id) on delete cascade,

  job_type text not null
    check (job_type in (
      'LESSON_PLAN','QUIZ_GENERATE','STUDY_SHEET','MARK_PAPER',
      'EXTRACT_TOPICS','EXTRACT_SUBJECT_REPORT','CHAT'
    )),

  status text not null default 'QUEUED'
    check (status in ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),

  -- The worker claims a job by moving QUEUED -> RUNNING conditionally, so two
  -- overlapping cron ticks cannot both run the same row. See the claim RPC.
  claimed_at timestamptz,

  -- Same key, same job. A tutor double-tapping Generate must not be charged
  -- twice, and a cron retry after a timeout must not duplicate work.
  idempotency_key text,

  -- Pointers into storage or into a row, never the payload itself. Keeping
  -- megabytes of prompt and output out of Postgres is what lets this table stay
  -- cheap to poll.
  input_ref jsonb not null default '{}'::jsonb,
  output_ref jsonb,

  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_cents numeric(10,3) not null default 0,

  attempts int not null default 0,
  error text,

  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists ai_jobs_idempotency_key_unique
  on public.ai_jobs (user_id, idempotency_key)
  where idempotency_key is not null;

-- The worker's pick query: oldest queued first.
create index if not exists ai_jobs_queue_idx
  on public.ai_jobs (created_at)
  where status = 'QUEUED';
create index if not exists ai_jobs_user_idx
  on public.ai_jobs (user_id, created_at desc);
create index if not exists ai_jobs_parent_idx
  on public.ai_jobs (parent_run_id);
-- Finds jobs that died mid-flight, for the stuck-job sweep.
create index if not exists ai_jobs_running_idx
  on public.ai_jobs (claimed_at)
  where status = 'RUNNING';

-- 250 left generated_questions.job_id untyped because ai_jobs did not exist.
do $do$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'generated_questions_job_fk'
  ) then
    alter table public.generated_questions
      add constraint generated_questions_job_fk
      foreign key (job_id) references public.ai_jobs(id) on delete set null;
  end if;
end $do$;

-- ── Credits ────────────────────────────────────────────────────────────────
--
-- Append-only. Balance is sum(delta), never a stored mutable total.
-- balance_after is written by a trigger for audit and for cheap display; it is
-- a record of what the balance WAS after this row, not a source of truth, and
-- the trigger is the only thing allowed to set it.

create table if not exists public.ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- Negative to spend, positive to grant or refund.
  delta integer not null check (delta <> 0),

  reason text not null
    check (reason in (
      'MONTHLY_GRANT','JOB_SPEND','JOB_REFUND','ADMIN_ADJUSTMENT','PROMOTIONAL_GRANT'
    )),

  job_id uuid references public.ai_jobs(id) on delete set null,
  note text,

  balance_after integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_credit_ledger_user_idx
  on public.ai_credit_ledger (user_id, created_at desc);

-- One refund per job, at most. A retry loop that refunded on every failed
-- attempt would hand out free credit; the constraint makes that impossible
-- rather than relying on the worker to remember.
create unique index if not exists ai_credit_ledger_one_refund_per_job
  on public.ai_credit_ledger (job_id)
  where reason = 'JOB_REFUND';

create unique index if not exists ai_credit_ledger_one_spend_per_job
  on public.ai_credit_ledger (job_id)
  where reason = 'JOB_SPEND';

create or replace function public.ai_credit_ledger_set_balance()
returns trigger
language plpgsql
as $fn$
declare prior integer;
begin
  select coalesce(sum(delta), 0) into prior
    from public.ai_credit_ledger
   where user_id = new.user_id;

  new.balance_after := prior + new.delta;
  return new;
end;
$fn$;

drop trigger if exists trg_ai_credit_ledger_set_balance on public.ai_credit_ledger;
create trigger trg_ai_credit_ledger_set_balance
  before insert on public.ai_credit_ledger
  for each row
  execute function public.ai_credit_ledger_set_balance();

-- Append-only, enforced. An UPDATE or DELETE here is always a bug — a
-- correction is a new compensating row, which is the whole point of a ledger.
create or replace function public.ai_credit_ledger_append_only()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'ai_credit_ledger is append-only: % rejected. Insert a compensating row instead.', tg_op
    using errcode = 'check_violation';
end;
$fn$;

drop trigger if exists trg_ai_credit_ledger_append_only on public.ai_credit_ledger;
create trigger trg_ai_credit_ledger_append_only
  before update or delete on public.ai_credit_ledger
  for each row
  execute function public.ai_credit_ledger_append_only();

create or replace function public.ai_credit_balance(p_user_id uuid)
returns integer
language sql
stable
as $fn$
  select coalesce(sum(delta), 0)::integer
    from public.ai_credit_ledger
   where user_id = p_user_id;
$fn$;

-- ── Entitlements ───────────────────────────────────────────────────────────

create table if not exists public.ai_entitlements (
  id uuid primary key default gen_random_uuid(),
  tier text not null,
  feature text not null,

  monthly_credits int not null default 0 check (monthly_credits >= 0),
  rate_limit_per_hour int not null default 0 check (rate_limit_per_hour >= 0),
  max_pages_per_job int not null default 0 check (max_pages_per_job >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ai_entitlements_tier_feature_unique unique (tier, feature)
);

-- The credit meter in the prototype reads "24 of 40". 40 is this row.
insert into public.ai_entitlements (tier, feature, monthly_credits, rate_limit_per_hour, max_pages_per_job)
select 'FREE', 'ALL', 40, 20, 12
where not exists (
  select 1 from public.ai_entitlements where tier = 'FREE' and feature = 'ALL'
);

-- ── Conversations ──────────────────────────────────────────────────────────

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  task_type text not null default 'GENERAL'
    check (task_type in ('LESSON_PLAN','QUIZ','STUDY_SHEET','MARKING','GENERAL')),

  -- Auto-titled from the first exchange. NOT NULL with a placeholder default
  -- because the history panel groups by title, and a timestamp masquerading as
  -- a title is the failure the handoff calls out by name.
  title text not null default 'New conversation',

  -- What this conversation produced, if anything. Loose by design: the artifact
  -- may be a lesson plan, a quiz, a study sheet or a marking run, and those live
  -- in four different tables.
  artifact_type text
    check (artifact_type is null or artifact_type in ('LESSON_PLAN','QUIZ','STUDY_SHEET','MARKING_RUN')),
  artifact_id uuid,

  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','ARCHIVED')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

-- The history panel's ordering: most recent first, per user, active only.
create index if not exists ai_conversations_user_recent_idx
  on public.ai_conversations (user_id, last_message_at desc);
create index if not exists ai_conversations_task_type_idx
  on public.ai_conversations (user_id, task_type, last_message_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,

  role text not null check (role in ('user','assistant','system')),
  content text not null default '',

  -- What lets a message render as option chips, an inline date picker, an
  -- editable summary card or a full calendar grid instead of as prose. The
  -- renderer is built around this from the first commit; retrofitting rich
  -- message types is the kind of change that rewrites a UI.
  structured_payload jsonb,

  job_id uuid references public.ai_jobs(id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at);

-- Keep the conversation's ordering column honest without the app having to
-- remember to touch it on every insert.
create or replace function public.ai_messages_touch_conversation()
returns trigger
language plpgsql
as $fn$
begin
  update public.ai_conversations
     set last_message_at = new.created_at,
         updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$fn$;

drop trigger if exists trg_ai_messages_touch_conversation on public.ai_messages;
create trigger trg_ai_messages_touch_conversation
  after insert on public.ai_messages
  for each row
  execute function public.ai_messages_touch_conversation();

-- ── Mastery ────────────────────────────────────────────────────────────────
--
-- Written by every marked question and every quiz response. This is the table
-- that makes the continuation prompts specific — "make a study sheet on the
-- weak topic" needs to know which topic was weak.

create table if not exists public.student_topic_mastery (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  topic_id uuid not null references public.syllabus_topics(id) on delete cascade,

  -- 0..1. A rolling estimate, not a percentage of one test.
  mastery_score numeric(4,3) not null default 0
    check (mastery_score >= 0 and mastery_score <= 1),
  -- How much evidence sits behind the score. One question is not mastery, and
  -- the UI needs to be able to say so rather than showing 100% off a single
  -- lucky answer.
  evidence_count int not null default 0 check (evidence_count >= 0),

  last_assessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint student_topic_mastery_unique unique (student_id, topic_id)
);

create index if not exists student_topic_mastery_student_idx
  on public.student_topic_mastery (student_id, mastery_score asc);

-- ── updated_at ─────────────────────────────────────────────────────────────

create or replace function public.ai_touch_updated_at()
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
    'ai_entitlements','ai_conversations','student_topic_mastery'
  ] loop
    execute format('drop trigger if exists trg_%1$s_touch_updated_at on public.%1$I', t, t);
    execute format(
      'create trigger trg_%1$s_touch_updated_at
         before update on public.%1$I
         for each row execute function public.ai_touch_updated_at()', t, t);
  end loop;
end $do$;

-- ── Job claiming ───────────────────────────────────────────────────────────
--
-- The cron runs every minute and Vercel will happily overlap two invocations if
-- one is slow. Claiming has to be atomic or the same job runs twice, bills
-- twice and writes its output twice. The UPDATE ... WHERE status = 'QUEUED'
-- does that in one statement: the row is claimed by whoever wins the write.
--
-- SECURITY INVOKER on purpose. The worker calls this with the service role;
-- nothing else should be able to claim jobs, and RLS on ai_jobs grants no
-- write to anyone.

create or replace function public.ai_claim_next_jobs(p_limit int default 5)
returns setof public.ai_jobs
language sql
volatile
as $fn$
  update public.ai_jobs
     set status = 'RUNNING',
         claimed_at = now(),
         attempts = attempts + 1
   where id in (
     select id from public.ai_jobs
      where status = 'QUEUED'
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning *;
$fn$;

-- ── RLS ────────────────────────────────────────────────────────────────────
--
-- Everything here is per-user and read-only from the browser. Enqueueing a job,
-- spending credit and writing a message all carry rules a policy cannot express
-- (entitlement checks, rate limits, idempotency), so writes go through the
-- service role on the server and no write policy is granted on purpose.

alter table public.ai_jobs enable row level security;
alter table public.ai_credit_ledger enable row level security;
alter table public.ai_entitlements enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.student_topic_mastery enable row level security;

drop policy if exists ai_jobs_own_read on public.ai_jobs;
create policy ai_jobs_own_read
  on public.ai_jobs for select
  using (user_id = auth.uid());

drop policy if exists ai_credit_ledger_own_read on public.ai_credit_ledger;
create policy ai_credit_ledger_own_read
  on public.ai_credit_ledger for select
  using (user_id = auth.uid());

drop policy if exists ai_entitlements_read on public.ai_entitlements;
create policy ai_entitlements_read
  on public.ai_entitlements for select
  using (auth.uid() is not null);

drop policy if exists ai_conversations_own_read on public.ai_conversations;
create policy ai_conversations_own_read
  on public.ai_conversations for select
  using (user_id = auth.uid());

drop policy if exists ai_messages_own_read on public.ai_messages;
create policy ai_messages_own_read
  on public.ai_messages for select
  using (exists (
    select 1 from public.ai_conversations c
     where c.id = ai_messages.conversation_id
       and c.user_id = auth.uid()
  ));

-- A student may see their own mastery. A tutor sees their students' mastery
-- through the server, not by selecting this table directly, because "is my
-- student" is a join across group_members and bookings that changes over time.
drop policy if exists student_topic_mastery_own_read on public.student_topic_mastery;
create policy student_topic_mastery_own_read
  on public.student_topic_mastery for select
  using (student_id = auth.uid());

-- ── Retiring the lifetime counter ──────────────────────────────────────────
--
-- Rule 2. profiles.ai_uses_count was added by 122 and metered v1. The
-- ground-clearing commit deleted app/api/ai/*, which held the only write to it,
-- so nothing has incremented this column since. Dropping it here rather than in
-- that commit keeps the code change and the schema change from being in flight
-- at the same time.

alter table public.profiles drop column if exists ai_uses_count;

-- ── Sanity ─────────────────────────────────────────────────────────────────

do $do$
declare
  missing text[];
  leftover int;
begin
  select array_agg(t) into missing
    from unnest(array[
      'ai_jobs','ai_credit_ledger','ai_entitlements',
      'ai_conversations','ai_messages','student_topic_mastery'
    ]) t
   where to_regclass('public.' || t) is null;

  if missing is not null then
    raise exception '251: tables missing after migration: %', missing;
  end if;

  select count(*) into leftover
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'ai_uses_count';

  if leftover <> 0 then
    raise exception '251: profiles.ai_uses_count still present — the lifetime counter was not dropped';
  end if;

  raise notice '251: jobs/credits/conversations/mastery ready; lifetime counter retired';
end $do$;
