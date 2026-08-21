-- ============================================================
-- MIGRATION 241: Venues, class format, seat types and per-seat pricing
-- Physical Classes & Cash Payments — release phase A
-- ============================================================
--
-- NUMBERED 241, NOT 217. The spec was written when the tree was at 216 and
-- claimed 217-220. Those are long gone: 217 is profiles_privileged_column_guard,
-- 218 attendance_read_only, 219 parent_approval_booking_requests, 220
-- attendance_derivation. 238-240 belong to the Finder (attribution, product-event
-- dedupe, finder schema). A migration written to a taken number is never applied
-- and never errors, which is the quietest way to lose a release.
--
-- TWO SPEC CLAIMS CORRECTED AGAINST THE LIVE SCHEMA (staging, read 2026-08-21):
--
--   * groups_max_students_check is CHECK (max_students > 0). It is NOT
--     CHECK (0 < n <= 500), as both the spec and the Class Match Week docs
--     state. There is no upper bound to work around.
--   * groups.max_students is integer NOT NULL DEFAULT 20, so it cannot simply
--     "become derived" by dropping it. It stays NOT NULL and is kept in step by
--     a trigger, rather than being maintained by every caller that writes a seat
--     cap.
--
-- WHY REGIONS ARE A TABLE AND NOT FREE TEXT
--
-- The student-side location filter is the entire point of storing a venue, and
-- four spellings of one town are four filter values — a failure nobody reports,
-- because the results still look plausible. region_id is therefore REQUIRED on
-- every venue from the start: venues do not exist yet, so it costs nothing now
-- and becomes a backfill the moment phase A ships without it.
--
-- ASCII HYPHENS, DELIBERATELY. The spec renders some names with EN DASH
-- (San Juan–Laventille, Penal–Debe, Mayaro–Rio Claro). lib/matching/levels.ts
-- records what that has already cost once: groups.form_level carries
-- 'CSEC (14–16)' with U+2013, and every rule written with an ASCII hyphen
-- matched zero rows. These are seeded ASCII so no caller has to know.
--
-- LOCATION VISIBILITY GATES THE STREET ADDRESS ONLY. The region is always
-- public. A filter nobody can see does not work, and "a class in Chaguanas"
-- reveals nothing a parent should not know before enrolling.
-- ============================================================

BEGIN;

-- ---------- regions -----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.regions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text    NOT NULL DEFAULT 'TT',
  name         text    NOT NULL,
  sort_order   integer NOT NULL DEFAULT 0,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, name)
);

COMMENT ON TABLE public.regions IS
  'Filterable areas, country-scoped so another market is data rather than schema. Seeded with the Trinidad and Tobago regional corporations.';

INSERT INTO public.regions (country_code, name, sort_order) VALUES
  ('TT', 'Port of Spain',           10),
  ('TT', 'San Fernando',            20),
  ('TT', 'Arima',                   30),
  ('TT', 'Chaguanas',               40),
  ('TT', 'Point Fortin',            50),
  ('TT', 'Diego Martin',            60),
  ('TT', 'San Juan-Laventille',     70),
  ('TT', 'Tunapuna-Piarco',         80),
  ('TT', 'Couva-Tabaquite-Talparo', 90),
  ('TT', 'Sangre Grande',          100),
  ('TT', 'Princes Town',           110),
  ('TT', 'Penal-Debe',             120),
  ('TT', 'Siparia',                130),
  ('TT', 'Mayaro-Rio Claro',       140),
  ('TT', 'Tobago',                 150)
ON CONFLICT (country_code, name) DO NOTHING;

-- ---------- venues ------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.venues (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name                text NOT NULL,
  region_id           uuid NOT NULL REFERENCES public.regions(id),
  address_line        text,
  latitude            numeric(9,6),
  longitude           numeric(9,6),
  access_instructions text,
  arrival_notes       text,
  capacity            integer,
  archived_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venues_capacity_check CHECK (capacity IS NULL OR capacity > 0)
);

CREATE INDEX IF NOT EXISTS idx_venues_region ON public.venues (region_id);
CREATE INDEX IF NOT EXISTS idx_venues_tutor  ON public.venues (tutor_id) WHERE archived_at IS NULL;

COMMENT ON COLUMN public.venues.capacity IS
  'Room capacity, for the tutor''s own reference. NOT the seat cap that blocks enrolment — that is groups.max_students_physical, because one venue can host several classes.';

-- ---------- groups: format, venue, seats, pricing, cash ----------------

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS class_format          text NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS venue_id              uuid REFERENCES public.venues(id),
  ADD COLUMN IF NOT EXISTS venue_visibility      text NOT NULL DEFAULT 'after_enrolment',
  ADD COLUMN IF NOT EXISTS max_students_online   integer,
  ADD COLUMN IF NOT EXISTS max_students_physical integer,
  ADD COLUMN IF NOT EXISTS price_online_ttd      numeric(12,2),
  ADD COLUMN IF NOT EXISTS price_physical_ttd    numeric(12,2),
  ADD COLUMN IF NOT EXISTS accepts_cash          boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.groups.class_format IS
  'online | physical | hybrid. Decides whether a venue and physical seats apply, and whether cash may be offered at all.';
