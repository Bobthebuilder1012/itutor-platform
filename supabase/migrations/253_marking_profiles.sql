-- 253 — Marking profiles.
--
-- Handoff number 222; see 248 for why the series starts at 248.
--
-- v1 hardcoded its leniency. There was a rule in the marking prompt about
-- Spanish -zar verbs, written for one tutor, applied to everyone, invisible to
-- everybody and impossible to change without a deploy. This table is the answer
-- to that: what counts as close enough is data, per subject and per paper,
-- editable by the person who has to defend the mark.
--
-- The three jsonb columns are shapes the extraction in 1.4 fills from subject
-- reports, not free-form scratch space:
--
--   section_structure  { sections: [{ name, question_count, marks_each,
--                                     answer_all }] }
--   leniency_rules     { spelling_tolerance, accept_equivalent_forms,
--                        follow_through, unit_omission_penalty, ... }
--   command_word_map   { "Calculate": { requires_working, method_marks }, ... }
--
-- They are jsonb rather than columns because the vocabulary differs per
-- subject — Mathematics has follow-through marks, a language paper has
-- accent tolerance — and modelling every subject's rules as columns would mean
-- a migration per subject.
--
-- Seeded EMPTY of leniency rules on purpose. Populating them requires the CXC
-- subject reports, which nobody has downloaded yet (see 249). A default row
-- exists so the marker has something to run against; its rules are the neutral
-- ones, and the extraction in 1.4 fills the rest.
--
-- Add-only.

create table if not exists public.marking_profiles (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.subjects(id) on delete cascade,

  name text not null,
  paper_number int,

  section_structure jsonb not null default '{}'::jsonb,
  leniency_rules jsonb not null default '{}'::jsonb,
  command_word_map jsonb not null default '{}'::jsonb,

  -- Where the rules came from, so a tutor asking "why was this accepted?" gets
  -- a document and a page rather than a shrug.
  source_id uuid references public.curriculum_sources(id) on delete set null,

  created_by uuid references public.profiles(id) on delete set null,
  is_default boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marking_profiles_subject_idx
  on public.marking_profiles (subject_id, paper_number);

-- One default per subject-and-paper. Two defaults means the marker picks
-- arbitrarily, and the tutor cannot tell which rules produced the mark.
-- Partial and coalesced so the global fallback (subject_id null) is covered by
-- the same constraint.
create unique index if not exists marking_profiles_one_default
  on public.marking_profiles (coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid),
                              coalesce(paper_number, -1))
  where is_default = true;

create or replace function public.marking_profiles_touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_marking_profiles_touch_updated_at on public.marking_profiles;
create trigger trg_marking_profiles_touch_updated_at
  before update on public.marking_profiles
  for each row
  execute function public.marking_profiles_touch_updated_at();

-- ── The neutral default ────────────────────────────────────────────────────
--
-- Deliberately conservative. Where the profile does not know a rule, the marker
-- should hand the question to the tutor rather than guess — an AI mark a tutor
-- has to undo is worse than an AI mark that was never offered.

insert into public.marking_profiles
  (subject_id, name, paper_number, leniency_rules, command_word_map, is_default)
select
  null,
  'Neutral default',
  null,
  jsonb_build_object(
    'spelling_tolerance', 'ignore_minor',
    'accept_equivalent_forms', true,
    'follow_through', true,
    'unit_omission_penalty', 0,
    'escalate_when_uncertain', true
  ),
  jsonb_build_object(
    'Calculate', jsonb_build_object('requires_working', true,  'method_marks', true),
    'Determine', jsonb_build_object('requires_working', true,  'method_marks', true),
    'Show that', jsonb_build_object('requires_working', true,  'method_marks', true),
    'State',     jsonb_build_object('requires_working', false, 'method_marks', false),
    'Explain',   jsonb_build_object('requires_working', false, 'method_marks', false)
  ),
  true
where not exists (
  select 1 from public.marking_profiles
   where subject_id is null and paper_number is null and is_default = true
);

-- ── RLS ────────────────────────────────────────────────────────────────────
--
-- Readable by any signed-in tutor — a profile is not sensitive, and the marker
-- UI shows which one produced a mark. Writes are server-side.

alter table public.marking_profiles enable row level security;

drop policy if exists marking_profiles_read on public.marking_profiles;
create policy marking_profiles_read
  on public.marking_profiles for select
  using (auth.uid() is not null);

-- ── Sanity ─────────────────────────────────────────────────────────────────

do $do$
declare defaults int;
begin
  if to_regclass('public.marking_profiles') is null then
    raise exception '253: marking_profiles missing after migration';
  end if;

  select count(*) into defaults
    from public.marking_profiles where is_default = true;

  if defaults < 1 then
    raise exception '253: no default marking profile — the marker would have no rules to run against';
  end if;

  raise notice '253: marking profiles ready (% default(s); leniency rules await the CXC subject reports)', defaults;
end $do$;
