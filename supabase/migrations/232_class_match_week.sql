-- =====================================================================
-- MIGRATION 232: Class Match Week — foundations
-- =====================================================================
--
-- Numbered 232, not 231. Migration 231 (group_promotions per-user coupons)
-- exists on feature/payment-integration and is already applied to the staging
-- database; it is not on this branch's history. Taking 231 here would collide
-- on merge. Gaps in the sequence are normal in this repo; collisions are not.
--
-- WHY A NEW SESSION TABLE RATHER THAN THE EXISTING SCHEDULE TABLES
--
-- The platform splits a class schedule across two tables and neither fits a
-- campaign taster:
--
--   group_sessions              has duration, recurrence and a link column,
--                               but no status and no cancelled_at
--   group_session_occurrences   has status, cancelled_at and a scheduled time,
--                               but no duration and no link
--
-- A campaign session needs duration, a link, AND cancellation on one record. It
-- also happens exactly once — nothing about it recurs — so it is occurrence-
-- shaped. But it does not belong in group_session_occurrences either: those
-- ~1200 rows are the real class schedule, and every reader of that table
-- (calendars, reminders, attendance, the class stream) would start picking up
-- campaign sessions unless each one learned to filter. A separate table is the
-- cheaper side of that trade.
--
-- WHY A CAMPAIGN ENTITY
--
-- The week's start and end dates otherwise have nowhere to live, which makes a
-- second Class Match Week a schema change rather than a row. It also gives
-- teacher opt-in somewhere to be recorded: opt-in is described throughout the
-- build plan as a persisted act, but without this the only teacher-owned row is
-- a per-class session, so a teacher who opts in and creates nothing is invisible
-- to funnel reporting.
--
-- CAPACITY IS NULLABLE HERE, DELIBERATELY
--
-- groups.max_students is integer NOT NULL DEFAULT 20 with CHECK (0 < n <= 500),
-- so "unlimited" is not representable there. Campaign capacity is optional and
-- defaults to unlimited, so it needs a nullable column of its own rather than a
-- sentinel value that every seat check would have to know about.
--
-- NAMING: "JOIN CLICK", NOT "ATTENDANCE"
--
-- What the platform can observe is that someone opened the session link. The
-- table is named for that. If this is read as attendance the campaign's
-- performance will be overstated and the decision to run it again will be made
-- on a number that does not mean what it says. The timestamp is stored so a
-- truthful attendance figure can be derived later by comparing against the
-- session window, without changing the product.
--
-- SUBMISSIONS ARE KEYED ON TOKEN, NOT USER
--
-- The questionnaire completes before an account exists. A UNIQUE(user_id) would
-- throw at the moment of sign-in when a token-keyed row is adopted onto an
-- account that already has one. The unique key is the token; user_id is
-- nullable and filled in on claim.

begin;

-- ---------------------------------------------------------------------
-- Campaign
-- ---------------------------------------------------------------------

create table if not exists public.class_match_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  constraint class_match_campaigns_status_check
    check (status in ('draft', 'live', 'ended')),
  constraint class_match_campaigns_window_check
    check (ends_at > starts_at)
);

comment on table public.class_match_campaigns is
  'One row per Class Match Week run. Holds the countdown window so a second campaign is a row, not a migration.';

-- At most one live campaign: the site-wide banner and the portal both resolve
-- "the campaign" with no further qualification, and two live rows would make
-- that ambiguous at runtime rather than at insert.
create unique index if not exists class_match_campaigns_single_live_idx
  on public.class_match_campaigns (status) where status = 'live';

-- ---------------------------------------------------------------------
-- Teacher participation
-- ---------------------------------------------------------------------

