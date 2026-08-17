-- =====================================================================
-- MIGRATION 234: the questionnaire is one-time
-- =====================================================================
--
-- A completed submission is final. Once the last question is answered the
-- row is closed: it is never edited again, and its owner is routed to their
-- tutor matches rather than back into the form.
--
-- Why a column rather than inferring completion from the answers being
-- present: "has a level, subjects and availability" is a statement about
-- data, and partial saves happen after every step, so a row can satisfy it
-- mid-flow. `completed_at` is a statement about the visitor having finished,
-- which is the thing the one-time rule actually turns on. It also survives
-- the matching rules changing — match_outcome is derived and could be
-- recomputed, whereas this records an event.

-- The match vocabulary changes with it. Subject is now the ONLY hard filter,
-- so a supported subject always yields teachers and there is no "fallback"
-- tier to record: either we matched, or nobody teaches that subject. Existing
-- rows are migrated — 'none' meant the same thing the new vocabulary calls
-- 'subject_unsupported' only by coincidence (it could also mean the level or
-- the hour excluded everyone), so historical rows are mapped conservatively
-- and the distinction is noted rather than pretended away.

begin;

alter table public.class_match_submissions
  add column if not exists completed_at timestamptz;

comment on column public.class_match_submissions.completed_at is
  'Set when the final questionnaire step is answered. The questionnaire is one-time: a row with completed_at set is never editable and its owner is routed to their matches instead of the form.';

-- Order matters: the old CHECK still forbids the new vocabulary, so it comes
-- off BEFORE the rows are rewritten. Updating first fails on the constraint
-- being replaced.
alter table public.class_match_submissions
  drop constraint if exists class_match_submissions_outcome_check;

update public.class_match_submissions
   set match_outcome = case
         when match_outcome in ('exact', 'fallback') then 'matched'
         when match_outcome = 'none' then 'subject_unsupported'
         else match_outcome
       end
 where match_outcome is not null;

alter table public.class_match_submissions
  add constraint class_match_submissions_outcome_check
  check (match_outcome is null or match_outcome in ('matched', 'subject_unsupported'));

commit;
