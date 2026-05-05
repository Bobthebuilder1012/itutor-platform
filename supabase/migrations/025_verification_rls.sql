-- =====================================================
-- TUTOR VERIFICATION SYSTEM - RLS POLICIES
-- =====================================================
-- Row Level Security policies for verification tables

-- 1. TUTOR_VERIFICATION_REQUESTS POLICIES
ALTER TABLE tutor_verification_requests ENABLE ROW LEVEL SECURITY;

-- Policy 1: Tutors can view their own verification requests
DROP POLICY IF EXISTS "Tutors view own verification requests" ON tutor_verification_requests;
CREATE POLICY "Tutors view own verification requests"
ON tutor_verification_requests FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

-- Policy 2: Tutors can insert their own verification requests
DROP POLICY IF EXISTS "Tutors create own verification requests" ON tutor_verification_requests;
CREATE POLICY "Tutors create own verification requests"
ON tutor_verification_requests FOR INSERT
TO authenticated
WITH CHECK (tutor_id = auth.uid());

-- Policy 3: Reviewers can view ALL verification requests
DROP POLICY IF EXISTS "Reviewers view all verification requests" ON tutor_verification_requests;
CREATE POLICY "Reviewers view all verification requests"
ON tutor_verification_requests FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_reviewer = true)
);

-- Policy 4: Reviewers can update verification requests (for decisions)
DROP POLICY IF EXISTS "Reviewers update verification requests" ON tutor_verification_requests;
CREATE POLICY "Reviewers update verification requests"
ON tutor_verification_requests FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_reviewer = true)
);

-- Policy 5: Service role has full access (for OCR processing)
DROP POLICY IF EXISTS "Service role full access to verification requests" ON tutor_verification_requests;
CREATE POLICY "Service role full access to verification requests"
ON tutor_verification_requests FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. TUTOR_VERIFICATION_EVENTS POLICIES
ALTER TABLE tutor_verification_events ENABLE ROW LEVEL SECURITY;

-- Policy 1: Tutors can view events for their own requests
DROP POLICY IF EXISTS "Tutors view own verification events" ON tutor_verification_events;
CREATE POLICY "Tutors view own verification events"
ON tutor_verification_events FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tutor_verification_requests 
    WHERE id = tutor_verification_events.request_id 
    AND tutor_id = auth.uid()
  )
);

-- Policy 2: Reviewers can view ALL verification events
DROP POLICY IF EXISTS "Reviewers view all verification events" ON tutor_verification_events;
CREATE POLICY "Reviewers view all verification events"
ON tutor_verification_events FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_reviewer = true)
);

-- Policy 3: Service role can insert events (audit trail)
DROP POLICY IF EXISTS "Service role insert verification events" ON tutor_verification_events;
CREATE POLICY "Service role insert verification events"
ON tutor_verification_events FOR INSERT
TO service_role
WITH CHECK (true);

-- Policy 4: Service role has full access
DROP POLICY IF EXISTS "Service role full access to verification events" ON tutor_verification_events;
CREATE POLICY "Service role full access to verification events"
ON tutor_verification_events FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Verification RLS policies created successfully!';
    RAISE NOTICE 'tutor_verification_requests: 5 policies (tutors view/create own, reviewers view/update all, service role full access)';
    RAISE NOTICE 'tutor_verification_events: 4 policies (tutors view own, reviewers view all, service role insert/full access)';
END $$;