create table if not exists public.class_match_participation (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.class_match_campaigns(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  opted_in_at timestamptz not null default now(),
  gate_snapshot jsonb,
  created_at timestamptz not null default now(),
  unique (campaign_id, tutor_id)
);

comment on column public.class_match_participation.gate_snapshot is
  'The eligibility clauses as evaluated at opt-in. Every clause is mutable — a teacher can be suspended, revoke Meet, unpublish, or change pricing mid-week — so the snapshot records what was true when they joined.';

-- ---------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------

create table if not exists public.class_match_sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.class_match_campaigns(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 30,
  meet_link text,
  max_attendees integer,
  status text not null default 'draft',
  cancelled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  -- Discount configuration. Per session, because a teacher may want a deeper
  -- offer on one taster than another.
  discount_percent integer not null,
  redemption_window_days integer not null default 14,
  price_duration_months integer not null default 3,
  constraint class_match_sessions_status_check
    check (status in ('draft', 'published', 'cancelled')),
  constraint class_match_sessions_duration_check
    check (duration_minutes > 0 and duration_minutes <= 480),
  -- Unlimited is NULL, not 0 or a sentinel.
  constraint class_match_sessions_capacity_check
    check (max_attendees is null or max_attendees > 0),
  -- Fixed tiers keep cards comparable and stop the results page turning into a
  -- price comparison between teachers.
  constraint class_match_sessions_discount_check
    check (discount_percent in (10, 15, 20)),
  constraint class_match_sessions_window_check
    check (redemption_window_days between 7 and 30),
  -- Finite by design. The savings figure is price x discount x months and has
  -- no answer for an unbounded duration, so there is no "forever".
  constraint class_match_sessions_price_duration_check
    check (price_duration_months > 0 and price_duration_months <= 24),
  constraint class_match_sessions_cancelled_check
    check ((status = 'cancelled') = (cancelled_at is not null))
);

comment on column public.class_match_sessions.meet_link is
  'Per-session room. Group classes mint one link per SERIES lazily on first join (lib/services/groupMeetingLink.ts); a taster is one-off, so it carries its own link rather than borrowing the class series link, which is shared across up to 104 occurrences.';
comment on column public.class_match_sessions.max_attendees is
  'NULL = unlimited. Not groups.max_students, which is NOT NULL with CHECK (0 < n <= 500) and cannot express unlimited.';
comment on column public.class_match_sessions.price_duration_months is
  'Months the discounted price holds after enrolment. Distinct from redemption_window_days, which is how long the coupon stays claimable.';

create index if not exists class_match_sessions_campaign_idx
  on public.class_match_sessions (campaign_id, status);
create index if not exists class_match_sessions_group_idx
  on public.class_match_sessions (group_id);
create index if not exists class_match_sessions_tutor_idx
  on public.class_match_sessions (tutor_id);
-- The results page and Explore both query "published sessions in this campaign,
-- soonest first"; the partial index keeps drafts and cancellations out of it.
create index if not exists class_match_sessions_schedule_idx
  on public.class_match_sessions (campaign_id, scheduled_at)
  where status = 'published';

-- ---------------------------------------------------------------------
-- Qualifying classes for a session's discount
-- ---------------------------------------------------------------------
--
-- A join table rather than a uuid[] column: this decides what a coupon can be
-- spent on, so it is worth real referential integrity. The floor — that the
-- session's own class always qualifies — is enforced in the service layer,
-- since SQL cannot see class_match_sessions.group_id from here without a
-- trigger, and a trigger would be the third thing to keep in sync.

create table if not exists public.class_match_qualifying_groups (
  session_id uuid not null references public.class_match_sessions(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  primary key (session_id, group_id)
);

-- ---------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------

create table if not exists public.class_match_reservations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_match_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'reserved',
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint class_match_reservations_status_check
    check (status in ('reserved', 'cancelled', 'requested', 'declined')),
  -- One seat per person per session; the reserve endpoint relies on this rather
  -- than a read-then-write that two taps could race.
  unique (session_id, user_id)
);

create index if not exists class_match_reservations_user_idx
  on public.class_match_reservations (user_id);

-- ---------------------------------------------------------------------
-- Join clicks
-- ---------------------------------------------------------------------

create table if not exists public.class_match_join_clicks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_match_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  unique (session_id, user_id)
);

comment on table public.class_match_join_clicks is
  'A row means the user opened the session link. It does NOT mean they attended. Name it "join clicked" in every report; clicked_at exists so a truthful attendance figure can be derived later against the session window.';

create index if not exists class_match_join_clicks_user_idx
  on public.class_match_join_clicks (user_id);

-- ---------------------------------------------------------------------
-- Questionnaire submissions
-- ---------------------------------------------------------------------

