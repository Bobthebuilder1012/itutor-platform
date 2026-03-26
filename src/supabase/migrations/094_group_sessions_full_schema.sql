-- =====================================================
-- GROUP SESSIONS FULL SCHEMA (Next.js + Supabase adaptation)
-- =====================================================

-- 1) Extend groups for richer publishing/pricing/content
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS difficulty text CHECK (difficulty IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
  ADD COLUMN IF NOT EXISTS goals text,
  ADD COLUMN IF NOT EXISTS price_per_session numeric(10,2),
  ADD COLUMN IF NOT EXISTS price_monthly numeric(10,2),
  ADD COLUMN IF NOT EXISTS pricing_model text NOT NULL DEFAULT 'FREE' CHECK (pricing_model IN ('PER_SESSION', 'MONTHLY', 'FREE')),
  ADD COLUMN IF NOT EXISTS recurrence_type text NOT NULL DEFAULT 'NONE' CHECK (recurrence_type IN ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY')),
  ADD COLUMN IF NOT EXISTS recurrence_rule text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS max_students integer NOT NULL DEFAULT 20 CHECK (max_students > 0),
  ADD COLUMN IF NOT EXISTS cover_image text,
  ADD COLUMN IF NOT EXISTS header_image text,
  ADD COLUMN IF NOT EXISTS content_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_groups_status ON public.groups(status);
CREATE INDEX IF NOT EXISTS idx_groups_subject ON public.groups(subject);
CREATE INDEX IF NOT EXISTS idx_groups_tutor_status ON public.groups(tutor_id, status);

-- 2) Extend group_sessions for RRULE/timezone details
ALTER TABLE public.group_sessions
  ADD COLUMN IF NOT EXISTS recurrence_rule text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS meeting_platform text CHECK (meeting_platform IN ('ZOOM', 'GOOGLE_MEET', 'INTERNAL')),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Normalize recurrence_type to include MONTHLY for new logic
ALTER TABLE public.group_sessions DROP CONSTRAINT IF EXISTS group_sessions_recurrence_type_check;
ALTER TABLE public.group_sessions
  ADD CONSTRAINT group_sessions_recurrence_type_check
  CHECK (recurrence_type IN ('none', 'weekly', 'daily', 'monthly'));

-- 3) Extend occurrences to map requested session fields
ALTER TABLE public.group_session_occurrences
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS meeting_link text,
  ADD COLUMN IF NOT EXISTS meeting_platform text CHECK (meeting_platform IN ('ZOOM', 'GOOGLE_MEET', 'INTERNAL')),
  ADD COLUMN IF NOT EXISTS occurrence_index integer,
  ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Keep legacy + new cancel semantics aligned
UPDATE public.group_session_occurrences
SET is_cancelled = true
WHERE status = 'cancelled';

CREATE INDEX IF NOT EXISTS idx_group_session_occurrences_session_start
  ON public.group_session_occurrences(group_session_id, scheduled_start_at);

