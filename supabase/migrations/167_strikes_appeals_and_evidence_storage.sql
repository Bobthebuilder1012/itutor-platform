-- =====================================================
-- STRIKES, APPEALS, AND NO-SHOW EVIDENCE STORAGE
-- =====================================================
-- Extends the reliability layer shipped in mig 156:
--
-- 1. student_strikes        â€“ mirror of tutor_strikes, used for
--                             confirmed student no-show claims.
-- 2. tutor_strikes appeal   â€“ appeal columns mirroring ratings.
-- 3. student_strikes appeal â€“ appeal columns.
-- 4. SQL helper current_student_strike_state.
-- 5. noshow-evidence bucket â€“ private storage for claim evidence
--                             screenshots + meeting reports + PDFs.
-- =====================================================


-- =====================================================
-- 1. student_strikes
-- =====================================================
CREATE TABLE IF NOT EXISTS public.student_strikes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_id   uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  session_id   uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  reason       text NOT NULL
                CHECK (reason IN ('student_noshow','admin_manual')),
  issued_at    timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  cleared_at   timestamptz,
  cleared_by   uuid REFERENCES public.profiles(id),
  cleared_note text,
  notes        text,

  appeal_status         text
    CHECK (appeal_status IS NULL OR appeal_status IN ('pending','upheld','overturned')),
  appeal_text           text,
  appealed_at           timestamptz,
  appeal_decided_by     uuid REFERENCES public.profiles(id),
  appeal_decided_at     timestamptz,
  appeal_decision_notes text,

  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_strikes_student_active
  ON public.student_strikes(student_id, expires_at)
  WHERE cleared_at IS NULL;

ALTER TABLE public.student_strikes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students read own strikes" ON public.student_strikes;
CREATE POLICY "Students read own strikes"
  ON public.student_strikes FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access student_strikes" ON public.student_strikes;
CREATE POLICY "Service role full access student_strikes"
  ON public.student_strikes FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- =====================================================
-- 2. Appeal columns on tutor_strikes
-- =====================================================
ALTER TABLE public.tutor_strikes
  ADD COLUMN IF NOT EXISTS appeal_status         text
    CHECK (appeal_status IS NULL OR appeal_status IN ('pending','upheld','overturned')),
  ADD COLUMN IF NOT EXISTS appeal_text           text,
  ADD COLUMN IF NOT EXISTS appealed_at           timestamptz,
  ADD COLUMN IF NOT EXISTS appeal_decided_by     uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS appeal_decided_at     timestamptz,
  ADD COLUMN IF NOT EXISTS appeal_decision_notes text;

-- =====================================================
-- 3. Helper: student strike state, 90-day rolling.
-- =====================================================
CREATE OR REPLACE FUNCTION public.current_student_strike_state(p_student_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*)
    INTO v_count
  FROM public.student_strikes
  WHERE student_id = p_student_id
    AND cleared_at IS NULL
    AND expires_at > now();

  RETURN jsonb_build_object(
    'active_strikes', v_count,
    'warning_threshold', 3,
    'suspension_threshold', 5,
    'is_warned_candidate', v_count >= 3,
    'is_suspension_candidate', v_count >= 5
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.current_student_strike_state(uuid) TO authenticated, service_role;

-- =====================================================
-- 4. noshow-evidence storage bucket
--    Private bucket. Path scheme (matches
--    /api/noshow-claims/evidence-upload-url):
--      {ownerUserId}/{timestamp}-{safeFileName}
--
--    Uploads happen via signed URLs minted by the service role
--    (which bypasses RLS), and downloads are served via signed
--    URLs from /api/admin/disputes/.../evidence and the participant
--    routes. RLS below is a defence-in-depth fallback for direct
--    storage API access.
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('noshow-evidence', 'noshow-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- Upload: authenticated users may only INSERT objects under
-- their own auth.uid() folder.
DROP POLICY IF EXISTS "noshow evidence: upload own" ON storage.objects;
CREATE POLICY "noshow evidence: upload own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'noshow-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Read: own uploads only. Cross-party + admin access goes through
-- service-role signed URLs from /api routes, not direct.
DROP POLICY IF EXISTS "noshow evidence: read own" ON storage.objects;
CREATE POLICY "noshow evidence: read own"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'noshow-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Delete: own uploads only (lets users remove a bad file pre-submit).
DROP POLICY IF EXISTS "noshow evidence: delete own" ON storage.objects;
CREATE POLICY "noshow evidence: delete own"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'noshow-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

