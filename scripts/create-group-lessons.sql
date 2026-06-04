-- ============================================================
-- iTutor: Group Lessons feature + Notification Preferences
-- Run this once in the Supabase SQL Editor
-- ============================================================

-- 1. Group Lessons table
CREATE TABLE IF NOT EXISTS group_lessons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id      UUID REFERENCES subjects(id),
  title           TEXT NOT NULL,
  description     TEXT,
  level           TEXT NOT NULL CHECK (level IN ('Primary', 'CSEC', 'CAPE')),
  day_of_week     TEXT NOT NULL,
  time_start      TIME NOT NULL,
  time_end        TIME NOT NULL,
  capacity        INTEGER NOT NULL DEFAULT 12,
  price_ttd       NUMERIC(10,2) NOT NULL,
  color           TEXT DEFAULT 'from-brand to-brand-deep',
  emoji           TEXT DEFAULT '📚',
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Group Enrollments table
CREATE TABLE IF NOT EXISTS group_enrollments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_lesson_id   UUID NOT NULL REFERENCES group_lessons(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enrolled_at       TIMESTAMPTZ DEFAULT NOW(),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  UNIQUE (group_lesson_id, student_id)
);

-- 3. Add notification_preferences column to profiles (safe – skips if already exists)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB
  DEFAULT '{"lessons":true,"reminders":true,"marketing":false,"sms":false}'::jsonb;

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE group_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_enrollments ENABLE ROW LEVEL SECURITY;

-- group_lessons: anyone authenticated can read active lessons
CREATE POLICY "Public can read active group lessons"
  ON group_lessons FOR SELECT
  TO authenticated
  USING (status = 'active');

-- group_lessons: tutors can manage their own lessons
CREATE POLICY "Tutors can manage their own group lessons"
  ON group_lessons FOR ALL
  TO authenticated
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

-- group_enrollments: students can see and manage their own enrollments
CREATE POLICY "Students can manage their own enrollments"
  ON group_enrollments FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- group_enrollments: tutors can read enrollments for their lessons
CREATE POLICY "Tutors can read enrollments for their lessons"
  ON group_enrollments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_lessons
      WHERE group_lessons.id = group_lesson_id
        AND group_lessons.tutor_id = auth.uid()
    )
  );

-- ============================================================
-- Storage: Avatars bucket policies
-- NOTE: Create the "avatars" bucket manually in Supabase Dashboard
--   Storage → New bucket → Name: "avatars" → Public: ON
-- Then run these RLS policies:
-- ============================================================

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Public can view avatars"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Trigger to auto-update updated_at on group_lessons
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER group_lessons_updated_at
  BEFORE UPDATE ON group_lessons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
