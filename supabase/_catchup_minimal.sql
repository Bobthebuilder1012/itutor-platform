-- =====================================================================
-- MINIMAL PRODUCTION CATCH-UP
-- Adds only the columns/tables that are actually missing in production,
-- based on the diagnostic run on 2026-05-08. Idempotent + safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. profiles: missing columns
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio                       text,
  ADD COLUMN IF NOT EXISTS institution_id            uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profile_banner_url        text,
  ADD COLUMN IF NOT EXISTS is_reviewer               boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tutor_verification_status text DEFAULT 'UNVERIFIED'
    CHECK (tutor_verification_status IN ('UNVERIFIED','PENDING','PROCESSING','VERIFIED','REJECTED')),
  ADD COLUMN IF NOT EXISTS tutor_verified_at         timestamptz,
  ADD COLUMN IF NOT EXISTS allow_same_day_bookings   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_suspended              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspension_reason         text,
  ADD COLUMN IF NOT EXISTS suspended_at              timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by              uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS suspension_lifted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_lifted_by      uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_profiles_institution_id ON public.profiles(institution_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_suspended   ON public.profiles(is_suspended) WHERE is_suspended = true;
CREATE INDEX IF NOT EXISTS idx_profiles_suspended_at   ON public.profiles(suspended_at) WHERE suspended_at IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. subjects: label column + relax constraints + CSEC/CAPE seed (006) + SEA seed (095)
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_curriculum_check;
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_curriculum_check
  CHECK (curriculum IN ('CSEC', 'CAPE', 'SEA'));

ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_level_check;

ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS label text;

-- Ensure unique constraint exists so seeds can dedupe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_subject_curriculum_level'
      AND conrelid = 'public.subjects'::regclass
  ) THEN
    BEGIN
      ALTER TABLE public.subjects
        ADD CONSTRAINT unique_subject_curriculum_level UNIQUE (name, curriculum, level);
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'subjects has duplicates on (name, curriculum, level); skipping unique constraint';
    END;
  END IF;
END $$;

-- CSEC subjects (migration 006) - using WHERE NOT EXISTS so it works even without unique constraint
INSERT INTO public.subjects (name, curriculum, level, code, label)
SELECT v.name, v.curriculum, v.level, v.code, v.name || ' (' || v.curriculum || ', ' || v.level || ')'
FROM (VALUES
  ('Mathematics', 'CSEC', 'Form 4-5', 'MATH'),
  ('English A', 'CSEC', 'Form 4-5', 'ENGA'),
  ('English B', 'CSEC', 'Form 4-5', 'ENGB'),
  ('Integrated Science', 'CSEC', 'Form 4-5', 'ISCI'),
  ('Physics', 'CSEC', 'Form 4-5', 'PHYS'),
  ('Chemistry', 'CSEC', 'Form 4-5', 'CHEM'),
  ('Biology', 'CSEC', 'Form 4-5', 'BIOL'),
  ('Spanish', 'CSEC', 'Form 4-5', 'SPAN'),
  ('French', 'CSEC', 'Form 4-5', 'FREN'),
  ('Information Technology', 'CSEC', 'Form 4-5', 'IT'),
  ('Additional Mathematics', 'CSEC', 'Form 4-5', 'ADDMATH'),
  ('Social Studies', 'CSEC', 'Form 4-5', 'SOCSTD'),
  ('Geography', 'CSEC', 'Form 4-5', 'GEOG'),
  ('History', 'CSEC', 'Form 4-5', 'HIST'),
  ('Economics', 'CSEC', 'Form 4-5', 'ECON'),
  ('Principles of Accounts', 'CSEC', 'Form 4-5', 'POA'),
  ('Principles of Business', 'CSEC', 'Form 4-5', 'POB'),
  ('Technical Drawing', 'CSEC', 'Form 4-5', 'TD'),
  ('Visual Arts', 'CSEC', 'Form 4-5', 'VARTS'),
  ('Music', 'CSEC', 'Form 4-5', 'MUSIC'),
  ('Physical Education & Sport', 'CSEC', 'Form 4-5', 'PE'),
  ('Food & Nutrition', 'CSEC', 'Form 4-5', 'FOODNUT'),
  ('Agricultural Science', 'CSEC', 'Form 4-5', 'AGRISCI'),
  ('Human & Social Biology', 'CSEC', 'Form 4-5', 'HSB')
) AS v(name, curriculum, level, code)
WHERE NOT EXISTS (
  SELECT 1 FROM public.subjects s
  WHERE s.name = v.name AND s.curriculum = v.curriculum
);

