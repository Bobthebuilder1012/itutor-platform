-- ============================================================
-- MIGRATION 207: PREORDERS ON BY DEFAULT
-- iTutor Database
-- ============================================================
--
-- secure_spot_enabled was introduced opt-in (default false), which meant a
-- tutor had to find a switch before a student could reserve a place. In
-- practice a class whose first lesson is five weeks away should simply offer
-- it: "Chemistry crash course", first session 11 September, sat showing
-- "Join class" purely because nobody had toggled anything.
--
-- The flag becomes an opt-OUT. It still gates the student CTA, so a tutor who
-- doesn't want reservations can switch it off and existing secured spots are
-- unaffected — the flag is only read when a NEW seat is claimed.
--
-- Turning it on by default is safe because the flag is not what makes a class
-- preorderable. Eligibility still requires a confirmed schedule whose FIRST
-- lesson is on a later day than today, and spare capacity. An already-running
-- class stays ineligible no matter what this column says.
--
-- Existing rows are backfilled: every current `false` is the old default
-- rather than a tutor's decision, since the feature has never shipped.
-- ============================================================

BEGIN;

ALTER TABLE public.groups
  ALTER COLUMN secure_spot_enabled SET DEFAULT true;

UPDATE public.groups
SET secure_spot_enabled = true
WHERE secure_spot_enabled IS DISTINCT FROM true;

COMMENT ON COLUMN public.groups.secure_spot_enabled IS
  'Whether students may reserve a place before the class starts. ON by default; a tutor can opt out. Not sufficient on its own — the class must also have a confirmed schedule with its first lesson still ahead, and spare capacity.';

COMMIT;
