-- group_enrollments.group_lesson_id was created NOT NULL by the legacy
-- scripts/create-group-lessons.sql script run directly in Supabase.
-- The new group subscription system (migrations 159/160) does not use
-- group_lesson_id — it references the groups table instead. Drop the
-- NOT NULL constraint so subscription enrollments can be created.

ALTER TABLE public.group_enrollments
  ALTER COLUMN group_lesson_id DROP NOT NULL;
