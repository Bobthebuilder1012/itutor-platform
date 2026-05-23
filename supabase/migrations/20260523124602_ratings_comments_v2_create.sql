-- =====================================================
-- RATINGS & COMMENTS V2 — PHASE 3: NEW TABLES,
-- TRIGGERS, AND RLS POLICIES
-- =====================================================

-- -------------------------------------------------------
-- 3a. class_ratings
-- -------------------------------------------------------
CREATE TABLE public.class_ratings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tutor_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  billing_period  text NOT NULL,
  stars           integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment         text,
  helpful_count   integer NOT NULL DEFAULT 0,
  is_test_data    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_id, billing_period)
);

CREATE INDEX idx_class_ratings_class_id   ON public.class_ratings(class_id);
CREATE INDEX idx_class_ratings_tutor_id   ON public.class_ratings(tutor_id);
CREATE INDEX idx_class_ratings_student_id ON public.class_ratings(student_id);

-- -------------------------------------------------------
-- 3b. rating_prompts
-- -------------------------------------------------------
CREATE TYPE public.rating_prompt_status AS ENUM ('pending', 'submitted', 'expired', 'dismissed');

CREATE TABLE public.rating_prompts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id        uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  billing_period  text NOT NULL,
  available_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  snoozed_until   timestamptz,
  dismissed_count integer NOT NULL DEFAULT 0,
  status          public.rating_prompt_status NOT NULL DEFAULT 'pending',
  submitted_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, class_id, billing_period)
);

CREATE INDEX idx_rating_prompts_student_status ON public.rating_prompts(student_id, status);
CREATE INDEX idx_rating_prompts_expires_at     ON public.rating_prompts(expires_at) WHERE status = 'pending';

-- -------------------------------------------------------
-- 3c. class_comments
-- -------------------------------------------------------
CREATE TABLE public.class_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  billing_period  text NOT NULL,
  body            text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  stars           integer CHECK (stars BETWEEN 1 AND 5),
  like_count      integer NOT NULL DEFAULT 0,
  dislike_count   integer NOT NULL DEFAULT 0,
  edited_at       timestamptz,
  hidden_at       timestamptz,
  hidden_by       uuid REFERENCES public.profiles(id),
  deleted_at      timestamptz,
  is_test_data    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, author_id, billing_period)
);

CREATE INDEX idx_class_comments_class_id    ON public.class_comments(class_id)                             WHERE deleted_at IS NULL;
CREATE INDEX idx_class_comments_created_at  ON public.class_comments(class_id, created_at DESC)            WHERE deleted_at IS NULL;
CREATE INDEX idx_class_comments_stars       ON public.class_comments(class_id, stars)                      WHERE deleted_at IS NULL AND stars IS NOT NULL;

-- -------------------------------------------------------
-- 3c. tutor_profile_comments
-- -------------------------------------------------------
CREATE TABLE public.tutor_profile_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id      uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  body            text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  stars           integer CHECK (stars BETWEEN 1 AND 5),
  like_count      integer NOT NULL DEFAULT 0,
  dislike_count   integer NOT NULL DEFAULT 0,
  edited_at       timestamptz,
  hidden_at       timestamptz,
  hidden_by       uuid REFERENCES public.profiles(id),
  deleted_at      timestamptz,
  is_test_data    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id)
);

CREATE INDEX idx_tutor_profile_comments_tutor_id   ON public.tutor_profile_comments(tutor_id)                    WHERE deleted_at IS NULL;
CREATE INDEX idx_tutor_profile_comments_created_at ON public.tutor_profile_comments(tutor_id, created_at DESC)   WHERE deleted_at IS NULL;

-- -------------------------------------------------------
-- 3d. comment_replies
-- -------------------------------------------------------
CREATE TYPE public.comment_target_type AS ENUM ('class_comment', 'tutor_profile_comment');