create table if not exists public.class_match_submissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.class_match_campaigns(id) on delete cascade,
  -- The unique key. Present from the first answer, before any account exists.
  token text not null unique,
  -- Filled in when the token-keyed row is claimed at sign-in. Nullable forever
  -- for people who answer and never sign up — the clearest demand signal the
  -- campaign produces, and the reason this table is not keyed on user_id.
  user_id uuid references public.profiles(id) on delete set null,
  role text not null,
  level text,
  subjects text[] not null default '{}',
  availability text[] not null default '{}',
  support_needed text[] not null default '{}',
  teacher_preferences text[] not null default '{}',
  -- What the matcher actually returned. Without this the no-match screen leaves
  -- no trace, and "which subjects should we recruit for" is unanswerable.
  match_outcome text,
  -- Snapshot of what was shown, so the export's "recommended sessions" column
  -- can be reproduced. Recomputing later would not give the same answer once
  -- the catalogue moves.
  recommended_session_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  constraint class_match_submissions_role_check
    check (role in ('parent', 'student')),
  constraint class_match_submissions_outcome_check
    check (match_outcome is null or match_outcome in ('exact', 'fallback', 'none'))
);

comment on column public.class_match_submissions.token is
  'First-party cookie token. The unique key, deliberately: a UNIQUE(user_id) would throw at sign-in when a token row is adopted onto an account that already has a submission.';

create index if not exists class_match_submissions_user_idx
  on public.class_match_submissions (user_id) where user_id is not null;
create index if not exists class_match_submissions_campaign_idx
  on public.class_match_submissions (campaign_id, created_at);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
--
-- Deliberately tight. The anonymous portal does NOT read through these policies
-- — every SELECT policy on groups/group_sessions is already TO authenticated and
-- there is no anon policy anywhere in this database, so an anonymous matcher
-- would silently return zero rows. The portal runs server-side through
-- getServiceClient(), which bypasses RLS. These policies exist for the
-- signed-in surfaces: a learner's own dashboard and a teacher's own sessions.

alter table public.class_match_campaigns enable row level security;
alter table public.class_match_participation enable row level security;
alter table public.class_match_sessions enable row level security;
alter table public.class_match_qualifying_groups enable row level security;
alter table public.class_match_reservations enable row level security;
alter table public.class_match_join_clicks enable row level security;
alter table public.class_match_submissions enable row level security;

drop policy if exists "Read live campaigns" on public.class_match_campaigns;
create policy "Read live campaigns"
  on public.class_match_campaigns for select
  using (status in ('live', 'ended'));

drop policy if exists "Tutors read own participation" on public.class_match_participation;
create policy "Tutors read own participation"
  on public.class_match_participation for all
  using (tutor_id = auth.uid())
  with check (tutor_id = auth.uid());

drop policy if exists "Read published sessions" on public.class_match_sessions;
create policy "Read published sessions"
  on public.class_match_sessions for select
  using (status = 'published');

drop policy if exists "Tutors manage own sessions" on public.class_match_sessions;
create policy "Tutors manage own sessions"
  on public.class_match_sessions for all
  using (tutor_id = auth.uid())
  with check (tutor_id = auth.uid());

drop policy if exists "Read qualifying groups" on public.class_match_qualifying_groups;
create policy "Read qualifying groups"
  on public.class_match_qualifying_groups for select
  using (true);

drop policy if exists "Users manage own reservations" on public.class_match_reservations;
create policy "Users manage own reservations"
  on public.class_match_reservations for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Tutors read reservations on own sessions" on public.class_match_reservations;
create policy "Tutors read reservations on own sessions"
  on public.class_match_reservations for select
  using (exists (
    select 1 from public.class_match_sessions s
    where s.id = class_match_reservations.session_id and s.tutor_id = auth.uid()
  ));

drop policy if exists "Users read own join clicks" on public.class_match_join_clicks;
create policy "Users read own join clicks"
  on public.class_match_join_clicks for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Tutors read join clicks on own sessions" on public.class_match_join_clicks;
create policy "Tutors read join clicks on own sessions"
  on public.class_match_join_clicks for select
  using (exists (
    select 1 from public.class_match_sessions s
    where s.id = class_match_join_clicks.session_id and s.tutor_id = auth.uid()
  ));

-- Submissions carry a child's level and subjects. There is no user-facing read
-- path: the portal reads them server-side by token, and the admin export runs
-- with the service role. A claimed submission is readable by its owner only.
drop policy if exists "Users read own claimed submissions" on public.class_match_submissions;
create policy "Users read own claimed submissions"
  on public.class_match_submissions for select
  using (user_id is not null and user_id = auth.uid());

commit;