-- CAPE subjects (migration 006)
INSERT INTO public.subjects (name, curriculum, level, code, label)
SELECT v.name, v.curriculum, v.level, v.code, v.name || ' (' || v.curriculum || ', ' || v.level || ')'
FROM (VALUES
  ('Pure Mathematics Unit 1', 'CAPE', 'Unit 1', 'PMATH1'),
  ('Pure Mathematics Unit 2', 'CAPE', 'Unit 2', 'PMATH2'),
  ('Applied Mathematics Unit 1', 'CAPE', 'Unit 1', 'AMATH1'),
  ('Applied Mathematics Unit 2', 'CAPE', 'Unit 2', 'AMATH2'),
  ('Physics Unit 1', 'CAPE', 'Unit 1', 'PHYS1'),
  ('Physics Unit 2', 'CAPE', 'Unit 2', 'PHYS2'),
  ('Chemistry Unit 1', 'CAPE', 'Unit 1', 'CHEM1'),
  ('Chemistry Unit 2', 'CAPE', 'Unit 2', 'CHEM2'),
  ('Biology Unit 1', 'CAPE', 'Unit 1', 'BIOL1'),
  ('Biology Unit 2', 'CAPE', 'Unit 2', 'BIOL2'),
  ('Economics Unit 1', 'CAPE', 'Unit 1', 'ECON1'),
  ('Economics Unit 2', 'CAPE', 'Unit 2', 'ECON2'),
  ('Accounting Unit 1', 'CAPE', 'Unit 1', 'ACCT1'),
  ('Accounting Unit 2', 'CAPE', 'Unit 2', 'ACCT2'),
  ('Management of Business Unit 1', 'CAPE', 'Unit 1', 'MOB1'),
  ('Management of Business Unit 2', 'CAPE', 'Unit 2', 'MOB2'),
  ('Geography Unit 1', 'CAPE', 'Unit 1', 'GEOG1'),
  ('Geography Unit 2', 'CAPE', 'Unit 2', 'GEOG2'),
  ('History Unit 1', 'CAPE', 'Unit 1', 'HIST1'),
  ('History Unit 2', 'CAPE', 'Unit 2', 'HIST2'),
  ('Sociology Unit 1', 'CAPE', 'Unit 1', 'SOC1'),
  ('Sociology Unit 2', 'CAPE', 'Unit 2', 'SOC2'),
  ('Law Unit 1', 'CAPE', 'Unit 1', 'LAW1'),
  ('Law Unit 2', 'CAPE', 'Unit 2', 'LAW2'),
  ('Literatures in English Unit 1', 'CAPE', 'Unit 1', 'LIT1'),
  ('Literatures in English Unit 2', 'CAPE', 'Unit 2', 'LIT2'),
  ('Spanish Unit 1', 'CAPE', 'Unit 1', 'SPAN1'),
  ('Spanish Unit 2', 'CAPE', 'Unit 2', 'SPAN2'),
  ('French Unit 1', 'CAPE', 'Unit 1', 'FREN1'),
  ('French Unit 2', 'CAPE', 'Unit 2', 'FREN2'),
  ('Computer Science Unit 1', 'CAPE', 'Unit 1', 'CS1'),
  ('Computer Science Unit 2', 'CAPE', 'Unit 2', 'CS2'),
  ('Communication Studies Unit 1', 'CAPE', 'Unit 1', 'COMM1'),
  ('Communication Studies Unit 2', 'CAPE', 'Unit 2', 'COMM2'),
  ('Environmental Science Unit 1', 'CAPE', 'Unit 1', 'ENVSCI1'),
  ('Environmental Science Unit 2', 'CAPE', 'Unit 2', 'ENVSCI2')
) AS v(name, curriculum, level, code)
WHERE NOT EXISTS (
  SELECT 1 FROM public.subjects s
  WHERE s.name = v.name AND s.curriculum = v.curriculum
);

-- SEA subjects (migration 095)
INSERT INTO public.subjects (name, label, curriculum, level, code)
SELECT v.name, v.label, v.curriculum, v.level, v.code
FROM (
  VALUES
    ('SEA Mathematics'::text, 'SEA Maths'::text, 'SEA'::text, 'SEA'::text, NULL::text),
    ('SEA English', 'SEA English', 'SEA', 'SEA', NULL),
    ('SEA Creative Writing', 'SEA Creative Writing', 'SEA', 'SEA', NULL)
) AS v(name, label, curriculum, level, code)
WHERE NOT EXISTS (
  SELECT 1 FROM public.subjects s
  WHERE s.name = v.name AND s.curriculum = v.curriculum
);

-- Backfill label for any rows without one (so subject search finds them)
-- Display format e.g. "Mathematics (CSEC, Form 4-5)" or "Pure Mathematics Unit 1 (CAPE, Unit 1)"
UPDATE public.subjects
SET label = name || ' (' || curriculum || ', ' || level || ')'
WHERE label IS NULL;

-- ---------------------------------------------------------------------
-- 3. Other tables: missing columns
-- ---------------------------------------------------------------------
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS is_test_data         boolean DEFAULT false;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancellation_reason  text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS is_test_data         boolean DEFAULT false;
ALTER TABLE public.ratings  ADD COLUMN IF NOT EXISTS is_test_data         boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bookings_test_data ON public.bookings(is_test_data) WHERE is_test_data = true;
CREATE INDEX IF NOT EXISTS idx_sessions_test_data ON public.sessions(is_test_data) WHERE is_test_data = true;
CREATE INDEX IF NOT EXISTS idx_ratings_test_data  ON public.ratings(is_test_data)  WHERE is_test_data = true;