-- 4) Enrollment + waitlist
CREATE TABLE IF NOT EXISTS public.group_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.group_session_occurrences(id) ON DELETE SET NULL,
  enrollment_type text NOT NULL CHECK (enrollment_type IN ('SUBSCRIPTION', 'SINGLE_SESSION')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED', 'WAITLISTED', 'COMPLETED')),
  payment_status text NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID', 'REFUNDED', 'FREE')),
  payment_ref text,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_enrollments_student ON public.group_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_group_enrollments_group ON public.group_enrollments(group_id);
CREATE INDEX IF NOT EXISTS idx_group_enrollments_status ON public.group_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_group_enrollments_group_status ON public.group_enrollments(group_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_group_enrollments_student_group_active
  ON public.group_enrollments(student_id, group_id)
  WHERE status = 'ACTIVE' AND session_id IS NULL;

CREATE TABLE IF NOT EXISTS public.group_waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  position integer NOT NULL CHECK (position > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_group_waitlist_student UNIQUE (student_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_group_waitlist_group_position
  ON public.group_waitlist_entries(group_id, position);

-- 5) Reviews + attendance
CREATE TABLE IF NOT EXISTS public.group_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.group_session_occurrences(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  is_verified boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_group_reviews_reviewer_group
  ON public.group_reviews(reviewer_id, group_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_group_reviews_group_created ON public.group_reviews(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_reviews_tutor_created ON public.group_reviews(tutor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.group_attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.group_session_occurrences(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'LATE')),
  marked_at timestamptz NOT NULL DEFAULT now(),
  marked_by_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_group_attendance_session_student UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_group_attendance_session ON public.group_attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_group_attendance_student ON public.group_attendance_records(student_id);

-- 6) Tutor profile extension table
CREATE TABLE IF NOT EXISTS public.tutor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  bio text,
  education text,
  experience text,
  certifications text[] DEFAULT '{}',
  subjects text[] NOT NULL DEFAULT '{}',
  response_time_hours integer,
  is_verified boolean NOT NULL DEFAULT false,
  profile_layout jsonb,
  social_links jsonb,
  intro_video_url text,
  sample_lesson_url text,
  average_rating numeric(3,2) NOT NULL DEFAULT 0,
  total_reviews integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tutor_profiles_user ON public.tutor_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_tutor_profiles_verified ON public.tutor_profiles(is_verified);

-- 7) Extend notifications to support group-session events
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS session_occurrence_id uuid REFERENCES public.group_session_occurrences(id) ON DELETE CASCADE;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (
    type IN (
      'booking_request',
      'booking_accepted',
      'booking_declined',
      'booking_counter_offer',
      'booking_cancelled',
      'new_message',
      'SESSION_REMINDER',
      'ENROLLMENT_CONFIRMED',
      'NEW_ANNOUNCEMENT',
      'SESSION_CANCELLED',
      'NEW_REVIEW',
      'WAITLIST_AVAILABLE'
    )
  );

-- 8) RLS for new tables
ALTER TABLE public.group_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_enrollments' AND policyname='Group enrollments select'
  ) THEN
    CREATE POLICY "Group enrollments select" ON public.group_enrollments
      FOR SELECT TO authenticated
      USING (
        student_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_enrollments' AND policyname='Group enrollments insert'
  ) THEN
    CREATE POLICY "Group enrollments insert" ON public.group_enrollments
      FOR INSERT TO authenticated
      WITH CHECK (student_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_enrollments' AND policyname='Group enrollments update'
  ) THEN
    CREATE POLICY "Group enrollments update" ON public.group_enrollments
      FOR UPDATE TO authenticated
      USING (
        student_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid())
      )
      WITH CHECK (
        student_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_waitlist_entries' AND policyname='Group waitlist select'
  ) THEN
    CREATE POLICY "Group waitlist select" ON public.group_waitlist_entries
      FOR SELECT TO authenticated
      USING (
        student_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_waitlist_entries' AND policyname='Group waitlist insert'
  ) THEN
    CREATE POLICY "Group waitlist insert" ON public.group_waitlist_entries
      FOR INSERT TO authenticated
      WITH CHECK (student_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_waitlist_entries' AND policyname='Group waitlist delete'
  ) THEN
    CREATE POLICY "Group waitlist delete" ON public.group_waitlist_entries
      FOR DELETE TO authenticated
      USING (
        student_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_reviews' AND policyname='Group reviews select'
  ) THEN
    CREATE POLICY "Group reviews select" ON public.group_reviews
      FOR SELECT TO authenticated
      USING (deleted_at IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_reviews' AND policyname='Group reviews insert'
  ) THEN
    CREATE POLICY "Group reviews insert" ON public.group_reviews
      FOR INSERT TO authenticated
      WITH CHECK (reviewer_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_reviews' AND policyname='Group reviews update'
  ) THEN
    CREATE POLICY "Group reviews update" ON public.group_reviews
      FOR UPDATE TO authenticated
      USING (reviewer_id = auth.uid())
      WITH CHECK (reviewer_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_attendance_records' AND policyname='Group attendance select'
  ) THEN
    CREATE POLICY "Group attendance select" ON public.group_attendance_records
      FOR SELECT TO authenticated
      USING (
        student_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.group_session_occurrences o
          JOIN public.group_sessions s ON s.id = o.group_session_id
          JOIN public.groups g ON g.id = s.group_id
          WHERE o.id = session_id AND g.tutor_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='group_attendance_records' AND policyname='Group attendance insert_update'
  ) THEN
    CREATE POLICY "Group attendance insert_update" ON public.group_attendance_records
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.group_session_occurrences o
          JOIN public.group_sessions s ON s.id = o.group_session_id
          JOIN public.groups g ON g.id = s.group_id
          WHERE o.id = session_id AND g.tutor_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.group_session_occurrences o
          JOIN public.group_sessions s ON s.id = o.group_session_id
          JOIN public.groups g ON g.id = s.group_id
          WHERE o.id = session_id AND g.tutor_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tutor_profiles' AND policyname='Tutor profiles select'
  ) THEN
    CREATE POLICY "Tutor profiles select" ON public.tutor_profiles
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tutor_profiles' AND policyname='Tutor profiles upsert self'
  ) THEN
    CREATE POLICY "Tutor profiles upsert self" ON public.tutor_profiles
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

