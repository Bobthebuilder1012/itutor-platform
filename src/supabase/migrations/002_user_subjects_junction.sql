-- =====================================================
-- USER_SUBJECTS JUNCTION TABLE
-- Links users (students/tutors) to subjects
-- =====================================================

DROP TABLE IF EXISTS public.user_subjects CASCADE;

-- Create user_subjects junction table
CREATE TABLE public.user_subjects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    -- Prevent duplicate entries
    UNIQUE (user_id, subject_id)
);

-- Indexes for performance
CREATE INDEX idx_user_subjects_user ON public.user_subjects(user_id);
CREATE INDEX idx_user_subjects_subject ON public.user_subjects(subject_id);

-- Trigger to auto-update updated_at
CREATE TRIGGER user_subjects_updated_at
    BEFORE UPDATE ON public.user_subjects
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Enable RLS
ALTER TABLE public.user_subjects ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can read their own subject links
CREATE POLICY "Users can read their own subjects"
ON public.user_subjects FOR SELECT
USING (user_id = auth.uid());

-- Anyone can read user subjects (needed for tutor discovery)
CREATE POLICY "Anyone can read user subjects"
ON public.user_subjects FOR SELECT
USING (true);

-- Users can insert their own subject links
CREATE POLICY "Users can insert their own subjects"
ON public.user_subjects FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Admins can insert any user subject link
CREATE POLICY "Admins can insert any user subject"
ON public.user_subjects FOR INSERT
WITH CHECK (public.is_admin());

-- Users can delete their own subject links
CREATE POLICY "Users can delete their own subjects"
ON public.user_subjects FOR DELETE
USING (user_id = auth.uid());

-- Admins can delete any user subject link
CREATE POLICY "Admins can delete any user subject"
ON public.user_subjects FOR DELETE
USING (public.is_admin());

-- Table comment
COMMENT ON TABLE public.user_subjects IS 'Junction table linking users to subjects they study (students) or teach (tutors)';