ALTER TABLE public.stream_posts
  ADD COLUMN IF NOT EXISTS pinned_at      timestamptz,
  ADD COLUMN IF NOT EXISTS pin_expires_at timestamptz;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS archived_reason text;

ALTER TABLE public.group_session_occurrences
  ADD COLUMN IF NOT EXISTS title text;

-- ---------------------------------------------------------------------
-- 4. Missing tables
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_rsvps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid NOT NULL REFERENCES public.group_session_occurrences(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status        text NOT NULL CHECK (status IN ('attending', 'not_attending')),
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_session_rsvp_occurrence_student UNIQUE (occurrence_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_session_rsvps_occurrence ON public.session_rsvps(occurrence_id);
CREATE INDEX IF NOT EXISTS idx_session_rsvps_student    ON public.session_rsvps(student_id);
ALTER TABLE public.session_rsvps ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.group_visits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visited_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_group_visits_group_user ON public.group_visits(group_id, user_id);
ALTER TABLE public.group_visits ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 5. lesson_offers: fix FK constraint names + add missing column
-- Production was created from old migration with tutor_user_id/student_user_id;
-- columns were later renamed to tutor_id/student_id but the FK names weren't.
-- PostgREST embed `student:profiles!lesson_offers_student_id_fkey(...)` fails.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema='public'
      AND tc.table_name='lesson_offers'
      AND tc.constraint_type='FOREIGN KEY'
      AND kcu.column_name IN ('tutor_id','student_id','tutor_user_id','student_user_id','subject_id')
  LOOP
    EXECUTE format('ALTER TABLE public.lesson_offers DROP CONSTRAINT %I', con.constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.lesson_offers
  ADD CONSTRAINT lesson_offers_tutor_id_fkey   FOREIGN KEY (tutor_id)   REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT lesson_offers_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT lesson_offers_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE RESTRICT;

ALTER TABLE public.lesson_offers
  ADD COLUMN IF NOT EXISTS last_action_by text CHECK (last_action_by IN ('tutor','student'));

-- ---------------------------------------------------------------------
-- 6. sessions: migrate old (migration 001) schema to new (migration 018) schema
-- Safe in-place ALTER because sessions has 0 rows on production.
-- ---------------------------------------------------------------------
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_status_check;

ALTER TABLE public.sessions
  DROP COLUMN IF EXISTS subject_id,
  DROP COLUMN IF EXISTS payer_id,
  DROP COLUMN IF EXISTS payment_status,
  DROP COLUMN IF EXISTS price_per_hour_ttd,
  DROP COLUMN IF EXISTS amount_ttd;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='sessions' AND column_name='scheduled_start') THEN
    ALTER TABLE public.sessions RENAME COLUMN scheduled_start TO scheduled_start_at;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='sessions' AND column_name='scheduled_end') THEN
    ALTER TABLE public.sessions RENAME COLUMN scheduled_end TO scheduled_end_at;
  END IF;
END $$;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS booking_id              uuid UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS provider                text,
  ADD COLUMN IF NOT EXISTS meeting_external_id     text,
  ADD COLUMN IF NOT EXISTS join_url                text,
  ADD COLUMN IF NOT EXISTS no_show_wait_minutes    integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS min_payable_minutes     integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS meeting_created_at      timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_started_at      timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_ended_at        timestamptz,
  ADD COLUMN IF NOT EXISTS tutor_marked_no_show_at timestamptz,
  ADD COLUMN IF NOT EXISTS charge_scheduled_at     timestamptz,
  ADD COLUMN IF NOT EXISTS charged_at              timestamptz,
  ADD COLUMN IF NOT EXISTS charge_amount_ttd       numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_amount_ttd       numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_ttd        numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes                   jsonb;

ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_provider_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_provider_check CHECK (provider IS NULL OR provider IN ('google_meet','zoom'));

ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_status_check CHECK (status IN (
    'SCHEDULED','JOIN_OPEN','COMPLETED_ASSUMED','NO_SHOW_STUDENT','EARLY_END_SHORT','CANCELLED'
  ));

ALTER TABLE public.sessions ALTER COLUMN status SET DEFAULT 'SCHEDULED';

CREATE INDEX IF NOT EXISTS idx_sessions_tutor_scheduled   ON public.sessions(tutor_id, scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_sessions_student_scheduled ON public.sessions(student_id, scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status_charge     ON public.sessions(status, charge_scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sessions_booking           ON public.sessions(booking_id);

-- ---------------------------------------------------------------------
-- 7. Reload PostgREST schema cache so the new columns/tables are visible
-- ---------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