COMMENT ON COLUMN public.groups.venue_visibility IS
  'Gates the STREET ADDRESS only. The region is always public, or the location filter cannot work.';
COMMENT ON COLUMN public.groups.accepts_cash IS
  'Cash is unavailable on online-only classes: there is no moment to hand money over.';

-- Backfill BEFORE the checks land, so every existing row already satisfies
-- them. Every current class is online — IN_PERSON_REMOVAL_SUMMARY.md stripped
-- in-person out — so this is the honest starting state, not a guess.
UPDATE public.groups
   SET max_students_online = COALESCE(max_students_online, max_students),
       price_online_ttd    = COALESCE(price_online_ttd, price_monthly)
 WHERE class_format = 'online';

-- NOT VALID: these tables hold live rows and the backfill above already
-- satisfies every predicate. Validate separately once phase A is proven, so a
-- long ACCESS EXCLUSIVE scan is not part of the deploy.
ALTER TABLE public.groups
  ADD CONSTRAINT groups_class_format_check
  CHECK (class_format IN ('online','physical','hybrid')) NOT VALID;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_venue_visibility_check
  CHECK (venue_visibility IN ('public','after_enrolment')) NOT VALID;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_venue_required_when_physical_check
  CHECK (class_format = 'online' OR venue_id IS NOT NULL) NOT VALID;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_cash_requires_physical_check
  CHECK (accepts_cash = false OR class_format <> 'online') NOT VALID;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_seat_caps_nonneg_check
  CHECK ((max_students_online   IS NULL OR max_students_online   >= 0)
     AND (max_students_physical IS NULL OR max_students_physical >= 0)) NOT VALID;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_seat_prices_nonneg_check
  CHECK ((price_online_ttd   IS NULL OR price_online_ttd   >= 0)
     AND (price_physical_ttd IS NULL OR price_physical_ttd >= 0)) NOT VALID;

-- ---------- group_enrollments: what the student bought -----------------

ALTER TABLE public.group_enrollments
  ADD COLUMN IF NOT EXISTS seat_type text NOT NULL DEFAULT 'online';

ALTER TABLE public.group_enrollments
  ADD CONSTRAINT group_enrollments_seat_type_check
  CHECK (seat_type IN ('online','physical')) NOT VALID;

COMMENT ON COLUMN public.group_enrollments.seat_type IS
  'What the student BOUGHT: it carries a price and is fixed until a period boundary. Distinct from what they DID, which is attendance mode and is derived per occurrence. The two need not agree — a physical-seat student may join online any week.';

-- ---------- occurrence-level venue override ----------------------------

ALTER TABLE public.group_session_occurrences
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id);

COMMENT ON COLUMN public.group_session_occurrences.venue_id IS
  'Per-session override for a one-off relocation. NULL means use the class venue.';

-- ---------- keep max_students in step with the seat caps ---------------
--
-- The spec requires max_students to be derived and never maintained
-- independently. It is NOT NULL DEFAULT 20 and is read all over the codebase,
-- so it cannot be dropped. This trigger recomputes it whenever either seat cap
-- is written. While both caps are NULL — an untouched online class — the column
-- is left exactly as it was, so nothing reading it today changes behaviour.

CREATE OR REPLACE FUNCTION public.sync_group_max_students()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
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
  'max_students is the sum of the two seat caps. GREATEST(1, ...) because groups_max_students_check requires > 0, and a class with both caps at zero would otherwise be unsaveable.';

DROP TRIGGER IF EXISTS trg_sync_group_max_students ON public.groups;
CREATE TRIGGER trg_sync_group_max_students
  BEFORE INSERT OR UPDATE OF max_students_online, max_students_physical
  ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_group_max_students();

-- ---------- RLS --------------------------------------------------------

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Regions readable by authenticated" ON public.regions;
CREATE POLICY "Regions readable by authenticated"
  ON public.regions FOR SELECT TO authenticated USING (active);

DROP POLICY IF EXISTS "Regions writable by admin" ON public.regions;
CREATE POLICY "Regions writable by admin"
  ON public.regions FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- A venue row carries a street address, so it is deliberately NOT
-- world-readable — unlike public.profiles, which is. Learners receive the
-- address through a server route that applies groups.venue_visibility; the
-- region reaches them on the class payload.
DROP POLICY IF EXISTS "Tutors manage their own venues" ON public.venues;
CREATE POLICY "Tutors manage their own venues"
  ON public.venues FOR ALL TO authenticated
  USING      (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_groups_venue  ON public.groups (venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_groups_format ON public.groups (class_format);

COMMIT;

NOTIFY pgrst, 'reload schema';