CREATE TABLE public.comment_replies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type public.comment_target_type NOT NULL,
  target_id   uuid NOT NULL,
  author_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  edited_at   timestamptz,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id)
);

CREATE INDEX idx_comment_replies_target ON public.comment_replies(target_type, target_id);

-- -------------------------------------------------------
-- 3e. comment_reactions
-- -------------------------------------------------------
CREATE TYPE public.comment_reaction_type AS ENUM ('like', 'dislike');

CREATE TABLE public.comment_reactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type   public.comment_target_type NOT NULL,
  target_id     uuid NOT NULL,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type public.comment_reaction_type NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, user_id)
);

CREATE INDEX idx_comment_reactions_target ON public.comment_reactions(target_type, target_id);

-- -------------------------------------------------------
-- 3f. comment_reports
-- -------------------------------------------------------
CREATE TYPE public.comment_report_reason AS ENUM ('spam', 'harassment', 'inappropriate_language', 'misleading', 'other');
CREATE TYPE public.comment_report_status AS ENUM ('pending', 'resolved_hidden', 'resolved_deleted', 'resolved_warned', 'dismissed');

CREATE TABLE public.comment_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type     public.comment_target_type NOT NULL,
  target_id       uuid NOT NULL,
  reply_id        uuid REFERENCES public.comment_replies(id) ON DELETE CASCADE,
  reporter_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason          public.comment_report_reason NOT NULL,
  body            text CHECK (length(body) <= 500),
  status          public.comment_report_status NOT NULL DEFAULT 'pending',
  resolved_by     uuid REFERENCES public.profiles(id),
  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_comment_reports_status   ON public.comment_reports(status, created_at);
CREATE INDEX idx_comment_reports_reporter ON public.comment_reports(reporter_id);

