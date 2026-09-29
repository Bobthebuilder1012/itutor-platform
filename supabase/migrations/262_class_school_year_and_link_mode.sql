-- 262_class_school_year_and_link_mode.sql
--
-- Two additions to groups, both read by the scheduling rework:
--
--   form_level_school_year  the school year in which groups.form_level was
--                           last true. /api/cron/progress-class-levels moves
--                           FORM_1..FORM_4 up one level per 1 July crossed.
--   meeting_link_mode       'generated' = the Google Meet / Zoom link minted on
--                           demand by /api/groups/[id]/meeting-link (the only
--                           behaviour until now); 'custom' = the tutor's own
--                           link, typed into the scheduling pop-up.
--
-- Additive only. The app tolerates both columns being absent: the link reads
-- fall back to 'generated', and the cron answers skipped:'schema_missing'.
--
-- ── SCHOOL YEAR ─────────────────────────────────────────────────────────────
-- School year Y runs 1 Jul Y – 30 Jun Y+1 on Trinidad wall-clock time
-- (groups.timezone reads 'UTC' on every row and is never trusted). Subtracting
-- six months maps Jul–Dec Y and Jan–Jun Y+1 onto calendar year Y. Month
-- arithmetic clamps only the day (31 Dec − 6 mon = 30 Jun), never the month,
-- so the answer depends on the month alone. Mirrors schoolYearOf() in
-- lib/classes/academicCalendar.ts.
--
-- Existing rows take the CURRENT school year: their levels are taken as true
-- today, so the first move-up is 1 July 2027. That comes from the ADD COLUMN
-- default, not an UPDATE — a non-volatile default is evaluated once and stored
-- as the column's missing value, so no row is rewritten and groups.updated_at
-- (which feeds the Customer.io watermark on prod) is not bumped for every class.
--
-- ── WHY A TRIGGER GUARDS THE LINK COLUMNS ──────────────────────────────────
-- groups_update lets a tutor update ANY column of their own class straight
-- through PostgREST. The link a tutor types becomes an <a href> in front of
-- every student and in reminder emails, so it may only be written by our API
-- routes, which normalise it (normalizeClassLinkUrl). A browser write of the
-- link columns or the school year is put back rather than refused, so a stale
-- round-trip never fails an unrelated save. The only browser write to groups
-- today is the archive on app/classes/manage/page.tsx, which touches neither.
--
-- The CHECKs are the backstop behind that: https only, no characters that can
-- break out of an attribute, and a custom class always has a link.

CREATE OR REPLACE FUNCTION public.trinidad_school_year(at_ts timestamptz DEFAULT now())
RETURNS smallint
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT extract(year FROM ((at_ts AT TIME ZONE 'America/Port_of_Spain') - interval '6 months'))::smallint
$$;

COMMENT ON FUNCTION public.trinidad_school_year(timestamptz) IS
  'School year (1 Jul Y – 30 Jun Y+1, America/Port_of_Spain) containing the instant, returned as Y.';

-- The column default below runs as whichever role inserts the row.
GRANT EXECUTE ON FUNCTION public.trinidad_school_year(timestamptz) TO anon, authenticated, service_role;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS form_level_school_year smallint NOT NULL
    DEFAULT public.trinidad_school_year();

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS meeting_link_mode text NOT NULL DEFAULT 'generated';

COMMENT ON COLUMN public.groups.form_level_school_year IS
  'School year in which form_level was last true. Re-stamped when form_level changes; advanced by /api/cron/progress-class-levels.';
COMMENT ON COLUMN public.groups.meeting_link_mode IS
  'generated = Meet/Zoom link made on demand; custom = tutor-supplied URL in meeting_link (meeting_link_generated_at NULL).';

DO $$ BEGIN
  ALTER TABLE public.groups
    ADD CONSTRAINT groups_meeting_link_mode_check
    CHECK (meeting_link_mode IN ('generated', 'custom'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Same character set as CLASS_LINK_SAFE_RE in lib/utils/meetingLink.ts.
DO $$ BEGIN
  ALTER TABLE public.groups
    ADD CONSTRAINT groups_meeting_link_safe
    CHECK (
      meeting_link IS NULL
      OR (
        length(meeting_link) <= 2048
        AND meeting_link ~ '^https://[^[:space:]"''<>`\\{}]+$'
      )
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.groups VALIDATE CONSTRAINT groups_meeting_link_safe;

DO $$ BEGIN
  ALTER TABLE public.groups
    ADD CONSTRAINT groups_custom_link_required
    CHECK (meeting_link_mode <> 'custom' OR meeting_link IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
    END IF;
    RETURN NEW;
  END IF;

  IF NOT privileged THEN
    NEW.form_level_school_year := OLD.form_level_school_year;
    NEW.meeting_link := OLD.meeting_link;
    NEW.meeting_link_mode := OLD.meeting_link_mode;
    NEW.meeting_link_generated_at := OLD.meeting_link_generated_at;
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

DROP TRIGGER IF EXISTS trg_groups_guard_level_year_and_link_ins ON public.groups;
CREATE TRIGGER trg_groups_guard_level_year_and_link_ins
  BEFORE INSERT ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.groups_guard_level_year_and_link();

DROP TRIGGER IF EXISTS trg_groups_guard_level_year_and_link_upd ON public.groups;
CREATE TRIGGER trg_groups_guard_level_year_and_link_upd
  BEFORE UPDATE OF form_level, form_level_school_year, meeting_link, meeting_link_mode, meeting_link_generated_at
  ON public.groups
  FOR EACH ROW
  WHEN (
    NEW.form_level IS DISTINCT FROM OLD.form_level
    OR NEW.form_level_school_year IS DISTINCT FROM OLD.form_level_school_year
    OR NEW.meeting_link IS DISTINCT FROM OLD.meeting_link
    OR NEW.meeting_link_mode IS DISTINCT FROM OLD.meeting_link_mode
    OR NEW.meeting_link_generated_at IS DISTINCT FROM OLD.meeting_link_generated_at
  )
  EXECUTE FUNCTION public.groups_guard_level_year_and_link();

NOTIFY pgrst, 'reload schema';
