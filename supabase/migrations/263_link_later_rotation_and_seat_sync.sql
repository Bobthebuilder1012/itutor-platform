-- 263_link_later_rotation_and_seat_sync.sql
--
-- Three follow-ups to 262 and 242.
--
-- ── 1. A TUTOR MAY CHOOSE "OWN LINK" AND ADD THE LINK LATER ────────────────
-- The scheduling pop-up now offers "Continue and add link later", so a class
-- can be in 'custom' mode with no link yet. groups_custom_link_required (262)
-- refused exactly that. What a custom class without a link means is already
-- handled everywhere: the tutor's Join answers 422 no_class_link with an "Add
-- class link" prompt, students see "Link not shared yet", and reminder emails
-- fall back to the class page. It never mints a Meet link over the tutor's
-- choice.
--
-- ── 2. groups.meeting_link_set_at ──────────────────────────────────────────
-- When the current custom link was saved. A tutor's own room is usually
-- permanent, so a student who leaves the class keeps a working link; the class
-- page asks the tutor to paste a new one at the end of every month
-- (lib/classes/linkRotation.ts) and needs to know when the last one arrived.
-- Written only by PATCH /api/classes/[id]/settings, so it joins the columns the
-- 262 guard trigger puts back on a browser write. NULL for links saved before
-- this migration — the reminder treats unknown age as due. No backfill.
--
-- ── 3. max_students COUNTS ONLY THE SEATS THE FORMAT OFFERS ────────────────
-- sync_group_max_students (242) summed both seat caps whatever the format. A
-- tutor who typed an in-person cap, then switched the class to "Online only",
-- left that cap in a hidden field; it was saved and summed in, so an online
-- class capped at 12 read 0/24 and every reader of max_students (the class
-- header, the older join paths) took 24. A cap for a seat type the format does
-- not offer now doesn't exist: it is cleared, and the trigger also fires on a
-- format change so switching format recomputes the total. lib/utils/seatCapacity.ts
-- already ignored such a cap for enrolment; this makes the stored total agree.
-- Staging had one affected row (repaired below); production had none.
--
-- Idempotent. No REFERENCES.

-- 1 ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_custom_link_required;

-- 2 ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS meeting_link_set_at timestamptz;

COMMENT ON COLUMN public.groups.meeting_link_set_at IS
  'When the current custom meeting_link was saved. Drives the monthly rotation reminder. NULL = unknown or no custom link.';

CREATE OR REPLACE FUNCTION public.groups_guard_level_year_and_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  privileged boolean := public.is_privileged_request();
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only server code may pre-date a class's level year or arrive with a link.
    IF NOT privileged OR NEW.form_level_school_year IS NULL THEN
      NEW.form_level_school_year := public.trinidad_school_year();
    END IF;
    IF NOT privileged THEN
      NEW.meeting_link := NULL;
      NEW.meeting_link_mode := 'generated';
      NEW.meeting_link_generated_at := NULL;
      NEW.meeting_link_set_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT privileged THEN
    NEW.form_level_school_year := OLD.form_level_school_year;
    NEW.meeting_link := OLD.meeting_link;
    NEW.meeting_link_mode := OLD.meeting_link_mode;
    NEW.meeting_link_generated_at := OLD.meeting_link_generated_at;
    NEW.meeting_link_set_at := OLD.meeting_link_set_at;
  END IF;

  -- A changed level is true as of now. The cron writes both columns in one
  -- statement and its explicit year is kept. The Settings save re-sends an
  -- unchanged level on every save, which the WHEN clause never lets in here.
  IF NEW.form_level IS DISTINCT FROM OLD.form_level
     AND NEW.form_level_school_year IS NOT DISTINCT FROM OLD.form_level_school_year THEN
    NEW.form_level_school_year := public.trinidad_school_year();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_groups_guard_level_year_and_link_upd ON public.groups;
CREATE TRIGGER trg_groups_guard_level_year_and_link_upd
  BEFORE UPDATE OF form_level, form_level_school_year, meeting_link, meeting_link_mode,
    meeting_link_generated_at, meeting_link_set_at
  ON public.groups
  FOR EACH ROW
  WHEN (
    NEW.form_level IS DISTINCT FROM OLD.form_level
    OR NEW.form_level_school_year IS DISTINCT FROM OLD.form_level_school_year
    OR NEW.meeting_link IS DISTINCT FROM OLD.meeting_link
    OR NEW.meeting_link_mode IS DISTINCT FROM OLD.meeting_link_mode
    OR NEW.meeting_link_generated_at IS DISTINCT FROM OLD.meeting_link_generated_at
    OR NEW.meeting_link_set_at IS DISTINCT FROM OLD.meeting_link_set_at
  )
  EXECUTE FUNCTION public.groups_guard_level_year_and_link();

-- 3 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_group_max_students()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- A cap for a seat type this format doesn't offer means nothing, and summed
  -- in it inflated the total. Hybrid keeps both.
  IF NEW.class_format = 'online' THEN
    NEW.max_students_physical := NULL;
  ELSIF NEW.class_format = 'physical' THEN
    NEW.max_students_online := NULL;
  END IF;

  IF NEW.max_students_online IS NOT NULL OR NEW.max_students_physical IS NOT NULL THEN
    NEW.max_students := GREATEST(
      1,
      COALESCE(NEW.max_students_online, 0) + COALESCE(NEW.max_students_physical, 0)
    );
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.sync_group_max_students() IS
  'max_students is the sum of the seat caps the class format offers (a cap for a seat type the format lacks is cleared). GREATEST(1, ...) because groups_max_students_check requires > 0.';

DROP TRIGGER IF EXISTS trg_sync_group_max_students ON public.groups;
CREATE TRIGGER trg_sync_group_max_students
  BEFORE INSERT OR UPDATE OF max_students_online, max_students_physical, class_format
  ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_group_max_students();

-- Repair rows already carrying a cap their format doesn't offer. The no-op
-- assignment fires the trigger above, which clears the stray cap and
-- recomputes max_students. Touches only those rows.
UPDATE public.groups
   SET class_format = class_format
 WHERE (class_format = 'online'   AND max_students_physical IS NOT NULL)
    OR (class_format = 'physical' AND max_students_online   IS NOT NULL);

NOTIFY pgrst, 'reload schema';