-- -------------------------------------------------------
-- 4. Rating cache: profiles.rating_average + rating_count
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_tutor_rating(p_tutor_id uuid)
RETURNS void AS $$
BEGIN
  WITH all_ratings AS (
    SELECT stars FROM public.ratings       WHERE tutor_id = p_tutor_id AND is_test_data = false
    UNION ALL
    SELECT stars FROM public.class_ratings WHERE tutor_id = p_tutor_id AND is_test_data = false
  )
  UPDATE public.profiles
  SET rating_average = COALESCE((SELECT AVG(stars)::numeric(3,2) FROM all_ratings), 0),
      rating_count   = (SELECT COUNT(*) FROM all_ratings),
      updated_at     = now()
  WHERE id = p_tutor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.trg_recompute_on_rating()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recompute_tutor_rating(COALESCE(NEW.tutor_id, OLD.tutor_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ratings_recompute ON public.ratings;
CREATE TRIGGER trg_ratings_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.ratings
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_on_rating();

DROP TRIGGER IF EXISTS trg_class_ratings_recompute ON public.class_ratings;
CREATE TRIGGER trg_class_ratings_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.class_ratings
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_on_rating();

-- -------------------------------------------------------
-- 4. Per-class rating cache on groups
-- -------------------------------------------------------
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS rating_average numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count   integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.recompute_class_rating(p_class_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.groups
  SET rating_average = COALESCE((
        SELECT AVG(stars)::numeric(3,2) FROM public.class_ratings
        WHERE class_id = p_class_id AND is_test_data = false
      ), 0),
      rating_count = (
        SELECT COUNT(*) FROM public.class_ratings
        WHERE class_id = p_class_id AND is_test_data = false
      )
  WHERE id = p_class_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.trg_recompute_on_class_rating()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recompute_class_rating(COALESCE(NEW.class_id, OLD.class_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_class_ratings_class_recompute ON public.class_ratings;
CREATE TRIGGER trg_class_ratings_class_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.class_ratings
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_on_class_rating();

-- -------------------------------------------------------
-- 4. Keep like_count / dislike_count on comment tables
--    in sync with comment_reactions
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sync_comment_reaction_counts()
RETURNS trigger AS $$
DECLARE
  v_target_type public.comment_target_type;
  v_target_id   uuid;
BEGIN
  v_target_type := COALESCE(NEW.target_type, OLD.target_type);
  v_target_id   := COALESCE(NEW.target_id,   OLD.target_id);

  IF v_target_type = 'class_comment' THEN
    UPDATE public.class_comments
    SET like_count    = (SELECT COUNT(*) FROM public.comment_reactions WHERE target_type = 'class_comment'    AND target_id = v_target_id AND reaction_type = 'like'),
        dislike_count = (SELECT COUNT(*) FROM public.comment_reactions WHERE target_type = 'class_comment'    AND target_id = v_target_id AND reaction_type = 'dislike')
    WHERE id = v_target_id;
  ELSIF v_target_type = 'tutor_profile_comment' THEN
    UPDATE public.tutor_profile_comments
    SET like_count    = (SELECT COUNT(*) FROM public.comment_reactions WHERE target_type = 'tutor_profile_comment' AND target_id = v_target_id AND reaction_type = 'like'),
        dislike_count = (SELECT COUNT(*) FROM public.comment_reactions WHERE target_type = 'tutor_profile_comment' AND target_id = v_target_id AND reaction_type = 'dislike')
    WHERE id = v_target_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_comment_reactions_counts ON public.comment_reactions;
CREATE TRIGGER trg_comment_reactions_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.comment_reactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_comment_reaction_counts();

-- -------------------------------------------------------
-- 5. RLS policies on all new tables
-- -------------------------------------------------------

-- class_ratings
ALTER TABLE public.class_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read class ratings"
  ON public.class_ratings FOR SELECT USING (true);
CREATE POLICY "Students read their own class ratings"
  ON public.class_ratings FOR UPDATE
  USING (auth.uid() = student_id);

-- rating_prompts
ALTER TABLE public.rating_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students read their own prompts"
  ON public.rating_prompts FOR SELECT
  USING (auth.uid() = student_id);
CREATE POLICY "Students update their own prompts"
  ON public.rating_prompts FOR UPDATE
  USING (auth.uid() = student_id);

-- class_comments
ALTER TABLE public.class_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read non-hidden class comments"
  ON public.class_comments FOR SELECT
  USING (deleted_at IS NULL AND hidden_at IS NULL);
CREATE POLICY "Authors can update their own class comments"
  ON public.class_comments FOR UPDATE
  USING (auth.uid() = author_id);
CREATE POLICY "Authors can delete their own class comments"
  ON public.class_comments FOR DELETE
  USING (auth.uid() = author_id);

-- tutor_profile_comments
ALTER TABLE public.tutor_profile_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read non-hidden tutor comments"
  ON public.tutor_profile_comments FOR SELECT
  USING (deleted_at IS NULL AND hidden_at IS NULL);
CREATE POLICY "Authors can update their own tutor comments"
  ON public.tutor_profile_comments FOR UPDATE
  USING (auth.uid() = author_id);
CREATE POLICY "Authors can delete their own tutor comments"
  ON public.tutor_profile_comments FOR DELETE
  USING (auth.uid() = author_id);

-- comment_replies
ALTER TABLE public.comment_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read non-deleted replies"
  ON public.comment_replies FOR SELECT
  USING (deleted_at IS NULL);
CREATE POLICY "Authors can update their own replies"
  ON public.comment_replies FOR UPDATE
  USING (auth.uid() = author_id);
CREATE POLICY "Authors can delete their own replies"
  ON public.comment_replies FOR DELETE
  USING (auth.uid() = author_id);

-- comment_reactions
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read reactions"
  ON public.comment_reactions FOR SELECT USING (true);
CREATE POLICY "Users manage their own reactions"
  ON public.comment_reactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- comment_reports
ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reporters read their own reports"
  ON public.comment_reports FOR SELECT
  USING (auth.uid() = reporter_id);
CREATE POLICY "Admins read all reports"
  ON public.comment_reports FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));
