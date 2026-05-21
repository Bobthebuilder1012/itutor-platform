-- =====================================================================
-- PRODUCTION CATCH-UP SCRIPT (auto-generated)
-- Concatenation of supabase/migrations/*.sql in filename order.
-- Excludes 000_drop_all_tables.sql (destructive).
--
-- HOW TO USE
--   Option A (recommended): supabase db push --linked
--   Option B: paste this whole file into Supabase SQL Editor in production.
--            If it times out, split at the '-- ===== FILE:' headers below
--            and run in chunks (in order).
--
-- NOTES
--   * Most files use IF NOT EXISTS / OR REPLACE and are safe to re-run.
--   * Some files contain seed INSERTs without ON CONFLICT - re-running
--     may insert duplicates or error on unique constraints. If a section
--     errors, skip it (the data is likely already there).
--   * After running, execute:  NOTIFY pgrst, 'reload schema';
-- =====================================================================


-- ===== FILE: 001_complete_schema_with_rls.sql =====

-- iTutor Platform - Complete Schema Migration with RLS
-- TTD-only payment model with WiPay/FAC integration
-- MVP: Students, Parents, Tutors, Sessions, Ratings, Payments, Balances, Payouts
-- Includes: Tables, Indexes, Triggers, RLS Policies

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- PART 1: TABLE DEFINITIONS
-- =============================================================================

-- =============================================================================
-- 1. PROFILES (Unified user table for all roles)
-- =============================================================================
CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('student', 'parent', 'tutor', 'admin')),
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone_number text,
  dob date,
  gender text CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  
  -- Geographic context
  country text,
  region text,
  school text,
  
  -- Academic context (students)
  form_level text,  -- e.g., "Form 4", "Unit 1"
  subjects_of_study text[],  -- Array of subject names for students
  
  -- Billing (students)
  billing_mode text CHECK (billing_mode IN ('parent_required', 'self_allowed')),
  
  -- Tutor-specific fields
  tutor_type text CHECK (tutor_type IN ('professional_teacher', 'university_tutor', 'graduate_tutor')),
  teaching_mode text CHECK (teaching_mode IN ('online', 'in_person', 'both')),
  response_time_minutes integer,
  attendance_rate numeric(5,2),  -- Percentage 0.00 - 100.00
  
  -- Performance metrics (tutors)
  rating_average numeric(3,2) CHECK (rating_average >= 0 AND rating_average <= 5),
  rating_count integer NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for profiles
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_country ON profiles(country);
CREATE INDEX idx_profiles_school ON profiles(school);
CREATE INDEX idx_profiles_tutor_rating ON profiles(rating_average DESC) WHERE role = 'tutor';

-- =============================================================================
-- 2. PARENT_CHILD_LINKS (Parent â†” Student relationships)
-- =============================================================================
CREATE TABLE parent_child_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT parent_not_child CHECK (parent_id != child_id),
  CONSTRAINT unique_parent_child UNIQUE (parent_id, child_id)
);

-- Indexes for parent_child_links
CREATE INDEX idx_parent_child_parent ON parent_child_links(parent_id);
CREATE INDEX idx_parent_child_child ON parent_child_links(child_id);

-- =============================================================================
-- 3. SUBJECTS (Normalized curriculum subjects)
-- =============================================================================
CREATE TABLE subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,  -- e.g., "Physics"
  curriculum text NOT NULL CHECK (curriculum IN ('CSEC', 'CAPE')),
  level text NOT NULL,  -- e.g., "Form 4", "Unit 1"
  code text,  -- Optional internal code
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure unique subject per curriculum and level
  CONSTRAINT unique_subject_curriculum_level UNIQUE (name, curriculum, level)
);

-- Indexes for subjects
CREATE INDEX idx_subjects_curriculum ON subjects(curriculum);
CREATE INDEX idx_subjects_name ON subjects(name);
CREATE INDEX idx_subjects_level ON subjects(level);

-- =============================================================================
-- 4. TUTOR_SUBJECTS (Tutor-subject mapping with TTD pricing)
-- =============================================================================
CREATE TABLE tutor_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  price_per_hour_ttd numeric(10,2) NOT NULL CHECK (price_per_hour_ttd > 0),
  mode text NOT NULL CHECK (mode IN ('online', 'in_person', 'either')),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- One pricing entry per tutor-subject pair
  CONSTRAINT unique_tutor_subject UNIQUE (tutor_id, subject_id)
);

-- Indexes for tutor_subjects
CREATE INDEX idx_tutor_subjects_tutor ON tutor_subjects(tutor_id);
CREATE INDEX idx_tutor_subjects_subject ON tutor_subjects(subject_id);
CREATE INDEX idx_tutor_subjects_price ON tutor_subjects(price_per_hour_ttd);

-- =============================================================================
-- 5. TUTOR_VERIFICATIONS (Certificate upload sessions)
-- =============================================================================
CREATE TABLE tutor_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  uploaded_doc_url text NOT NULL,  -- Storage URL for certificate image
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  verified_by uuid REFERENCES profiles(id) ON DELETE SET NULL,  -- Admin who verified
  notes text
);

-- Indexes for tutor_verifications
CREATE INDEX idx_tutor_verifications_tutor ON tutor_verifications(tutor_id);
CREATE INDEX idx_tutor_verifications_status ON tutor_verifications(status);

-- =============================================================================
-- 6. TUTOR_VERIFIED_SUBJECT_GRADES (Immutable verified grades from certificates)
-- =============================================================================
CREATE TABLE tutor_verified_subject_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL REFERENCES tutor_verifications(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exam_type text NOT NULL CHECK (exam_type IN ('CSEC', 'CAPE')),
  subject_name text NOT NULL,  -- As extracted from certificate
  grade text NOT NULL,  -- e.g., "1", "2", "3" for CSEC; "A", "B", "C" for CAPE
  display boolean NOT NULL DEFAULT true,  -- Tutor can hide but NOT edit subject/grade
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for tutor_verified_subject_grades
CREATE INDEX idx_verified_grades_tutor ON tutor_verified_subject_grades(tutor_id);
CREATE INDEX idx_verified_grades_verification ON tutor_verified_subject_grades(verification_id);
CREATE INDEX idx_verified_grades_display ON tutor_verified_subject_grades(tutor_id, display);

-- =============================================================================
-- 7. SESSIONS (Tutoring sessions)
-- =============================================================================
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  tutor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  payer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,  -- Parent or student
  
  -- Session details
  status text NOT NULL CHECK (status IN ('booked', 'in_progress', 'completed', 'cancelled')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded')),
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  
  -- Pricing (TTD)
  price_per_hour_ttd numeric(10,2) NOT NULL CHECK (price_per_hour_ttd > 0),
  amount_ttd numeric(10,2) NOT NULL CHECK (amount_ttd > 0),
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for sessions
CREATE INDEX idx_sessions_student ON sessions(student_id);
CREATE INDEX idx_sessions_tutor ON sessions(tutor_id);
CREATE INDEX idx_sessions_payer ON sessions(payer_id);
CREATE INDEX idx_sessions_subject ON sessions(subject_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_payment_status ON sessions(payment_status);
CREATE INDEX idx_sessions_scheduled_start ON sessions(scheduled_start);

-- =============================================================================
-- 8. RATINGS (Session ratings and reviews)
-- =============================================================================
CREATE TABLE ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stars integer NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- One rating per session
  CONSTRAINT unique_session_rating UNIQUE (session_id)
);

-- Indexes for ratings
CREATE INDEX idx_ratings_session ON ratings(session_id);
CREATE INDEX idx_ratings_student ON ratings(student_id);
CREATE INDEX idx_ratings_tutor ON ratings(tutor_id);
CREATE INDEX idx_ratings_stars ON ratings(stars);

-- =============================================================================
-- 9. PAYMENTS (TTD payments from WiPay/FAC)
-- =============================================================================
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  
  -- Related entities
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  payer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  tutor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  
  -- Payment details (TTD only)
  amount_ttd numeric(12,2) NOT NULL CHECK (amount_ttd > 0),
  
  -- Gateway details
  gateway text NOT NULL CHECK (gateway IN ('WiPay', 'FAC', 'Manual')),
  gateway_reference text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
  raw_payload jsonb
);

-- Indexes for payments
CREATE INDEX idx_payments_session ON payments(session_id);
CREATE INDEX idx_payments_payer ON payments(payer_id);
CREATE INDEX idx_payments_tutor ON payments(tutor_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_gateway_ref ON payments(gateway_reference);

-- =============================================================================
-- 10. TUTOR_EARNINGS (Per-session earnings ledger with 90/10 split)
-- =============================================================================
CREATE TABLE tutor_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  tutor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  
  -- TTD amounts
  gross_amount_ttd numeric(12,2) NOT NULL CHECK (gross_amount_ttd > 0),
  tutor_share_ttd numeric(12,2) NOT NULL CHECK (tutor_share_ttd > 0),
  commission_ttd numeric(12,2) NOT NULL CHECK (commission_ttd >= 0),
  
  status text NOT NULL CHECK (status IN ('EARNED', 'REVERSED')),
  
  -- One earnings record per payment
  CONSTRAINT unique_payment_earnings UNIQUE (payment_id)
);

-- Indexes for tutor_earnings
CREATE INDEX idx_tutor_earnings_tutor ON tutor_earnings(tutor_id);
CREATE INDEX idx_tutor_earnings_session ON tutor_earnings(session_id);
CREATE INDEX idx_tutor_earnings_payment ON tutor_earnings(payment_id);
CREATE INDEX idx_tutor_earnings_status ON tutor_earnings(status);

-- =============================================================================
-- 11. TUTOR_BALANCES (Internal TTD wallet per tutor)
-- =============================================================================
CREATE TABLE tutor_balances (
  tutor_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  available_ttd numeric(12,2) NOT NULL DEFAULT 0 CHECK (available_ttd >= 0),
  pending_ttd numeric(12,2) NOT NULL DEFAULT 0 CHECK (pending_ttd >= 0),
  last_updated timestamptz NOT NULL DEFAULT now()
);

-- Index for tutor_balances
CREATE INDEX idx_tutor_balances_available ON tutor_balances(available_ttd DESC);

-- =============================================================================
-- 12. COMMISSION_LEDGER (Platform revenue - 10% per session)
-- =============================================================================
CREATE TABLE commission_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  tutor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  commission_ttd numeric(12,2) NOT NULL CHECK (commission_ttd >= 0),
  notes text
);

-- Indexes for commission_ledger
CREATE INDEX idx_commission_session ON commission_ledger(session_id);
CREATE INDEX idx_commission_tutor ON commission_ledger(tutor_id);
CREATE INDEX idx_commission_payment ON commission_ledger(payment_id);

-- =============================================================================
-- 13. PAYOUT_REQUESTS (Tutor withdrawal requests)
-- =============================================================================
CREATE TABLE payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  tutor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  amount_requested_ttd numeric(12,2) NOT NULL CHECK (amount_requested_ttd > 0),
  status text NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'PAID')),
  payment_method text NOT NULL CHECK (payment_method IN ('BankTransfer', 'WiPayWallet', 'Cash', 'Other')),
  payout_details jsonb,  -- Bank account info, wallet ID, etc.
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  paid_at timestamptz,
  admin_notes text
);

-- Indexes for payout_requests
CREATE INDEX idx_payout_requests_tutor ON payout_requests(tutor_id);
CREATE INDEX idx_payout_requests_status ON payout_requests(status);
CREATE INDEX idx_payout_requests_created ON payout_requests(created_at DESC);

-- =============================================================================
-- PART 2: TRIGGERS
-- =============================================================================

-- Trigger function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to profiles
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply updated_at trigger to sessions
CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger function: Update tutor rating average and count
CREATE OR REPLACE FUNCTION update_tutor_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles
  SET 
    rating_count = (SELECT COUNT(*) FROM ratings WHERE tutor_id = NEW.tutor_id),
    rating_average = (SELECT AVG(stars)::numeric(3,2) FROM ratings WHERE tutor_id = NEW.tutor_id)
  WHERE id = NEW.tutor_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply rating trigger
CREATE TRIGGER ratings_update_tutor_stats
  AFTER INSERT ON ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_tutor_rating();

-- =============================================================================
-- PART 3: TABLE COMMENTS
-- =============================================================================

COMMENT ON TABLE profiles IS 'Unified user table for students, parents, tutors, and admins';
COMMENT ON TABLE parent_child_links IS 'Links parent profiles to their child student profiles';
COMMENT ON TABLE subjects IS 'Normalized curriculum subjects (CSEC/CAPE)';
COMMENT ON TABLE tutor_subjects IS 'Tutors teaching subjects with TTD hourly rates';
COMMENT ON TABLE tutor_verifications IS 'Certificate verification submissions';
COMMENT ON TABLE tutor_verified_subject_grades IS 'Immutable verified grades extracted from certificates';
COMMENT ON TABLE sessions IS 'Tutoring session bookings';
COMMENT ON TABLE ratings IS 'Student ratings of completed sessions';
COMMENT ON TABLE payments IS 'TTD payments received via WiPay/FAC';
COMMENT ON TABLE tutor_earnings IS 'Per-session earnings ledger (90% tutor, 10% platform)';
COMMENT ON TABLE tutor_balances IS 'Current TTD balance per tutor (internal wallet)';
COMMENT ON TABLE commission_ledger IS 'Platform commission tracking (10% per session)';
COMMENT ON TABLE payout_requests IS 'Tutor withdrawal requests to be fulfilled by admins';

-- =============================================================================
-- PART 4: RLS HELPER FUNCTIONS
-- =============================================================================

-- Check if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if a given student_id is a child of the current user (parent)
CREATE OR REPLACE FUNCTION public.is_my_child(student_uuid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.parent_child_links
    WHERE parent_id = auth.uid() AND child_id = student_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if a session belongs to one of the current user's children
CREATE OR REPLACE FUNCTION public.is_child_session(session_uuid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.sessions s
    JOIN public.parent_child_links pcl ON s.student_id = pcl.child_id
    WHERE s.id = session_uuid AND pcl.parent_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PART 5: ENABLE RLS ON ALL TABLES
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_child_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_verified_subject_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- PART 6: RLS POLICIES
-- =============================================================================

-- TABLE: profiles
-- =============================================================================

CREATE POLICY "Users can read their own profile"
ON public.profiles FOR SELECT
USING (id = auth.uid());

CREATE POLICY "Parents can read children profiles"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.parent_child_links
    WHERE parent_id = auth.uid() AND child_id = profiles.id
  )
);

CREATE POLICY "Admins can read all profiles"
ON public.profiles FOR SELECT
USING (public.is_admin());

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can insert any profile"
ON public.profiles FOR INSERT
WITH CHECK (public.is_admin());

-- TABLE: parent_child_links
-- =============================================================================

CREATE POLICY "Parents can read their own links"
ON public.parent_child_links FOR SELECT
USING (parent_id = auth.uid());

CREATE POLICY "Children can read their parent links"
ON public.parent_child_links FOR SELECT
USING (child_id = auth.uid());

CREATE POLICY "Admins can read all parent-child links"
ON public.parent_child_links FOR SELECT
USING (public.is_admin());

CREATE POLICY "Parents can create their own links"
ON public.parent_child_links FOR INSERT
WITH CHECK (parent_id = auth.uid());

CREATE POLICY "Admins can create any link"
ON public.parent_child_links FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Parents can delete their own links"
ON public.parent_child_links FOR DELETE
USING (parent_id = auth.uid());

CREATE POLICY "Admins can delete any link"
ON public.parent_child_links FOR DELETE
USING (public.is_admin());

-- TABLE: subjects
-- =============================================================================

CREATE POLICY "Anyone can read subjects"
ON public.subjects FOR SELECT
USING (true);

CREATE POLICY "Admins can insert subjects"
ON public.subjects FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update subjects"
ON public.subjects FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete subjects"
ON public.subjects FOR DELETE
USING (public.is_admin());

-- TABLE: tutor_subjects
-- =============================================================================

CREATE POLICY "Anyone can read tutor subjects"
ON public.tutor_subjects FOR SELECT
USING (true);

CREATE POLICY "Tutors can insert their own subjects"
ON public.tutor_subjects FOR INSERT
WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "Admins can insert any tutor subject"
ON public.tutor_subjects FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Tutors can update their own subjects"
ON public.tutor_subjects FOR UPDATE
USING (tutor_id = auth.uid())
WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "Admins can update any tutor subject"
ON public.tutor_subjects FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Tutors can delete their own subjects"
ON public.tutor_subjects FOR DELETE
USING (tutor_id = auth.uid());

CREATE POLICY "Admins can delete any tutor subject"
ON public.tutor_subjects FOR DELETE
USING (public.is_admin());

-- TABLE: tutor_verifications
-- =============================================================================

CREATE POLICY "Tutors can read their own verifications"
ON public.tutor_verifications FOR SELECT
USING (tutor_id = auth.uid());

CREATE POLICY "Admins can read all verifications"
ON public.tutor_verifications FOR SELECT
USING (public.is_admin());

CREATE POLICY "Tutors can create their own verifications"
ON public.tutor_verifications FOR INSERT
WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "Admins can create any verification"
ON public.tutor_verifications FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update verifications"
ON public.tutor_verifications FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete verifications"
ON public.tutor_verifications FOR DELETE
USING (public.is_admin());

-- TABLE: tutor_verified_subject_grades
-- =============================================================================

CREATE POLICY "Tutors can read their own verified grades"
ON public.tutor_verified_subject_grades FOR SELECT
USING (tutor_id = auth.uid());

CREATE POLICY "Anyone can read displayed verified grades"
ON public.tutor_verified_subject_grades FOR SELECT
USING (display = true);

CREATE POLICY "Admins can read all verified grades"
ON public.tutor_verified_subject_grades FOR SELECT
USING (public.is_admin());

CREATE POLICY "Admins can insert verified grades"
ON public.tutor_verified_subject_grades FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Tutors can toggle display on their grades"
ON public.tutor_verified_subject_grades FOR UPDATE
USING (tutor_id = auth.uid())
WITH CHECK (
  tutor_id = auth.uid() 
  AND verification_id = (SELECT verification_id FROM public.tutor_verified_subject_grades WHERE id = tutor_verified_subject_grades.id)
  AND subject_name = (SELECT subject_name FROM public.tutor_verified_subject_grades WHERE id = tutor_verified_subject_grades.id)
  AND grade = (SELECT grade FROM public.tutor_verified_subject_grades WHERE id = tutor_verified_subject_grades.id)
  AND exam_type = (SELECT exam_type FROM public.tutor_verified_subject_grades WHERE id = tutor_verified_subject_grades.id)
);

CREATE POLICY "Admins can update any verified grade"
ON public.tutor_verified_subject_grades FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete verified grades"
ON public.tutor_verified_subject_grades FOR DELETE
USING (public.is_admin());

-- TABLE: sessions
-- =============================================================================

CREATE POLICY "Students can read their own sessions"
ON public.sessions FOR SELECT
USING (student_id = auth.uid());

CREATE POLICY "Tutors can read their sessions"
ON public.sessions FOR SELECT
USING (tutor_id = auth.uid());

CREATE POLICY "Parents can read children sessions"
ON public.sessions FOR SELECT
USING (public.is_my_child(student_id));

CREATE POLICY "Payers can read their paid sessions"
ON public.sessions FOR SELECT
USING (payer_id = auth.uid());

CREATE POLICY "Admins can read all sessions"
ON public.sessions FOR SELECT
USING (public.is_admin());

CREATE POLICY "Students can create their own sessions"
ON public.sessions FOR INSERT
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Parents can create sessions for children"
ON public.sessions FOR INSERT
WITH CHECK (public.is_my_child(student_id) AND payer_id = auth.uid());

CREATE POLICY "Admins can create any session"
ON public.sessions FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Tutors can update their sessions"
ON public.sessions FOR UPDATE
USING (tutor_id = auth.uid())
WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "Students can update their sessions"
ON public.sessions FOR UPDATE
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admins can update any session"
ON public.sessions FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- TABLE: ratings
-- =============================================================================

CREATE POLICY "Students can read their own ratings"
ON public.ratings FOR SELECT
USING (student_id = auth.uid());

CREATE POLICY "Tutors can read ratings about themselves"
ON public.ratings FOR SELECT
USING (tutor_id = auth.uid());

CREATE POLICY "Parents can read children ratings"
ON public.ratings FOR SELECT
USING (public.is_my_child(student_id));

CREATE POLICY "Anyone can read ratings"
ON public.ratings FOR SELECT
USING (true);

CREATE POLICY "Admins can read all ratings"
ON public.ratings FOR SELECT
USING (public.is_admin());

CREATE POLICY "Students can rate their completed sessions"
ON public.ratings FOR INSERT
WITH CHECK (
  student_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.sessions
    WHERE id = session_id
    AND student_id = auth.uid()
    AND status = 'completed'
  )
);

CREATE POLICY "Admins can insert any rating"
ON public.ratings FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Students can update their own ratings"
ON public.ratings FOR UPDATE
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admins can update any rating"
ON public.ratings FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- TABLE: payments
-- =============================================================================

CREATE POLICY "Payers can read their own payments"
ON public.payments FOR SELECT
USING (payer_id = auth.uid());

CREATE POLICY "Tutors can read their session payments"
ON public.payments FOR SELECT
USING (tutor_id = auth.uid());

CREATE POLICY "Parents can read payments for children"
ON public.payments FOR SELECT
USING (
  payer_id = auth.uid()
  OR public.is_my_child(student_id)
);

CREATE POLICY "Admins can read all payments"
ON public.payments FOR SELECT
USING (public.is_admin());

CREATE POLICY "Admins can insert payments"
ON public.payments FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update payments"
ON public.payments FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- TABLE: tutor_earnings
-- =============================================================================

CREATE POLICY "Tutors can read their own earnings"
ON public.tutor_earnings FOR SELECT
USING (tutor_id = auth.uid());

CREATE POLICY "Admins can read all earnings"
ON public.tutor_earnings FOR SELECT
USING (public.is_admin());

CREATE POLICY "Admins can insert earnings"
ON public.tutor_earnings FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update earnings"
ON public.tutor_earnings FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- TABLE: tutor_balances
-- =============================================================================

CREATE POLICY "Tutors can read their own balance"
ON public.tutor_balances FOR SELECT
USING (tutor_id = auth.uid());

CREATE POLICY "Admins can read all balances"
ON public.tutor_balances FOR SELECT
USING (public.is_admin());

CREATE POLICY "Admins can insert balances"
ON public.tutor_balances FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update balances"
ON public.tutor_balances FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- TABLE: commission_ledger
-- =============================================================================

CREATE POLICY "Admins can read commission ledger"
ON public.commission_ledger FOR SELECT
USING (public.is_admin());

CREATE POLICY "Admins can insert to commission ledger"
ON public.commission_ledger FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update commission ledger"
ON public.commission_ledger FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- TABLE: payout_requests
-- =============================================================================

CREATE POLICY "Tutors can read their own payout requests"
ON public.payout_requests FOR SELECT
USING (tutor_id = auth.uid());

CREATE POLICY "Admins can read all payout requests"
ON public.payout_requests FOR SELECT
USING (public.is_admin());

CREATE POLICY "Tutors can create their own payout requests"
ON public.payout_requests FOR INSERT
WITH CHECK (
  tutor_id = auth.uid()
  AND status = 'PENDING'
);

CREATE POLICY "Admins can create any payout request"
ON public.payout_requests FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update payout requests"
ON public.payout_requests FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Tutors can delete their pending requests"
ON public.payout_requests FOR DELETE
USING (tutor_id = auth.uid() AND status = 'PENDING');

CREATE POLICY "Admins can delete any payout request"
ON public.payout_requests FOR DELETE
USING (public.is_admin());

-- =============================================================================
-- PART 7: GRANT PERMISSIONS
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_my_child(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_child_session(uuid) TO authenticated;

-- =============================================================================
-- PART 8: FUNCTION COMMENTS
-- =============================================================================

COMMENT ON FUNCTION public.is_admin IS 'Returns true if the current user has admin role';
COMMENT ON FUNCTION public.is_my_child IS 'Returns true if the given student_id is a child of the current user (parent)';
COMMENT ON FUNCTION public.is_child_session IS 'Returns true if the given session belongs to one of the current user''s children';



-- ===== FILE: 002_storage_policies.sql =====

-- iTutor Platform - Storage Bucket Policies
-- Run this AFTER 001_complete_schema_with_rls.sql
-- This sets up file upload capabilities for tutor certificate verification

-- =============================================================================
-- STORAGE BUCKET SETUP
-- =============================================================================

-- Create the verification_docs bucket for tutor certificates
-- Public: false (files are not publicly accessible)
INSERT INTO storage.buckets (id, name, public)
VALUES ('verification_docs', 'verification_docs', false)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- STORAGE RLS POLICIES
-- =============================================================================

-- Policy: Authenticated users can upload to verification_docs
CREATE POLICY "Authenticated users can upload verification docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'verification_docs');

-- Policy: Users can view their own uploaded documents
CREATE POLICY "Users can view their own verification docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification_docs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Admins can view all verification documents
CREATE POLICY "Admins can view all verification docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification_docs'
  AND public.is_admin()
);

-- Policy: Users can delete their own documents
CREATE POLICY "Users can delete their own verification docs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'verification_docs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- =============================================================================
-- NOTES
-- =============================================================================

-- This migration creates a storage bucket for tutor certificate uploads
-- Files uploaded will follow the pattern: verification_docs/{tutor_id}/{filename}
-- 
-- Storage policies ensure:
-- 1. Any authenticated user can upload files
-- 2. Users can only view their own uploaded files
-- 3. Admins can view all files
-- 4. Users can delete their own files
--
-- The tutor verification workflow:
-- 1. Tutor uploads certificate (PDF, JPG, PNG) via frontend
-- 2. File is stored in: verification_docs/{tutor_id}/{timestamp}.{ext}
-- 3. Record created in tutor_verifications table with file URL
-- 4. Admin reviews and approves/rejects
-- 5. If approved, grades are extracted and stored in tutor_verified_subject_grades




















-- ===== FILE: 002_user_subjects_junction.sql =====

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


















-- ===== FILE: 003_create_institutions_table.sql =====

-- =====================================================
-- CREATE INSTITUTIONS TABLE
-- Stores schools, colleges, and universities
-- =====================================================

CREATE TABLE IF NOT EXISTS public.institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  institution_level text NOT NULL CHECK (institution_level IN ('primary', 'secondary', 'tertiary', 'other')),
  institution_type text CHECK (institution_type IN ('public', 'private', 'government_assisted', 'denominational')),
  country_code text NOT NULL,
  region text,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for faster searches
CREATE INDEX IF NOT EXISTS idx_institutions_name ON public.institutions(name);
CREATE INDEX IF NOT EXISTS idx_institutions_country ON public.institutions(country_code);
CREATE INDEX IF NOT EXISTS idx_institutions_level ON public.institutions(institution_level);
CREATE INDEX IF NOT EXISTS idx_institutions_active ON public.institutions(is_active) WHERE is_active = true;

-- Full text search index for institution names
CREATE INDEX IF NOT EXISTS idx_institutions_name_trgm ON public.institutions USING gin (name gin_trgm_ops);

-- Enable RLS
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access to active institutions
CREATE POLICY "Public read access to active institutions"
  ON public.institutions
  FOR SELECT
  USING (is_active = true);

-- Seed some Trinidad & Tobago secondary schools
INSERT INTO public.institutions (name, institution_level, institution_type, country_code, region, is_active) VALUES
  ('Queen''s Royal College', 'secondary', 'government_assisted', 'TT', 'Port of Spain', true),
  ('St. Joseph''s Convent, Port of Spain', 'secondary', 'denominational', 'TT', 'Port of Spain', true),
  ('Presentation College, San Fernando', 'secondary', 'denominational', 'TT', 'San Fernando', true),
  ('Naparima College', 'secondary', 'denominational', 'TT', 'San Fernando', true),
  ('Naparima Girls'' High School', 'secondary', 'denominational', 'TT', 'San Fernando', true),
  ('St. Augustine Girls'' High School', 'secondary', 'government_assisted', 'TT', 'Tunapuna', true),
  ('Fatima College', 'secondary', 'denominational', 'TT', 'Port of Spain', true),
  ('St. Mary''s College', 'secondary', 'denominational', 'TT', 'Port of Spain', true),
  ('Holy Name Convent', 'secondary', 'denominational', 'TT', 'Port of Spain', true),
  ('St. Joseph''s Convent, St. Joseph', 'secondary', 'denominational', 'TT', 'St. Joseph', true),
  ('San Fernando Boys'' R.C.', 'secondary', 'denominational', 'TT', 'San Fernando', true),
  ('Tranquility Government Secondary School', 'secondary', 'public', 'TT', 'Port of Spain', true),
  ('St. Benedict''s College', 'secondary', 'denominational', 'TT', 'La Romaine', true),
  ('Mucurapo Senior Comprehensive', 'secondary', 'public', 'TT', 'Port of Spain', true),
  ('Diego Martin North Secondary', 'secondary', 'public', 'TT', 'Diego Martin', true),
  ('Malick Secondary School', 'secondary', 'public', 'TT', 'Barataria', true),
  ('Arima North Secondary', 'secondary', 'public', 'TT', 'Arima', true),
  ('Point Fortin East Secondary', 'secondary', 'public', 'TT', 'Point Fortin', true),
  ('Princes Town Secondary', 'secondary', 'public', 'TT', 'Princes Town', true),
  ('Siparia West Secondary', 'secondary', 'public', 'TT', 'Siparia', true)
ON CONFLICT DO NOTHING;

-- Add comment
COMMENT ON TABLE public.institutions IS 'Educational institutions (schools, colleges, universities)';




-- ===== FILE: 004_add_institution_id_to_profiles.sql =====

-- =====================================================
-- ADD INSTITUTION_ID TO PROFILES
-- Links profiles to institutions table
-- =====================================================

-- Add institution_id column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS institution_id uuid 
REFERENCES public.institutions(id) 
ON DELETE SET NULL;

-- Create index for better join performance
CREATE INDEX IF NOT EXISTS idx_profiles_institution_id 
ON public.profiles(institution_id);

-- Add comment
COMMENT ON COLUMN public.profiles.institution_id IS 'Reference to the institution (school/college) the user is associated with';


















-- ===== FILE: 006_enable_extensions_and_seed_subjects.sql =====

-- =====================================================
-- ENABLE EXTENSIONS & SEED SUBJECTS
-- =====================================================

-- Enable pg_trgm extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Seed CSEC subjects (Forms 1-5)
INSERT INTO public.subjects (name, curriculum, level, code) VALUES
  -- Core CSEC subjects
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
ON CONFLICT (name, curriculum, level) DO NOTHING;

-- Seed CAPE subjects (Unit 1 & Unit 2 / Lower 6 & Upper 6)
INSERT INTO public.subjects (name, curriculum, level, code) VALUES
  -- Pure Sciences
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
  
  -- Business & Social Sciences
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
  
  -- Languages & Literature
  ('Literatures in English Unit 1', 'CAPE', 'Unit 1', 'LIT1'),
  ('Literatures in English Unit 2', 'CAPE', 'Unit 2', 'LIT2'),
  ('Spanish Unit 1', 'CAPE', 'Unit 1', 'SPAN1'),
  ('Spanish Unit 2', 'CAPE', 'Unit 2', 'SPAN2'),
  ('French Unit 1', 'CAPE', 'Unit 1', 'FREN1'),
  ('French Unit 2', 'CAPE', 'Unit 2', 'FREN2'),
  
  -- Technical & Vocational
  ('Computer Science Unit 1', 'CAPE', 'Unit 1', 'CS1'),
  ('Computer Science Unit 2', 'CAPE', 'Unit 2', 'CS2'),
  ('Communication Studies Unit 1', 'CAPE', 'Unit 1', 'COMM1'),
  ('Communication Studies Unit 2', 'CAPE', 'Unit 2', 'COMM2'),
  ('Environmental Science Unit 1', 'CAPE', 'Unit 1', 'ENVSCI1'),
  ('Environmental Science Unit 2', 'CAPE', 'Unit 2', 'ENVSCI2')
ON CONFLICT (name, curriculum, level) DO NOTHING;

COMMENT ON EXTENSION pg_trgm IS 'Extension for fuzzy text search on institution names';




-- ===== FILE: 007_add_avatar_url_to_profiles.sql =====

-- =====================================================
-- ADD AVATAR_URL TO PROFILES
-- Stores the public URL to user's profile picture
-- =====================================================

-- Add avatar_url column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS avatar_url text;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_avatar_url 
ON public.profiles(avatar_url);

-- Add comment
COMMENT ON COLUMN public.profiles.avatar_url IS 'Public URL to user profile picture stored in Supabase Storage';

















-- ===== FILE: 008_setup_avatars_storage.sql =====

-- =====================================================
-- SETUP AVATARS STORAGE BUCKET
-- Creates bucket and RLS policies for profile pictures
-- =====================================================

-- Create avatars bucket (public read access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own avatar
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own avatar
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own avatar
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to all avatars
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

















-- ===== FILE: 010_create_booking_system.sql =====

-- =====================================================
-- BOOKING SYSTEM TABLES
-- Implements request/confirm flow with tutor calendars
-- =====================================================

-- 1) TUTOR AVAILABILITY RULES (Recurring teaching hours)
CREATE TABLE IF NOT EXISTS public.tutor_availability_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    day_of_week int NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time time NOT NULL,
    end_time time NOT NULL CHECK (end_time > start_time),
    slot_minutes int NOT NULL DEFAULT 30 CHECK (slot_minutes > 0),
    buffer_minutes int NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tutor_avail_rules_tutor ON public.tutor_availability_rules(tutor_id) WHERE is_active = true;

-- 2) TUTOR UNAVAILABILITY BLOCKS (Override availability)
CREATE TABLE IF NOT EXISTS public.tutor_unavailability_blocks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL CHECK (end_at > start_at),
    is_recurring boolean NOT NULL DEFAULT false,
    rrule text, -- Optional for future recurring blocks
    reason_private text, -- Private to tutor, never shown to students
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tutor_unavail_tutor_time ON public.tutor_unavailability_blocks(tutor_id, start_at, end_at);

-- 3) SESSION TYPES (Duration/pricing templates)
CREATE TABLE IF NOT EXISTS public.session_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject_id uuid NOT NULL REFERENCES public.subjects(id),
    name text NOT NULL, -- e.g., "Standard Session", "Trial Session"
    duration_minutes int NOT NULL CHECK (duration_minutes > 0),
    price_ttd numeric(10,2) NOT NULL CHECK (price_ttd >= 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_types_tutor_subject ON public.session_types(tutor_id, subject_id) WHERE is_active = true;

-- 4) BOOKINGS (Main booking table)
CREATE TABLE IF NOT EXISTS public.bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject_id uuid NOT NULL REFERENCES public.subjects(id),
    session_type_id uuid REFERENCES public.session_types(id),
    
    -- Requested time (set by student initially)
    requested_start_at timestamptz NOT NULL,
    requested_end_at timestamptz NOT NULL CHECK (requested_end_at > requested_start_at),
    
    -- Confirmed time (set when tutor confirms)
    confirmed_start_at timestamptz,
    confirmed_end_at timestamptz CHECK (confirmed_end_at IS NULL OR confirmed_end_at > confirmed_start_at),
    
    -- Status tracking
    status text NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'COUNTER_PROPOSED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED', 'NO_SHOW')
    ),
    last_action_by text CHECK (last_action_by IN ('student', 'tutor')),
    
    -- Pricing
    price_ttd numeric(10,2) NOT NULL CHECK (price_ttd >= 0),
    
    -- Additional info
    student_notes text,
    tutor_notes text,
    
    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Critical indexes for conflict checking and inbox queries
CREATE INDEX idx_bookings_tutor_confirmed ON public.bookings(tutor_id, confirmed_start_at, confirmed_end_at) 
    WHERE status = 'CONFIRMED';
CREATE INDEX idx_bookings_tutor_requested ON public.bookings(tutor_id, requested_start_at, status);
CREATE INDEX idx_bookings_student ON public.bookings(student_id, created_at DESC);
CREATE INDEX idx_bookings_tutor_inbox ON public.bookings(tutor_id, status, created_at DESC);

-- 5) BOOKING MESSAGES (Chat + time proposals)
CREATE TABLE IF NOT EXISTS public.booking_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES public.profiles(id),
    
    message_type text NOT NULL CHECK (message_type IN ('text', 'time_proposal', 'system')),
    body text,
    
    -- For time proposals
    proposed_start_at timestamptz,
    proposed_end_at timestamptz CHECK (
        (proposed_start_at IS NULL AND proposed_end_at IS NULL) OR 
        (proposed_start_at IS NOT NULL AND proposed_end_at IS NOT NULL AND proposed_end_at > proposed_start_at)
    ),
    
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_messages_booking ON public.booking_messages(booking_id, created_at);
CREATE INDEX idx_booking_messages_sender ON public.booking_messages(sender_id);

-- 6) TUTOR RESPONSE METRICS (For displaying avg response time)
CREATE TABLE IF NOT EXISTS public.tutor_response_metrics (
    tutor_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    avg_first_response_seconds_30d int,
    total_bookings_30d int DEFAULT 0,
    total_confirmed_30d int DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tutor_avail_rules_updated_at 
    BEFORE UPDATE ON public.tutor_availability_rules 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tutor_unavail_blocks_updated_at 
    BEFORE UPDATE ON public.tutor_unavailability_blocks 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_session_types_updated_at 
    BEFORE UPDATE ON public.session_types 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at 
    BEFORE UPDATE ON public.bookings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verify tables
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
    'tutor_availability_rules', 
    'tutor_unavailability_blocks', 
    'session_types',
    'bookings', 
    'booking_messages',
    'tutor_response_metrics'
)
ORDER BY tablename;
















-- ===== FILE: 011_booking_system_rls.sql =====

-- =====================================================
-- RLS POLICIES FOR BOOKING SYSTEM
-- =====================================================

-- Enable RLS on all booking tables
ALTER TABLE public.tutor_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_unavailability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_response_metrics ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- TUTOR_AVAILABILITY_RULES
-- =====================================================

-- Tutors can manage their own rules
CREATE POLICY "Tutors can view own availability rules"
ON public.tutor_availability_rules
FOR SELECT
TO authenticated
USING (auth.uid() = tutor_id);

CREATE POLICY "Tutors can insert own availability rules"
ON public.tutor_availability_rules
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = tutor_id);

CREATE POLICY "Tutors can update own availability rules"
ON public.tutor_availability_rules
FOR UPDATE
TO authenticated
USING (auth.uid() = tutor_id)
WITH CHECK (auth.uid() = tutor_id);

CREATE POLICY "Tutors can delete own availability rules"
ON public.tutor_availability_rules
FOR DELETE
TO authenticated
USING (auth.uid() = tutor_id);

-- Students cannot read raw rules (they use public calendar RPC instead)

-- =====================================================
-- TUTOR_UNAVAILABILITY_BLOCKS
-- =====================================================

-- Tutors can manage their own unavailability blocks
CREATE POLICY "Tutors can view own unavailability blocks"
ON public.tutor_unavailability_blocks
FOR SELECT
TO authenticated
USING (auth.uid() = tutor_id);

CREATE POLICY "Tutors can insert own unavailability blocks"
ON public.tutor_unavailability_blocks
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = tutor_id);

CREATE POLICY "Tutors can update own unavailability blocks"
ON public.tutor_unavailability_blocks
FOR UPDATE
TO authenticated
USING (auth.uid() = tutor_id)
WITH CHECK (auth.uid() = tutor_id);

CREATE POLICY "Tutors can delete own unavailability blocks"
ON public.tutor_unavailability_blocks
FOR DELETE
TO authenticated
USING (auth.uid() = tutor_id);

-- Students cannot read blocks with private reasons (they use public calendar RPC)

-- =====================================================
-- SESSION_TYPES
-- =====================================================

-- Tutors can manage their session types
CREATE POLICY "Tutors can manage own session types"
ON public.session_types
FOR ALL
TO authenticated
USING (auth.uid() = tutor_id)
WITH CHECK (auth.uid() = tutor_id);

-- Students can view active session types for browsing/booking
CREATE POLICY "Students can view active session types"
ON public.session_types
FOR SELECT
TO authenticated
USING (is_active = true);

-- =====================================================
-- BOOKINGS
-- =====================================================

-- Students can view their own bookings
CREATE POLICY "Students can view own bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

-- Tutors can view bookings for them
CREATE POLICY "Tutors can view their bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (auth.uid() = tutor_id);

-- Students can create bookings (requests)
CREATE POLICY "Students can create booking requests"
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id);

-- Students can update their own bookings (cancel)
CREATE POLICY "Students can update own bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (auth.uid() = student_id)
WITH CHECK (auth.uid() = student_id);

-- Tutors can update their bookings (confirm, decline, etc.)
CREATE POLICY "Tutors can update their bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (auth.uid() = tutor_id)
WITH CHECK (auth.uid() = tutor_id);

-- =====================================================
-- BOOKING_MESSAGES
-- =====================================================

-- Participants can view messages for their bookings
CREATE POLICY "Participants can view booking messages"
ON public.booking_messages
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.bookings
        WHERE bookings.id = booking_messages.booking_id
        AND (bookings.student_id = auth.uid() OR bookings.tutor_id = auth.uid())
    )
);

-- Participants can send messages
CREATE POLICY "Participants can send booking messages"
ON public.booking_messages
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
        SELECT 1 FROM public.bookings
        WHERE bookings.id = booking_messages.booking_id
        AND (bookings.student_id = auth.uid() OR bookings.tutor_id = auth.uid())
    )
);

-- =====================================================
-- TUTOR_RESPONSE_METRICS
-- =====================================================

-- Anyone can view metrics (for displaying on tutor profiles)
CREATE POLICY "Anyone can view tutor metrics"
ON public.tutor_response_metrics
FOR SELECT
TO authenticated
USING (true);

-- Only system/admins should update metrics (via functions)
-- For now, allow tutors to view their own
CREATE POLICY "Tutors can view own metrics"
ON public.tutor_response_metrics
FOR SELECT
TO authenticated
USING (auth.uid() = tutor_id);

-- Verify policies
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN (
    'tutor_availability_rules',
    'tutor_unavailability_blocks',
    'session_types',
    'bookings',
    'booking_messages',
    'tutor_response_metrics'
)
ORDER BY tablename, policyname;
















-- ===== FILE: 012_booking_functions.sql =====

-- =====================================================
-- BOOKING SYSTEM FUNCTIONS
-- Core logic for availability and booking actions
-- =====================================================

-- HELPER: Check if a time range overlaps with another
CREATE OR REPLACE FUNCTION time_ranges_overlap(
    start1 timestamptz,
    end1 timestamptz,
    start2 timestamptz,
    end2 timestamptz
) RETURNS boolean AS $$
BEGIN
    RETURN start1 < end2 AND end1 > start2;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- 1) GET TUTOR PUBLIC CALENDAR
-- Returns available slots and busy blocks (no private reasons)
-- =====================================================
CREATE OR REPLACE FUNCTION get_tutor_public_calendar(
    p_tutor_id uuid,
    p_range_start timestamptz,
    p_range_end timestamptz
) RETURNS jsonb AS $$
DECLARE
    v_result jsonb;
    v_available_slots jsonb DEFAULT '[]'::jsonb;
    v_busy_blocks jsonb DEFAULT '[]'::jsonb;
BEGIN
    -- Enforce range limit (max 30 days)
    IF p_range_end > p_range_start + interval '30 days' THEN
        p_range_end := p_range_start + interval '30 days';
    END IF;

    -- Build available slots from availability rules
    -- For MVP: generate all slots, then filter out busy ones
    WITH RECURSIVE date_series AS (
        SELECT p_range_start::date as day
        UNION ALL
        SELECT (day + interval '1 day')::date
        FROM date_series
        WHERE day < p_range_end::date
    ),
    availability_windows AS (
        SELECT 
            (ds.day + ar.start_time)::timestamptz as window_start,
            (ds.day + ar.end_time)::timestamptz as window_end,
            ar.slot_minutes,
            ar.buffer_minutes
        FROM date_series ds
        CROSS JOIN public.tutor_availability_rules ar
        WHERE ar.tutor_id = p_tutor_id
        AND ar.is_active = true
        AND EXTRACT(DOW FROM ds.day) = ar.day_of_week
        AND (ds.day + ar.start_time)::timestamptz >= p_range_start
        AND (ds.day + ar.end_time)::timestamptz <= p_range_end
    ),
    generated_slots AS (
        SELECT 
            window_start + (n * (slot_minutes + buffer_minutes) * interval '1 minute') as slot_start,
            window_start + (n * (slot_minutes + buffer_minutes) * interval '1 minute') + (slot_minutes * interval '1 minute') as slot_end
        FROM availability_windows,
        LATERAL generate_series(
            0,
            FLOOR(EXTRACT(EPOCH FROM (window_end - window_start)) / 60 / (slot_minutes + buffer_minutes))::int - 1
        ) as n
    ),
    -- Get all busy periods (confirmed bookings + unavailability blocks)
    busy_periods AS (
        -- Confirmed bookings
        SELECT confirmed_start_at as busy_start, confirmed_end_at as busy_end, 'BOOKED' as busy_type
        FROM public.bookings
        WHERE tutor_id = p_tutor_id
        AND status = 'CONFIRMED'
        AND confirmed_start_at IS NOT NULL
        AND confirmed_end_at IS NOT NULL
        AND time_ranges_overlap(confirmed_start_at, confirmed_end_at, p_range_start, p_range_end)
        
        UNION ALL
        
        -- Unavailability blocks
        SELECT start_at as busy_start, end_at as busy_end, 'UNAVAILABLE' as busy_type
        FROM public.tutor_unavailability_blocks
        WHERE tutor_id = p_tutor_id
        AND time_ranges_overlap(start_at, end_at, p_range_start, p_range_end)
    ),
    -- Filter available slots (exclude those overlapping with busy periods)
    available AS (
        SELECT gs.slot_start, gs.slot_end
        FROM generated_slots gs
        WHERE NOT EXISTS (
            SELECT 1 FROM busy_periods bp
            WHERE time_ranges_overlap(gs.slot_start, gs.slot_end, bp.busy_start, bp.busy_end)
        )
        AND gs.slot_start >= now() + interval '1 hour' -- Min 1 hour notice
    )
    SELECT jsonb_agg(
        jsonb_build_object('start_at', slot_start, 'end_at', slot_end)
        ORDER BY slot_start
    ) INTO v_available_slots
    FROM available;

    -- Build busy blocks (merge adjacent/overlapping periods)
    WITH busy_periods AS (
        SELECT confirmed_start_at as busy_start, confirmed_end_at as busy_end, 'BOOKED' as busy_type
        FROM public.bookings
        WHERE tutor_id = p_tutor_id
        AND status = 'CONFIRMED'
        AND confirmed_start_at IS NOT NULL
        AND time_ranges_overlap(confirmed_start_at, confirmed_end_at, p_range_start, p_range_end)
        
        UNION ALL
        
        SELECT start_at, end_at, 'UNAVAILABLE' as busy_type
        FROM public.tutor_unavailability_blocks
        WHERE tutor_id = p_tutor_id
        AND time_ranges_overlap(start_at, end_at, p_range_start, p_range_end)
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', busy_start,
            'end_at', busy_end,
            'type', busy_type
        )
        ORDER BY busy_start
    ) INTO v_busy_blocks
    FROM busy_periods;

    -- Return combined result
    v_result := jsonb_build_object(
        'available_slots', COALESCE(v_available_slots, '[]'::jsonb),
        'busy_blocks', COALESCE(v_busy_blocks, '[]'::jsonb)
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_tutor_public_calendar TO authenticated;

-- =====================================================
-- 2) CREATE BOOKING REQUEST
-- Students create a booking request
-- =====================================================
CREATE OR REPLACE FUNCTION create_booking_request(
    p_student_id uuid,
    p_tutor_id uuid,
    p_subject_id uuid,
    p_session_type_id uuid,
    p_requested_start_at timestamptz,
    p_requested_end_at timestamptz,
    p_student_notes text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_booking_id uuid;
    v_price_ttd numeric;
    v_is_available boolean;
    v_calendar jsonb;
BEGIN
    -- Validate requester is the student
    IF auth.uid() != p_student_id THEN
        RAISE EXCEPTION 'Unauthorized: You can only create bookings for yourself';
    END IF;

    -- Get price from session type
    SELECT price_ttd INTO v_price_ttd
    FROM public.session_types
    WHERE id = p_session_type_id
    AND tutor_id = p_tutor_id
    AND is_active = true;

    IF v_price_ttd IS NULL THEN
        RAISE EXCEPTION 'Invalid session type';
    END IF;

    -- Check if requested slot is available
    v_calendar := get_tutor_public_calendar(p_tutor_id, p_requested_start_at, p_requested_end_at);
    
    -- Simple check: ensure slot doesn't overlap with busy blocks
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_calendar->'busy_blocks') as bb
        WHERE time_ranges_overlap(
            p_requested_start_at, 
            p_requested_end_at,
            (bb->>'start_at')::timestamptz,
            (bb->>'end_at')::timestamptz
        )
    ) THEN
        RAISE EXCEPTION 'Requested time slot is not available';
    END IF;

    -- Insert booking
    INSERT INTO public.bookings (
        student_id,
        tutor_id,
        subject_id,
        session_type_id,
        requested_start_at,
        requested_end_at,
        status,
        last_action_by,
        price_ttd,
        student_notes
    ) VALUES (
        p_student_id,
        p_tutor_id,
        p_subject_id,
        p_session_type_id,
        p_requested_start_at,
        p_requested_end_at,
        'PENDING',
        'student',
        v_price_ttd,
        p_student_notes
    ) RETURNING id INTO v_booking_id;

    -- Add system message
    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (v_booking_id, p_student_id, 'system', 'Booking request created');

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_booking_request TO authenticated;

-- =====================================================
-- 3) TUTOR CONFIRM BOOKING
-- Tutor confirms a booking request
-- =====================================================
CREATE OR REPLACE FUNCTION tutor_confirm_booking(
    p_booking_id uuid
) RETURNS jsonb AS $$
DECLARE
    v_booking record;
BEGIN
    -- Get booking details
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    AND tutor_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found or unauthorized';
    END IF;

    IF v_booking.status != 'PENDING' AND v_booking.status != 'COUNTER_PROPOSED' THEN
        RAISE EXCEPTION 'Booking cannot be confirmed in current status: %', v_booking.status;
    END IF;

    -- Atomic conflict check: ensure no confirmed booking overlaps
    IF EXISTS (
        SELECT 1 FROM public.bookings
        WHERE tutor_id = v_booking.tutor_id
        AND status = 'CONFIRMED'
        AND id != p_booking_id
        AND time_ranges_overlap(
            confirmed_start_at,
            confirmed_end_at,
            v_booking.requested_start_at,
            v_booking.requested_end_at
        )
    ) THEN
        RAISE EXCEPTION 'Time slot is no longer available due to another confirmed booking';
    END IF;

    -- Check unavailability blocks
    IF EXISTS (
        SELECT 1 FROM public.tutor_unavailability_blocks
        WHERE tutor_id = v_booking.tutor_id
        AND time_ranges_overlap(
            start_at,
            end_at,
            v_booking.requested_start_at,
            v_booking.requested_end_at
        )
    ) THEN
        RAISE EXCEPTION 'Time slot conflicts with your unavailability block';
    END IF;

    -- Update booking to confirmed
    UPDATE public.bookings
    SET 
        status = 'CONFIRMED',
        confirmed_start_at = requested_start_at,
        confirmed_end_at = requested_end_at,
        last_action_by = 'tutor'
    WHERE id = p_booking_id;

    -- Add system message
    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (p_booking_id, auth.uid(), 'system', 'Booking confirmed by tutor');

    RETURN jsonb_build_object('success', true, 'status', 'CONFIRMED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION tutor_confirm_booking TO authenticated;

-- =====================================================
-- 4) TUTOR DECLINE BOOKING
-- =====================================================
CREATE OR REPLACE FUNCTION tutor_decline_booking(
    p_booking_id uuid,
    p_message text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_tutor_id uuid;
BEGIN
    -- Verify tutor owns this booking
    SELECT tutor_id INTO v_tutor_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_tutor_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Update status
    UPDATE public.bookings
    SET 
        status = 'DECLINED',
        last_action_by = 'tutor'
    WHERE id = p_booking_id;

    -- Add message if provided
    IF p_message IS NOT NULL THEN
        INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
        VALUES (p_booking_id, auth.uid(), 'text', p_message);
    END IF;

    -- Add system message
    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (p_booking_id, auth.uid(), 'system', 'Booking declined by tutor');

    RETURN jsonb_build_object('success', true, 'status', 'DECLINED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION tutor_decline_booking TO authenticated;

-- Verify functions
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%booking%'
ORDER BY routine_name;
















-- ===== FILE: 013_booking_functions_continued.sql =====

-- =====================================================
-- BOOKING FUNCTIONS (CONTINUED)
-- Counter-offers and student actions
-- =====================================================

-- =====================================================
-- 5) TUTOR COUNTER OFFER
-- Tutor proposes alternative time
-- =====================================================
CREATE OR REPLACE FUNCTION tutor_counter_offer(
    p_booking_id uuid,
    p_proposed_start_at timestamptz,
    p_proposed_end_at timestamptz,
    p_message text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_booking record;
    v_message_id uuid;
BEGIN
    -- Get booking details
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    AND tutor_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found or unauthorized';
    END IF;

    -- Validate proposed time is available using calendar
    IF EXISTS (
        SELECT 1 FROM public.bookings
        WHERE tutor_id = v_booking.tutor_id
        AND status = 'CONFIRMED'
        AND id != p_booking_id
        AND time_ranges_overlap(
            confirmed_start_at,
            confirmed_end_at,
            p_proposed_start_at,
            p_proposed_end_at
        )
    ) THEN
        RAISE EXCEPTION 'Proposed time slot is not available';
    END IF;

    -- Insert time proposal message
    INSERT INTO public.booking_messages (
        booking_id,
        sender_id,
        message_type,
        body,
        proposed_start_at,
        proposed_end_at
    ) VALUES (
        p_booking_id,
        auth.uid(),
        'time_proposal',
        COALESCE(p_message, 'Alternative time proposed'),
        p_proposed_start_at,
        p_proposed_end_at
    ) RETURNING id INTO v_message_id;

    -- Update booking status
    UPDATE public.bookings
    SET 
        status = 'COUNTER_PROPOSED',
        last_action_by = 'tutor'
    WHERE id = p_booking_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'COUNTER_PROPOSED',
        'message_id', v_message_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION tutor_counter_offer TO authenticated;

-- =====================================================
-- 6) STUDENT ACCEPT COUNTER OFFER
-- Student accepts tutor's proposed time (auto-confirms)
-- =====================================================
CREATE OR REPLACE FUNCTION student_accept_counter(
    p_booking_id uuid,
    p_message_id uuid
) RETURNS jsonb AS $$
DECLARE
    v_booking record;
    v_proposal record;
BEGIN
    -- Get booking details
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    AND student_id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found or unauthorized';
    END IF;

    -- Get proposed time from message
    SELECT * INTO v_proposal
    FROM public.booking_messages
    WHERE id = p_message_id
    AND booking_id = p_booking_id
    AND message_type = 'time_proposal';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Time proposal not found';
    END IF;

    -- Atomic conflict check for proposed time
    IF EXISTS (
        SELECT 1 FROM public.bookings
        WHERE tutor_id = v_booking.tutor_id
        AND status = 'CONFIRMED'
        AND id != p_booking_id
        AND time_ranges_overlap(
            confirmed_start_at,
            confirmed_end_at,
            v_proposal.proposed_start_at,
            v_proposal.proposed_end_at
        )
    ) THEN
        RAISE EXCEPTION 'Proposed time slot is no longer available';
    END IF;

    -- Since tutor proposed, accepting auto-confirms
    UPDATE public.bookings
    SET 
        status = 'CONFIRMED',
        requested_start_at = v_proposal.proposed_start_at,
        requested_end_at = v_proposal.proposed_end_at,
        confirmed_start_at = v_proposal.proposed_start_at,
        confirmed_end_at = v_proposal.proposed_end_at,
        last_action_by = 'student'
    WHERE id = p_booking_id;

    -- Add system message
    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (p_booking_id, auth.uid(), 'system', 'Student accepted counter-offer. Booking confirmed.');

    RETURN jsonb_build_object('success', true, 'status', 'CONFIRMED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION student_accept_counter TO authenticated;

-- =====================================================
-- 7) STUDENT CANCEL BOOKING
-- =====================================================
CREATE OR REPLACE FUNCTION student_cancel_booking(
    p_booking_id uuid,
    p_reason text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_student_id uuid;
BEGIN
    -- Verify student owns this booking
    SELECT student_id INTO v_student_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_student_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Update booking status
    UPDATE public.bookings
    SET 
        status = 'CANCELLED',
        last_action_by = 'student'
    WHERE id = p_booking_id;

    -- Update session status if a session exists for this booking
    UPDATE public.sessions
    SET 
        status = 'CANCELLED',
        updated_at = NOW()
    WHERE booking_id = p_booking_id;

    -- Add message if provided
    IF p_reason IS NOT NULL THEN
        INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
        VALUES (p_booking_id, auth.uid(), 'text', p_reason);
    END IF;

    -- Add system message
    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (p_booking_id, auth.uid(), 'system', 'Booking cancelled by student');

    RETURN jsonb_build_object('success', true, 'status', 'CANCELLED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION student_cancel_booking TO authenticated;

-- =====================================================
-- 8) ADD BOOKING MESSAGE
-- Either party can send text messages
-- =====================================================
CREATE OR REPLACE FUNCTION add_booking_message(
    p_booking_id uuid,
    p_message text
) RETURNS jsonb AS $$
DECLARE
    v_message_id uuid;
    v_is_participant boolean;
BEGIN
    -- Verify sender is a participant
    SELECT EXISTS (
        SELECT 1 FROM public.bookings
        WHERE id = p_booking_id
        AND (student_id = auth.uid() OR tutor_id = auth.uid())
    ) INTO v_is_participant;

    IF NOT v_is_participant THEN
        RAISE EXCEPTION 'Unauthorized: You are not a participant in this booking';
    END IF;

    -- Insert message
    INSERT INTO public.booking_messages (
        booking_id,
        sender_id,
        message_type,
        body
    ) VALUES (
        p_booking_id,
        auth.uid(),
        'text',
        p_message
    ) RETURNING id INTO v_message_id;

    RETURN jsonb_build_object('success', true, 'message_id', v_message_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION add_booking_message TO authenticated;

-- =====================================================
-- 9) GET TUTOR AVAILABILITY SUMMARY
-- Returns basic availability info for tutor profile display
-- =====================================================
CREATE OR REPLACE FUNCTION get_tutor_availability_summary(
    p_tutor_id uuid
) RETURNS jsonb AS $$
DECLARE
    v_has_availability boolean;
    v_earliest_available timestamptz;
    v_days_with_hours jsonb;
BEGIN
    -- Check if tutor has any active availability rules
    SELECT EXISTS (
        SELECT 1 FROM public.tutor_availability_rules
        WHERE tutor_id = p_tutor_id AND is_active = true
    ) INTO v_has_availability;

    -- Get days of week with availability
    SELECT jsonb_agg(DISTINCT day_of_week ORDER BY day_of_week)
    INTO v_days_with_hours
    FROM public.tutor_availability_rules
    WHERE tutor_id = p_tutor_id AND is_active = true;

    -- Find earliest available slot in next 14 days
    WITH calendar AS (
        SELECT get_tutor_public_calendar(
            p_tutor_id,
            now(),
            now() + interval '14 days'
        ) as cal
    )
    SELECT MIN((slot->>'start_at')::timestamptz)
    INTO v_earliest_available
    FROM calendar,
    LATERAL jsonb_array_elements(cal->'available_slots') as slot;

    RETURN jsonb_build_object(
        'has_availability', v_has_availability,
        'days_with_hours', COALESCE(v_days_with_hours, '[]'::jsonb),
        'earliest_available', v_earliest_available
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_tutor_availability_summary TO authenticated;

-- =====================================================
-- 10) UPDATE TUTOR RESPONSE METRICS
-- Recalculate metrics for a tutor (called after tutor actions)
-- =====================================================
CREATE OR REPLACE FUNCTION update_tutor_response_metrics(
    p_tutor_id uuid
) RETURNS jsonb AS $$
DECLARE
    v_avg_response_seconds int;
    v_total_bookings int;
    v_total_confirmed int;
BEGIN
    -- Calculate average first response time (time from booking creation to first tutor action)
    WITH first_responses AS (
        SELECT 
            b.id,
            b.created_at as request_time,
            MIN(b.updated_at) FILTER (WHERE b.last_action_by = 'tutor') as first_response_time
        FROM public.bookings b
        WHERE b.tutor_id = p_tutor_id
        AND b.created_at >= now() - interval '30 days'
        AND b.last_action_by = 'tutor'
        GROUP BY b.id, b.created_at
    )
    SELECT 
        AVG(EXTRACT(EPOCH FROM (first_response_time - request_time)))::int,
        COUNT(*),
        COUNT(*) FILTER (WHERE first_response_time IS NOT NULL)
    INTO v_avg_response_seconds, v_total_bookings, v_total_confirmed
    FROM first_responses
    WHERE first_response_time IS NOT NULL;

    -- Upsert metrics
    INSERT INTO public.tutor_response_metrics (
        tutor_id,
        avg_first_response_seconds_30d,
        total_bookings_30d,
        total_confirmed_30d,
        updated_at
    ) VALUES (
        p_tutor_id,
        v_avg_response_seconds,
        v_total_bookings,
        v_total_confirmed,
        now()
    )
    ON CONFLICT (tutor_id)
    DO UPDATE SET
        avg_first_response_seconds_30d = v_avg_response_seconds,
        total_bookings_30d = v_total_bookings,
        total_confirmed_30d = v_total_confirmed,
        updated_at = now();

    RETURN jsonb_build_object(
        'success', true,
        'avg_response_seconds', v_avg_response_seconds
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_tutor_response_metrics TO authenticated;

-- Verify all functions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN (
    'get_tutor_public_calendar',
    'create_booking_request',
    'tutor_confirm_booking',
    'tutor_decline_booking',
    'tutor_counter_offer',
    'student_accept_counter',
    'student_cancel_booking',
    'add_booking_message',
    'get_tutor_availability_summary',
    'update_tutor_response_metrics'
)
ORDER BY routine_name;
















-- ===== FILE: 014_fix_availability_constraints.sql =====

-- =====================================================
-- FIX AVAILABILITY CONSTRAINTS
-- Remove midnight-spanning constraint and ensure proper validation
-- =====================================================

-- 1) Remove the check constraint that prevents overnight sessions
ALTER TABLE public.tutor_availability_rules
DROP CONSTRAINT IF EXISTS tutor_availability_rules_end_time_check;

-- Note: We no longer enforce end_time > start_time at the database level
-- because tutors may want to teach overnight (e.g., 10:45 PM to 5:00 AM)
-- The application logic should handle this properly by treating such sessions
-- as spanning two calendar days.

-- 2) Verify the tables are set up correctly
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.tutor_availability_rules'::regclass
AND conname LIKE '%check%';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Availability constraints updated successfully. Overnight sessions are now allowed.';
END
$$;
















-- ===== FILE: 015_notifications_and_messages.sql =====

-- =====================================================
-- NOTIFICATIONS AND MESSAGING SYSTEM
-- Real-time notifications + inbox for tutors & students
-- =====================================================

-- 1) NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN (
        'booking_request',
        'booking_accepted',
        'booking_declined',
        'booking_counter_offer',
        'booking_cancelled',
        'new_message'
    )),
    title text NOT NULL,
    message text NOT NULL,
    link text, -- URL to navigate to
    related_booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
    related_message_id uuid REFERENCES public.booking_messages(id) ON DELETE CASCADE,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own notifications
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- System can insert notifications (via triggers/functions)
CREATE POLICY "System can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 2) CONVERSATIONS TABLE (for direct messaging)
CREATE TABLE IF NOT EXISTS public.conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_1_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    participant_2_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_message_at timestamptz,
    last_message_preview text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    -- Ensure unique conversation between two users
    CONSTRAINT unique_conversation UNIQUE (participant_1_id, participant_2_id),
    -- Ensure participants are different
    CONSTRAINT different_participants CHECK (participant_1_id != participant_2_id)
);

CREATE INDEX idx_conversations_participant1 ON public.conversations(participant_1_id, last_message_at DESC);
CREATE INDEX idx_conversations_participant2 ON public.conversations(participant_2_id, last_message_at DESC);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can see conversations they're part of
CREATE POLICY "Users can view their conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

CREATE POLICY "Users can create conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

CREATE POLICY "Users can update their conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

-- 3) DIRECT MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content text NOT NULL,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can see messages in their conversations
CREATE POLICY "Users can view messages in their conversations"
ON public.messages
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.conversations
        WHERE id = conversation_id
        AND (participant_1_id = auth.uid() OR participant_2_id = auth.uid())
    )
);

CREATE POLICY "Users can send messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.conversations
        WHERE id = conversation_id
        AND (participant_1_id = auth.uid() OR participant_2_id = auth.uid())
    )
);

-- 4) TRIGGER: Update conversation on new message
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.conversations
    SET 
        last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.content, 100),
        updated_at = now()
    WHERE id = NEW.conversation_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_conversation_on_message
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_on_message();

-- 5) TRIGGER: Create notification on new booking request
CREATE OR REPLACE FUNCTION notify_on_booking_request()
RETURNS TRIGGER AS $$
DECLARE
    v_student_name text;
    v_subject_name text;
BEGIN
    -- Only for new PENDING bookings
    IF NEW.status = 'PENDING' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        -- Get student name
        SELECT COALESCE(display_name, username, full_name) INTO v_student_name
        FROM public.profiles WHERE id = NEW.student_id;
        
        -- Get subject name
        SELECT COALESCE(label, name) INTO v_subject_name
        FROM public.subjects WHERE id = NEW.subject_id;
        
        -- Create notification for tutor
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            message,
            link,
            related_booking_id
        ) VALUES (
            NEW.tutor_id,
            'booking_request',
            'New Booking Request',
            v_student_name || ' wants to book a ' || v_subject_name || ' session',
            '/tutor/bookings/' || NEW.id,
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_on_booking_request
    AFTER INSERT OR UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_booking_request();

-- 6) TRIGGER: Create notification on booking status change
CREATE OR REPLACE FUNCTION notify_on_booking_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_tutor_name text;
    v_subject_name text;
    v_notif_type text;
    v_notif_title text;
    v_notif_message text;
BEGIN
    -- Only notify on status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Get tutor name
        SELECT COALESCE(display_name, username, full_name) INTO v_tutor_name
        FROM public.profiles WHERE id = NEW.tutor_id;
        
        -- Get subject name
        SELECT COALESCE(label, name) INTO v_subject_name
        FROM public.subjects WHERE id = NEW.subject_id;
        
        -- Determine notification type and message
        CASE NEW.status
            WHEN 'CONFIRMED' THEN
                v_notif_type := 'booking_accepted';
                v_notif_title := 'Booking Accepted! âœ…';
                v_notif_message := v_tutor_name || ' accepted your ' || v_subject_name || ' session';
            WHEN 'DECLINED' THEN
                v_notif_type := 'booking_declined';
                v_notif_title := 'Booking Declined';
                v_notif_message := v_tutor_name || ' declined your ' || v_subject_name || ' session';
            WHEN 'COUNTER_PROPOSED' THEN
                v_notif_type := 'booking_counter_offer';
                v_notif_title := 'New Time Proposed';
                v_notif_message := v_tutor_name || ' proposed a different time for your ' || v_subject_name || ' session';
            WHEN 'CANCELLED' THEN
                v_notif_type := 'booking_cancelled';
                v_notif_title := 'Booking Cancelled';
                v_notif_message := 'Your ' || v_subject_name || ' session was cancelled';
            ELSE
                RETURN NEW; -- Don't notify for other statuses
        END CASE;
        
        -- Create notification for student
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            message,
            link,
            related_booking_id
        ) VALUES (
            NEW.student_id,
            v_notif_type,
            v_notif_title,
            v_notif_message,
            '/student/bookings/' || NEW.id,
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_on_booking_status_change
    AFTER UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_booking_status_change();

-- 7) TRIGGER: Create notification on new booking message
CREATE OR REPLACE FUNCTION notify_on_booking_message()
RETURNS TRIGGER AS $$
DECLARE
    v_booking record;
    v_recipient_id uuid;
    v_sender_name text;
    v_is_tutor boolean;
BEGIN
    -- Get booking info
    SELECT * INTO v_booking
    FROM public.bookings WHERE id = NEW.booking_id;
    
    -- Determine recipient (the person who DIDN'T send the message)
    IF NEW.sender_id = v_booking.student_id THEN
        v_recipient_id := v_booking.tutor_id;
        v_is_tutor := true;
    ELSE
        v_recipient_id := v_booking.student_id;
        v_is_tutor := false;
    END IF;
    
    -- Get sender name
    SELECT COALESCE(display_name, username, full_name) INTO v_sender_name
    FROM public.profiles WHERE id = NEW.sender_id;
    
    -- Create notification for recipient
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        link,
        related_booking_id,
        related_message_id
    ) VALUES (
        v_recipient_id,
        'new_message',
        'New Message',
        v_sender_name || ': ' || LEFT(COALESCE(NEW.body, 'Sent a time proposal'), 50),
        CASE 
            WHEN v_is_tutor THEN '/tutor/bookings/' || NEW.booking_id
            ELSE '/student/bookings/' || NEW.booking_id
        END,
        NEW.booking_id,
        NEW.id
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_on_booking_message
    AFTER INSERT ON public.booking_messages
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_booking_message();

-- 8) Trigger for conversations updated_at
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Verify tables created
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('notifications', 'conversations', 'messages')
ORDER BY tablename;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  NOTIFICATIONS & MESSAGING COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'âœ“ Notifications table created';
    RAISE NOTICE 'âœ“ Conversations table created';
    RAISE NOTICE 'âœ“ Messages table created';
    RAISE NOTICE 'âœ“ Real-time triggers installed';
    RAISE NOTICE 'âœ“ RLS policies configured';
    RAISE NOTICE '';
    RAISE NOTICE 'Features enabled:';
    RAISE NOTICE '- Booking request notifications';
    RAISE NOTICE '- Status change notifications';
    RAISE NOTICE '- Message notifications';
    RAISE NOTICE '- Direct messaging inbox';
    RAISE NOTICE '';
END $$;
















-- ===== FILE: 016_lesson_offers_system.sql =====

-- =====================================================
-- LESSON OFFERS SYSTEM
-- =====================================================
-- Allows tutors to send lesson offers to students
-- Students can accept, decline, or counter-offer

-- 1. Create lesson_offers table
CREATE TABLE IF NOT EXISTS public.lesson_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tutor_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  proposed_start TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'countered', 'expired')),
  counter_proposed_start TIMESTAMPTZ,
  counter_duration_minutes INTEGER,
  counter_note TEXT,
  last_action_by TEXT CHECK (last_action_by IN ('tutor', 'student')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_duration CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  CONSTRAINT valid_counter_duration CHECK (counter_duration_minutes IS NULL OR (counter_duration_minutes > 0 AND counter_duration_minutes <= 480))
);

-- 2. Create indexes for performance
CREATE INDEX idx_lesson_offers_tutor ON public.lesson_offers(tutor_user_id, status);
CREATE INDEX idx_lesson_offers_student ON public.lesson_offers(student_user_id, status);
CREATE INDEX idx_lesson_offers_status ON public.lesson_offers(status);
CREATE INDEX idx_lesson_offers_created ON public.lesson_offers(created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.lesson_offers ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies if any
DROP POLICY IF EXISTS "Tutors can view their sent offers" ON public.lesson_offers;
DROP POLICY IF EXISTS "Students can view their received offers" ON public.lesson_offers;
DROP POLICY IF EXISTS "Tutors can create offers" ON public.lesson_offers;
DROP POLICY IF EXISTS "Tutors can update their sent offers" ON public.lesson_offers;
DROP POLICY IF EXISTS "Students can update their received offers" ON public.lesson_offers;
DROP POLICY IF EXISTS "Users can delete their own offers" ON public.lesson_offers;

-- 5. Create RLS policies

-- Tutors can view offers they sent
CREATE POLICY "Tutors can view their sent offers"
ON public.lesson_offers FOR SELECT
TO authenticated
USING (
  tutor_user_id = auth.uid()
);

-- Students can view offers they received
CREATE POLICY "Students can view their received offers"
ON public.lesson_offers FOR SELECT
TO authenticated
USING (
  student_user_id = auth.uid()
);

-- Tutors can create offers (must be a tutor role)
CREATE POLICY "Tutors can create offers"
ON public.lesson_offers FOR INSERT
TO authenticated
WITH CHECK (
  tutor_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'tutor'
  )
);

-- Tutors can update their sent offers (only for counter-offer responses)
CREATE POLICY "Tutors can update their sent offers"
ON public.lesson_offers FOR UPDATE
TO authenticated
USING (
  tutor_user_id = auth.uid()
)
WITH CHECK (
  tutor_user_id = auth.uid()
);

-- Students can update offers they received (to accept/decline/counter)
CREATE POLICY "Students can update their received offers"
ON public.lesson_offers FOR UPDATE
TO authenticated
USING (
  student_user_id = auth.uid()
)
WITH CHECK (
  student_user_id = auth.uid()
);

-- Users can delete offers they're involved in (before acceptance)
CREATE POLICY "Users can delete their own offers"
ON public.lesson_offers FOR DELETE
TO authenticated
USING (
  (tutor_user_id = auth.uid() OR student_user_id = auth.uid())
  AND status IN ('pending', 'countered')
);

-- 6. Create updated_at trigger
CREATE OR REPLACE FUNCTION update_lesson_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_lesson_offers_updated_at
BEFORE UPDATE ON public.lesson_offers
FOR EACH ROW
EXECUTE FUNCTION update_lesson_offers_updated_at();

-- 7. Create notification trigger for new offers
CREATE OR REPLACE FUNCTION notify_new_lesson_offer()
RETURNS TRIGGER AS $$
BEGIN
  -- Create notification for student
  INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
  VALUES (
    NEW.student_user_id,
    'lesson_offer_received',
    'New Lesson Offer',
    'You have received a new lesson offer',
    '/student/offers',
    jsonb_build_object(
      'offer_id', NEW.id,
      'tutor_id', NEW.tutor_user_id,
      'subject', NEW.subject,
      'proposed_start', NEW.proposed_start
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_lesson_offer_created
AFTER INSERT ON public.lesson_offers
FOR EACH ROW
EXECUTE FUNCTION notify_new_lesson_offer();

-- 8. Create notification trigger for offer status changes
CREATE OR REPLACE FUNCTION notify_lesson_offer_status_change()
RETURNS TRIGGER AS $$
DECLARE
  notify_user_id UUID;
  notification_type TEXT;
  notification_title TEXT;
  notification_message TEXT;
BEGIN
  -- Only notify on status change
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Determine who to notify and what to say
  IF NEW.status = 'accepted' THEN
    notify_user_id := NEW.tutor_user_id;
    notification_type := 'lesson_offer_accepted';
    notification_title := 'Offer Accepted!';
    notification_message := 'Your lesson offer has been accepted';
  ELSIF NEW.status = 'declined' THEN
    notify_user_id := NEW.tutor_user_id;
    notification_type := 'lesson_offer_declined';
    notification_title := 'Offer Declined';
    notification_message := 'Your lesson offer was declined';
  ELSIF NEW.status = 'countered' THEN
    notify_user_id := NEW.tutor_user_id;
    notification_type := 'lesson_offer_countered';
    notification_title := 'Counter-Offer Received';
    notification_message := 'The student has sent a counter-offer';
  END IF;
  
  -- Create notification
  IF notify_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
    VALUES (
      notify_user_id,
      notification_type,
      notification_title,
      notification_message,
      '/tutor/offers',
      jsonb_build_object(
        'offer_id', NEW.id,
        'student_id', NEW.student_user_id,
        'subject', NEW.subject,
        'status', NEW.status
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_lesson_offer_status_change
AFTER UPDATE ON public.lesson_offers
FOR EACH ROW
EXECUTE FUNCTION notify_lesson_offer_status_change();

-- 9. Verify setup
SELECT 'Lesson offers table created successfully' AS status;
















-- ===== FILE: 016_lesson_offers_system_FIXED.sql =====

-- =====================================================
-- LESSON OFFERS SYSTEM (FIXED)
-- =====================================================
-- Allows tutors to send lesson offers to students
-- Students can accept, decline, or counter-offer

-- Drop existing table if it exists
DROP TABLE IF EXISTS public.lesson_offers CASCADE;

-- 1. Create lesson_offers table
CREATE TABLE public.lesson_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tutor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  proposed_start_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  tutor_note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'countered', 'expired')),
  counter_proposed_start_at TIMESTAMPTZ,
  counter_tutor_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_duration CHECK (duration_minutes > 0 AND duration_minutes <= 480)
);

-- 2. Create indexes for performance
CREATE INDEX idx_lesson_offers_tutor ON public.lesson_offers(tutor_id, status);
CREATE INDEX idx_lesson_offers_student ON public.lesson_offers(student_id, status);
CREATE INDEX idx_lesson_offers_status ON public.lesson_offers(status);
CREATE INDEX idx_lesson_offers_created ON public.lesson_offers(created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.lesson_offers ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies

-- Tutors can view offers they sent
CREATE POLICY "Tutors can view their sent offers"
ON public.lesson_offers FOR SELECT
TO authenticated
USING (
  tutor_id = auth.uid()
);

-- Students can view offers they received
CREATE POLICY "Students can view their received offers"
ON public.lesson_offers FOR SELECT
TO authenticated
USING (
  student_id = auth.uid()
);

-- Tutors can create offers (must be a tutor role)
CREATE POLICY "Tutors can create offers"
ON public.lesson_offers FOR INSERT
TO authenticated
WITH CHECK (
  tutor_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'tutor'
  )
);

-- Tutors can update their sent offers (only for counter-offer responses)
CREATE POLICY "Tutors can update their sent offers"
ON public.lesson_offers FOR UPDATE
TO authenticated
USING (
  tutor_id = auth.uid()
)
WITH CHECK (
  tutor_id = auth.uid()
);

-- Students can update offers they received (to accept/decline/counter)
CREATE POLICY "Students can update their received offers"
ON public.lesson_offers FOR UPDATE
TO authenticated
USING (
  student_id = auth.uid()
)
WITH CHECK (
  student_id = auth.uid()
);

-- Users can delete offers they're involved in (before acceptance)
CREATE POLICY "Users can delete their own offers"
ON public.lesson_offers FOR DELETE
TO authenticated
USING (
  (tutor_id = auth.uid() OR student_id = auth.uid())
  AND status IN ('pending', 'countered')
);

-- 5. Create updated_at trigger
CREATE OR REPLACE FUNCTION update_lesson_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_lesson_offers_updated_at
BEFORE UPDATE ON public.lesson_offers
FOR EACH ROW
EXECUTE FUNCTION update_lesson_offers_updated_at();

-- 6. Create notification trigger for new offers
CREATE OR REPLACE FUNCTION notify_new_lesson_offer()
RETURNS TRIGGER AS $$
BEGIN
  -- Create notification for student
  INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
  VALUES (
    NEW.student_id,
    'lesson_offer_received',
    'New Lesson Offer',
    'You have received a new lesson offer',
    '/student/dashboard',
    jsonb_build_object(
      'offer_id', NEW.id,
      'tutor_id', NEW.tutor_id,
      'subject_id', NEW.subject_id,
      'proposed_start_at', NEW.proposed_start_at
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_lesson_offer_created
AFTER INSERT ON public.lesson_offers
FOR EACH ROW
EXECUTE FUNCTION notify_new_lesson_offer();

-- 7. Create notification trigger for offer status changes
CREATE OR REPLACE FUNCTION notify_lesson_offer_status_change()
RETURNS TRIGGER AS $$
DECLARE
  notify_user_id UUID;
  notification_type TEXT;
  notification_title TEXT;
  notification_message TEXT;
BEGIN
  -- Only notify on status change
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Determine who to notify and what to say
  IF NEW.status = 'accepted' THEN
    notify_user_id := NEW.tutor_id;
    notification_type := 'lesson_offer_accepted';
    notification_title := 'Offer Accepted!';
    notification_message := 'Your lesson offer has been accepted';
  ELSIF NEW.status = 'declined' THEN
    notify_user_id := NEW.tutor_id;
    notification_type := 'lesson_offer_declined';
    notification_title := 'Offer Declined';
    notification_message := 'Your lesson offer was declined';
  ELSIF NEW.status = 'countered' THEN
    notify_user_id := NEW.tutor_id;
    notification_type := 'lesson_offer_countered';
    notification_title := 'Counter-Offer Received';
    notification_message := 'The student has sent a counter-offer';
  END IF;
  
  -- Create notification
  IF notify_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
    VALUES (
      notify_user_id,
      notification_type,
      notification_title,
      notification_message,
      '/tutor/dashboard',
      jsonb_build_object(
        'offer_id', NEW.id,
        'student_id', NEW.student_id,
        'subject_id', NEW.subject_id,
        'status', NEW.status
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_lesson_offer_status_change
AFTER UPDATE ON public.lesson_offers
FOR EACH ROW
EXECUTE FUNCTION notify_lesson_offer_status_change();

-- 8. Verify setup
SELECT 'Lesson offers table created successfully' AS status;
















-- ===== FILE: 017_add_bio_column.sql =====

-- =====================================================
-- ADD BIOGRAPHY COLUMN TO PROFILES TABLE
-- =====================================================
-- Migration: 017
-- Description: Adds a 'bio' column to store user biographies
-- Run this in your Supabase SQL Editor

-- Add bio column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bio TEXT;

-- Add a comment to document the column
COMMENT ON COLUMN public.profiles.bio IS 'User biography/about me text, supports emojis and multiline content (max ~1000 chars recommended)';

-- Verify the column was added
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'profiles' 
  AND column_name = 'bio';

SELECT 'Biography column added successfully!' AS status;















-- ===== FILE: 018_sessions_system.sql =====

-- =====================================================
-- SESSIONS SYSTEM - COMPLETE IMPLEMENTATION
-- =====================================================
-- Implements video provider connections, sessions, and charging logic

-- =====================================================
-- 1. TUTOR VIDEO PROVIDER CONNECTIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tutor_video_provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_meet', 'zoom')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  connection_status TEXT NOT NULL CHECK (connection_status IN ('connected', 'needs_reauth', 'disconnected')) DEFAULT 'connected',
  provider_account_email TEXT,
  provider_account_name TEXT,
  access_token_encrypted TEXT, -- Store in Supabase vault in production
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick tutor lookups
CREATE INDEX idx_tutor_video_connections_tutor ON public.tutor_video_provider_connections(tutor_id);

-- =====================================================
-- 2. SESSIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  tutor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_meet', 'zoom')),
  meeting_external_id TEXT,
  join_url TEXT,
  -- Use confirmed times from booking (when booking is confirmed, these are set)
  scheduled_start_at TIMESTAMPTZ NOT NULL, -- Will be set from booking.confirmed_start_at
  scheduled_end_at TIMESTAMPTZ NOT NULL,   -- Will be set from booking.confirmed_end_at
  duration_minutes INTEGER NOT NULL,
  no_show_wait_minutes INTEGER NOT NULL,
  min_payable_minutes INTEGER NOT NULL,
  meeting_created_at TIMESTAMPTZ,
  meeting_started_at TIMESTAMPTZ,
  meeting_ended_at TIMESTAMPTZ,
  tutor_marked_no_show_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN (
    'SCHEDULED',
    'JOIN_OPEN',
    'COMPLETED_ASSUMED',
    'NO_SHOW_STUDENT',
    'EARLY_END_SHORT',
    'CANCELLED'
  )) DEFAULT 'SCHEDULED',
  charge_scheduled_at TIMESTAMPTZ NOT NULL,
  charged_at TIMESTAMPTZ,
  charge_amount_ttd NUMERIC(10,2) NOT NULL DEFAULT 0,
  payout_amount_ttd NUMERIC(10,2) NOT NULL DEFAULT 0,
  platform_fee_ttd NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_sessions_tutor_scheduled ON public.sessions(tutor_id, scheduled_start_at);
CREATE INDEX idx_sessions_student_scheduled ON public.sessions(student_id, scheduled_start_at);
CREATE INDEX idx_sessions_status_charge ON public.sessions(status, charge_scheduled_at);
CREATE INDEX idx_sessions_booking ON public.sessions(booking_id);

-- =====================================================
-- 3. SESSION EVENTS (AUDIT LOG)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for session event queries
CREATE INDEX idx_session_events_session ON public.session_events(session_id, received_at DESC);

-- =====================================================
-- 4. TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tutor_video_connections_updated_at
BEFORE UPDATE ON public.tutor_video_provider_connections
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_sessions_updated_at
BEFORE UPDATE ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE public.tutor_video_provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;

-- tutor_video_provider_connections policies
CREATE POLICY "Tutors can view their own video connections"
ON public.tutor_video_provider_connections FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

CREATE POLICY "Tutors can update their own video connections"
ON public.tutor_video_provider_connections FOR UPDATE
TO authenticated
USING (tutor_id = auth.uid())
WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "Tutors can insert their own video connections"
ON public.tutor_video_provider_connections FOR INSERT
TO authenticated
WITH CHECK (tutor_id = auth.uid());

-- Explicitly NO DELETE policy (tutors cannot delete their connection)

-- sessions policies
CREATE POLICY "Tutors can view their sessions"
ON public.sessions FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

CREATE POLICY "Students can view their sessions"
ON public.sessions FOR SELECT
TO authenticated
USING (student_id = auth.uid());

-- NO UPDATE/INSERT/DELETE policies for clients
-- All session modifications go through secure API routes with service role

-- session_events policies
-- NO client access at all (service role only)

-- =====================================================
-- 6. HELPER FUNCTIONS
-- =====================================================

-- Calculate session rule values
CREATE OR REPLACE FUNCTION calculate_session_rules(duration_min INTEGER)
RETURNS TABLE(
  no_show_wait INTEGER,
  min_payable INTEGER
) AS $$
BEGIN
  RETURN QUERY SELECT
    FLOOR(duration_min * 0.33)::INTEGER AS no_show_wait,
    FLOOR(duration_min * 0.66)::INTEGER AS min_payable;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Check if join window is open
CREATE OR REPLACE FUNCTION is_join_window_open(scheduled_start TIMESTAMPTZ)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOW() >= (scheduled_start - INTERVAL '5 minutes');
END;
$$ LANGUAGE plpgsql STABLE;

SELECT 'âœ… Sessions system tables, indexes, RLS policies, and helper functions created successfully!' AS status;



-- ===== FILE: 020_payments_system.sql =====

-- =====================================================
-- PAYMENTS SYSTEM MIGRATION
-- =====================================================
-- Extends existing booking/session tables and adds payment tracking

-- 1. EXTEND BOOKINGS TABLE
-- Add payment tracking columns to existing bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payer_id uuid REFERENCES profiles(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_required boolean DEFAULT true;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid' 
  CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'refunded', 'failed'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS currency text DEFAULT 'TTD';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS platform_fee_pct integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS platform_fee_ttd numeric(10,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tutor_payout_ttd numeric(10,2);

-- Create index on payment_status for faster queries
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_payer_id ON bookings(payer_id);

-- 2. EXTEND SESSIONS TABLE
-- Add payment tracking to existing sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS payer_id uuid REFERENCES profiles(id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'paid', 'release_ready', 'released', 'refunded'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS currency text DEFAULT 'TTD';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS platform_fee_pct integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS platform_fee_ttd numeric(10,2);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tutor_payout_ttd numeric(10,2);

-- Create index on payment_status
CREATE INDEX IF NOT EXISTS idx_sessions_payment_status ON sessions(payment_status);
CREATE INDEX IF NOT EXISTS idx_sessions_payer_id ON sessions(payer_id);

-- 3. CREATE TUTOR_PAYOUT_ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS tutor_payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'wipay',
  payout_name text,
  payout_account_identifier text,
  payout_metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index on tutor_id
CREATE INDEX IF NOT EXISTS idx_tutor_payout_accounts_tutor_id ON tutor_payout_accounts(tutor_id);

-- Enable RLS
ALTER TABLE tutor_payout_accounts ENABLE ROW LEVEL SECURITY;

-- 4. CREATE PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL REFERENCES profiles(id),
  provider text NOT NULL DEFAULT 'wipay',
  provider_reference text UNIQUE,
  amount_ttd numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'initiated' 
    CHECK (status IN ('initiated', 'requires_action', 'succeeded', 'failed', 'refunded', 'cancelled')),
  raw_provider_payload jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_payer_id ON payments(payer_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_reference ON payments(provider_reference);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 5. CREATE PAYOUT_LEDGER TABLE
CREATE TABLE IF NOT EXISTS payout_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid UNIQUE NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES profiles(id),
  amount_ttd numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'owed' 
    CHECK (status IN ('owed', 'release_ready', 'released', 'reversed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payout_ledger_session_id ON payout_ledger(session_id);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_tutor_id ON payout_ledger(tutor_id);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_status ON payout_ledger(status);

-- Enable RLS
ALTER TABLE payout_ledger ENABLE ROW LEVEL SECURITY;

-- 6. CREATE TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at on new tables
DROP TRIGGER IF EXISTS update_tutor_payout_accounts_updated_at ON tutor_payout_accounts;
CREATE TRIGGER update_tutor_payout_accounts_updated_at
    BEFORE UPDATE ON tutor_payout_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payout_ledger_updated_at ON payout_ledger;
CREATE TRIGGER update_payout_ledger_updated_at
    BEFORE UPDATE ON payout_ledger
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'âœ… Payments system tables created successfully!';
    RAISE NOTICE 'Tables: bookings (extended), sessions (extended), tutor_payout_accounts, payments, payout_ledger';
END $$;















-- ===== FILE: 021_payment_functions.sql =====

-- =====================================================
-- PAYMENT SYSTEM FUNCTIONS
-- =====================================================
-- Functions for platform fee calculation and payment processing

-- 1. COMPUTE PLATFORM FEE
-- Tiered fee structure:
-- < 50 TTD => 10%
-- 50-199 TTD => 15%
-- >= 200 TTD => 20%
CREATE OR REPLACE FUNCTION compute_platform_fee(price_ttd numeric)
RETURNS TABLE(pct integer, fee numeric, payout numeric)
AS $$
DECLARE
  v_pct integer;
  v_fee numeric;
  v_payout numeric;
BEGIN
  -- Determine fee percentage based on price tiers
  IF price_ttd < 50 THEN
    v_pct := 10;
  ELSIF price_ttd >= 50 AND price_ttd < 200 THEN
    v_pct := 15;
  ELSE
    v_pct := 20;
  END IF;
  
  -- Calculate fee and payout amounts
  v_fee := ROUND(price_ttd * v_pct / 100.0, 2);
  v_payout := price_ttd - v_fee;
  
  RETURN QUERY SELECT v_pct, v_fee, v_payout;
END;
$$ LANGUAGE plpgsql;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION compute_platform_fee TO authenticated;

-- 2. COMPLETE BOOKING PAYMENT
-- Called by webhook after successful payment
CREATE OR REPLACE FUNCTION complete_booking_payment(
  p_booking_id uuid,
  p_payment_id uuid,
  p_provider_reference text
)
RETURNS void
AS $$
BEGIN
  -- Update booking payment status
  UPDATE bookings
  SET payment_status = 'paid',
      updated_at = now()
  WHERE id = p_booking_id;
  
  -- Update payment record
  UPDATE payments
  SET status = 'succeeded',
      provider_reference = p_provider_reference,
      updated_at = now()
  WHERE id = p_payment_id;
  
  -- If booking was PARENT_APPROVED, transition to PENDING (send to tutor)
  UPDATE bookings
  SET status = 'PENDING'
  WHERE id = p_booking_id 
    AND status = 'PARENT_APPROVED';
    
  RAISE NOTICE 'Payment completed for booking %', p_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service_role only
GRANT EXECUTE ON FUNCTION complete_booking_payment TO service_role;

-- 3. MARK SESSION COMPLETED
-- Updates session status and creates payout ledger entry
CREATE OR REPLACE FUNCTION mark_session_completed_with_payout(p_session_id uuid)
RETURNS void
AS $$
DECLARE
  v_session sessions%ROWTYPE;
BEGIN
  -- Get session details
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;
  
  -- Update session status to completed and mark for payout release
  UPDATE sessions
  SET status = 'COMPLETED_ASSUMED',
      payment_status = 'release_ready',
      updated_at = now()
  WHERE id = p_session_id;
  
  -- Create or update payout ledger entry
  INSERT INTO payout_ledger (session_id, tutor_id, amount_ttd, status)
  VALUES (p_session_id, v_session.tutor_id, v_session.tutor_payout_ttd, 'release_ready')
  ON CONFLICT (session_id) DO UPDATE
  SET status = 'release_ready', 
      amount_ttd = EXCLUDED.amount_ttd,
      updated_at = now();
      
  RAISE NOTICE 'Session % marked as completed, payout ready', p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users (will check permissions in RLS)
GRANT EXECUTE ON FUNCTION mark_session_completed_with_payout TO authenticated;
GRANT EXECUTE ON FUNCTION mark_session_completed_with_payout TO service_role;

-- 4. RELEASE PAYOUT
-- Admin function to mark payouts as released
CREATE OR REPLACE FUNCTION release_payout(p_session_id uuid)
RETURNS void
AS $$
BEGIN
  -- Update session payment status
  UPDATE sessions
  SET payment_status = 'released',
      updated_at = now()
  WHERE id = p_session_id;
  
  -- Update payout ledger status
  UPDATE payout_ledger
  SET status = 'released', 
      updated_at = now()
  WHERE session_id = p_session_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout ledger entry not found for session %', p_session_id;
  END IF;
  
  RAISE NOTICE 'Payout released for session %', p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service_role only (admin function)
GRANT EXECUTE ON FUNCTION release_payout TO service_role;

-- 5. HELPER: DETERMINE PAYER
-- Returns the payer_id for a given student (parent if linked, else student)
CREATE OR REPLACE FUNCTION get_payer_for_student(p_student_id uuid)
RETURNS uuid
AS $$
DECLARE
  v_parent_id uuid;
  v_billing_mode text;
BEGIN
  -- Check if student has a parent linked
  SELECT billing_mode INTO v_billing_mode
  FROM profiles
  WHERE id = p_student_id;
  
  IF v_billing_mode = 'parent_required' THEN
    -- Find parent from parent_child_links
    SELECT parent_id INTO v_parent_id
    FROM parent_child_links
    WHERE child_id = p_student_id
    LIMIT 1;
    
    IF v_parent_id IS NOT NULL THEN
      RETURN v_parent_id;
    END IF;
  END IF;
  
  -- Default to student as payer
  RETURN p_student_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_payer_for_student TO authenticated;
GRANT EXECUTE ON FUNCTION get_payer_for_student TO service_role;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'âœ… Payment system functions created successfully!';
    RAISE NOTICE 'Functions: compute_platform_fee, complete_booking_payment, mark_session_completed_with_payout, release_payout, get_payer_for_student';
END $$;















-- ===== FILE: 023_payment_rls_policies.sql =====

-- =====================================================
-- RLS POLICIES FOR PAYMENT TABLES
-- =====================================================
-- Security policies for tutor_payout_accounts, payments, payout_ledger

-- 1. TUTOR_PAYOUT_ACCOUNTS POLICIES

-- Tutors can view their own payout accounts
DROP POLICY IF EXISTS "Tutors can view their own payout accounts" ON tutor_payout_accounts;
CREATE POLICY "Tutors can view their own payout accounts"
ON tutor_payout_accounts
FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

-- Tutors can insert their own payout accounts
DROP POLICY IF EXISTS "Tutors can create their own payout accounts" ON tutor_payout_accounts;
CREATE POLICY "Tutors can create their own payout accounts"
ON tutor_payout_accounts
FOR INSERT
TO authenticated
WITH CHECK (tutor_id = auth.uid());

-- Tutors can update their own payout accounts
DROP POLICY IF EXISTS "Tutors can update their own payout accounts" ON tutor_payout_accounts;
CREATE POLICY "Tutors can update their own payout accounts"
ON tutor_payout_accounts
FOR UPDATE
TO authenticated
USING (tutor_id = auth.uid());

-- Tutors can delete their own payout accounts
DROP POLICY IF EXISTS "Tutors can delete their own payout accounts" ON tutor_payout_accounts;
CREATE POLICY "Tutors can delete their own payout accounts"
ON tutor_payout_accounts
FOR DELETE
TO authenticated
USING (tutor_id = auth.uid());

-- Service role has full access
DROP POLICY IF EXISTS "Service role full access to payout accounts" ON tutor_payout_accounts;
CREATE POLICY "Service role full access to payout accounts"
ON tutor_payout_accounts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. PAYMENTS POLICIES

-- Payers can view their own payments
DROP POLICY IF EXISTS "Payers can view their payments" ON payments;
CREATE POLICY "Payers can view their payments"
ON payments
FOR SELECT
TO authenticated
USING (payer_id = auth.uid());

-- Students can view payments for their bookings
DROP POLICY IF EXISTS "Students can view their booking payments" ON payments;
CREATE POLICY "Students can view their booking payments"
ON payments
FOR SELECT
TO authenticated
USING (
    booking_id IN (
        SELECT id FROM bookings WHERE student_id = auth.uid()
    )
);

-- Tutors can view payments for their bookings
DROP POLICY IF EXISTS "Tutors can view their booking payments" ON payments;
CREATE POLICY "Tutors can view their booking payments"
ON payments
FOR SELECT
TO authenticated
USING (
    booking_id IN (
        SELECT id FROM bookings WHERE tutor_id = auth.uid()
    )
);

-- Parents can view payments for their children's bookings
DROP POLICY IF EXISTS "Parents can view their children's payments" ON payments;
CREATE POLICY "Parents can view their children's payments"
ON payments
FOR SELECT
TO authenticated
USING (
    booking_id IN (
        SELECT b.id 
        FROM bookings b
        INNER JOIN parent_child_links pcl ON pcl.child_id = b.student_id
        WHERE pcl.parent_id = auth.uid()
    )
);

-- Service role can manage all payments (for webhook processing)
DROP POLICY IF EXISTS "Service role full access to payments" ON payments;
CREATE POLICY "Service role full access to payments"
ON payments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users can insert payments (for initiating payment)
DROP POLICY IF EXISTS "Authenticated users can create payments" ON payments;
CREATE POLICY "Authenticated users can create payments"
ON payments
FOR INSERT
TO authenticated
WITH CHECK (payer_id = auth.uid());

-- 3. PAYOUT_LEDGER POLICIES

-- Tutors can view their own payout ledger
DROP POLICY IF EXISTS "Tutors can view their payout ledger" ON payout_ledger;
CREATE POLICY "Tutors can view their payout ledger"
ON payout_ledger
FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

-- Service role can manage all payout ledger entries
DROP POLICY IF EXISTS "Service role full access to payout ledger" ON payout_ledger;
CREATE POLICY "Service role full access to payout ledger"
ON payout_ledger
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Students can view payout ledger for their sessions (transparency)
DROP POLICY IF EXISTS "Students can view payout ledger for their sessions" ON payout_ledger;
CREATE POLICY "Students can view payout ledger for their sessions"
ON payout_ledger
FOR SELECT
TO authenticated
USING (
    session_id IN (
        SELECT id FROM sessions WHERE student_id = auth.uid()
    )
);

-- Parents can view payout ledger for their children's sessions
DROP POLICY IF EXISTS "Parents can view payout ledger for children's sessions" ON payout_ledger;
CREATE POLICY "Parents can view payout ledger for children's sessions"
ON payout_ledger
FOR SELECT
TO authenticated
USING (
    session_id IN (
        SELECT s.id 
        FROM sessions s
        INNER JOIN parent_child_links pcl ON pcl.child_id = s.student_id
        WHERE pcl.parent_id = auth.uid()
    )
);

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'âœ… RLS policies created for payment tables!';
    RAISE NOTICE 'Policies: tutor_payout_accounts (4), payments (6), payout_ledger (4)';
END $$;















-- ===== FILE: 024_tutor_verification_schema.sql =====

-- =====================================================
-- TUTOR VERIFICATION SYSTEM - DATABASE SCHEMA
-- =====================================================
-- Creates tables and columns for tutor verification with OCR processing

-- 1. EXTEND PROFILES TABLE
-- Add verification-related columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_reviewer boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tutor_verification_status text 
  DEFAULT 'UNVERIFIED' 
  CHECK (tutor_verification_status IN ('UNVERIFIED','PENDING','PROCESSING','VERIFIED','REJECTED'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tutor_verified_at timestamptz;

-- Create index on verification status for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_verification_status ON profiles(tutor_verification_status);
CREATE INDEX IF NOT EXISTS idx_profiles_is_reviewer ON profiles(is_reviewer);

-- Set the known reviewer account
UPDATE profiles 
SET is_reviewer = true 
WHERE id = 'a7c6ebfe-de7e-4059-a953-6180872220da';

-- 2. CREATE TUTOR_VERIFICATION_REQUESTS TABLE
-- Stores each verification attempt with OCR results and reviewer decision
CREATE TABLE IF NOT EXISTS tutor_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'SUBMITTED' 
    CHECK (status IN ('SUBMITTED','PROCESSING','READY_FOR_REVIEW','APPROVED','REJECTED')),
  
  -- Upload fields
  file_path text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('image','pdf')),
  original_filename text,
  
  -- OCR processing output
  extracted_text text,
  extracted_json jsonb,  -- {candidate_name, exam_type, year, subjects:[{name,grade}]}
  confidence_score integer CHECK (confidence_score >= 0 AND confidence_score <= 100),
  system_recommendation text CHECK (system_recommendation IN ('APPROVE','REJECT')),
  system_reason text,
  
  -- Reviewer decision
  reviewed_by uuid REFERENCES profiles(id),
  reviewer_decision text CHECK (reviewer_decision IN ('APPROVE','REJECT')),
  reviewer_reason text,
  reviewed_at timestamptz,
  
  -- Audit and notes
  notes jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_verification_requests_tutor ON tutor_verification_requests(tutor_id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON tutor_verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_verification_requests_reviewer ON tutor_verification_requests(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_verification_requests_created ON tutor_verification_requests(created_at DESC);

-- 3. CREATE TUTOR_VERIFICATION_EVENTS TABLE
-- Audit trail for all verification events
CREATE TABLE IF NOT EXISTS tutor_verification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES tutor_verification_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL,  -- SUBMITTED, OCR_STARTED, OCR_DONE, SYSTEM_RECOMMENDED, REVIEWER_DECISION, NOTIFIED
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_verification_events_request ON tutor_verification_events(request_id);
CREATE INDEX IF NOT EXISTS idx_verification_events_type ON tutor_verification_events(event_type);
CREATE INDEX IF NOT EXISTS idx_verification_events_created ON tutor_verification_events(created_at DESC);

-- 4. CREATE TRIGGER FOR UPDATED_AT
-- Ensure updated_at is automatically set on tutor_verification_requests
DROP TRIGGER IF EXISTS update_verification_requests_updated_at ON tutor_verification_requests;
CREATE TRIGGER update_verification_requests_updated_at
    BEFORE UPDATE ON tutor_verification_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. UPDATE NOTIFICATIONS TABLE CONSTRAINT
-- Add new notification types for verification
DO $$
BEGIN
    -- Drop existing constraint if it exists
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    
    -- Add new constraint with verification types
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
        'booking_request',
        'booking_accepted',
        'booking_declined',
        'booking_counter_offer',
        'booking_cancelled',
        'new_message',
        'booking_needs_parent_approval',
        'booking_parent_approved',
        'booking_parent_rejected',
        'lesson_offer_received',
        'lesson_offer_accepted',
        'lesson_offer_declined',
        'lesson_offer_countered',
        'counter_offer_accepted',
        'booking_confirmed',
        'session_created',
        'session_rescheduled_by_parent',
        'session_cancelled_by_parent',
        'payment_succeeded',
        'payment_failed',
        'booking_request_received',
        'VERIFICATION_APPROVED',
        'VERIFICATION_REJECTED'
    ));
    
    RAISE NOTICE 'Notifications constraint updated with verification types';
END $$;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'âœ… Tutor verification schema created successfully!';
    RAISE NOTICE 'Tables: tutor_verification_requests, tutor_verification_events';
    RAISE NOTICE 'Extended: profiles (is_reviewer, tutor_verification_status, tutor_verified_at)';
    RAISE NOTICE 'Updated: notifications table constraint';
END $$;















-- ===== FILE: 025_verification_rls.sql =====

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
    RAISE NOTICE 'âœ… Verification RLS policies created successfully!';
    RAISE NOTICE 'tutor_verification_requests: 5 policies (tutors view/create own, reviewers view/update all, service role full access)';
    RAISE NOTICE 'tutor_verification_events: 4 policies (tutors view own, reviewers view all, service role insert/full access)';
END $$;















-- ===== FILE: 026_support_requests.sql =====

-- =====================================================
-- SUPPORT REQUESTS TABLE
-- =====================================================
-- Stores support requests from users

CREATE TABLE IF NOT EXISTS public.support_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_name text NOT NULL,
    user_email text NOT NULL,
    user_role text,
    issue text NOT NULL,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'closed')),
    admin_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone
);

-- Enable RLS
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own support requests
CREATE POLICY "Users can view own support requests"
    ON public.support_requests
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Users can create support requests
CREATE POLICY "Users can create support requests"
    ON public.support_requests
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Reviewers/admins can view all support requests
CREATE POLICY "Admins can view all support requests"
    ON public.support_requests
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_reviewer = true
        )
    );

-- Reviewers/admins can update support requests
CREATE POLICY "Admins can update support requests"
    ON public.support_requests
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_reviewer = true
        )
    );

-- Create index for faster lookups
CREATE INDEX idx_support_requests_user_id ON public.support_requests(user_id);
CREATE INDEX idx_support_requests_status ON public.support_requests(status);
CREATE INDEX idx_support_requests_created_at ON public.support_requests(created_at DESC);

-- Grant permissions
GRANT SELECT, INSERT ON public.support_requests TO authenticated;
GRANT UPDATE ON public.support_requests TO authenticated;

COMMENT ON TABLE public.support_requests IS 'Stores support requests from users that get sent to support@myitutor.com';















-- ===== FILE: 027_username_unique_constraint.sql =====

-- =====================================================
-- ENFORCE USERNAME UNIQUENESS
-- =====================================================
-- Ensures all usernames are unique across the entire system
-- No two users (student, tutor, parent, or admin) can have the same username

-- Step 1: Drop existing unique constraints if they exist
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_username_key;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_username_unique;

-- Step 2: Update any NULL usernames to temporary unique values
UPDATE profiles
SET username = 'user_' || id
WHERE username IS NULL;

-- Step 3: Handle any duplicate usernames by appending user ID
WITH duplicates AS (
  SELECT username, array_agg(id ORDER BY created_at) as user_ids
  FROM profiles
  WHERE username IS NOT NULL
  GROUP BY username
  HAVING COUNT(*) > 1
)
UPDATE profiles p
SET username = p.username || '_' || p.id
FROM duplicates d
WHERE p.username = d.username
  AND p.id = ANY(d.user_ids[2:]);  -- Keep first user with original username

-- Step 4: Add unique constraint on username (drop first in case it exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_username_unique'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_username_unique UNIQUE (username);
  END IF;
END $$;

-- Step 5: Make username NOT NULL
DO $$
BEGIN
  ALTER TABLE profiles ALTER COLUMN username SET NOT NULL;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'username column already NOT NULL or error occurred';
END $$;

-- Step 6: Add index for faster username lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Step 7: Add constraint to ensure username format
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_username_format'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_username_format CHECK (username ~ '^[a-zA-Z0-9_-]+$');
  END IF;
END $$;

-- Step 8: Add constraint to ensure username length
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_username_length'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_username_length CHECK (length(username) >= 6 AND length(username) <= 30);
  END IF;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'âœ… Username uniqueness constraint added successfully!';
  RAISE NOTICE 'âœ… All usernames are now unique across the system';
  RAISE NOTICE 'âœ… Username format: 6-30 characters, alphanumeric with _ and -';
END $$;



-- ===== FILE: 028_terms_acceptance.sql =====

-- =====================================================
-- TERMS & CONDITIONS ACCEPTANCE
-- =====================================================
-- Adds fields to track when users accept terms and conditions

-- Step 1: Add terms acceptance fields to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE;

-- Step 2: Set existing users as having accepted terms (grandfather clause)
UPDATE profiles
SET terms_accepted = TRUE,
    terms_accepted_at = created_at
WHERE terms_accepted IS NULL OR terms_accepted = FALSE;

-- Step 3: Make terms_accepted NOT NULL with default FALSE for new users
ALTER TABLE profiles
ALTER COLUMN terms_accepted SET DEFAULT FALSE;

ALTER TABLE profiles
ALTER COLUMN terms_accepted SET NOT NULL;

-- Step 4: Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_terms_accepted ON profiles(terms_accepted);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'âœ… Terms acceptance tracking added successfully!';
  RAISE NOTICE 'âœ… Existing users marked as accepted (grandfathered)';
  RAISE NOTICE 'âœ… New users will be required to accept terms during signup';
END $$;















-- ===== FILE: 029_curriculum_syllabuses.sql =====

-- =====================================================
-- CURRICULUM SYLLABUSES SCHEMA
-- =====================================================
-- Creates syllabuses table to store official CXC syllabus PDFs
-- Designed for future scalability with units/topics/lesson mappings

-- =============================================================================
-- 1. CREATE SYLLABUSES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS syllabuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  qualification text NOT NULL CHECK (qualification IN ('CSEC', 'CAPE')),
  category text NOT NULL,
  title text NOT NULL,
  version text,
  effective_year integer,
  pdf_url text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Prevent duplicate syllabus versions for same subject
  CONSTRAINT unique_subject_version UNIQUE (subject_id, version)
);

-- =============================================================================
-- 2. CREATE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_syllabuses_subject_id ON syllabuses(subject_id);
CREATE INDEX IF NOT EXISTS idx_syllabuses_qualification ON syllabuses(qualification);
CREATE INDEX IF NOT EXISTS idx_syllabuses_category ON syllabuses(category);

-- =============================================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE syllabuses ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. CREATE RLS POLICIES
-- =============================================================================

-- Policy: Tutors can read syllabuses for subjects they teach
CREATE POLICY tutors_read_own_syllabuses ON syllabuses
FOR SELECT TO authenticated
USING (
  subject_id IN (
    SELECT subject_id 
    FROM tutor_subjects 
    WHERE tutor_id = auth.uid()
  )
);

-- Policy: Admins and reviewers have full access
CREATE POLICY admins_manage_syllabuses ON syllabuses
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
);

-- =============================================================================
-- 5. CREATE UPDATED_AT TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION update_syllabuses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER syllabuses_updated_at
BEFORE UPDATE ON syllabuses
FOR EACH ROW
EXECUTE FUNCTION update_syllabuses_updated_at();

-- =============================================================================
-- 6. FUTURE SCALABILITY NOTES
-- =============================================================================

COMMENT ON TABLE syllabuses IS 'Official CXC syllabuses linked to subjects. Future tables: syllabus_units (syllabus_id, unit_number, title), syllabus_topics (unit_id, topic_number, title, learning_outcomes), lesson_topic_mappings (lesson_id, topic_id), student_topic_progress (student_id, topic_id, status)';

-- =============================================================================
-- SUCCESS MESSAGE
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'âœ… Syllabuses table created successfully';
  RAISE NOTICE 'âœ… RLS policies applied for tutor and admin access';
  RAISE NOTICE 'âœ… Indexes created for performance';
  RAISE NOTICE 'âœ… Ready for seed data (run 030_seed_syllabuses.sql next)';
END $$;















-- ===== FILE: 030_seed_syllabuses.sql =====

-- =====================================================
-- SYLLABUS SEED MIGRATION
-- Populates syllabuses table with official CXC syllabuses
-- Uses direct subject table joins for reliability
-- =====================================================

-- Clear existing data
TRUNCATE TABLE syllabuses CASCADE;

-- =============================================================================
-- CSEC SYLLABUSES
-- =============================================================================

-- CSEC Sciences
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Sciences', 'Agricultural Science', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Agricultural-Science-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Agricultural Science%' AND s.curriculum = 'CSEC' AND s.name NOT LIKE '%Unit%' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Sciences', 'Biology', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Biology-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Biology' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Sciences', 'Chemistry', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Chemistry-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Chemistry' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Sciences', 'Physics', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Physics-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Physics' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Sciences', 'Integrated Science', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Integrated-Science-AmendedOct2025.pdf', 'Amended Oct 2025', 2025
FROM subjects s WHERE s.name = 'Integrated Science' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Sciences', 'Human and Social Biology', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Human-and-Social-Biology-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Human%Social%Biology%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CSEC Mathematics
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Mathematics', 'Mathematics', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Mathematics-AmendedOct2025.pdf', 'Amended Oct 2025', 2025
FROM subjects s WHERE s.name = 'Mathematics' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Mathematics', 'Additional Mathematics', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Additional-Mathematics-Syllabus-Amended-2020.pdf', 'Amended 2020', 2020
FROM subjects s WHERE s.name = 'Additional Mathematics' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CSEC Languages
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Languages', 'English A & B', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-English-Syllabus-Revised-2025.pdf', 'Revised 2025', 2025
FROM subjects s WHERE s.name = 'English A' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Languages', 'English A & B', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-English-Syllabus-Revised-2025.pdf', 'Revised 2025', 2025
FROM subjects s WHERE s.name = 'English B' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Languages', 'Modern Languages', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Modern-Languages-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Spanish' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Languages', 'Modern Languages', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Modern-Languages-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'French' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Languages', 'Modern Languages', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Modern-Languages-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Portuguese' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CSEC Business
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Business', 'Principles of Business', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Principles-of-Business-Syllabus-.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Principles%Business%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Business', 'Principles of Accounts', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Principles-of-Accounts-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Principles%Accounts%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Business', 'Economics', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Economics-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Economics' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Business', 'Office Administration', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Office-Administration-Syllabus-Revised-2024.pdf', 'Revised 2024', 2024
FROM subjects s WHERE s.name LIKE '%Office%Administration%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CSEC Social Studies
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Social Studies', 'Caribbean History', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Caribbean-History-Syllabus-Amended.pdf', 'Amended', NULL
FROM subjects s WHERE s.name LIKE '%Caribbean%History%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Social Studies', 'Geography', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Geography-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Geography' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Social Studies', 'Social Studies', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Social-Studies-Syllabus-July-2023.pdf', 'Revised July 2023', 2023
FROM subjects s WHERE s.name = 'Social Studies' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Social Studies', 'Religious Education', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Religious-Education-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Religious%Education%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CSEC Arts
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Arts', 'Visual Arts', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Visual-Arts-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Visual%Arts%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Arts', 'Music', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Music-Syllabus-Amended.pdf', 'Amended', NULL
FROM subjects s WHERE s.name = 'Music' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Arts', 'Theatre Arts', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Theatre-Arts-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Theatre%Arts%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Arts', 'Physical Education and Sport', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Physical-Education-and-Sport-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Physical%Education%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CSEC Technical
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Technical', 'Industrial Technology', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Industrial-Technology-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Industrial%Technology%' AND s.curriculum = 'CSEC' AND s.name NOT LIKE '%Unit%' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Technical', 'Technical Drawing', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Technical-Drawing-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Technical%Drawing%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Technical', 'Information Technology', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-Information-Technology-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Information Technology' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Technical', 'EDPM', 'https://www.cxc.org/wp-content/uploads/2018/11/CSEC-EDPM-Syllabus-Revised-2024.pdf', 'Revised 2024', 2024
FROM subjects s WHERE s.name LIKE '%EDPM%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CSEC Other
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CSEC', 'Other', 'Home Economics', 'https://www.cxc.org/SiteAssets/syllabusses/CSEC/CSEC%20Home%20Ec.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Food%Nutrition%' AND s.curriculum = 'CSEC' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- =============================================================================
-- CAPE SYLLABUSES
-- =============================================================================

-- CAPE Sciences
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Sciences', 'Biology', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Biology-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Biology' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Sciences', 'Chemistry', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Chemistry-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Chemistry' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Sciences', 'Physics', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Physics-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Physics' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Sciences', 'Environmental Science', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Environmental-Science-Syllabus-AmendedOctober2025.pdf', 'Amended Oct 2025', 2025
FROM subjects s WHERE s.name LIKE '%Environmental%Science%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Sciences', 'Agricultural Science', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Agricultural-Science-Syllabus-with-Specimen-Papers.pdf', 'With Specimen Papers', NULL
FROM subjects s WHERE s.name LIKE '%Agricultural%Science%' AND s.curriculum = 'CAPE' AND s.name NOT LIKE '%Unit%' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CAPE Mathematics
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Mathematics', 'Pure Mathematics', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Pure-Mathematics-with-Specimen-Papers.pdf', 'With Specimen Papers', NULL
FROM subjects s WHERE s.name = 'Pure Mathematics' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Mathematics', 'Applied Mathematics', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Applied-Mathematics-Syllabus-with-Specimen-Papers.pdf', 'With Specimen Papers', NULL
FROM subjects s WHERE s.name = 'Applied Mathematics' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Mathematics', 'Integrated Mathematics', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Integrated-Mathematics-Syllabus-Revised.pdf', 'Revised', NULL
FROM subjects s WHERE s.name = 'Integrated Mathematics' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CAPE Technical
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Technical', 'Computer Science', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Computer-Science-Syllabus-Eff.-2022.pdf', 'Effective 2022', 2022
FROM subjects s WHERE s.name = 'Computer Science' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Technical', 'Information Technology', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Information-Technology-Syllabus-Eff.-2022.pdf', 'Effective 2022', 2022
FROM subjects s WHERE s.name = 'Information Technology' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Technical', 'Digital Media', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Digital-Media-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Digital%Media%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Technical', 'Animation and Game Design', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Animation-and-Game-Design-Syllabus-Revised.pdf', 'Revised', NULL
FROM subjects s WHERE s.name LIKE '%Animation%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Technical', 'Green Engineering', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Green-Engineering-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Green%Engineering%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Technical', 'Electrical Engineering', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Electrical-and-Electronic-Engineering-Technology-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Electrical%' AND s.curriculum = 'CAPE' AND s.name NOT LIKE '%Unit%' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Technical', 'Building and Mechanical Engineering', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Building-and-Mechanical-Engineering-Syllabus-With-Specimen-Papers.pdf', 'With Specimen Papers', NULL
FROM subjects s WHERE s.name LIKE '%Building%Mechanical%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Technical', 'Mechanical Engineering', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Building-and-Mechanical-Engineering-Syllabus-With-Specimen-Papers.pdf', 'With Specimen Papers', NULL
FROM subjects s WHERE s.name = 'Mechanical Engineering' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CAPE Business
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Business', 'Accounting', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Accounting-Syllabus-Revised.pdf', 'Revised', NULL
FROM subjects s WHERE s.name = 'Accounting' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Business', 'Economics', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Economics-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Economics' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Business', 'Management of Business', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Management-of-Business-Syllabus-Amended-2024.pdf', 'Amended 2024', 2024
FROM subjects s WHERE s.name LIKE '%Management%Business%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Business', 'Entrepreneurship', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Entrepreneurship-Syllabus-Amended.pdf', 'Amended', NULL
FROM subjects s WHERE s.name = 'Entrepreneurship' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Business', 'Logistics and Supply Chain Operations', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Logistics-and-Supply-Chain-Operations-Syllabus-and-Specimen-Papers.pdf', 'With Specimen Papers', NULL
FROM subjects s WHERE s.name LIKE '%Logistics%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Business', 'Financial Services Studies', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Financial-Services-Studies-Syllabus-Revised.pdf', 'Revised', NULL
FROM subjects s WHERE s.name LIKE '%Financial%Services%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Business', 'Tourism', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Tourism-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Tourism' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CAPE Social Studies
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Social Studies', 'Caribbean Studies', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Caribbean-Studies-Syllabus-Amended-October-2023.pdf', 'Amended Oct 2023', 2023
FROM subjects s WHERE s.name LIKE '%Caribbean%Studies%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Social Studies', 'Communication Studies', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Communication-Studies-Syllabus-Revised-2024.pdf', 'Revised 2024', 2024
FROM subjects s WHERE s.name LIKE '%Communication%Studies%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Social Studies', 'Sociology', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Sociology-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Sociology' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Social Studies', 'History', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-History-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'History' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Social Studies', 'Law', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Law-Syllabus-AmendedOctober2025.pdf', 'Amended Oct 2025', 2025
FROM subjects s WHERE s.name = 'Law' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Social Studies', 'Geography', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Geography-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Geography' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Social Studies', 'Criminology', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Criminology-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Criminology' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CAPE Languages
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Languages', 'Literatures in English', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Literatures-in-English-Syllabus-Revised.pdf', 'Revised', NULL
FROM subjects s WHERE s.name LIKE '%Literatures%English%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Languages', 'French', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-French-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'French' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Languages', 'Spanish', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Spanish-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Spanish' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CAPE Arts
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Arts', 'Art and Design', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Art-and-Design-Syllabus-AmendedOctober2025.pdf', 'Amended Oct 2025', 2025
FROM subjects s WHERE s.name LIKE '%Art%Design%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Arts', 'Performing Arts', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Performing-Arts-Syllabus-with-Specimen-Papers-Amended.pdf', 'With Specimen Papers', NULL
FROM subjects s WHERE s.name LIKE '%Performing%Arts%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Arts', 'Music', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Music-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name = 'Music' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- CAPE Other
INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Other', 'Food and Nutrition', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Food-and-Nutrition-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Food%Nutrition%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Other', 'Physical Education and Sport', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Physical-Education-and-Sport-Syllabus-Amended.pdf', 'Amended', NULL
FROM subjects s WHERE s.name LIKE '%Physical%Education%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Other', 'Sports Science', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Sports-Science-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Sports%Science%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Other', 'Digital Literacy', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Digital-Literacy-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Digital%Literacy%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

INSERT INTO syllabuses (subject_id, qualification, category, title, pdf_url, version, effective_year)
SELECT s.id, 'CAPE', 'Other', 'Maritime Operations', 'https://www.cxc.org/wp-content/uploads/2018/11/CAPE-Maritime-Operations-Syllabus.pdf', NULL, NULL
FROM subjects s WHERE s.name LIKE '%Maritime%' AND s.curriculum = 'CAPE' LIMIT 1
ON CONFLICT (subject_id, version) DO NOTHING;

-- =============================================================================
-- SUCCESS MESSAGE
-- =============================================================================

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM syllabuses;
  RAISE NOTICE 'âœ… Syllabuses seeded successfully';
  RAISE NOTICE 'âœ… Total syllabuses in database: %', v_count;
  RAISE NOTICE 'âœ… Curriculum feature ready for use';
END $$;


-- ===== FILE: 031_allow_tutors_read_all_syllabuses.sql =====

-- =====================================================
-- UPDATE SYLLABUSES RLS POLICY
-- =====================================================
-- Allow tutors to read ALL syllabuses (not just their subjects)
-- This enables the "All CXC Syllabuses" reference library

-- Drop the restrictive policy
DROP POLICY IF EXISTS tutors_read_own_syllabuses ON syllabuses;

-- Create new policy: All tutors can read all syllabuses
CREATE POLICY tutors_read_all_syllabuses ON syllabuses
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'tutor'
  )
);

DO $$
BEGIN
  RAISE NOTICE 'âœ… Tutors can now read all syllabuses';
  RAISE NOTICE 'âœ… "All CXC Syllabuses" section will now work correctly';
END $$;














-- ===== FILE: 032_add_verified_subjects_table.sql =====

-- =====================================================
-- CXC VERIFIED SUBJECTS TABLE
-- =====================================================
-- Stores individual verified subjects with grades from CXC results slips
-- Integrates with existing tutor_verification_requests system

-- 1. CREATE TUTOR_VERIFIED_SUBJECTS TABLE
CREATE TABLE IF NOT EXISTS tutor_verified_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  exam_type text NOT NULL CHECK (exam_type IN ('CSEC', 'CAPE')),
  grade integer NOT NULL CHECK (grade >= 1 AND grade <= 9),
  year integer,
  session text,
  verified_by_admin_id uuid REFERENCES profiles(id),
  verified_at timestamptz NOT NULL DEFAULT now(),
  is_public boolean NOT NULL DEFAULT true,
  visibility_updated_at timestamptz,
  source_request_id uuid REFERENCES tutor_verification_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_verified_subjects_tutor ON tutor_verified_subjects(tutor_id);
CREATE INDEX IF NOT EXISTS idx_verified_subjects_subject ON tutor_verified_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_verified_subjects_public ON tutor_verified_subjects(is_public);
CREATE INDEX IF NOT EXISTS idx_verified_subjects_exam_type ON tutor_verified_subjects(exam_type);
CREATE INDEX IF NOT EXISTS idx_verified_subjects_source ON tutor_verified_subjects(source_request_id);

-- 3. ENABLE ROW LEVEL SECURITY
ALTER TABLE tutor_verified_subjects ENABLE ROW LEVEL SECURITY;

-- 4. CREATE RLS POLICIES

-- Policy 1: Admins can INSERT verified subjects
DROP POLICY IF EXISTS "Admins insert verified subjects" ON tutor_verified_subjects;
CREATE POLICY "Admins insert verified subjects"
ON tutor_verified_subjects FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
);

-- Policy 2: Admins can UPDATE grade, exam_type, year, session, subject_id fields
DROP POLICY IF EXISTS "Admins update verified subjects" ON tutor_verified_subjects;
CREATE POLICY "Admins update verified subjects"
ON tutor_verified_subjects FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
);

-- Policy 3: Tutors can UPDATE only is_public and visibility_updated_at on their own rows
DROP POLICY IF EXISTS "Tutors update own visibility" ON tutor_verified_subjects;
CREATE POLICY "Tutors update own visibility"
ON tutor_verified_subjects FOR UPDATE
TO authenticated
USING (tutor_id = auth.uid())
WITH CHECK (tutor_id = auth.uid());

-- Policy 4: Tutors can SELECT all their own verified subjects (public + hidden)
DROP POLICY IF EXISTS "Tutors view own verified subjects" ON tutor_verified_subjects;
CREATE POLICY "Tutors view own verified subjects"
ON tutor_verified_subjects FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

-- Policy 5: Public can SELECT only rows where is_public = true
DROP POLICY IF EXISTS "Public view public verified subjects" ON tutor_verified_subjects;
CREATE POLICY "Public view public verified subjects"
ON tutor_verified_subjects FOR SELECT
TO authenticated
USING (is_public = true);

-- Policy 6: Admins can view all verified subjects
DROP POLICY IF EXISTS "Admins view all verified subjects" ON tutor_verified_subjects;
CREATE POLICY "Admins view all verified subjects"
ON tutor_verified_subjects FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
);

-- Policy 7: Admins can DELETE verified subjects
DROP POLICY IF EXISTS "Admins delete verified subjects" ON tutor_verified_subjects;
CREATE POLICY "Admins delete verified subjects"
ON tutor_verified_subjects FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
);

-- 5. CREATE UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION update_verified_subjects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS verified_subjects_updated_at ON tutor_verified_subjects;
CREATE TRIGGER verified_subjects_updated_at
BEFORE UPDATE ON tutor_verified_subjects
FOR EACH ROW
EXECUTE FUNCTION update_verified_subjects_updated_at();

-- 6. CREATE TRIGGER TO UPDATE visibility_updated_at
CREATE OR REPLACE FUNCTION update_visibility_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_public IS DISTINCT FROM NEW.is_public THEN
    NEW.visibility_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS visibility_updated_timestamp ON tutor_verified_subjects;
CREATE TRIGGER visibility_updated_timestamp
BEFORE UPDATE ON tutor_verified_subjects
FOR EACH ROW
EXECUTE FUNCTION update_visibility_timestamp();

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'âœ… tutor_verified_subjects table created successfully';
  RAISE NOTICE 'âœ… Indexes created for performance';
  RAISE NOTICE 'âœ… RLS policies applied (tutors manage visibility, admins manage content, public view public only)';
  RAISE NOTICE 'âœ… Triggers created for updated_at and visibility_updated_at';
END $$;



-- ===== FILE: 033_verification_storage_policies.sql =====

-- =====================================================
-- VERIFICATION STORAGE BUCKET & POLICIES
-- =====================================================
-- Storage bucket for tutor verification documents (CXC results slips)
-- Path: {tutor_id}/requests/{request_id}.{ext}

-- 1. CREATE STORAGE BUCKET (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('tutor-verifications', 'tutor-verifications', false)
ON CONFLICT (id) DO NOTHING;

-- 2. STORAGE POLICIES

-- Policy 1: Tutors can upload to their own folder
DROP POLICY IF EXISTS "Tutors upload own verification documents" ON storage.objects;
CREATE POLICY "Tutors upload own verification documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tutor-verifications' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 2: Tutors can read their own documents
DROP POLICY IF EXISTS "Tutors read own verification documents" ON storage.objects;
CREATE POLICY "Tutors read own verification documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'tutor-verifications' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 3: Admins can read all verification documents
DROP POLICY IF EXISTS "Admins read all verification documents" ON storage.objects;
CREATE POLICY "Admins read all verification documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'tutor-verifications'
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
);

-- Policy 4: Admins can delete verification documents
DROP POLICY IF EXISTS "Admins delete verification documents" ON storage.objects;
CREATE POLICY "Admins delete verification documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'tutor-verifications'
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (is_reviewer = true OR role = 'admin')
  )
);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'âœ… Storage bucket tutor-verifications configured';
  RAISE NOTICE 'âœ… Storage policies applied (tutors upload/read own, admins read/delete all)';
  RAISE NOTICE 'âœ… Path format: {tutor_id}/requests/{request_id}.{ext}';
END $$;














-- ===== FILE: 034_allow_admin_update_verification_status.sql =====

-- =====================================================
-- ALLOW ADMINS TO UPDATE VERIFICATION STATUS
-- =====================================================
-- Adds helper function and RLS policy so admins can revoke/update tutor verification status

-- 1. Create helper function to check if user is admin/reviewer
-- Using SECURITY DEFINER to bypass RLS and avoid infinite recursion
CREATE OR REPLACE FUNCTION is_admin_or_reviewer(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id
    AND (is_reviewer = true OR role = 'admin')
  );
END;
$$;

-- 2. Policy: Admins/Reviewers can update tutor_verification_status and tutor_verified_at
DROP POLICY IF EXISTS "Admins update tutor verification status" ON profiles;
CREATE POLICY "Admins update tutor verification status"
ON profiles FOR UPDATE
TO authenticated
USING (
  -- User is updating their own profile OR user is admin/reviewer
  id = auth.uid() 
  OR is_admin_or_reviewer(auth.uid())
)
WITH CHECK (
  -- User is updating their own profile OR user is admin/reviewer
  id = auth.uid() 
  OR is_admin_or_reviewer(auth.uid())
);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'âœ… Helper function created: is_admin_or_reviewer()';
  RAISE NOTICE 'âœ… RLS policy added: Admins can now update tutor verification status';
  RAISE NOTICE 'âœ… Admins with is_reviewer=true or role=admin can update profiles';
END $$;



-- ===== FILE: 035_fix_verification_rls_for_admins.sql =====

-- =====================================================
-- FIX VERIFICATION RLS TO INCLUDE ADMINS
-- =====================================================
-- The existing policy only checks is_reviewer=true
-- This adds support for role='admin' as well

-- Update Policy 3: Reviewers AND Admins can view ALL verification requests
-- Uses the is_admin_or_reviewer() helper from migration 034
DROP POLICY IF EXISTS "Reviewers view all verification requests" ON tutor_verification_requests;
CREATE POLICY "Reviewers view all verification requests"
ON tutor_verification_requests FOR SELECT
TO authenticated
USING (
  is_admin_or_reviewer(auth.uid())
);

-- Update Policy 4: Reviewers AND Admins can update verification requests
DROP POLICY IF EXISTS "Reviewers update verification requests" ON tutor_verification_requests;
CREATE POLICY "Reviewers update verification requests"
ON tutor_verification_requests FOR UPDATE
TO authenticated
USING (
  is_admin_or_reviewer(auth.uid())
);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'âœ… Verification RLS policies updated!';
  RAISE NOTICE 'âœ… Users with is_reviewer=true OR role=admin can now view/update verification requests';
END $$;



-- ===== FILE: 036_fix_storage_rls_for_admins.sql =====

-- =====================================================
-- FIX STORAGE RLS TO USE SECURITY DEFINER FUNCTION
-- =====================================================
-- The storage policies need to use the same helper function
-- we created in migration 034 to avoid RLS recursion issues

-- Update Policy 3: Admins can read all verification documents
DROP POLICY IF EXISTS "Admins read all verification documents" ON storage.objects;
CREATE POLICY "Admins read all verification documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'tutor-verifications'
  AND is_admin_or_reviewer(auth.uid())
);

-- Update Policy 4: Admins can delete verification documents
DROP POLICY IF EXISTS "Admins delete verification documents" ON storage.objects;
CREATE POLICY "Admins delete verification documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'tutor-verifications'
  AND is_admin_or_reviewer(auth.uid())
);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'âœ… Storage RLS policies updated!';
  RAISE NOTICE 'âœ… Admins and reviewers can now read/delete verification documents';
END $$;



-- ===== FILE: 037_allow_tutor_update_file_path.sql =====

-- =====================================================
-- ALLOW TUTORS TO UPDATE FILE PATH
-- =====================================================
-- Tutors need to update the file_path field after uploading
-- Currently they can only INSERT but not UPDATE their own requests

-- Add policy: Tutors can UPDATE their own verification requests (for file_path)
DROP POLICY IF EXISTS "Tutors update own verification requests" ON tutor_verification_requests;
CREATE POLICY "Tutors update own verification requests"
ON tutor_verification_requests FOR UPDATE
TO authenticated
USING (tutor_id = auth.uid())
WITH CHECK (tutor_id = auth.uid());

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'âœ… RLS policy added: Tutors can now update their own verification requests';
  RAISE NOTICE 'âœ… This allows tutors to update file_path after uploading documents';
END $$;














-- ===== FILE: 038_set_verified_subjects_public_by_default.sql =====

-- =====================================================
-- SET VERIFIED SUBJECTS TO PUBLIC BY DEFAULT
-- =====================================================
-- Changes default behavior so verified subjects are visible
-- by default when admin adds them. Tutors can still hide
-- them later if needed.

-- 1. Update all existing hidden subjects to be public
UPDATE tutor_verified_subjects
SET 
  is_public = true,
  visibility_updated_at = now()
WHERE is_public = false;

-- 2. Change the default value for future inserts
ALTER TABLE tutor_verified_subjects 
ALTER COLUMN is_public SET DEFAULT true;

-- 3. Verify the change
SELECT 
  COUNT(*) as total_subjects,
  COUNT(*) FILTER (WHERE is_public = true) as public_subjects,
  COUNT(*) FILTER (WHERE is_public = false) as hidden_subjects
FROM tutor_verified_subjects;














-- ===== FILE: 039_update_commission_tiers.sql =====

-- =====================================================
-- UPDATE COMMISSION TIERS
-- =====================================================
-- Updates the compute_platform_fee function to match new commission structure:
-- - Sessions < $100: 10%
-- - Sessions $100-$199: 15%
-- - Sessions $200+: 20%

-- Drop and recreate the function with correct tiers
DROP FUNCTION IF EXISTS compute_platform_fee(numeric);

CREATE OR REPLACE FUNCTION compute_platform_fee(price_ttd numeric)
RETURNS TABLE(pct integer, fee numeric, payout numeric)
AS $$
DECLARE
  v_pct integer;
  v_fee numeric;
  v_payout numeric;
BEGIN
  -- Determine fee percentage based on NEW price tiers
  IF price_ttd < 100 THEN
    v_pct := 10;
  ELSIF price_ttd >= 100 AND price_ttd < 200 THEN
    v_pct := 15;
  ELSE
    v_pct := 20;
  END IF;
  
  -- Calculate fee and payout amounts
  v_fee := ROUND(price_ttd * v_pct / 100.0, 2);
  v_payout := price_ttd - v_fee;
  
  RETURN QUERY SELECT v_pct, v_fee, v_payout;
END;
$$ LANGUAGE plpgsql;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION compute_platform_fee TO authenticated;

-- Test the function with different price points
DO $$
DECLARE
  result RECORD;
BEGIN
  RAISE NOTICE '=== Testing Commission Tiers ===';
  
  -- Test $50 (should be 10%)
  SELECT * INTO result FROM compute_platform_fee(50);
  RAISE NOTICE '$50 session: % commission, $% fee, $% payout', result.pct, result.fee, result.payout;
  
  -- Test $99 (should be 10%)
  SELECT * INTO result FROM compute_platform_fee(99);
  RAISE NOTICE '$99 session: % commission, $% fee, $% payout', result.pct, result.fee, result.payout;
  
  -- Test $100 (should be 15%)
  SELECT * INTO result FROM compute_platform_fee(100);
  RAISE NOTICE '$100 session: % commission, $% fee, $% payout', result.pct, result.fee, result.payout;
  
  -- Test $150 (should be 15%)
  SELECT * INTO result FROM compute_platform_fee(150);
  RAISE NOTICE '$150 session: % commission, $% fee, $% payout', result.pct, result.fee, result.payout;
  
  -- Test $199 (should be 15%)
  SELECT * INTO result FROM compute_platform_fee(199);
  RAISE NOTICE '$199 session: % commission, $% fee, $% payout', result.pct, result.fee, result.payout;
  
  -- Test $200 (should be 20%)
  SELECT * INTO result FROM compute_platform_fee(200);
  RAISE NOTICE '$200 session: % commission, $% fee, $% payout', result.pct, result.fee, result.payout;
  
  -- Test $300 (should be 20%)
  SELECT * INTO result FROM compute_platform_fee(300);
  RAISE NOTICE '$300 session: % commission, $% fee, $% payout', result.pct, result.fee, result.payout;
  
  RAISE NOTICE 'âœ… Commission tiers updated successfully!';
END $$;














-- ===== FILE: 040_add_account_suspension_fields.sql =====

-- =====================================================
-- Add Account Suspension Fields to Profiles
-- =====================================================
-- Adds fields to track account suspension status

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS suspension_reason text,
ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS suspension_lifted_at timestamptz,
ADD COLUMN IF NOT EXISTS suspension_lifted_by uuid REFERENCES public.profiles(id);

-- Create index for querying suspended accounts
CREATE INDEX IF NOT EXISTS idx_profiles_is_suspended ON public.profiles(is_suspended) WHERE is_suspended = true;

-- Create index for suspension history queries
CREATE INDEX IF NOT EXISTS idx_profiles_suspended_at ON public.profiles(suspended_at) WHERE suspended_at IS NOT NULL;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'âœ… Account suspension fields added to profiles table';
END $$;















-- ===== FILE: 041_fix_admin_rls_for_reviewers.sql =====

-- =====================================================
-- FIX ADMIN RLS TO INCLUDE REVIEWERS
-- =====================================================
-- Update RLS policies to allow users with is_reviewer=true
-- to read all profiles, not just users with role='admin'

BEGIN;

-- Create a function that checks for both reviewer and admin
CREATE OR REPLACE FUNCTION public.is_admin_or_reviewer()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() 
    AND (role = 'admin' OR is_reviewer = true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_admin_or_reviewer() TO authenticated;

-- Drop the old policy that only checked is_admin()
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;

-- Create new policy that checks for both admin and reviewer
CREATE POLICY "Admins and reviewers can read all profiles"
ON public.profiles FOR SELECT
USING (public.is_admin_or_reviewer());

-- Also update the update policy to use the new function
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Admins and reviewers can update all profiles"
ON public.profiles FOR UPDATE
USING (public.is_admin_or_reviewer());

COMMENT ON FUNCTION public.is_admin_or_reviewer IS 'Returns true if the current user has admin role or is_reviewer flag';

COMMIT;














-- ===== FILE: 042_communities_core.sql =====

-- =====================================================
-- COMMUNITIES CORE TABLES
-- =====================================================
-- Creates the foundation for school communities and subject Q&A communities

-- 1. CREATE ENUMS
DO $$ BEGIN
  CREATE TYPE community_type AS ENUM ('school', 'school_form', 'subject_qa');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE community_audience AS ENUM ('students', 'itutors', 'mixed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('member', 'moderator', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE member_status AS ENUM ('active', 'restricted', 'timed_out', 'banned');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. CREATE COMMUNITIES TABLE
CREATE TABLE IF NOT EXISTS communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type community_type NOT NULL,
  audience community_audience NOT NULL DEFAULT 'students',
  
  -- For school and school_form types
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  form_level text, -- e.g., "Form 1", "Form 2", "Lower 6", "Upper 6"
  
  -- For subject_qa types
  subject_id uuid REFERENCES subjects(id) ON DELETE CASCADE,
  level_tag text, -- e.g., "Form 4", "CSEC", "CAPE Unit 1"
  
  -- Community metadata
  is_auto boolean NOT NULL DEFAULT false, -- true for school/form communities
  is_joinable boolean NOT NULL DEFAULT true, -- false for school/form (auto-assigned only)
  description text,
  image_url text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT school_has_institution CHECK (
    type IN ('school', 'school_form') AND institution_id IS NOT NULL
    OR type = 'subject_qa'
  ),
  CONSTRAINT subject_qa_has_subject CHECK (
    type = 'subject_qa' AND subject_id IS NOT NULL
    OR type IN ('school', 'school_form')
  ),
  CONSTRAINT unique_school_community UNIQUE (type, institution_id, form_level),
  CONSTRAINT unique_subject_community UNIQUE (type, subject_id, level_tag)
);

-- 3. CREATE INDEXES FOR COMMUNITIES
CREATE INDEX IF NOT EXISTS idx_communities_type ON communities(type);
CREATE INDEX IF NOT EXISTS idx_communities_type_institution ON communities(type, institution_id);
CREATE INDEX IF NOT EXISTS idx_communities_type_subject_level ON communities(type, subject_id, level_tag);
CREATE INDEX IF NOT EXISTS idx_communities_is_joinable ON communities(is_joinable) WHERE is_joinable = true;
CREATE INDEX IF NOT EXISTS idx_communities_audience ON communities(audience);

-- 4. CREATE COMMUNITY_MEMBERSHIPS TABLE
CREATE TABLE IF NOT EXISTS community_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  status member_status NOT NULL DEFAULT 'active',
  timed_out_until timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  
  -- Prevent duplicate memberships
  CONSTRAINT unique_community_member UNIQUE (community_id, user_id)
);

-- 5. CREATE INDEXES FOR MEMBERSHIPS
CREATE INDEX IF NOT EXISTS idx_memberships_user ON community_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_community ON community_memberships(community_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON community_memberships(status);
CREATE INDEX IF NOT EXISTS idx_memberships_role ON community_memberships(role) WHERE role IN ('moderator', 'admin');

-- 6. CREATE TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION update_communities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER communities_updated_at
  BEFORE UPDATE ON communities
  FOR EACH ROW
  EXECUTE FUNCTION update_communities_updated_at();

-- 7. ENABLE RLS
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_memberships ENABLE ROW LEVEL SECURITY;

-- 8. COMMENTS
COMMENT ON TABLE communities IS 'Communities for schools, forms, and subject Q&A';
COMMENT ON TABLE community_memberships IS 'User memberships in communities with roles and status';
COMMENT ON COLUMN communities.is_auto IS 'True for school/form communities that are auto-assigned';
COMMENT ON COLUMN communities.is_joinable IS 'False for school/form communities, true for subject Q&A';
COMMENT ON COLUMN community_memberships.status IS 'User status: active, restricted (read-only), timed_out, or banned';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'âœ… Communities core tables created successfully';
  RAISE NOTICE '   - communities table with type, audience, and metadata';
  RAISE NOTICE '   - community_memberships table with roles and status';
  RAISE NOTICE '   - Comprehensive indexes for performance';
  RAISE NOTICE '   - RLS enabled (policies in separate migration)';
END $$;














-- ===== FILE: 043_extend_messages_for_communities.sql =====

-- =====================================================
-- EXTEND MESSAGES SYSTEM FOR COMMUNITIES
-- =====================================================
-- Unifies messaging by extending existing conversations and messages tables
-- to support community Q&A alongside DMs and booking threads

-- 1. CREATE ENUMS
DO $$ BEGIN
  CREATE TYPE message_type AS ENUM ('dm', 'question', 'answer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE conversation_type AS ENUM ('dm', 'booking', 'group');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE question_status AS ENUM ('open', 'answered', 'locked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. EXTEND CONVERSATIONS TABLE
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS conversation_type conversation_type DEFAULT 'dm',
ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES communities(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS participant_ids uuid[] DEFAULT '{}';

-- Backfill existing conversations as 'dm' or 'booking'
UPDATE conversations
SET conversation_type = 'dm'
WHERE conversation_type IS NULL;

-- Index for group chat participants
CREATE INDEX IF NOT EXISTS idx_conversations_participants ON conversations USING GIN(participant_ids);
CREATE INDEX IF NOT EXISTS idx_conversations_community ON conversations(community_id);
CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(conversation_type);

-- 3. EXTEND MESSAGES TABLE FOR QUESTIONS AND ANSWERS
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS message_type message_type DEFAULT 'dm',
ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES communities(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS question_id uuid REFERENCES messages(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS topic_tag text,
ADD COLUMN IF NOT EXISTS status question_status DEFAULT 'open',
ADD COLUMN IF NOT EXISTS best_answer_id uuid REFERENCES messages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS answer_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS views_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS helpful_count integer DEFAULT 0;

-- Backfill existing messages as 'dm'
UPDATE messages
SET message_type = 'dm'
WHERE message_type IS NULL;

-- 4. CREATE INDEXES FOR COMMUNITY Q&A
-- Questions in a community, sorted by creation
CREATE INDEX IF NOT EXISTS idx_messages_community_questions ON messages(community_id, message_type, created_at DESC)
WHERE message_type = 'question';

-- Questions by status
CREATE INDEX IF NOT EXISTS idx_messages_community_status ON messages(community_id, status, created_at DESC)
WHERE message_type = 'question';

-- Pinned questions
CREATE INDEX IF NOT EXISTS idx_messages_community_pinned ON messages(community_id, is_pinned, created_at DESC)
WHERE message_type = 'question' AND is_pinned = true;

-- Answers for a question
CREATE INDEX IF NOT EXISTS idx_messages_question_answers ON messages(question_id, created_at)
WHERE message_type = 'answer';

-- Questions by author
CREATE INDEX IF NOT EXISTS idx_messages_author_questions ON messages(sender_id, message_type, created_at DESC)
WHERE message_type = 'question';

-- Best answers
CREATE INDEX IF NOT EXISTS idx_messages_best_answers ON messages(best_answer_id)
WHERE best_answer_id IS NOT NULL;

-- Topic tags for filtering
CREATE INDEX IF NOT EXISTS idx_messages_topic_tag ON messages(topic_tag)
WHERE topic_tag IS NOT NULL;

-- 5. CREATE FUNCTION TO INCREMENT ANSWER COUNT
CREATE OR REPLACE FUNCTION increment_answer_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.message_type = 'answer' AND NEW.question_id IS NOT NULL THEN
    UPDATE messages
    SET answer_count = answer_count + 1
    WHERE id = NEW.question_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER answer_count_increment
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION increment_answer_count();

-- 6. CREATE FUNCTION TO DECREMENT ANSWER COUNT
CREATE OR REPLACE FUNCTION decrement_answer_count()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.message_type = 'answer' AND OLD.question_id IS NOT NULL THEN
    UPDATE messages
    SET answer_count = GREATEST(0, answer_count - 1)
    WHERE id = OLD.question_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER answer_count_decrement
  AFTER DELETE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION decrement_answer_count();

-- 7. CREATE FUNCTION TO AUTO-UPDATE QUESTION STATUS
CREATE OR REPLACE FUNCTION update_question_status()
RETURNS TRIGGER AS $$
BEGIN
  -- When answer count goes from 0 to 1+, mark as 'answered'
  IF NEW.answer_count > 0 AND OLD.answer_count = 0 AND NEW.status = 'open' THEN
    NEW.status = 'answered';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER question_status_update
  BEFORE UPDATE ON messages
  FOR EACH ROW
  WHEN (OLD.answer_count IS DISTINCT FROM NEW.answer_count)
  EXECUTE FUNCTION update_question_status();

-- 8. COMMENTS
COMMENT ON COLUMN messages.message_type IS 'Type: dm (direct message), question (community Q&A), answer (to a question)';
COMMENT ON COLUMN messages.community_id IS 'Reference to community for questions and answers';
COMMENT ON COLUMN messages.question_id IS 'For answers, reference to the parent question';
COMMENT ON COLUMN messages.title IS 'For questions, the question title';
COMMENT ON COLUMN messages.topic_tag IS 'Optional topic/category tag for questions';
COMMENT ON COLUMN messages.status IS 'Question status: open, answered, locked';
COMMENT ON COLUMN messages.best_answer_id IS 'ID of the marked best answer for this question';
COMMENT ON COLUMN messages.answer_count IS 'Number of answers to this question (auto-incremented)';
COMMENT ON COLUMN messages.views_count IS 'Number of times this question has been viewed';
COMMENT ON COLUMN messages.is_pinned IS 'Whether this question is pinned by moderators';
COMMENT ON COLUMN messages.helpful_count IS 'Number of helpful reactions to an answer';

COMMENT ON COLUMN conversations.conversation_type IS 'Type: dm (1-on-1), booking (tutoring thread), group (group chat)';
COMMENT ON COLUMN conversations.participant_ids IS 'Array of all participant IDs for group chats';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'âœ… Messages system extended for communities';
  RAISE NOTICE '   - messages table supports questions and answers';
  RAISE NOTICE '   - conversations table supports group chats';
  RAISE NOTICE '   - Auto-increment/decrement answer_count triggers';
  RAISE NOTICE '   - Auto-update question status trigger';
  RAISE NOTICE '   - Comprehensive indexes for Q&A performance';
END $$;














-- ===== FILE: 044_community_moderation.sql =====

-- =====================================================
-- COMMUNITY MODERATION SYSTEM
-- =====================================================
-- Creates tables for reports and moderator actions

-- 1. CREATE ENUMS
DO $$ BEGIN
  CREATE TYPE report_target_type AS ENUM ('question', 'answer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE report_reason AS ENUM (
    'spam',
    'harassment',
    'inappropriate',
    'off_platform_payments',
    'misinformation',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE mod_action_type AS ENUM (
    'restrict_user',
    'timeout_user',
    'ban_user',
    'unban_user',
    'remove_question',
    'remove_answer',
    'lock_question',
    'unlock_question',
    'pin_question',
    'unpin_question',
    'mark_best_answer',
    'update_community_profile'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. CREATE COMMUNITY_REPORTS TABLE
CREATE TABLE IF NOT EXISTS community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  target_type report_target_type NOT NULL,
  target_id uuid NOT NULL, -- ID of the question or answer message
  reason report_reason NOT NULL,
  details text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Prevent duplicate reports from same user for same target
  CONSTRAINT unique_user_target_report UNIQUE (reporter_id, target_id)
);

-- 3. CREATE INDEXES FOR REPORTS
CREATE INDEX IF NOT EXISTS idx_reports_target ON community_reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_community ON community_reports(community_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON community_reports(reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON community_reports(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reports_created ON community_reports(created_at DESC);

-- 4. CREATE COMMUNITY_MOD_ACTIONS TABLE
CREATE TABLE IF NOT EXISTS community_mod_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  moderator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action_type mod_action_type NOT NULL,
  target_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  target_id uuid, -- ID of question/answer if applicable
  reason text,
  metadata jsonb, -- Additional data (e.g., timeout duration, previous status)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. CREATE INDEXES FOR MOD ACTIONS
CREATE INDEX IF NOT EXISTS idx_mod_actions_community ON community_mod_actions(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_actions_moderator ON community_mod_actions(moderator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_actions_target_user ON community_mod_actions(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_actions_type ON community_mod_actions(action_type, created_at DESC);

-- 6. CREATE FUNCTION TO LOG MODERATION ACTIONS
CREATE OR REPLACE FUNCTION log_mod_action(
  p_community_id uuid,
  p_moderator_id uuid,
  p_action_type mod_action_type,
  p_target_user_id uuid DEFAULT NULL,
  p_target_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_action_id uuid;
BEGIN
  INSERT INTO community_mod_actions (
    community_id,
    moderator_id,
    action_type,
    target_user_id,
    target_id,
    reason,
    metadata
  ) VALUES (
    p_community_id,
    p_moderator_id,
    p_action_type,
    p_target_user_id,
    p_target_id,
    p_reason,
    p_metadata
  ) RETURNING id INTO v_action_id;
  
  RETURN v_action_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. ENABLE RLS
ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_mod_actions ENABLE ROW LEVEL SECURITY;

-- 8. COMMENTS
COMMENT ON TABLE community_reports IS 'User reports of inappropriate questions or answers';
COMMENT ON TABLE community_mod_actions IS 'Log of all moderation actions taken in communities';

COMMENT ON COLUMN community_reports.target_type IS 'Type of content being reported: question or answer';
COMMENT ON COLUMN community_reports.target_id IS 'ID of the message (question or answer) being reported';
COMMENT ON COLUMN community_reports.reason IS 'Reason for report: spam, harassment, inappropriate, etc.';
COMMENT ON COLUMN community_reports.status IS 'Report status: pending, reviewing, resolved, dismissed';

COMMENT ON COLUMN community_mod_actions.action_type IS 'Type of moderation action taken';
COMMENT ON COLUMN community_mod_actions.target_user_id IS 'User affected by the action (if applicable)';
COMMENT ON COLUMN community_mod_actions.target_id IS 'Question/answer affected by the action (if applicable)';
COMMENT ON COLUMN community_mod_actions.metadata IS 'Additional action data in JSON format';

COMMENT ON FUNCTION log_mod_action IS 'Helper function to log moderation actions';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'âœ… Community moderation system created';
  RAISE NOTICE '   - community_reports table with status tracking';
  RAISE NOTICE '   - community_mod_actions table for audit log';
  RAISE NOTICE '   - Helper function log_mod_action() for logging';
  RAISE NOTICE '   - RLS enabled (policies in separate migration)';
END $$;














-- ===== FILE: 045_community_auto_assignment.sql =====

-- =====================================================
-- COMMUNITY AUTO-ASSIGNMENT SYSTEM
-- =====================================================
-- Automatically assigns users to school and form communities
-- based on their institution_id and form_level

-- 1. CREATE FUNCTION TO AUTO-CREATE SCHOOL COMMUNITIES
CREATE OR REPLACE FUNCTION ensure_school_communities(p_institution_id uuid)
RETURNS void AS $$
DECLARE
  v_institution_name text;
  v_form_levels text[] := ARRAY['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5', 'Form 6', 'Lower 6', 'Upper 6'];
  v_form_level text;
BEGIN
  -- Get institution name
  SELECT name INTO v_institution_name
  FROM institutions
  WHERE id = p_institution_id;
  
  IF v_institution_name IS NULL THEN
    RETURN;
  END IF;
  
  -- Create main school community if doesn't exist
  INSERT INTO communities (
    name,
    type,
    audience,
    institution_id,
    is_auto,
    is_joinable,
    description
  ) VALUES (
    v_institution_name,
    'school',
    'mixed',
    p_institution_id,
    true,
    false,
    'Main community for ' || v_institution_name
  ) ON CONFLICT (type, institution_id, form_level) DO NOTHING;
  
  -- Create form communities for each form level
  FOREACH v_form_level IN ARRAY v_form_levels
  LOOP
    INSERT INTO communities (
      name,
      type,
      audience,
      institution_id,
      form_level,
      is_auto,
      is_joinable,
      description
    ) VALUES (
      v_institution_name || ' - ' || v_form_level,
      'school_form',
      'mixed',
      p_institution_id,
      v_form_level,
      true,
      false,
      v_form_level || ' community for ' || v_institution_name
    ) ON CONFLICT (type, institution_id, form_level) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. CREATE FUNCTION TO AUTO-ASSIGN USER TO COMMUNITIES
CREATE OR REPLACE FUNCTION auto_assign_school_communities()
RETURNS TRIGGER AS $$
DECLARE
  v_school_community_id uuid;
  v_form_community_id uuid;
BEGIN
  -- Only process if institution_id is set
  IF NEW.institution_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Ensure communities exist for this institution
  PERFORM ensure_school_communities(NEW.institution_id);
  
  -- Get school community ID
  SELECT id INTO v_school_community_id
  FROM communities
  WHERE type = 'school'
    AND institution_id = NEW.institution_id;
  
  -- Assign to school community if found
  IF v_school_community_id IS NOT NULL THEN
    INSERT INTO community_memberships (
      community_id,
      user_id,
      role,
      status
    ) VALUES (
      v_school_community_id,
      NEW.id,
      'member',
      'active'
    ) ON CONFLICT (community_id, user_id) DO NOTHING;
  END IF;
  
  -- If form_level is set, assign to form community
  IF NEW.form_level IS NOT NULL AND NEW.form_level != '' THEN
    SELECT id INTO v_form_community_id
    FROM communities
    WHERE type = 'school_form'
      AND institution_id = NEW.institution_id
      AND form_level = NEW.form_level;
    
    IF v_form_community_id IS NOT NULL THEN
      INSERT INTO community_memberships (
        community_id,
        user_id,
        role,
        status
      ) VALUES (
        v_form_community_id,
        NEW.id,
        'member',
        'active'
      ) ON CONFLICT (community_id, user_id) DO NOTHING;
    END IF;
  END IF;
  
  -- Handle changes: remove old memberships if institution or form changed
  IF TG_OP = 'UPDATE' THEN
    -- If institution changed, remove old school community memberships
    IF OLD.institution_id IS DISTINCT FROM NEW.institution_id AND OLD.institution_id IS NOT NULL THEN
      DELETE FROM community_memberships
      WHERE user_id = NEW.id
        AND community_id IN (
          SELECT id FROM communities
          WHERE institution_id = OLD.institution_id
            AND type IN ('school', 'school_form')
            AND is_auto = true
        );
    END IF;
    
    -- If form_level changed within same institution, remove old form membership
    IF OLD.form_level IS DISTINCT FROM NEW.form_level 
       AND NEW.institution_id = OLD.institution_id 
       AND OLD.form_level IS NOT NULL THEN
      DELETE FROM community_memberships
      WHERE user_id = NEW.id
        AND community_id IN (
          SELECT id FROM communities
          WHERE institution_id = NEW.institution_id
            AND type = 'school_form'
            AND form_level = OLD.form_level
            AND is_auto = true
        );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. CREATE TRIGGER ON PROFILES TABLE
DROP TRIGGER IF EXISTS trigger_auto_assign_communities ON profiles;
CREATE TRIGGER trigger_auto_assign_communities
  AFTER INSERT OR UPDATE OF institution_id, form_level ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_school_communities();

-- 4. CREATE FUNCTION TO BACKFILL EXISTING USERS
CREATE OR REPLACE FUNCTION backfill_school_community_memberships()
RETURNS void AS $$
DECLARE
  v_profile RECORD;
  v_count integer := 0;
BEGIN
  RAISE NOTICE 'Starting backfill of school community memberships...';
  
  -- Process all users with institution_id
  FOR v_profile IN
    SELECT id, institution_id, form_level
    FROM profiles
    WHERE institution_id IS NOT NULL
  LOOP
    -- Ensure communities exist
    PERFORM ensure_school_communities(v_profile.institution_id);
    
    -- Assign to school community
    INSERT INTO community_memberships (community_id, user_id, role, status)
    SELECT c.id, v_profile.id, 'member', 'active'
    FROM communities c
    WHERE c.type = 'school'
      AND c.institution_id = v_profile.institution_id
    ON CONFLICT (community_id, user_id) DO NOTHING;
    
    -- Assign to form community if form_level set
    IF v_profile.form_level IS NOT NULL AND v_profile.form_level != '' THEN
      INSERT INTO community_memberships (community_id, user_id, role, status)
      SELECT c.id, v_profile.id, 'member', 'active'
      FROM communities c
      WHERE c.type = 'school_form'
        AND c.institution_id = v_profile.institution_id
        AND c.form_level = v_profile.form_level
      ON CONFLICT (community_id, user_id) DO NOTHING;
    END IF;
    
    v_count := v_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Backfill complete: processed % users', v_count;
END;
$$ LANGUAGE plpgsql;

-- 5. RUN BACKFILL FOR EXISTING USERS
SELECT backfill_school_community_memberships();

-- 6. COMMENTS
COMMENT ON FUNCTION ensure_school_communities IS 'Creates school and form communities for an institution if they don''t exist';
COMMENT ON FUNCTION auto_assign_school_communities IS 'Trigger function to auto-assign users to school/form communities';
COMMENT ON FUNCTION backfill_school_community_memberships IS 'One-time function to backfill existing users into communities';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'âœ… Community auto-assignment system created';
  RAISE NOTICE '   - ensure_school_communities() creates communities on demand';
  RAISE NOTICE '   - auto_assign_school_communities() trigger on profiles';
  RAISE NOTICE '   - Automatically assigns users on insert/update';
  RAISE NOTICE '   - Handles institution and form_level changes';
  RAISE NOTICE '   - Backfilled existing users into communities';
END $$;














-- ===== FILE: 046_community_rls_policies.sql =====

-- =====================================================
-- COMMUNITY RLS POLICIES
-- =====================================================
-- Implements row-level security for all community tables

-- =====================================================
-- COMMUNITIES TABLE POLICIES
-- =====================================================

-- Policy: Authenticated users can read all communities
DROP POLICY IF EXISTS "Authenticated users can read communities" ON communities;
CREATE POLICY "Authenticated users can read communities"
ON communities FOR SELECT
TO authenticated
USING (true);

-- Policy: Only admins can create school/form communities
DROP POLICY IF EXISTS "Admins can create school communities" ON communities;
CREATE POLICY "Admins can create school communities"
ON communities FOR INSERT
TO authenticated
WITH CHECK (
  type IN ('school', 'school_form') AND (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
);

-- Policy: Users can create subject_qa communities (if joinable)
DROP POLICY IF EXISTS "Users can create subject communities" ON communities;
CREATE POLICY "Users can create subject communities"
ON communities FOR INSERT
TO authenticated
WITH CHECK (
  type = 'subject_qa' AND is_joinable = true
);

-- Policy: Moderators and admins can update their communities
DROP POLICY IF EXISTS "Moderators can update communities" ON communities;
CREATE POLICY "Moderators can update communities"
ON communities FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = communities.id
      AND user_id = auth.uid()
      AND role IN ('moderator', 'admin')
      AND status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = communities.id
      AND user_id = auth.uid()
      AND role IN ('moderator', 'admin')
      AND status = 'active'
  )
);

-- =====================================================
-- COMMUNITY_MEMBERSHIPS TABLE POLICIES
-- =====================================================

-- Policy: Users can read their own memberships
DROP POLICY IF EXISTS "Users can read own memberships" ON community_memberships;
CREATE POLICY "Users can read own memberships"
ON community_memberships FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Policy: Members can read other members in their communities
DROP POLICY IF EXISTS "Members can read community members" ON community_memberships;
CREATE POLICY "Members can read community members"
ON community_memberships FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_memberships cm
    WHERE cm.community_id = community_memberships.community_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'active'
  )
);

-- Policy: Users can join joinable communities
DROP POLICY IF EXISTS "Users can join communities" ON community_memberships;
CREATE POLICY "Users can join communities"
ON community_memberships FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM communities
    WHERE id = community_memberships.community_id
      AND is_joinable = true
  )
);

-- Policy: Users can leave communities they joined (not auto-assigned)
DROP POLICY IF EXISTS "Users can leave communities" ON community_memberships;
CREATE POLICY "Users can leave communities"
ON community_memberships FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM communities
    WHERE id = community_memberships.community_id
      AND is_joinable = true
  )
);

-- Policy: Moderators can update member status
DROP POLICY IF EXISTS "Moderators can update memberships" ON community_memberships;
CREATE POLICY "Moderators can update memberships"
ON community_memberships FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_memberships cm
    WHERE cm.community_id = community_memberships.community_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('moderator', 'admin')
      AND cm.status = 'active'
  )
);

-- =====================================================
-- MESSAGES TABLE POLICIES (FOR Q&A)
-- =====================================================

-- Policy: Members can read questions/answers in their communities
DROP POLICY IF EXISTS "Members can read community questions" ON messages;
CREATE POLICY "Members can read community questions"
ON messages FOR SELECT
TO authenticated
USING (
  (message_type IN ('question', 'answer') AND community_id IS NOT NULL AND
   EXISTS (
     SELECT 1 FROM community_memberships
     WHERE community_id = messages.community_id
       AND user_id = auth.uid()
       AND status = 'active'
   ))
  OR
  (message_type = 'dm' OR community_id IS NULL)
);

-- Policy: Active members can create questions
DROP POLICY IF EXISTS "Active members can create questions" ON messages;
CREATE POLICY "Active members can create questions"
ON messages FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (
    (message_type = 'question' AND community_id IS NOT NULL AND
     EXISTS (
       SELECT 1 FROM community_memberships
       WHERE community_id = messages.community_id
         AND user_id = auth.uid()
         AND status = 'active'
     ))
    OR
    (message_type IN ('dm', 'answer') AND (community_id IS NULL OR 
     EXISTS (
       SELECT 1 FROM community_memberships
       WHERE community_id = messages.community_id
         AND user_id = auth.uid()
         AND status = 'active'
     )))
  )
);

-- Policy: Users can update their own messages (within 15 minutes)
DROP POLICY IF EXISTS "Users can edit own messages" ON messages;
CREATE POLICY "Users can edit own messages"
ON messages FOR UPDATE
TO authenticated
USING (
  sender_id = auth.uid()
  AND created_at > (now() - interval '15 minutes')
)
WITH CHECK (sender_id = auth.uid());

-- Policy: Moderators can update questions (pin, lock, mark best answer)
DROP POLICY IF EXISTS "Moderators can update questions" ON messages;
CREATE POLICY "Moderators can update questions"
ON messages FOR UPDATE
TO authenticated
USING (
  message_type = 'question'
  AND EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = messages.community_id
      AND user_id = auth.uid()
      AND role IN ('moderator', 'admin')
      AND status = 'active'
  )
);

-- Policy: Authors and moderators can delete questions/answers
DROP POLICY IF EXISTS "Authors and moderators can delete" ON messages;
CREATE POLICY "Authors and moderators can delete"
ON messages FOR DELETE
TO authenticated
USING (
  (sender_id = auth.uid())
  OR
  (message_type IN ('question', 'answer') AND
   EXISTS (
     SELECT 1 FROM community_memberships
     WHERE community_id = messages.community_id
       AND user_id = auth.uid()
       AND role IN ('moderator', 'admin')
       AND status = 'active'
   ))
);

-- =====================================================
-- COMMUNITY_REPORTS TABLE POLICIES
-- =====================================================

-- Policy: Community members can create reports
DROP POLICY IF EXISTS "Members can create reports" ON community_reports;
CREATE POLICY "Members can create reports"
ON community_reports FOR INSERT
TO authenticated
WITH CHECK (
  reporter_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = community_reports.community_id
      AND user_id = auth.uid()
      AND status = 'active'
  )
);

-- Policy: Moderators and admins can read reports
DROP POLICY IF EXISTS "Moderators can read reports" ON community_reports;
CREATE POLICY "Moderators can read reports"
ON community_reports FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = community_reports.community_id
      AND user_id = auth.uid()
      AND role IN ('moderator', 'admin')
      AND status = 'active'
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Policy: Moderators can update reports (mark as reviewed)
DROP POLICY IF EXISTS "Moderators can update reports" ON community_reports;
CREATE POLICY "Moderators can update reports"
ON community_reports FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = community_reports.community_id
      AND user_id = auth.uid()
      AND role IN ('moderator', 'admin')
      AND status = 'active'
  )
);

-- =====================================================
-- COMMUNITY_MOD_ACTIONS TABLE POLICIES
-- =====================================================

-- Policy: Moderators can log their own actions
DROP POLICY IF EXISTS "Moderators can create mod actions" ON community_mod_actions;
CREATE POLICY "Moderators can create mod actions"
ON community_mod_actions FOR INSERT
TO authenticated
WITH CHECK (
  moderator_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = community_mod_actions.community_id
      AND user_id = auth.uid()
      AND role IN ('moderator', 'admin')
      AND status = 'active'
  )
);

-- Policy: Moderators and admins can read mod actions in their communities
DROP POLICY IF EXISTS "Moderators can read mod actions" ON community_mod_actions;
CREATE POLICY "Moderators can read mod actions"
ON community_mod_actions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = community_mod_actions.community_id
      AND user_id = auth.uid()
      AND role IN ('moderator', 'admin')
      AND status = 'active'
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- =====================================================
-- HELPER FUNCTIONS FOR RLS
-- =====================================================

-- Function to check if user is a moderator/admin in a community
CREATE OR REPLACE FUNCTION is_community_moderator(p_community_id uuid, p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = p_community_id
      AND user_id = p_user_id
      AND role IN ('moderator', 'admin')
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to check if user can post in a community
CREATE OR REPLACE FUNCTION can_post_in_community(p_community_id uuid, p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM community_memberships
    WHERE community_id = p_community_id
      AND user_id = p_user_id
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE 'âœ… Community RLS policies created successfully';
  RAISE NOTICE '   - Communities: read by all, create/update restricted';
  RAISE NOTICE '   - Memberships: users can join/leave joinable communities';
  RAISE NOTICE '   - Messages: members can read/post, moderators can moderate';
  RAISE NOTICE '   - Reports: members can report, moderators can review';
  RAISE NOTICE '   - Mod Actions: moderators can create/read';
  RAISE NOTICE '   - Helper functions for permission checks';
END $$;














-- ===== FILE: 047_dm_requests.sql =====

-- =====================================================
-- DM REQUEST SYSTEM
-- =====================================================
-- Creates table for DM requests to control who can message whom

-- 1. CREATE ENUM FOR REQUEST STATUS
DO $$ BEGIN
  CREATE TYPE dm_request_status AS ENUM ('pending', 'accepted', 'declined');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. CREATE DM_REQUESTS TABLE
CREATE TABLE IF NOT EXISTS dm_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status dm_request_status NOT NULL DEFAULT 'pending',
  message text, -- Optional message with the request
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  
  -- Prevent duplicate requests
  CONSTRAINT unique_dm_request UNIQUE (requester_id, recipient_id),
  
  -- Cannot request yourself
  CONSTRAINT no_self_request CHECK (requester_id != recipient_id)
);

-- 3. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_dm_requests_recipient ON dm_requests(recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_dm_requests_requester ON dm_requests(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_dm_requests_pending ON dm_requests(status) WHERE status = 'pending';

-- 4. ENABLE RLS
ALTER TABLE dm_requests ENABLE ROW LEVEL SECURITY;

-- 5. CREATE RLS POLICIES

-- Policy: Users can read their own requests (sent or received)
DROP POLICY IF EXISTS "Users can read own dm requests" ON dm_requests;
CREATE POLICY "Users can read own dm requests"
ON dm_requests FOR SELECT
TO authenticated
USING (requester_id = auth.uid() OR recipient_id = auth.uid());

-- Policy: Users can create dm requests
DROP POLICY IF EXISTS "Users can create dm requests" ON dm_requests;
CREATE POLICY "Users can create dm requests"
ON dm_requests FOR INSERT
TO authenticated
WITH CHECK (requester_id = auth.uid());

-- Policy: Recipients can update requests (accept/decline)
DROP POLICY IF EXISTS "Recipients can update dm requests" ON dm_requests;
CREATE POLICY "Recipients can update dm requests"
ON dm_requests FOR UPDATE
TO authenticated
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

-- 6. CREATE HELPER FUNCTION TO CHECK IF DM IS ALLOWED
CREATE OR REPLACE FUNCTION can_dm_user(p_user1_id uuid, p_user2_id uuid)
RETURNS boolean AS $$
DECLARE
  v_has_tutoring_relationship boolean;
  v_has_accepted_request boolean;
BEGIN
  -- Check if there's an accepted DM request in either direction
  SELECT EXISTS (
    SELECT 1 FROM dm_requests
    WHERE status = 'accepted'
      AND ((requester_id = p_user1_id AND recipient_id = p_user2_id)
           OR (requester_id = p_user2_id AND recipient_id = p_user1_id))
  ) INTO v_has_accepted_request;

  IF v_has_accepted_request THEN
    RETURN true;
  END IF;

  -- Check if there's an existing tutoring relationship (confirmed booking)
  SELECT EXISTS (
    SELECT 1 FROM bookings
    WHERE status = 'CONFIRMED'
      AND ((student_id = p_user1_id AND tutor_id = p_user2_id)
           OR (student_id = p_user2_id AND tutor_id = p_user1_id))
  ) INTO v_has_tutoring_relationship;

  RETURN v_has_tutoring_relationship;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 7. CREATE FUNCTION TO GET CONNECTED USERS
CREATE OR REPLACE FUNCTION get_connected_users(p_user_id uuid)
RETURNS TABLE (user_id uuid) AS $$
BEGIN
  RETURN QUERY
  -- Users with accepted DM requests
  SELECT DISTINCT
    CASE
      WHEN requester_id = p_user_id THEN recipient_id
      ELSE requester_id
    END AS user_id
  FROM dm_requests
  WHERE status = 'accepted'
    AND (requester_id = p_user_id OR recipient_id = p_user_id)
  
  UNION
  
  -- Users with tutoring relationships
  SELECT DISTINCT
    CASE
      WHEN student_id = p_user_id THEN tutor_id
      ELSE student_id
    END AS user_id
  FROM bookings
  WHERE status = 'CONFIRMED'
    AND (student_id = p_user_id OR tutor_id = p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 8. COMMENTS
COMMENT ON TABLE dm_requests IS 'DM requests for users to connect outside of tutoring';
COMMENT ON FUNCTION can_dm_user IS 'Check if user1 can DM user2 (accepted request or tutoring relationship)';
COMMENT ON FUNCTION get_connected_users IS 'Get all users connected to a given user (accepted DMs or tutoring)';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'âœ… DM request system created';
  RAISE NOTICE '   - dm_requests table with status tracking';
  RAISE NOTICE '   - RLS policies for privacy';
  RAISE NOTICE '   - Helper functions for connection checking';
  RAISE NOTICE '   - Integration with existing bookings system';
END $$;














-- ===== FILE: 048_add_missing_schools.sql =====

-- =====================================================
-- ADD MISSING SCHOOLS TO INSTITUTIONS TABLE
-- =====================================================
-- Robust migration that handles any schema variation

DO $$ 
DECLARE
  v_columns text;
  v_insert_sql text;
  v_institution_type_to_use text := 'denominational';
BEGIN
  -- Build dynamic column list based on what exists
  SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
  INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'institutions'
    AND column_name IN (
      'name', 'normalized_name', 'institution_level', 'institution_type', 
      'country_code', 'island', 'region', 'is_active'
    );

  -- Try to get an allowed institution_type value from existing data
  BEGIN
    SELECT institution_type INTO v_institution_type_to_use
    FROM institutions
    WHERE institution_type IS NOT NULL
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_institution_type_to_use := 'denominational';
  END;

  -- Use denominational for all schools to avoid check constraint issues
  -- Build appropriate INSERT based on available columns
  IF v_columns LIKE '%normalized_name%' AND v_columns LIKE '%island%' AND v_columns LIKE '%region%' THEN
    -- Full schema
    EXECUTE format($sql$
      INSERT INTO public.institutions (name, normalized_name, institution_level, institution_type, country_code, island, region, is_active)
      VALUES 
        ('Presentation College Chaguanas', LOWER('Presentation College Chaguanas'), 'secondary', %L, 'TT', 'Trinidad', 'Chaguanas', true),
        ('St. Joseph''s Convent, San Fernando', LOWER('St. Joseph''s Convent, San Fernando'), 'secondary', %L, 'TT', 'Trinidad', 'San Fernando', true)
      ON CONFLICT DO NOTHING
    $sql$, v_institution_type_to_use, v_institution_type_to_use);
    
  ELSIF v_columns LIKE '%normalized_name%' AND v_columns LIKE '%island%' THEN
    -- With island
    EXECUTE format($sql$
      INSERT INTO public.institutions (name, normalized_name, institution_level, institution_type, country_code, island, is_active)
      VALUES 
        ('Presentation College Chaguanas', LOWER('Presentation College Chaguanas'), 'secondary', %L, 'TT', 'Trinidad', true),
        ('St. Joseph''s Convent, San Fernando', LOWER('St. Joseph''s Convent, San Fernando'), 'secondary', %L, 'TT', 'Trinidad', true)
      ON CONFLICT DO NOTHING
    $sql$, v_institution_type_to_use, v_institution_type_to_use);
    
  ELSIF v_columns LIKE '%normalized_name%' THEN
    -- With normalized_name
    EXECUTE format($sql$
      INSERT INTO public.institutions (name, normalized_name, institution_level, institution_type, country_code, is_active)
      VALUES 
        ('Presentation College Chaguanas', LOWER('Presentation College Chaguanas'), 'secondary', %L, 'TT', true),
        ('St. Joseph''s Convent, San Fernando', LOWER('St. Joseph''s Convent, San Fernando'), 'secondary', %L, 'TT', true)
      ON CONFLICT DO NOTHING
    $sql$, v_institution_type_to_use, v_institution_type_to_use);
    
  ELSE
    -- Minimal schema
    EXECUTE format($sql$
      INSERT INTO public.institutions (name, institution_level, institution_type, country_code, is_active)
      VALUES 
        ('Presentation College Chaguanas', 'secondary', %L, 'TT', true),
        ('St. Joseph''s Convent, San Fernando', 'secondary', %L, 'TT', true)
      ON CONFLICT DO NOTHING
    $sql$, v_institution_type_to_use, v_institution_type_to_use);
  END IF;

  RAISE NOTICE 'âœ… Missing schools added successfully';
  RAISE NOTICE '   - Presentation College Chaguanas';
  RAISE NOTICE '   - St. Joseph''s Convent, San Fernando';
  RAISE NOTICE '   - Using institution_type: %', v_institution_type_to_use;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'âŒ Error adding schools: %', SQLERRM;
    RAISE NOTICE '   Columns available: %', v_columns;
    RAISE;
END $$;


-- ===== FILE: 048_update_cancel_booking_to_update_sessions.sql =====

-- =====================================================
-- UPDATE CANCEL BOOKING FUNCTIONS TO UPDATE SESSIONS
-- =====================================================
-- When a booking is cancelled, also mark the corresponding session as CANCELLED

CREATE OR REPLACE FUNCTION student_cancel_booking(
    p_booking_id uuid,
    p_reason text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_student_id uuid;
BEGIN
    -- Verify student owns this booking
    SELECT student_id INTO v_student_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_student_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Update booking status
    UPDATE public.bookings
    SET 
        status = 'CANCELLED',
        last_action_by = 'student'
    WHERE id = p_booking_id;

    -- Update session status if a session exists for this booking
    UPDATE public.sessions
    SET 
        status = 'CANCELLED',
        updated_at = NOW()
    WHERE booking_id = p_booking_id;

    -- Add message if provided
    IF p_reason IS NOT NULL THEN
        INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
        VALUES (p_booking_id, auth.uid(), 'text', p_reason);
    END IF;

    -- Add system message
    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (p_booking_id, auth.uid(), 'system', 'Booking cancelled by student');

    RETURN jsonb_build_object('success', true, 'status', 'CANCELLED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ===== FILE: 049_migrate_school_to_institution_id.sql =====

-- =====================================================
-- MIGRATE SCHOOL TEXT TO INSTITUTION_ID
-- =====================================================
-- Updates profiles to use institution_id based on their school text field
-- This triggers the auto-assignment to school communities

-- Function to match school text to institution_id
CREATE OR REPLACE FUNCTION migrate_school_to_institution_id()
RETURNS void AS $$
DECLARE
  v_profile RECORD;
  v_institution_id uuid;
  v_matched_count integer := 0;
  v_unmatched_count integer := 0;
BEGIN
  RAISE NOTICE 'Starting migration of school text to institution_id...';

  -- Loop through all profiles with school set but no institution_id
  FOR v_profile IN
    SELECT id, school, form_level
    FROM profiles
    WHERE school IS NOT NULL
      AND school != ''
      AND institution_id IS NULL
  LOOP
    -- Try to find matching institution (case-insensitive, handles variations)
    SELECT i.id INTO v_institution_id
    FROM institutions i
    WHERE 
      -- Exact match (case-insensitive)
      LOWER(i.name) = LOWER(v_profile.school)
      OR
      -- Match without "Presentation College" variations
      (v_profile.school ILIKE '%Presentation College%' AND i.name ILIKE '%Presentation College%' 
       AND (
         (v_profile.school ILIKE '%Chaguanas%' AND i.name ILIKE '%Chaguanas%')
         OR (v_profile.school ILIKE '%San Fernando%' AND i.name ILIKE '%San Fernando%')
       ))
      OR
      -- Match "St. Joseph's Convent" variations
      (v_profile.school ILIKE '%St. Joseph%Convent%' AND i.name ILIKE '%St. Joseph%Convent%'
       AND (
         (v_profile.school ILIKE '%Port of Spain%' AND i.name ILIKE '%Port of Spain%')
         OR (v_profile.school ILIKE '%St. Joseph%' AND i.name ILIKE '%St. Joseph%' AND i.name NOT ILIKE '%Port of Spain%')
       ))
      OR
      -- Partial match for other schools (e.g., "Fatima" matches "Fatima College")
      (LENGTH(v_profile.school) > 5 AND i.name ILIKE '%' || v_profile.school || '%')
    ORDER BY 
      -- Prioritize exact matches
      CASE WHEN LOWER(i.name) = LOWER(v_profile.school) THEN 1 ELSE 2 END,
      -- Then prioritize longer matches
      LENGTH(i.name)
    LIMIT 1;

    IF v_institution_id IS NOT NULL THEN
      -- Update the profile with the institution_id
      -- This will trigger the auto_assign_school_communities trigger
      UPDATE profiles
      SET institution_id = v_institution_id
      WHERE id = v_profile.id;

      v_matched_count := v_matched_count + 1;
      
      RAISE NOTICE 'Matched: % â†’ %', v_profile.school, v_institution_id;
    ELSE
      v_unmatched_count := v_unmatched_count + 1;
      RAISE NOTICE 'No match found for: %', v_profile.school;
    END IF;
  END LOOP;

  RAISE NOTICE 'âœ… Migration complete:';
  RAISE NOTICE '   - % profiles matched and updated', v_matched_count;
  RAISE NOTICE '   - % profiles unmatched (manual review needed)', v_unmatched_count;
  RAISE NOTICE '   - Auto-assignment trigger will create community memberships';
END;
$$ LANGUAGE plpgsql;

-- Run the migration
SELECT migrate_school_to_institution_id();

-- Drop the function after use (optional, keep if you want to run manually later)
-- DROP FUNCTION migrate_school_to_institution_id();

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'âœ… School to institution_id migration executed';
  RAISE NOTICE '   - Profiles updated with institution_id where matches found';
  RAISE NOTICE '   - Community memberships auto-created by trigger';
  RAISE NOTICE '   - Check logs above for unmatched schools';
END $$;














-- ===== FILE: 050_add_test_data_flags.sql =====

-- Add is_test_data column to bookings, sessions, and ratings tables
-- This allows us to easily identify and remove test/seed data

ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS is_test_data boolean DEFAULT false;

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS is_test_data boolean DEFAULT false;

ALTER TABLE ratings
ADD COLUMN IF NOT EXISTS is_test_data boolean DEFAULT false;

-- Create indexes for faster cleanup
CREATE INDEX IF NOT EXISTS idx_bookings_test_data ON bookings(is_test_data)
WHERE is_test_data = true;

CREATE INDEX IF NOT EXISTS idx_sessions_test_data ON sessions(is_test_data)
WHERE is_test_data = true;

CREATE INDEX IF NOT EXISTS idx_ratings_test_data ON ratings(is_test_data)
WHERE is_test_data = true;



-- ===== FILE: 051_rating_likes.sql =====




-- ===== FILE: 052_allow_free_sessions.sql =====

-- =====================================================
-- ALLOW FREE SESSIONS
-- =====================================================
-- Enable tutors to offer free sessions ($0/hour)
-- Recommended for new tutors to build ratings
-- No platform commission on free sessions
-- =====================================================

-- Drop existing price check constraints
ALTER TABLE public.tutor_subjects
DROP CONSTRAINT IF EXISTS tutor_subjects_price_per_hour_ttd_check;

ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_price_per_hour_ttd_check;

-- Add new constraints allowing $0 (free sessions)
ALTER TABLE public.tutor_subjects
ADD CONSTRAINT tutor_subjects_price_per_hour_ttd_check 
CHECK (price_per_hour_ttd >= 0);

ALTER TABLE public.bookings
ADD CONSTRAINT bookings_price_per_hour_ttd_check 
CHECK (price_per_hour_ttd >= 0);

-- Add comment explaining free sessions
COMMENT ON COLUMN public.tutor_subjects.price_per_hour_ttd IS 
'Hourly rate in TTD. Can be 0 for free sessions (recommended for new tutors to build ratings).';

COMMENT ON COLUMN public.bookings.price_per_hour_ttd IS 
'Hourly rate in TTD. Can be 0 for free sessions.';














-- ===== FILE: 053_fix_profile_insert_rls.sql =====

-- =====================================================
-- FIX PROFILE CREATION FOR EMAIL CONFIRMATION
-- =====================================================
-- When email confirmation is enabled, users are not in the
-- authenticated role until they verify, so RLS blocks profile creation.
-- Solution: Auto-create profiles via trigger (bypasses RLS)

BEGIN;

-- Drop existing restrictive INSERT policies
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert any profile" ON public.profiles;

-- Create a more permissive INSERT policy that allows service role
CREATE POLICY "Service role can insert profiles"
ON public.profiles FOR INSERT
TO service_role
WITH CHECK (true);

-- Allow authenticated users to insert their own profile
CREATE POLICY "Authenticated users can create their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- Allow admins to create any profile
CREATE POLICY "Admins can create any profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() 
    AND (role = 'admin' OR is_reviewer = true)
  )
);

-- Create function to handle new user signup
-- This runs with SECURITY DEFINER so it bypasses RLS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only create profile if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    INSERT INTO public.profiles (
      id,
      email,
      full_name,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      NOW(),
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user IS 'Automatically creates a profile when a new user signs up';

COMMIT;


-- ===== FILE: 054_fix_profile_trigger_constraints.sql =====

-- =====================================================
-- FIX PROFILE CREATION TRIGGER - HANDLE CONSTRAINTS
-- =====================================================
-- The previous trigger was failing because of NOT NULL constraints
-- This version handles all required fields properly

BEGIN;

-- Drop the old trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create improved function that handles all constraints
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only create profile if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    INSERT INTO public.profiles (
      id,
      email,
      full_name,
      role,
      username,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      NULL,  -- Role will be set by the signup flow
      NULL,  -- Username will be set by the signup flow
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;  -- Prevent duplicate insert errors
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the signup
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Make sure username can be NULL temporarily during signup
ALTER TABLE public.profiles 
  ALTER COLUMN username DROP NOT NULL;

-- Make sure role can be NULL temporarily during signup  
ALTER TABLE public.profiles 
  ALTER COLUMN role DROP NOT NULL;

COMMENT ON FUNCTION public.handle_new_user IS 'Automatically creates a basic profile when a new user signs up, with role and username to be filled in by signup flow';

COMMIT;












-- ===== FILE: 055_allow_initial_profile_update.sql =====

-- =====================================================
-- ALLOW INITIAL PROFILE UPDATE AFTER SIGNUP
-- =====================================================
-- Users need to be able to update their profile immediately
-- after signup, even if role is NULL

BEGIN;

-- Drop existing update policies that might be too restrictive
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

-- Create a permissive policy for users updating their own profile
-- This allows updates even when role is NULL (during initial signup)
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Keep admin ability to update any profile
CREATE POLICY "Admins and reviewers can update any profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() 
    AND (role = 'admin' OR is_reviewer = true)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() 
    AND (role = 'admin' OR is_reviewer = true)
  )
);

COMMIT;












-- ===== FILE: 056_fix_profile_insert_policy.sql =====

-- =====================================================
-- FIX PROFILE INSERT POLICY FOR SIGNUP
-- =====================================================
-- Allow authenticated users to insert their own profile during signup

BEGIN;

-- Drop existing INSERT policies
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can create their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can create any profile" ON public.profiles;

-- Create a simple, permissive INSERT policy for authenticated users
CREATE POLICY "Authenticated users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- Allow service role to insert (for migrations/scripts)
CREATE POLICY "Service role can insert profiles"
ON public.profiles FOR INSERT
TO service_role
WITH CHECK (true);

-- Allow admins to insert any profile
CREATE POLICY "Admins can insert any profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() 
    AND (role = 'admin' OR is_reviewer = true)
  )
);

COMMIT;












-- ===== FILE: 057_auto_create_parent_child_conversations.sql =====

-- =====================================================
-- AUTO-CREATE CONVERSATIONS BETWEEN PARENTS AND CHILDREN
-- =====================================================
-- This migration ensures parents always have an open DM with each of their children
-- Creates a conversation automatically when a parent_child_link is established

BEGIN;

-- =====================================================
-- FUNCTION: Create conversation between parent and child
-- =====================================================
CREATE OR REPLACE FUNCTION create_parent_child_conversation()
RETURNS TRIGGER AS $$
DECLARE
    v_conversation_id uuid;
    v_parent_name text;
    v_child_name text;
BEGIN
    -- Get display names for initial message
    SELECT COALESCE(display_name, username, full_name, 'Parent') 
    INTO v_parent_name
    FROM public.profiles
    WHERE id = NEW.parent_id;

    SELECT COALESCE(display_name, username, full_name, 'Child')
    INTO v_child_name
    FROM public.profiles
    WHERE id = NEW.child_id;

    -- Check if conversation already exists
    -- (in case this is a re-linking or manual creation)
    SELECT id INTO v_conversation_id
    FROM public.conversations
    WHERE (participant_1_id = NEW.parent_id AND participant_2_id = NEW.child_id)
       OR (participant_1_id = NEW.child_id AND participant_2_id = NEW.parent_id);

    -- If conversation doesn't exist, create it
    IF v_conversation_id IS NULL THEN
        -- Create the conversation
        INSERT INTO public.conversations (
            participant_1_id,
            participant_2_id,
            conversation_type,
            last_message_at,
            last_message_preview,
            created_at,
            updated_at
        ) VALUES (
            NEW.parent_id,
            NEW.child_id,
            'dm',
            NOW(),
            'Start chatting with your ' || 
                CASE 
                    WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id = NEW.parent_id) 
                    THEN CASE 
                        WHEN EXISTS(SELECT 1 FROM public.profiles WHERE id = NEW.child_id AND role = 'student') 
                        THEN 'child'
                        ELSE 'parent'
                    END
                    ELSE 'family member'
                END,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_conversation_id;

        -- Create welcome message
        INSERT INTO public.messages (
            conversation_id,
            sender_id,
            content,
            message_type,
            created_at,
            updated_at
        ) VALUES (
            v_conversation_id,
            NEW.parent_id, -- Message from parent
            'Hi ' || v_child_name || '! ðŸ‘‹ This is our private chat. I can see your bookings and help you with your tutoring sessions here.',
            'dm',
            NOW(),
            NOW()
        );

        RAISE NOTICE 'Created conversation % between parent % and child %', 
            v_conversation_id, NEW.parent_id, NEW.child_id;
    ELSE
        RAISE NOTICE 'Conversation already exists between parent % and child %', 
            NEW.parent_id, NEW.child_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- TRIGGER: Auto-create conversation on parent-child link
-- =====================================================
DROP TRIGGER IF EXISTS trigger_create_parent_child_conversation ON public.parent_child_links;

CREATE TRIGGER trigger_create_parent_child_conversation
    AFTER INSERT ON public.parent_child_links
    FOR EACH ROW
    EXECUTE FUNCTION create_parent_child_conversation();

-- =====================================================
-- BACKFILL: Create conversations for existing parent-child relationships
-- =====================================================
DO $$
DECLARE
    link_record RECORD;
    v_conversation_id uuid;
    v_parent_name text;
    v_child_name text;
    v_created_count integer := 0;
    v_existing_count integer := 0;
BEGIN
    RAISE NOTICE 'Starting backfill of parent-child conversations...';

    FOR link_record IN 
        SELECT parent_id, child_id, created_at
        FROM public.parent_child_links
        ORDER BY created_at
    LOOP
        -- Get display names
        SELECT COALESCE(display_name, username, full_name, 'Parent') 
        INTO v_parent_name
        FROM public.profiles
        WHERE id = link_record.parent_id;

        SELECT COALESCE(display_name, username, full_name, 'Child')
        INTO v_child_name
        FROM public.profiles
        WHERE id = link_record.child_id;

        -- Check if conversation exists
        SELECT id INTO v_conversation_id
        FROM public.conversations
        WHERE (participant_1_id = link_record.parent_id AND participant_2_id = link_record.child_id)
           OR (participant_1_id = link_record.child_id AND participant_2_id = link_record.parent_id);

        IF v_conversation_id IS NULL THEN
            -- Create conversation
            INSERT INTO public.conversations (
                participant_1_id,
                participant_2_id,
                conversation_type,
                last_message_at,
                last_message_preview,
                created_at,
                updated_at
            ) VALUES (
                link_record.parent_id,
                link_record.child_id,
                'dm',
                link_record.created_at,
                'Start chatting with your child',
                link_record.created_at,
                link_record.created_at
            )
            RETURNING id INTO v_conversation_id;

            -- Create welcome message
            INSERT INTO public.messages (
                conversation_id,
                sender_id,
                content,
                message_type,
                created_at,
                updated_at
            ) VALUES (
                v_conversation_id,
                link_record.parent_id,
                'Hi ' || v_child_name || '! ðŸ‘‹ This is our private chat. I can see your bookings and help you with your tutoring sessions here.',
                'dm',
                link_record.created_at,
                link_record.created_at
            );

            v_created_count := v_created_count + 1;
            RAISE NOTICE 'Created conversation for parent % and child %', 
                link_record.parent_id, link_record.child_id;
        ELSE
            v_existing_count := v_existing_count + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'Backfill complete: Created % new conversations, % already existed', 
        v_created_count, v_existing_count;
END $$;

-- =====================================================
-- VERIFICATION QUERY
-- =====================================================
-- Run this to verify all parent-child links have conversations:
/*
SELECT 
    pcl.parent_id,
    pp.full_name as parent_name,
    pcl.child_id,
    cp.full_name as child_name,
    CASE 
        WHEN c.id IS NOT NULL THEN 'Has Conversation âœ“'
        ELSE 'Missing Conversation âœ—'
    END as conversation_status,
    c.id as conversation_id
FROM parent_child_links pcl
JOIN profiles pp ON pp.id = pcl.parent_id
JOIN profiles cp ON cp.id = pcl.child_id
LEFT JOIN conversations c ON 
    (c.participant_1_id = pcl.parent_id AND c.participant_2_id = pcl.child_id)
    OR (c.participant_1_id = pcl.child_id AND c.participant_2_id = pcl.parent_id)
ORDER BY pp.full_name, cp.full_name;
*/

COMMIT;

-- =====================================================
-- ROLLBACK SCRIPT (if needed)
-- =====================================================
/*
BEGIN;

-- Remove trigger
DROP TRIGGER IF EXISTS trigger_create_parent_child_conversation ON public.parent_child_links;

-- Remove function
DROP FUNCTION IF EXISTS create_parent_child_conversation();

-- Optionally, remove auto-created conversations
-- (CAREFUL: This will delete all parent-child conversations!)
-- DELETE FROM public.conversations
-- WHERE conversation_type = 'dm'
-- AND EXISTS (
--     SELECT 1 FROM public.parent_child_links
--     WHERE (parent_id = conversations.participant_1_id AND child_id = conversations.participant_2_id)
--        OR (parent_id = conversations.participant_2_id AND child_id = conversations.participant_1_id)
-- );

COMMIT;
*/







-- ===== FILE: 058_enable_rls_on_profiles_and_subjects.sql =====

-- =====================================================
-- ENABLE RLS ON PROFILES AND SUBJECTS TABLES
-- =====================================================
-- Security fix: Ensure RLS is enabled on these tables
-- as required by the existing RLS policies

BEGIN;

-- Enable RLS on profiles table
-- This table has comprehensive policies defined in previous migrations
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Enable RLS on subjects table
-- This table allows public read but only admin writes
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verify RLS is enabled
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'profiles' AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'RLS not enabled on profiles table';
  END IF;
  
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'subjects' AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'RLS not enabled on subjects table';
  END IF;
  
  RAISE NOTICE 'RLS successfully enabled on profiles and subjects tables';
END $$;



-- ===== FILE: 059_fix_profiles_rls_infinite_recursion.sql =====

-- =====================================================
-- Fix Infinite Recursion in Profiles RLS Policies
-- =====================================================
-- Issue: is_admin() and is_admin_or_reviewer() functions
-- query the profiles table, causing infinite recursion
-- when RLS policies on profiles also use these functions.
--
-- Solution: Simplify profiles RLS to allow public reads
-- (necessary for tutor platform) and use direct checks
-- without recursive function calls.

-- Drop ALL existing policies on profiles to start fresh
DROP POLICY IF EXISTS "Users can read their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Parents can read children profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins and reviewers can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins and reviewers can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Direct admin check can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert any profile" ON public.profiles;
DROP POLICY IF EXISTS "Direct admin check can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can read basic profile info for RLS" ON public.profiles;

-- =============================================================================
-- NEW SIMPLIFIED POLICIES (No infinite recursion)
-- =============================================================================

-- SELECT: Allow public reads (tutors need to be discoverable)
CREATE POLICY "profiles_public_read_v2"
ON public.profiles FOR SELECT
USING (true);

-- UPDATE: Users can update their own profile
CREATE POLICY "profiles_user_update_own_v2"
ON public.profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- UPDATE: Service role can update any profile (for admin operations)
CREATE POLICY "profiles_service_role_update_v2"
ON public.profiles FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- INSERT: Users can insert their own profile during signup
CREATE POLICY "profiles_user_insert_own_v2"
ON public.profiles FOR INSERT
WITH CHECK (id = auth.uid());

-- INSERT: Service role can insert any profile
CREATE POLICY "profiles_service_role_insert_v2"
ON public.profiles FOR INSERT
TO service_role
WITH CHECK (true);

-- DELETE: Only service role can delete profiles
CREATE POLICY "profiles_service_role_delete_v2"
ON public.profiles FOR DELETE
TO service_role
USING (true);

-- =============================================================================
-- Note: is_admin() and is_admin_or_reviewer() functions will still work
-- for OTHER tables' RLS policies since "Anyone can read profiles" allows
-- these functions to query profiles without triggering recursion.
-- =============================================================================


-- ===== FILE: 060_fix_profile_insert_for_triggers.sql =====

-- =====================================================
-- FIX PROFILE CREATION FOR SIGNUP FLOW
-- =====================================================
-- The trigger-based approach wasn't working reliably because RLS blocks
-- the trigger from inserting. Instead, we'll temporarily disable RLS
-- for profile creation during signup by allowing inserts from both
-- authenticated users AND unauthenticated contexts (for the brief moment
-- between auth.users creation and session establishment).

BEGIN;

-- First, let's fix the trigger function to work around RLS
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recreate the trigger function with proper RLS bypass
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert profile with RLS effectively bypassed via SECURITY DEFINER
  -- and explicit INSERT from a function that runs as the DB owner
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the signup
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Now fix the INSERT policy to allow both trigger and client-side inserts
DROP POLICY IF EXISTS "profiles_user_insert_own_v2" ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_role_insert_v2" ON public.profiles;

-- Create a policy that allows profile creation from client side too
-- This is needed because the trigger might not complete before the client checks
CREATE POLICY "profiles_insert_own_or_new_user_v3"
ON public.profiles FOR INSERT
WITH CHECK (
  -- Allow authenticated users to insert their own profile
  (auth.uid() IS NOT NULL AND id = auth.uid())
  OR
  -- Allow inserts for NEW auth users (id exists in auth.users but no session yet)
  -- This covers the brief window between signup and email confirmation
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = profiles.id 
    AND auth.users.created_at > (NOW() - INTERVAL '5 minutes')
  )
);

-- Service role policy for admin operations
CREATE POLICY "profiles_service_role_insert_v3"
ON public.profiles FOR INSERT
TO service_role
WITH CHECK (true);

COMMIT;



-- ===== FILE: 061_fix_profile_update_for_new_users.sql =====




-- ===== FILE: 062_rollback_and_fix_update_policy.sql =====

-- =====================================================
-- ROLLBACK BAD POLICY AND APPLY CORRECT ONE
-- =====================================================
-- Migration 061 had a bug - it tried to query auth.users which
-- regular users don't have permission to access.
-- This migration drops the bad policy and creates the correct one.

BEGIN;

-- Drop ALL update policies to start fresh
DROP POLICY IF EXISTS "profiles_user_update_own_v2" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_new_user_v3" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_incomplete_v3" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_new_v3" ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_role_update_v2" ON public.profiles;

-- Create the CORRECT UPDATE policy that:
-- 1. Allows authenticated users to update their own profile
-- 2. Allows NEW profiles (created < 5 min ago, role=NULL) to be updated during signup
-- This uses profiles.created_at (which we CAN read) instead of auth.users (which we CAN'T)
CREATE POLICY "profiles_update_own_or_recent_v4"
ON public.profiles FOR UPDATE
USING (
  -- Allow authenticated users to update their own profile
  (auth.uid() IS NOT NULL AND id = auth.uid())
  OR
  -- Allow updates for profiles created within last 5 minutes with no role set
  -- This covers the signup flow before email confirmation
  (created_at > (NOW() - INTERVAL '5 minutes') AND role IS NULL)
)
WITH CHECK (
  -- Same conditions for WITH CHECK
  (auth.uid() IS NOT NULL AND id = auth.uid())
  OR
  (created_at > (NOW() - INTERVAL '5 minutes') AND role IS NULL)
);

-- Recreate service role policy for admin operations
CREATE POLICY "profiles_service_role_update_v4"
ON public.profiles FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

COMMIT;

-- This policy now works because it only queries the profiles table
-- which the user has access to, not the auth.users table.






-- ===== FILE: 063_fix_update_with_check_clause.sql =====

-- =====================================================
-- FIX UPDATE WITH CHECK CLAUSE
-- =====================================================
-- The WITH CHECK clause was failing because it checks the row AFTER
-- the update, when role is no longer NULL. We need to allow the
-- transition from incomplete (role=NULL) to complete (role set).

BEGIN;

-- Drop the policy with the buggy WITH CHECK
DROP POLICY IF EXISTS "profiles_update_own_or_recent_v4" ON public.profiles;

-- Create the CORRECT policy with proper WITH CHECK logic
CREATE POLICY "profiles_update_own_or_recent_v5"
ON public.profiles FOR UPDATE
USING (
  -- USING checks the row BEFORE update
  -- Allow authenticated users to update their own profile
  (auth.uid() IS NOT NULL AND id = auth.uid())
  OR
  -- Allow updates for profiles created within last 5 minutes with no role set
  -- This covers the signup flow before email confirmation
  (created_at > (NOW() - INTERVAL '5 minutes') AND role IS NULL)
)
WITH CHECK (
  -- WITH CHECK checks the row AFTER update
  -- Allow if user is authenticated and owns the profile
  (auth.uid() IS NOT NULL AND id = auth.uid())
  OR
  -- Allow if profile was recently created (even if role is now set)
  -- This allows the initial profile setup during signup
  (created_at > (NOW() - INTERVAL '5 minutes'))
);

COMMIT;

-- Key difference: WITH CHECK only requires created_at check, not role IS NULL
-- This allows the transition from role=NULL to role='student' during signup






-- ===== FILE: 064_fix_trigger_use_metadata.sql =====

-- =====================================================
-- FIX TRIGGER TO USE USER METADATA
-- =====================================================
-- Update the handle_new_user trigger to extract signup
-- data from user_metadata and populate the profile
-- This allows the profile to be complete even when
-- email confirmation is required

BEGIN;

-- Drop the existing trigger function
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Create improved function that uses user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert profile with data from user metadata
  -- SECURITY DEFINER bypasses RLS
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    username,
    role,
    country,
    terms_accepted,
    terms_accepted_at,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'role',
    NEW.raw_user_meta_data->>'country',
    COALESCE((NEW.raw_user_meta_data->>'terms_accepted')::boolean, false),
    CASE 
      WHEN (NEW.raw_user_meta_data->>'terms_accepted')::boolean = true 
      THEN NOW()
      ELSE NULL
    END,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    -- Update with metadata if it was provided
    full_name = COALESCE(
      EXCLUDED.full_name,
      profiles.full_name
    ),
    username = COALESCE(
      EXCLUDED.username,
      profiles.username
    ),
    role = COALESCE(
      EXCLUDED.role,
      profiles.role
    ),
    country = COALESCE(
      EXCLUDED.country,
      profiles.country
    ),
    terms_accepted = COALESCE(
      EXCLUDED.terms_accepted,
      profiles.terms_accepted
    ),
    terms_accepted_at = COALESCE(
      EXCLUDED.terms_accepted_at,
      profiles.terms_accepted_at
    ),
    updated_at = NOW();
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the signup
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMIT;

-- This trigger now creates complete profiles using the metadata
-- passed during signup, so email confirmation doesn't block
-- profile completion




-- ===== FILE: 065_allow_students_read_all_syllabuses.sql =====

-- =====================================================
-- ALLOW STUDENTS TO READ ALL SYLLABUSES
-- =====================================================
-- Students should be able to browse and view all CXC syllabuses
-- regardless of which subjects they're enrolled in

-- Add policy for students to read all syllabuses
CREATE POLICY students_read_all_syllabuses ON syllabuses
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'student'
  )
);

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'âœ… Students can now read all syllabuses';
  RAISE NOTICE 'âœ… Students will see "Your Subjects" syllabuses at the top';
  RAISE NOTICE 'âœ… Students will see "All CXC Syllabuses" below';
END $$;


-- ===== FILE: 066_allow_students_read_video_connections.sql =====

-- =====================================================
-- ALLOW STUDENTS TO READ TUTOR VIDEO CONNECTIONS
-- =====================================================
-- Students need to see which tutors have video connections set up
-- so they can be displayed on the find-tutors page

-- Check if RLS policy already exists for students
DO $$
BEGIN
  -- Drop existing policy if it exists
  DROP POLICY IF EXISTS students_read_video_connections ON tutor_video_provider_connections;
  
  -- Create new policy allowing students to read video connections
  CREATE POLICY students_read_video_connections ON tutor_video_provider_connections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'student'
    )
  );
  
  RAISE NOTICE 'âœ… Students can now read tutor video connections';
END $$;

-- Verify the policy was created
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'tutor_video_provider_connections'
  AND policyname = 'students_read_video_connections';


-- ===== FILE: 067_create_onboarding_email_queue.sql =====

-- =====================================================
-- ONBOARDING EMAIL QUEUE TABLE
-- =====================================================
-- Manages automated onboarding email sequences for new users
-- Tracks stage, timing, and activation status
-- =====================================================

CREATE TABLE public.onboarding_email_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_type text NOT NULL CHECK (user_type IN ('student', 'tutor', 'parent')),
    stage integer NOT NULL DEFAULT 0 CHECK (stage >= 0 AND stage <= 4),
    next_send_at timestamptz NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    last_sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    CONSTRAINT unique_user_queue UNIQUE (user_id)
);

-- Indexes for performance
CREATE INDEX idx_queue_active_next_send 
    ON public.onboarding_email_queue(is_active, next_send_at) 
    WHERE is_active = true;

CREATE INDEX idx_queue_user_id 
    ON public.onboarding_email_queue(user_id);

-- Updated_at trigger
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.onboarding_email_queue
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- RLS policies (service role only)
ALTER TABLE public.onboarding_email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" 
    ON public.onboarding_email_queue 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE public.onboarding_email_queue IS 'Manages automated onboarding email sequences for new users';
COMMENT ON COLUMN public.onboarding_email_queue.stage IS 'Email stage: 0=welcome, 1=day1, 2=day3, 3=day5, 4=day7';
COMMENT ON COLUMN public.onboarding_email_queue.is_active IS 'False when user activates or sequence completes';
COMMENT ON COLUMN public.onboarding_email_queue.next_send_at IS 'Next scheduled send time';


-- ===== FILE: 067_mandatory_post_session_feedback.sql =====

-- =============================================================================
-- 067: Mandatory post-session feedback (student ratings + tutor feedback)
-- =============================================================================
-- - Adds tutor_feedback table (one per session)
-- - Fixes ratings insert eligibility to use session status + scheduled_end_at
-- - Adds RPC helpers for middleware (pending feedback lookups)

-- =============================================================================
-- Table: tutor_feedback
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tutor_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feedback_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tutor_feedback_unique_session UNIQUE (session_id),
  CONSTRAINT tutor_feedback_non_empty CHECK (length(trim(feedback_text)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_tutor_feedback_session_id ON public.tutor_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_tutor_feedback_tutor_created ON public.tutor_feedback(tutor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tutor_feedback_student_created ON public.tutor_feedback(student_id, created_at DESC);

ALTER TABLE public.tutor_feedback ENABLE ROW LEVEL SECURITY;

-- Tutors and students (and parents of the student) can read feedback for relevant sessions.
DROP POLICY IF EXISTS "Tutors can read their feedback" ON public.tutor_feedback;
CREATE POLICY "Tutors can read their feedback"
ON public.tutor_feedback FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

DROP POLICY IF EXISTS "Students can read their tutor feedback" ON public.tutor_feedback;
CREATE POLICY "Students can read their tutor feedback"
ON public.tutor_feedback FOR SELECT
TO authenticated
USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Parents can read children tutor feedback" ON public.tutor_feedback;
CREATE POLICY "Parents can read children tutor feedback"
ON public.tutor_feedback FOR SELECT
TO authenticated
USING (public.is_my_child(student_id));

DROP POLICY IF EXISTS "Admins can read all tutor feedback" ON public.tutor_feedback;
CREATE POLICY "Admins can read all tutor feedback"
ON public.tutor_feedback FOR SELECT
TO authenticated
USING (public.is_admin());

-- Insert: tutor can submit feedback for their completed sessions after scheduled_end_at.
DROP POLICY IF EXISTS "Tutors can submit feedback for completed sessions" ON public.tutor_feedback;
CREATE POLICY "Tutors can submit feedback for completed sessions"
ON public.tutor_feedback FOR INSERT
TO authenticated
WITH CHECK (
  tutor_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.id = tutor_feedback.session_id
      AND s.tutor_id = auth.uid()
      AND s.student_id = tutor_feedback.student_id
      AND s.status = 'COMPLETED_ASSUMED'
      AND s.scheduled_end_at <= now()
  )
);

-- =============================================================================
-- Fix ratings insert policy (status + scheduled_end_at)
-- =============================================================================

-- Replace the original policy from 001_complete_schema_with_rls.sql which checks status='completed'
DROP POLICY IF EXISTS "Students can rate their completed sessions" ON public.ratings;
DROP POLICY IF EXISTS "Students can create ratings for their tutors" ON public.ratings;

CREATE POLICY "Students can rate their completed sessions"
ON public.ratings FOR INSERT
TO authenticated
WITH CHECK (
  student_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.id = ratings.session_id
      AND s.student_id = auth.uid()
      AND s.tutor_id = ratings.tutor_id
      AND s.status = 'COMPLETED_ASSUMED'
      AND s.scheduled_end_at <= now()
  )
);

-- =============================================================================
-- RPC helpers for pending feedback enforcement
-- =============================================================================

-- Returns the next session_id requiring a student rating for the current auth user (student).
CREATE OR REPLACE FUNCTION public.pending_student_rating_session()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT s.id
  FROM public.sessions s
  LEFT JOIN public.ratings r ON r.session_id = s.id
  WHERE s.student_id = auth.uid()
    AND s.status = 'COMPLETED_ASSUMED'
    AND s.scheduled_end_at <= now()
    AND r.id IS NULL
  ORDER BY s.scheduled_end_at ASC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.pending_student_rating_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_student_rating_session() TO authenticated;

-- Returns the next session_id requiring tutor written feedback for the current auth user (tutor).
CREATE OR REPLACE FUNCTION public.pending_tutor_feedback_session()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT s.id
  FROM public.sessions s
  LEFT JOIN public.tutor_feedback tf ON tf.session_id = s.id
  WHERE s.tutor_id = auth.uid()
    AND s.status = 'COMPLETED_ASSUMED'
    AND s.scheduled_end_at <= now()
    AND tf.id IS NULL
  ORDER BY s.scheduled_end_at ASC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.pending_tutor_feedback_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_tutor_feedback_session() TO authenticated;



-- ===== FILE: 068_create_email_send_logs.sql =====

-- =====================================================
-- EMAIL SEND LOGS TABLE
-- =====================================================
-- Tracks success/failure of onboarding email sends
-- Provides audit trail and debugging information
-- =====================================================

CREATE TABLE public.email_send_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stage integer NOT NULL,
    email_type text NOT NULL,
    status text NOT NULL CHECK (status IN ('success', 'error')),
    error_message text,
    resend_email_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_logs_user_created 
    ON public.email_send_logs(user_id, created_at DESC);

CREATE INDEX idx_email_logs_status 
    ON public.email_send_logs(status, created_at DESC);

-- RLS (service role only)
ALTER TABLE public.email_send_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" 
    ON public.email_send_logs 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE public.email_send_logs IS 'Audit log for onboarding email sends';
COMMENT ON COLUMN public.email_send_logs.email_type IS 'Format: {user_type}_stage_{stage}';
COMMENT ON COLUMN public.email_send_logs.resend_email_id IS 'Resend API email ID for tracking';


-- ===== FILE: 069_feedback_lock_based_on_end_time.sql =====

-- =============================================================================
-- 069: Feedback lock based on scheduled end time (not session status)
-- =============================================================================
-- The cron that updates session status may lag. For mandatory feedback, treat
-- sessions as "ended" when scheduled_end_at <= now(), regardless of status,
-- excluding CANCELLED.

-- Update tutor_feedback insert policy to allow SCHEDULED/JOIN_OPEN/COMPLETED_ASSUMED once end time has passed.
DROP POLICY IF EXISTS "Tutors can submit feedback for completed sessions" ON public.tutor_feedback;
CREATE POLICY "Tutors can submit feedback for completed sessions"
ON public.tutor_feedback FOR INSERT
TO authenticated
WITH CHECK (
  tutor_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.id = tutor_feedback.session_id
      AND s.tutor_id = auth.uid()
      AND s.student_id = tutor_feedback.student_id
      AND s.status <> 'CANCELLED'
      AND s.scheduled_end_at <= now()
  )
);

-- Update ratings insert policy similarly.
DROP POLICY IF EXISTS "Students can rate their completed sessions" ON public.ratings;
CREATE POLICY "Students can rate their completed sessions"
ON public.ratings FOR INSERT
TO authenticated
WITH CHECK (
  student_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.id = ratings.session_id
      AND s.student_id = auth.uid()
      AND s.tutor_id = ratings.tutor_id
      AND s.status <> 'CANCELLED'
      AND s.scheduled_end_at <= now()
  )
);

-- Update pending feedback RPCs to ignore status lag.
CREATE OR REPLACE FUNCTION public.pending_student_rating_session()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT s.id
  FROM public.sessions s
  LEFT JOIN public.ratings r ON r.session_id = s.id
  WHERE s.student_id = auth.uid()
    AND s.status <> 'CANCELLED'
    AND s.scheduled_end_at <= now()
    AND r.id IS NULL
  ORDER BY s.scheduled_end_at ASC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.pending_student_rating_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_student_rating_session() TO authenticated;

CREATE OR REPLACE FUNCTION public.pending_tutor_feedback_session()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT s.id
  FROM public.sessions s
  LEFT JOIN public.tutor_feedback tf ON tf.session_id = s.id
  WHERE s.tutor_id = auth.uid()
    AND s.status <> 'CANCELLED'
    AND s.scheduled_end_at <= now()
    AND tf.id IS NULL
  ORDER BY s.scheduled_end_at ASC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.pending_tutor_feedback_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_tutor_feedback_session() TO authenticated;



-- ===== FILE: 070_one_rating_per_student_tutor.sql =====

-- =============================================================================
-- 070: One rating per student per tutor (keep latest)
-- =============================================================================
-- Requirements:
-- - A student should only have ONE rating per tutor (not per session).
-- - If duplicates exist, keep ONLY the latest rating.
-- - Tutor stats (profiles.rating_count / rating_average) must update on insert/update/delete.
--
-- Notes:
-- - We keep `ratings.session_id` as "the most recently rated session" for traceability.
-- - Application uses an upsert to overwrite the existing rating when needed.

BEGIN;

-- 1) Deduplicate existing data: keep latest rating per (student_id, tutor_id)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY student_id, tutor_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.ratings
)
DELETE FROM public.ratings r
USING ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

-- 2) Change uniqueness: no longer unique per session; unique per (student, tutor)
ALTER TABLE public.ratings DROP CONSTRAINT IF EXISTS unique_session_rating;
ALTER TABLE public.ratings
  ADD CONSTRAINT unique_student_tutor_rating UNIQUE (student_id, tutor_id);

-- 3) Ensure tutor rating stats stay correct on insert/update/delete
CREATE OR REPLACE FUNCTION public.update_tutor_rating()
RETURNS TRIGGER AS $$
DECLARE
  v_tutor_id uuid;
BEGIN
  v_tutor_id := COALESCE(NEW.tutor_id, OLD.tutor_id);

  IF v_tutor_id IS NOT NULL THEN
    UPDATE public.profiles
    SET
      rating_count = (SELECT COUNT(*) FROM public.ratings WHERE tutor_id = v_tutor_id),
      rating_average = (SELECT AVG(stars)::numeric(3,2) FROM public.ratings WHERE tutor_id = v_tutor_id)
    WHERE id = v_tutor_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ratings_update_tutor_stats ON public.ratings;
CREATE TRIGGER ratings_update_tutor_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tutor_rating();

-- 4) Keep DB helper RPC consistent with "one rating per tutor"
CREATE OR REPLACE FUNCTION public.pending_student_rating_session()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT s.id
  FROM public.sessions s
  WHERE s.student_id = auth.uid()
    AND s.status <> 'CANCELLED'
    AND s.scheduled_end_at <= now()
    AND NOT EXISTS (
      SELECT 1
      FROM public.ratings r
      WHERE r.student_id = auth.uid()
        AND r.tutor_id = s.tutor_id
    )
  ORDER BY s.scheduled_end_at ASC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.pending_student_rating_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_student_rating_session() TO authenticated;

-- 5) Helpful indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ratings_tutor_created_at ON public.ratings(tutor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_student_tutor ON public.ratings(student_id, tutor_id);

COMMIT;



-- ===== FILE: 070_tutor_cancel_session.sql =====

-- =====================================================
-- TUTOR SESSION CANCELLATION
-- =====================================================
-- Allows tutors to cancel upcoming sessions with reason
-- and optional reschedule request

-- 1. Add cancellation tracking fields to sessions table
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS cancelled_by TEXT CHECK (cancelled_by IN ('tutor', 'student', 'admin')),
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reschedule_proposed_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reschedule_proposed_end TIMESTAMPTZ;

-- 2. Update session status constraint to include CANCELLED
DO $$
BEGIN
    -- Check if CANCELLED is already in the constraint
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint con
        INNER JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'sessions'
        AND con.conname = 'sessions_status_check'
        AND pg_get_constraintdef(con.oid) LIKE '%CANCELLED%'
    ) THEN
        -- Drop and recreate the constraint
        ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_status_check;
        
        ALTER TABLE sessions
        ADD CONSTRAINT sessions_status_check
        CHECK (status IN (
            'SCHEDULED',
            'JOIN_OPEN',
            'COMPLETED_ASSUMED',
            'NO_SHOW_STUDENT',
            'EARLY_END_SHORT',
            'CANCELLED'
        ));
    END IF;
END $$;

-- 3. Create tutor_cancel_session function
CREATE OR REPLACE FUNCTION tutor_cancel_session(
    p_session_id UUID,
    p_cancellation_reason TEXT,
    p_reschedule_start TIMESTAMPTZ DEFAULT NULL,
    p_reschedule_end TIMESTAMPTZ DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_session RECORD;
    v_booking RECORD;
    v_tutor_name TEXT;
BEGIN
    -- Get session details
    SELECT * INTO v_session
    FROM sessions
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found';
    END IF;

    -- Verify tutor owns this session
    IF v_session.tutor_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Only the tutor can cancel this session';
    END IF;

    -- Validate session can be cancelled (must be upcoming)
    IF v_session.status NOT IN ('SCHEDULED', 'JOIN_OPEN') THEN
        RAISE EXCEPTION 'Cannot cancel session with status: %', v_session.status;
    END IF;

    -- Validate not too close to start time (must be at least 2 hours before)
    IF v_session.scheduled_start_at - INTERVAL '2 hours' < NOW() THEN
        RAISE EXCEPTION 'Cannot cancel session less than 2 hours before start time';
    END IF;

    -- Validate cancellation reason provided
    IF p_cancellation_reason IS NULL OR TRIM(p_cancellation_reason) = '' THEN
        RAISE EXCEPTION 'Cancellation reason is required';
    END IF;

    -- Validate reschedule times if provided
    IF p_reschedule_start IS NOT NULL AND p_reschedule_end IS NOT NULL THEN
        IF p_reschedule_end <= p_reschedule_start THEN
            RAISE EXCEPTION 'Reschedule end time must be after start time';
        END IF;
        
        IF p_reschedule_start < NOW() THEN
            RAISE EXCEPTION 'Reschedule time cannot be in the past';
        END IF;
    END IF;

    -- Update session status
    UPDATE sessions
    SET
        status = 'CANCELLED',
        cancelled_by = 'tutor',
        cancellation_reason = p_cancellation_reason,
        cancelled_at = NOW(),
        reschedule_proposed_start = p_reschedule_start,
        reschedule_proposed_end = p_reschedule_end,
        updated_at = NOW()
    WHERE id = p_session_id;

    -- Get booking details for notification
    SELECT * INTO v_booking
    FROM bookings
    WHERE id = v_session.booking_id;

    -- Get tutor name
    SELECT COALESCE(display_name, full_name, username) INTO v_tutor_name
    FROM profiles
    WHERE id = v_session.tutor_id;

    -- Notify student
    INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        link,
        created_at,
        metadata
    ) VALUES (
        v_session.student_id,
        'session_cancelled',
        'Session Cancelled',
        v_tutor_name || ' has cancelled your upcoming session. Reason: ' || p_cancellation_reason,
        '/student/sessions',
        NOW(),
        jsonb_build_object(
            'session_id', p_session_id,
            'booking_id', v_session.booking_id,
            'cancelled_by', 'tutor',
            'has_reschedule_request', p_reschedule_start IS NOT NULL
        )
    );

    -- If reschedule requested, add additional notification
    IF p_reschedule_start IS NOT NULL THEN
        INSERT INTO notifications (
            user_id,
            type,
            title,
            message,
            link,
            created_at,
            metadata
        ) VALUES (
            v_session.student_id,
            'reschedule_request',
            'Reschedule Request',
            v_tutor_name || ' has proposed a new time for your session',
            '/student/sessions',
            NOW(),
            jsonb_build_object(
                'session_id', p_session_id,
                'booking_id', v_session.booking_id,
                'proposed_start', p_reschedule_start,
                'proposed_end', p_reschedule_end
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Session cancelled successfully',
        'session_id', p_session_id,
        'reschedule_requested', p_reschedule_start IS NOT NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION tutor_cancel_session TO authenticated;

SELECT 'âœ… Tutor session cancellation feature installed' AS status;


-- ===== FILE: 071_push_notifications_core.sql =====

-- =====================================================
-- PUSH NOTIFICATIONS (DEVICE-LEVEL) - CORE TABLES
-- =====================================================
-- Adds:
-- - push_tokens: device tokens per user (multi-device)
-- - notifications_log: idempotency log for reminders
-- - sessions index: (status, scheduled_start_at) for fast 10-min window queries

-- 1) PUSH TOKENS TABLE
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- Prevent duplicates per user/device token
CREATE UNIQUE INDEX IF NOT EXISTS uq_push_tokens_user_token
  ON public.push_tokens(user_id, token);

-- Fast lookups by user_id
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id
  ON public.push_tokens(user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- RLS: Users manage only their own tokens
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'push_tokens' AND policyname = 'Users can view own push tokens'
  ) THEN
    CREATE POLICY "Users can view own push tokens"
      ON public.push_tokens
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'push_tokens' AND policyname = 'Users can insert own push tokens'
  ) THEN
    CREATE POLICY "Users can insert own push tokens"
      ON public.push_tokens
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'push_tokens' AND policyname = 'Users can update own push tokens'
  ) THEN
    CREATE POLICY "Users can update own push tokens"
      ON public.push_tokens
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'push_tokens' AND policyname = 'Users can delete own push tokens'
  ) THEN
    CREATE POLICY "Users can delete own push tokens"
      ON public.push_tokens
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;


-- 2) NOTIFICATIONS LOG TABLE (IDEMPOTENCY / DEDUPE)
CREATE TABLE IF NOT EXISTS public.notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- Dedupe guarantee: one log row per (user, session, type)
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_log_user_session_type
  ON public.notifications_log(user_id, session_id, type);

CREATE INDEX IF NOT EXISTS idx_notifications_log_session_id
  ON public.notifications_log(session_id);

ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;
-- Intentionally no user-facing policies; service role bypasses RLS for inserts/reads.


-- 3) SESSIONS INDEX FOR 10-MINUTE WINDOW QUERY
-- Supports: WHERE status='SCHEDULED' AND scheduled_start_at BETWEEN ...
CREATE INDEX IF NOT EXISTS idx_sessions_status_scheduled_start
  ON public.sessions(status, scheduled_start_at);



-- ===== FILE: 072_allow_same_day_bookings_for_testing.sql =====

-- =====================================================
-- Add Same-Day Booking Feature for Testing
-- Allow specific tutors to accept same-day bookings
-- =====================================================

-- Step 1: Add column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS allow_same_day_bookings boolean DEFAULT false;

COMMENT ON COLUMN public.profiles.allow_same_day_bookings IS 
'Allows tutor to accept bookings on the same day (bypasses 24-hour advance notice requirement). Primarily for testing.';

-- Step 2: Enable same-day bookings for the test user
UPDATE public.profiles
SET allow_same_day_bookings = true
WHERE email = 'jovangoodluck@myitutor.com'
AND role = 'tutor';

-- Step 3: Update create_booking_request function to check this flag
-- Drop all versions of the function using DO block
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN 
        SELECT 'DROP FUNCTION IF EXISTS ' || oid::regprocedure || ' CASCADE;' as drop_statement
        FROM pg_proc 
        WHERE proname = 'create_booking_request'
    LOOP
        EXECUTE r.drop_statement;
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION create_booking_request(
    p_tutor_id uuid,
    p_student_id uuid,
    p_subject_id uuid,
    p_session_type_id uuid,
    p_requested_start_at timestamptz,
    p_requested_end_at timestamptz,
    p_student_notes text DEFAULT '',
    p_price_ttd numeric DEFAULT NULL,
    p_duration_minutes int DEFAULT 60
) RETURNS jsonb AS $$
DECLARE
    v_booking_id uuid;
    v_calculated_price numeric;
    v_tutor_hourly_rate numeric;
    v_actual_duration_minutes int;
    v_is_parent boolean := false;
    v_tutor_allows_same_day boolean := false;
    v_hours_until_session numeric;
BEGIN
    -- Validate auth: Allow if user is the student OR if user is the parent of the student
    IF auth.uid() != p_student_id THEN
        -- Check if authenticated user is a parent of this student
        SELECT EXISTS(
            SELECT 1 
            FROM parent_child_links 
            WHERE parent_id = auth.uid() 
            AND child_id = p_student_id
        ) INTO v_is_parent;
        
        IF NOT v_is_parent THEN
            RAISE EXCEPTION 'Unauthorized: You can only create bookings for yourself or your children';
        END IF;
    END IF;

    -- Check if tutor allows same-day bookings
    SELECT COALESCE(allow_same_day_bookings, false) INTO v_tutor_allows_same_day
    FROM profiles
    WHERE id = p_tutor_id;

    -- Calculate hours until session starts
    v_hours_until_session := EXTRACT(EPOCH FROM (p_requested_start_at - now())) / 3600;

    -- Enforce booking time restrictions based on tutor settings
    IF v_tutor_allows_same_day THEN
        -- Test mode: Allow bookings at any time (no restrictions)
        -- This allows testing of calendar and booking flow without time constraints
        NULL; -- No validation needed
    ELSE
        -- Normal mode: Enforce 24-hour advance notice
        IF v_hours_until_session < 24 THEN
            RAISE EXCEPTION 'Bookings must be made at least 24 hours in advance. Please select a time at least one day from now.';
        END IF;
        
        -- Prevent booking sessions in the past
        IF p_requested_start_at <= now() THEN
            RAISE EXCEPTION 'Cannot book sessions in the past. Please select a future time.';
        END IF;
    END IF;

    -- Calculate actual duration from timestamps if not provided
    v_actual_duration_minutes := COALESCE(
        p_duration_minutes,
        EXTRACT(EPOCH FROM (p_requested_end_at - p_requested_start_at)) / 60
    );

    -- Validate duration bounds
    IF v_actual_duration_minutes < 30 THEN
        RAISE EXCEPTION 'Duration must be at least 30 minutes';
    END IF;
    
    IF v_actual_duration_minutes > 300 THEN
        RAISE EXCEPTION 'Duration cannot exceed 5 hours (300 minutes)';
    END IF;

    -- Validate consecutive slots are available (if function exists)
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_consecutive_slots') THEN
        IF NOT validate_consecutive_slots(p_tutor_id, p_requested_start_at, v_actual_duration_minutes) THEN
            RAISE EXCEPTION 'The requested time slot(s) are not available. Please choose a different time.';
        END IF;
    END IF;

    -- Get tutor's hourly rate for this subject
    SELECT price_per_hour_ttd INTO v_tutor_hourly_rate
    FROM tutor_subjects
    WHERE tutor_id = p_tutor_id
    AND subject_id = p_subject_id
    LIMIT 1;

    IF v_tutor_hourly_rate IS NULL THEN
        RAISE EXCEPTION 'Tutor does not teach this subject';
    END IF;

    -- Calculate price based on duration
    v_calculated_price := COALESCE(p_price_ttd, (v_tutor_hourly_rate / 60.0) * v_actual_duration_minutes);

    -- Insert booking
    INSERT INTO bookings (
        tutor_id,
        student_id,
        subject_id,
        session_type_id,
        requested_start_at,
        requested_end_at,
        student_notes,
        price_ttd,
        duration_minutes,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_tutor_id,
        p_student_id,
        p_subject_id,
        p_session_type_id,
        p_requested_start_at,
        p_requested_end_at,
        p_student_notes,
        v_calculated_price,
        v_actual_duration_minutes,
        'PENDING',
        now(),
        now()
    ) RETURNING id INTO v_booking_id;

    -- Create notification for tutor
    INSERT INTO notifications (user_id, type, title, message, link, created_at)
    VALUES (
        p_tutor_id,
        'booking_request_received',
        'New Booking Request',
        'You have a new booking request',
        '/tutor/bookings/' || v_booking_id,
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'price', v_calculated_price,
        'duration_minutes', v_actual_duration_minutes
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_booking_request TO authenticated;

-- Verification queries
SELECT 
    'Column added' as status,
    EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'allow_same_day_bookings'
    ) as column_exists;

SELECT 
    'Test user enabled' as status,
    full_name,
    email,
    username,
    allow_same_day_bookings
FROM profiles
WHERE email = 'jovangoodluck@myitutor.com';


-- ===== FILE: 073_update_calendar_for_same_day_bookings.sql =====

-- =====================================================
-- Update get_tutor_public_calendar to respect allow_same_day_bookings flag
-- =====================================================

CREATE OR REPLACE FUNCTION get_tutor_public_calendar(
    p_tutor_id uuid,
    p_range_start timestamptz,
    p_range_end timestamptz
) RETURNS jsonb AS $$
DECLARE
    v_result jsonb;
    v_available_slots jsonb DEFAULT '[]'::jsonb;
    v_busy_blocks jsonb DEFAULT '[]'::jsonb;
    v_allow_same_day boolean;
    v_minimum_notice interval;
    v_timezone text := 'America/Port_of_Spain'; -- Trinidad timezone (UTC-4)
BEGIN
    -- Check if tutor allows same-day bookings
    SELECT COALESCE(allow_same_day_bookings, false) INTO v_allow_same_day
    FROM profiles
    WHERE id = p_tutor_id;

    -- Set minimum notice requirement
    IF v_allow_same_day THEN
        v_minimum_notice := interval '0 minutes';  -- Test mode: Show ALL slots (no minimum notice)
    ELSE
        v_minimum_notice := interval '24 hours'; -- Normal: 24 hours notice
    END IF;

    -- Enforce range limit (max 30 days)
    IF p_range_end > p_range_start + interval '30 days' THEN
        p_range_end := p_range_start + interval '30 days';
    END IF;

    -- Build available slots from availability rules
    WITH RECURSIVE date_series AS (
        SELECT p_range_start::date as day
        UNION ALL
        SELECT (day + interval '1 day')::date
        FROM date_series
        WHERE day < p_range_end::date
    ),
    availability_windows AS (
        SELECT 
            -- Fix: interpret times in local timezone, not UTC
            ((ds.day || ' ' || ar.start_time)::timestamp AT TIME ZONE v_timezone)::timestamptz as window_start,
            -- Special case: if end_time is 00:00:00 (12:00 AM), treat it as 23:59:59 (11:59 PM) same day
            ((ds.day || ' ' || 
                CASE 
                    WHEN ar.end_time = '00:00:00'::time THEN '23:59:59'::time
                    ELSE ar.end_time
                END
            )::timestamp AT TIME ZONE v_timezone)::timestamptz as window_end,
            ar.slot_minutes,
            ar.buffer_minutes
        FROM date_series ds
        CROSS JOIN public.tutor_availability_rules ar
        WHERE ar.tutor_id = p_tutor_id
        AND ar.is_active = true
        AND EXTRACT(DOW FROM ds.day) = ar.day_of_week
        AND ((ds.day || ' ' || ar.start_time)::timestamp AT TIME ZONE v_timezone)::timestamptz >= p_range_start
        AND ((ds.day || ' ' || 
            CASE 
                WHEN ar.end_time = '00:00:00'::time THEN '23:59:59'::time
                ELSE ar.end_time
            END
        )::timestamp AT TIME ZONE v_timezone)::timestamptz <= p_range_end
    ),
    generated_slots AS (
        SELECT 
            window_start + (n * (slot_minutes + buffer_minutes) * interval '1 minute') as slot_start,
            window_start + (n * (slot_minutes + buffer_minutes) * interval '1 minute') + (slot_minutes * interval '1 minute') as slot_end
        FROM availability_windows,
        LATERAL generate_series(
            0,
            FLOOR(EXTRACT(EPOCH FROM (window_end - window_start)) / 60 / (slot_minutes + buffer_minutes))::int - 1
        ) as n
    ),
    -- Get all busy periods (confirmed bookings + unavailability blocks)
    busy_periods AS (
        SELECT confirmed_start_at as busy_start, confirmed_end_at as busy_end, 'BOOKED' as busy_type
        FROM public.bookings
        WHERE tutor_id = p_tutor_id
        AND status = 'CONFIRMED'
        AND confirmed_start_at IS NOT NULL
        AND confirmed_end_at IS NOT NULL
        AND time_ranges_overlap(confirmed_start_at, confirmed_end_at, p_range_start, p_range_end)
        
        UNION ALL
        
        SELECT start_at as busy_start, end_at as busy_end, 'UNAVAILABLE' as busy_type
        FROM public.tutor_unavailability_blocks
        WHERE tutor_id = p_tutor_id
        AND time_ranges_overlap(start_at, end_at, p_range_start, p_range_end)
    ),
    -- Filter available slots (exclude those overlapping with busy periods)
    available AS (
        SELECT gs.slot_start, gs.slot_end
        FROM generated_slots gs
        WHERE NOT EXISTS (
            SELECT 1 FROM busy_periods bp
            WHERE time_ranges_overlap(gs.slot_start, gs.slot_end, bp.busy_start, bp.busy_end)
        )
        -- Use dynamic minimum notice based on tutor's settings
        AND gs.slot_start >= now() + v_minimum_notice
    )
    SELECT jsonb_agg(
        jsonb_build_object('start_at', slot_start, 'end_at', slot_end)
        ORDER BY slot_start
    ) INTO v_available_slots
    FROM available;

    -- Build busy blocks (merge adjacent/overlapping periods)
    WITH busy_periods AS (
        SELECT confirmed_start_at as busy_start, confirmed_end_at as busy_end, 'BOOKED' as busy_type
        FROM public.bookings
        WHERE tutor_id = p_tutor_id
        AND status = 'CONFIRMED'
        AND confirmed_start_at IS NOT NULL
        AND time_ranges_overlap(confirmed_start_at, confirmed_end_at, p_range_start, p_range_end)
        
        UNION ALL
        
        SELECT start_at, end_at, 'UNAVAILABLE' as busy_type
        FROM public.tutor_unavailability_blocks
        WHERE tutor_id = p_tutor_id
        AND time_ranges_overlap(start_at, end_at, p_range_start, p_range_end)
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', busy_start,
            'end_at', busy_end,
            'type', busy_type
        )
        ORDER BY busy_start
    ) INTO v_busy_blocks
    FROM busy_periods;

    -- Return combined result
    v_result := jsonb_build_object(
        'available_slots', COALESCE(v_available_slots, '[]'::jsonb),
        'busy_blocks', COALESCE(v_busy_blocks, '[]'::jsonb)
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_tutor_public_calendar TO authenticated;

-- Verification
SELECT 
    'Function updated successfully' as status,
    allow_same_day_bookings
FROM profiles
WHERE email = 'jovangoodluck@myitutor.com';


-- ===== FILE: 074_flexible_booking_windows.sql =====

-- =====================================================
-- FLEXIBLE BOOKING: Return availability windows instead of fixed slots
-- Allows students to book at any 15-minute interval within tutor's availability
-- =====================================================

CREATE OR REPLACE FUNCTION get_tutor_public_calendar(
    p_tutor_id uuid,
    p_range_start timestamptz,
    p_range_end timestamptz
) RETURNS jsonb AS $$
DECLARE
    v_result jsonb;
    v_availability_windows jsonb DEFAULT '[]'::jsonb;
    v_busy_blocks jsonb DEFAULT '[]'::jsonb;
    v_allow_same_day boolean;
    v_minimum_notice interval;
    v_timezone text := 'America/Port_of_Spain'; -- Trinidad timezone (UTC-4)
BEGIN
    -- Check if tutor allows same-day bookings
    SELECT COALESCE(allow_same_day_bookings, true) INTO v_allow_same_day
    FROM profiles
    WHERE id = p_tutor_id;

    -- Set minimum notice requirement
    IF v_allow_same_day THEN
        v_minimum_notice := interval '0 minutes';  -- Same-day: Just needs to be in future
    ELSE
        v_minimum_notice := interval '24 hours'; -- Requires 24h advance notice
    END IF;

    -- Enforce range limit (max 30 days)
    IF p_range_end > p_range_start + interval '30 days' THEN
        p_range_end := p_range_start + interval '30 days';
    END IF;

    -- Build availability windows from tutor's availability rules
    WITH RECURSIVE date_series AS (
        SELECT p_range_start::date as day
        UNION ALL
        SELECT (day + interval '1 day')::date
        FROM date_series
        WHERE day < p_range_end::date
    ),
    raw_windows AS (
        SELECT 
            -- Interpret times in local timezone
            ((ds.day || ' ' || ar.start_time)::timestamp AT TIME ZONE v_timezone)::timestamptz as window_start,
            -- Handle midnight edge case
            ((ds.day || ' ' || 
                CASE 
                    WHEN ar.end_time = '00:00:00'::time THEN '23:59:59'::time
                    ELSE ar.end_time
                END
            )::timestamp AT TIME ZONE v_timezone)::timestamptz as window_end
        FROM date_series ds
        CROSS JOIN public.tutor_availability_rules ar
        WHERE ar.tutor_id = p_tutor_id
        AND ar.is_active = true
        AND EXTRACT(DOW FROM ds.day) = ar.day_of_week
        AND ((ds.day || ' ' || ar.start_time)::timestamp AT TIME ZONE v_timezone)::timestamptz >= p_range_start
        AND ((ds.day || ' ' || 
            CASE 
                WHEN ar.end_time = '00:00:00'::time THEN '23:59:59'::time
                ELSE ar.end_time
            END
        )::timestamp AT TIME ZONE v_timezone)::timestamptz <= p_range_end
    ),
    -- Get busy periods (confirmed bookings + unavailability blocks)
    busy_periods AS (
        SELECT confirmed_start_at as busy_start, confirmed_end_at as busy_end, 'BOOKED' as busy_type
        FROM public.bookings
        WHERE tutor_id = p_tutor_id
        AND status = 'CONFIRMED'
        AND confirmed_start_at IS NOT NULL
        AND confirmed_end_at IS NOT NULL
        AND time_ranges_overlap(confirmed_start_at, confirmed_end_at, p_range_start, p_range_end)
        
        UNION ALL
        
        SELECT start_at as busy_start, end_at as busy_end, 'UNAVAILABLE' as busy_type
        FROM public.tutor_unavailability_blocks
        WHERE tutor_id = p_tutor_id
        AND time_ranges_overlap(start_at, end_at, p_range_start, p_range_end)
    ),
    -- Filter windows: Only keep future slots with minimum notice
    future_windows AS (
        SELECT window_start, window_end
        FROM raw_windows
        WHERE window_end >= now() + v_minimum_notice
        -- Adjust start time if it's in the past or too soon
        AND window_start < window_end
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', GREATEST(window_start, now() + v_minimum_notice),
            'end_at', window_end
        )
        ORDER BY window_start
    ) INTO v_availability_windows
    FROM future_windows;

    -- Build busy blocks
    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', busy_start,
            'end_at', busy_end,
            'type', busy_type
        )
        ORDER BY busy_start
    ) INTO v_busy_blocks
    FROM busy_periods;

    -- Return result with availability windows and busy blocks
    v_result := jsonb_build_object(
        'availability_windows', COALESCE(v_availability_windows, '[]'::jsonb),
        'busy_blocks', COALESCE(v_busy_blocks, '[]'::jsonb),
        'allows_flexible_booking', true
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_tutor_public_calendar TO authenticated;

-- Add helper function to validate if a requested time fits within availability
CREATE OR REPLACE FUNCTION is_time_slot_available(
    p_tutor_id uuid,
    p_requested_start timestamptz,
    p_requested_end timestamptz
) RETURNS boolean AS $$
DECLARE
    v_calendar jsonb;
    v_window jsonb;
    v_busy jsonb;
    v_window_start timestamptz;
    v_window_end timestamptz;
    v_busy_start timestamptz;
    v_busy_end timestamptz;
    v_fits_in_window boolean := false;
    v_overlaps_busy boolean := false;
BEGIN
    -- Get calendar data
    v_calendar := get_tutor_public_calendar(p_tutor_id, p_requested_start, p_requested_end);
    
    -- Check if requested time fits within any availability window
    FOR v_window IN SELECT * FROM jsonb_array_elements(v_calendar->'availability_windows')
    LOOP
        v_window_start := (v_window->>'start_at')::timestamptz;
        v_window_end := (v_window->>'end_at')::timestamptz;
        
        IF p_requested_start >= v_window_start AND p_requested_end <= v_window_end THEN
            v_fits_in_window := true;
            EXIT;
        END IF;
    END LOOP;
    
    -- If doesn't fit in any window, not available
    IF NOT v_fits_in_window THEN
        RETURN false;
    END IF;
    
    -- Check if requested time overlaps with any busy block
    FOR v_busy IN SELECT * FROM jsonb_array_elements(v_calendar->'busy_blocks')
    LOOP
        v_busy_start := (v_busy->>'start_at')::timestamptz;
        v_busy_end := (v_busy->>'end_at')::timestamptz;
        
        IF time_ranges_overlap(p_requested_start, p_requested_end, v_busy_start, v_busy_end) THEN
            RETURN false;
        END IF;
    END LOOP;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION is_time_slot_available TO authenticated;

-- Verification: Test the new function
SELECT 
    'Migration 074 completed' as status,
    'get_tutor_public_calendar updated for flexible bookings' as message;


-- ===== FILE: 075_fix_rls_recursion.sql =====

-- =============================================================================
-- Migration: 075_fix_rls_recursion.sql
-- Description: Fix infinite recursion in RLS policies for production
-- Date: 2026-02-17
-- UPDATED: Using ultra-simple policies to eliminate all recursion
-- =============================================================================
-- This migration resolves the infinite recursion issues in Row Level Security
-- policies by using the simplest possible approach.
--
-- Root cause: Complex policies with subqueries cause PostgreSQL RLS recursion.
--
-- Solution: Ultra-simple policies with NO complex logic:
-- - Only support DM messages (tutor-student direct messages)
-- - Remove community Q&A message policies (they caused recursion)
-- - Simple EXISTS checks only
-- =============================================================================

BEGIN;

-- =============================================================================
-- Step 1: Drop ALL existing policies to start fresh
-- =============================================================================

-- messages table - remove all policies
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Members can read community questions" ON messages;
DROP POLICY IF EXISTS "Users can send messages" ON messages;
DROP POLICY IF EXISTS "Active members can create questions" ON messages;
DROP POLICY IF EXISTS "Users can edit own messages" ON messages;
DROP POLICY IF EXISTS "Moderators can moderate messages" ON messages;
DROP POLICY IF EXISTS "Authors and moderators can delete" ON messages;
DROP POLICY IF EXISTS "users_read_messages" ON messages;
DROP POLICY IF EXISTS "users_send_dm_messages" ON messages;
DROP POLICY IF EXISTS "members_post_community_messages" ON messages;
DROP POLICY IF EXISTS "users_update_own_messages" ON messages;
DROP POLICY IF EXISTS "users_delete_messages" ON messages;
DROP POLICY IF EXISTS "msg_read_dm_only" ON messages;
DROP POLICY IF EXISTS "msg_insert_dm_only" ON messages;

-- conversations table - remove all policies
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update their conversations" ON conversations;
DROP POLICY IF EXISTS "conversations_select" ON conversations;
DROP POLICY IF EXISTS "conversations_insert" ON conversations;
DROP POLICY IF EXISTS "conversations_update" ON conversations;
DROP POLICY IF EXISTS "conv_read" ON conversations;
DROP POLICY IF EXISTS "conv_insert" ON conversations;

-- =============================================================================
-- Step 2: Create ultra-simple policies (ZERO recursion possible)
-- =============================================================================

-- CONVERSATIONS: Simple direct check
CREATE POLICY "conv_read"
ON conversations
FOR SELECT
TO authenticated
USING (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

CREATE POLICY "conv_insert"
ON conversations
FOR INSERT
TO authenticated
WITH CHECK (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

-- MESSAGES: Only for DMs - NO community logic
CREATE POLICY "msg_read_dm_only"
ON messages
FOR SELECT
TO authenticated
USING (
  -- Only allow DMs, ignore community messages
  (community_id IS NULL OR message_type = 'dm' OR message_type IS NULL)
  AND
  -- Simple check - conversation belongs to user
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
    AND (c.participant_1_id = auth.uid() OR c.participant_2_id = auth.uid())
  )
);

CREATE POLICY "msg_insert_dm_only"
ON messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (community_id IS NULL OR message_type = 'dm' OR message_type IS NULL)
  AND EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_id
    AND (c.participant_1_id = auth.uid() OR c.participant_2_id = auth.uid())
  )
);

-- =============================================================================
-- Step 3: Ensure profiles policy is simple
-- =============================================================================

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON profiles;

CREATE POLICY "Authenticated users can view profiles"
ON profiles
FOR SELECT
TO authenticated
USING (true);

-- =============================================================================
-- Step 4: Enable RLS on all tables
-- =============================================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

COMMIT;

-- =============================================================================
-- Verification
-- =============================================================================

DO $$
DECLARE
  v_messages_policies int;
  v_conversations_policies int;
BEGIN
  SELECT COUNT(*) INTO v_messages_policies FROM pg_policies WHERE tablename = 'messages';
  SELECT COUNT(*) INTO v_conversations_policies FROM pg_policies WHERE tablename = 'conversations';
  
  RAISE NOTICE '';
  RAISE NOTICE 'âœ… Ultra-Simple RLS Policies Applied Successfully';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Policy counts:';
  RAISE NOTICE '  - messages: % policies', v_messages_policies;
  RAISE NOTICE '  - conversations: % policies', v_conversations_policies;
  RAISE NOTICE '';
  RAISE NOTICE 'Security:';
  RAISE NOTICE '  âœ“ Users can only read their own conversations';
  RAISE NOTICE '  âœ“ Users can only read DM messages they have access to';
  RAISE NOTICE '  âœ“ All authenticated users can view profiles';
  RAISE NOTICE '';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  âœ“ Direct messages (DMs) work perfectly';
  RAISE NOTICE '  âœ“ Tutor feedback appears in messages';
  RAISE NOTICE '  âœ“ Zero recursion - uses simplest possible logic';
  RAISE NOTICE '';
  RAISE NOTICE 'âš ï¸  Note: Community Q&A messages are not included in these policies';
  RAISE NOTICE '   (They caused the recursion issue and can be added later if needed)';
  RAISE NOTICE '';
END $$;


-- ===== FILE: 076_school_communities_v2_schema.sql =====

-- =====================================================
-- SCHOOL COMMUNITIES V2 - SCHEMA
-- One public School Community per institution; separate from v1 communities/messages
-- =====================================================

-- 1. ENUMS
DO $$ BEGIN
  CREATE TYPE school_community_member_status AS ENUM ('ACTIVE', 'LEFT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE school_community_member_role AS ENUM ('MEMBER', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. SCHOOL_COMMUNITIES (one per institution)
CREATE TABLE IF NOT EXISTS school_communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE REFERENCES public.institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'SCHOOL' CHECK (type = 'SCHOOL'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_communities_school_id ON school_communities(school_id);

COMMENT ON TABLE school_communities IS 'One public School Community per institution (v2)';

-- 3. SCHOOL_COMMUNITY_MEMBERSHIPS
CREATE TABLE IF NOT EXISTS school_community_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES school_communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status school_community_member_status NOT NULL DEFAULT 'ACTIVE',
  muted boolean NOT NULL DEFAULT false,
  role school_community_member_role NOT NULL DEFAULT 'MEMBER',
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  CONSTRAINT unique_school_community_member UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_school_community_memberships_community_id ON school_community_memberships(community_id);
CREATE INDEX IF NOT EXISTS idx_school_community_memberships_user_id ON school_community_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_school_community_memberships_status ON school_community_memberships(status);

COMMENT ON TABLE school_community_memberships IS 'User membership in school communities (v2)';

-- 4. SCHOOL_COMMUNITY_MESSAGES (threads via parent_message_id)
CREATE TABLE IF NOT EXISTS school_community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES school_communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_message_id uuid REFERENCES school_community_messages(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_community_messages_community_id ON school_community_messages(community_id);
CREATE INDEX IF NOT EXISTS idx_school_community_messages_parent_message_id ON school_community_messages(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_school_community_messages_created_at ON school_community_messages(created_at DESC);

COMMENT ON TABLE school_community_messages IS 'Feed and thread messages for school communities (v2); separate from messages/DM';

-- 5. UPDATED_AT TRIGGER FOR MESSAGES
CREATE OR REPLACE FUNCTION school_community_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_school_community_messages_updated_at ON school_community_messages;
CREATE TRIGGER trigger_school_community_messages_updated_at
  BEFORE UPDATE ON school_community_messages
  FOR EACH ROW
  EXECUTE FUNCTION school_community_messages_updated_at();


-- ===== FILE: 077_school_communities_v2_rls.sql =====

-- =====================================================
-- SCHOOL COMMUNITIES V2 - RLS POLICIES
-- =====================================================

-- Helper: current user's institution_id (for RLS)
CREATE OR REPLACE FUNCTION public.user_institution_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT institution_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Enable RLS on all three tables
ALTER TABLE school_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_community_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_community_messages ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- SCHOOL_COMMUNITIES
-- ---------------------------------------------------------------------------
-- SELECT: only community for user's school
CREATE POLICY "school_communities_select_own_school"
ON school_communities FOR SELECT
TO authenticated
USING (school_id = public.user_institution_id());

-- No INSERT/UPDATE/DELETE for users; use service role in app

-- ---------------------------------------------------------------------------
-- SCHOOL_COMMUNITY_MEMBERSHIPS
-- ---------------------------------------------------------------------------
-- SELECT: memberships for communities that belong to user's school
CREATE POLICY "school_community_memberships_select_own_school"
ON school_community_memberships FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM school_communities sc
    WHERE sc.id = school_community_memberships.community_id
    AND sc.school_id = public.user_institution_id()
  )
);

-- INSERT: rejoin - only for own school's community, self only
CREATE POLICY "school_community_memberships_insert_rejoin"
ON school_community_memberships FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM school_communities sc
    WHERE sc.id = community_id AND sc.school_id = public.user_institution_id()
  )
);

-- UPDATE: own row only (status, muted, left_at, joined_at for leave/rejoin)
CREATE POLICY "school_community_memberships_update_own"
ON school_community_memberships FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- SCHOOL_COMMUNITY_MESSAGES
-- ---------------------------------------------------------------------------
-- SELECT: messages in communities that belong to user's school
CREATE POLICY "school_community_messages_select_own_school"
ON school_community_messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM school_communities sc
    WHERE sc.id = school_community_messages.community_id
    AND sc.school_id = public.user_institution_id()
  )
);

-- INSERT: only if community is user's school AND user has ACTIVE membership
CREATE POLICY "school_community_messages_insert_active_member"
ON school_community_messages FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM school_communities sc
    WHERE sc.id = community_id AND sc.school_id = public.user_institution_id()
  )
  AND EXISTS (
    SELECT 1 FROM school_community_memberships m
    WHERE m.community_id = school_community_messages.community_id
    AND m.user_id = auth.uid()
    AND m.status = 'ACTIVE'
  )
);

-- UPDATE: own messages (content/edit); pin/unpin only for ADMIN or platform admin
CREATE POLICY "school_community_messages_update_own"
ON school_community_messages FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- UPDATE: allow pin/unpin for community ADMIN or platform admin (role/is_reviewer)
CREATE POLICY "school_community_messages_update_pin_admin"
ON school_community_messages FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM school_community_memberships m
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE m.community_id = school_community_messages.community_id
    AND m.user_id = auth.uid()
    AND m.role = 'ADMIN'
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND (p.role = 'admin' OR p.is_reviewer = true)
  )
)
WITH CHECK (true);

-- DELETE: own messages only
CREATE POLICY "school_community_messages_delete_own"
ON school_community_messages FOR DELETE
TO authenticated
USING (user_id = auth.uid());


-- ===== FILE: 078_communities_v2_unified_schema.sql =====

-- =====================================================
-- COMMUNITIES V2 UNIFIED SCHEMA (Discord-style)
-- communities + community_memberships + community_messages + community_favorites
-- =====================================================

-- 1. ENUMS (distinct names to avoid conflict with existing community_type/member_role/member_status)
DO $$ BEGIN
  CREATE TYPE v2_community_type AS ENUM ('SCHOOL', 'PUBLIC');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE v2_community_member_role AS ENUM ('MEMBER', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE v2_community_member_status AS ENUM ('ACTIVE', 'LEFT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. COMMUNITIES
CREATE TABLE IF NOT EXISTS public.communities_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type v2_community_type NOT NULL,
  school_id uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  avatar_url text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communities_v2_school_unique UNIQUE (school_id),
  CONSTRAINT communities_v2_school_has_id CHECK (
    (type = 'SCHOOL' AND school_id IS NOT NULL) OR (type = 'PUBLIC' AND school_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_communities_v2_type ON public.communities_v2(type);
CREATE INDEX IF NOT EXISTS idx_communities_v2_school_id ON public.communities_v2(school_id) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communities_v2_created_by ON public.communities_v2(created_by);

COMMENT ON TABLE public.communities_v2 IS 'Unified communities: SCHOOL (one per institution) and PUBLIC (user-created)';

-- 3. COMMUNITY_MEMBERSHIPS
CREATE TABLE IF NOT EXISTS public.community_memberships_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities_v2(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role v2_community_member_role NOT NULL DEFAULT 'MEMBER',
  status v2_community_member_status NOT NULL DEFAULT 'ACTIVE',
  muted boolean NOT NULL DEFAULT false,
  muted_until timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  CONSTRAINT community_memberships_v2_unique UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_memberships_v2_community_user ON public.community_memberships_v2(community_id, user_id);
CREATE INDEX IF NOT EXISTS idx_community_memberships_v2_user ON public.community_memberships_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_community_memberships_v2_status ON public.community_memberships_v2(status);

COMMENT ON TABLE public.community_memberships_v2 IS 'Memberships for v2 communities; muted_until for timed mute';

-- 4. COMMUNITY_MESSAGES
CREATE TABLE IF NOT EXISTS public.community_messages_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities_v2(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_message_id uuid REFERENCES public.community_messages_v2(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_messages_v2_community_created ON public.community_messages_v2(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_messages_v2_parent ON public.community_messages_v2(parent_message_id) WHERE parent_message_id IS NOT NULL;

COMMENT ON TABLE public.community_messages_v2 IS 'Messages and threads for v2 communities';

-- 5. COMMUNITY_FAVORITES (per-user bookmarks)
CREATE TABLE IF NOT EXISTS public.community_favorites_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.community_messages_v2(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_favorites_v2_unique UNIQUE (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_community_favorites_v2_user ON public.community_favorites_v2(user_id);

COMMENT ON TABLE public.community_favorites_v2 IS 'Per-user favorite (bookmark) messages in v2 communities';


-- ===== FILE: 079_communities_v2_unified_rls.sql =====

-- =====================================================
-- COMMUNITIES V2 UNIFIED - RLS POLICIES
-- Uses public.user_institution_id() from 077
-- =====================================================

ALTER TABLE public.communities_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_memberships_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_messages_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_favorites_v2 ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- COMMUNITIES_V2
-- ---------------------------------------------------------------------------
-- SELECT: ACTIVE member OR PUBLIC (browse) OR SCHOOL and user's school
CREATE POLICY "communities_v2_select"
ON public.communities_v2 FOR SELECT TO authenticated
USING (
  type = 'PUBLIC'
  OR school_id = public.user_institution_id()
  OR EXISTS (
    SELECT 1 FROM public.community_memberships_v2 m
    WHERE m.community_id = communities_v2.id AND m.user_id = auth.uid() AND m.status = 'ACTIVE'
  )
);

-- INSERT: PUBLIC by anyone (creator); SCHOOL only via service role
CREATE POLICY "communities_v2_insert_public"
ON public.communities_v2 FOR INSERT TO authenticated
WITH CHECK (type = 'PUBLIC' AND created_by = auth.uid());

-- UPDATE: creator only (avatar, name, description)
CREATE POLICY "communities_v2_update_creator"
ON public.communities_v2 FOR UPDATE TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- COMMUNITY_MEMBERSHIPS_V2
-- ---------------------------------------------------------------------------
-- SELECT: memberships for communities user can read
CREATE POLICY "community_memberships_v2_select"
ON public.community_memberships_v2 FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.communities_v2 c
    WHERE c.id = community_memberships_v2.community_id
    AND (
      c.type = 'PUBLIC'
      OR c.school_id = public.user_institution_id()
      OR EXISTS (SELECT 1 FROM public.community_memberships_v2 m2 WHERE m2.community_id = c.id AND m2.user_id = auth.uid())
    )
  )
);

-- INSERT: join PUBLIC or SCHOOL (own school only), self only
CREATE POLICY "community_memberships_v2_insert"
ON public.community_memberships_v2 FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM public.communities_v2 c WHERE c.id = community_id AND c.type = 'PUBLIC')
    OR EXISTS (SELECT 1 FROM public.communities_v2 c WHERE c.id = community_id AND c.type = 'SCHOOL' AND c.school_id = public.user_institution_id())
  )
);

-- UPDATE: own row only (status, muted, muted_until, left_at)
CREATE POLICY "community_memberships_v2_update_own"
ON public.community_memberships_v2 FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- COMMUNITY_MESSAGES_V2
-- ---------------------------------------------------------------------------
-- SELECT: ACTIVE member or SCHOOL-eligible (same school)
CREATE POLICY "community_messages_v2_select"
ON public.community_messages_v2 FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.communities_v2 c
    WHERE c.id = community_messages_v2.community_id
    AND (
      (c.type = 'SCHOOL' AND c.school_id = public.user_institution_id())
      OR EXISTS (SELECT 1 FROM public.community_memberships_v2 m WHERE m.community_id = c.id AND m.user_id = auth.uid() AND m.status = 'ACTIVE')
    )
  )
);

-- INSERT: ACTIVE member only
CREATE POLICY "community_messages_v2_insert"
ON public.community_messages_v2 FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.community_memberships_v2 m
    WHERE m.community_id = community_messages_v2.community_id AND m.user_id = auth.uid() AND m.status = 'ACTIVE'
  )
);

-- UPDATE: own content; is_pinned only for ADMIN
CREATE POLICY "community_messages_v2_update_own"
ON public.community_messages_v2 FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "community_messages_v2_update_pin_admin"
ON public.community_messages_v2 FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.community_memberships_v2 m
    WHERE m.community_id = community_messages_v2.community_id AND m.user_id = auth.uid() AND m.role = 'ADMIN'
  )
)
WITH CHECK (true);

-- DELETE: own messages only
CREATE POLICY "community_messages_v2_delete_own"
ON public.community_messages_v2 FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- COMMUNITY_FAVORITES_V2
-- ---------------------------------------------------------------------------
CREATE POLICY "community_favorites_v2_select"
ON public.community_favorites_v2 FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "community_favorites_v2_insert"
ON public.community_favorites_v2 FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "community_favorites_v2_delete"
ON public.community_favorites_v2 FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- =====================================================
-- STORAGE: community-avatars (path: {community_id}/{filename})
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-avatars', 'community-avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "community_avatars_select" ON storage.objects;
CREATE POLICY "community_avatars_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'community-avatars');

DROP POLICY IF EXISTS "community_avatars_insert" ON storage.objects;
CREATE POLICY "community_avatars_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'community-avatars'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.communities_v2 WHERE created_by = auth.uid()
    UNION
    SELECT community_id::text FROM public.community_memberships_v2 WHERE user_id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
  )
);

DROP POLICY IF EXISTS "community_avatars_update" ON storage.objects;
CREATE POLICY "community_avatars_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'community-avatars'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.communities_v2 WHERE created_by = auth.uid()
    UNION
    SELECT community_id::text FROM public.community_memberships_v2 WHERE user_id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
  )
);

DROP POLICY IF EXISTS "community_avatars_delete" ON storage.objects;
CREATE POLICY "community_avatars_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'community-avatars'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.communities_v2 WHERE created_by = auth.uid()
    UNION
    SELECT community_id::text FROM public.community_memberships_v2 WHERE user_id = auth.uid() AND role = 'ADMIN' AND status = 'ACTIVE'
  )
);


-- ===== FILE: 080_communities_v2_data_migration.sql =====

-- =====================================================
-- DATA MIGRATION: school_* -> communities_v2 / community_memberships_v2 / community_messages_v2
-- One-time; run after 078 + 079. Preserves existing school communities and data.
-- =====================================================

-- 1. Communities: copy each school_community to communities_v2 (type SCHOOL)
INSERT INTO public.communities_v2 (type, school_id, name, description, created_by)
SELECT 'SCHOOL'::v2_community_type, school_id, name, description, NULL
FROM public.school_communities sc
WHERE NOT EXISTS (SELECT 1 FROM public.communities_v2 c2 WHERE c2.school_id = sc.school_id AND c2.type = 'SCHOOL');

-- 2. Memberships: copy using school_id join (old community_id -> new community_id)
INSERT INTO public.community_memberships_v2 (community_id, user_id, role, status, muted, muted_until, joined_at, left_at)
SELECT c2.id, m.user_id,
  CASE m.role::text WHEN 'ADMIN' THEN 'ADMIN'::v2_community_member_role ELSE 'MEMBER'::v2_community_member_role END,
  CASE m.status::text WHEN 'LEFT' THEN 'LEFT'::v2_community_member_status ELSE 'ACTIVE'::v2_community_member_status END,
  m.muted, NULL, m.joined_at, m.left_at
FROM public.school_community_memberships m
JOIN public.school_communities sc ON sc.id = m.community_id
JOIN public.communities_v2 c2 ON c2.school_id = sc.school_id AND c2.type = 'SCHOOL'
ON CONFLICT (community_id, user_id) DO NOTHING;

-- 3. Messages: copy with parent_message_id mapping (insert in created_at order)
DO $$
DECLARE
  r RECORD;
  new_comm_id uuid;
  new_parent_id uuid;
  new_msg_id uuid;
BEGIN
  CREATE TEMP TABLE _comm_id_map (old_id uuid PRIMARY KEY, new_id uuid);
  INSERT INTO _comm_id_map (old_id, new_id)
  SELECT sc.id, c2.id FROM public.school_communities sc
  JOIN public.communities_v2 c2 ON c2.school_id = sc.school_id AND c2.type = 'SCHOOL';

  CREATE TEMP TABLE _msg_id_map (old_id uuid PRIMARY KEY, new_id uuid);

  FOR r IN
    SELECT sm.id, sm.community_id, sm.user_id, sm.parent_message_id, sm.content, sm.is_pinned, sm.created_at
    FROM public.school_community_messages sm
    ORDER BY sm.created_at ASC
  LOOP
    SELECT cm.new_id INTO new_comm_id FROM _comm_id_map cm WHERE cm.old_id = r.community_id;
    IF new_comm_id IS NULL THEN CONTINUE; END IF;

    new_parent_id := NULL;
    IF r.parent_message_id IS NOT NULL THEN
      SELECT m.new_id INTO new_parent_id FROM _msg_id_map m WHERE m.old_id = r.parent_message_id;
    END IF;

    INSERT INTO public.community_messages_v2 (community_id, user_id, parent_message_id, content, is_pinned, created_at)
    VALUES (new_comm_id, r.user_id, new_parent_id, r.content, r.is_pinned, r.created_at)
    RETURNING id INTO new_msg_id;

    INSERT INTO _msg_id_map (old_id, new_id) VALUES (r.id, new_msg_id) ON CONFLICT (old_id) DO UPDATE SET new_id = EXCLUDED.new_id;
  END LOOP;

  DROP TABLE _msg_id_map;
  DROP TABLE _comm_id_map;
END $$;


-- ===== FILE: 081_conversation_request_status.sql =====

-- =====================================================
-- CONVERSATION REQUEST STATUS (student-to-student)
-- First message = request; receiver must accept to continue.
-- =====================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS status text NULL
    CHECK (status IS NULL OR status IN ('PENDING', 'ACCEPTED', 'DECLINED')),
  ADD COLUMN IF NOT EXISTS initiated_by_id uuid NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_status ON public.conversations(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_initiated_by ON public.conversations(initiated_by_id) WHERE initiated_by_id IS NOT NULL;

COMMENT ON COLUMN public.conversations.status IS 'For student-student: PENDING = awaiting accept, ACCEPTED = can chat, DECLINED = request declined. NULL = legacy or non-student convos (treated as open).';
COMMENT ON COLUMN public.conversations.initiated_by_id IS 'User who sent the first message (the request); used when status = PENDING.';


-- ===== FILE: 082_fix_community_memberships_v2_rls_recursion.sql =====

-- =====================================================
-- FIX: Infinite recursion in policy for community_memberships_v2
-- =====================================================
-- Two policies formed a cycle:
--   community_memberships_v2_select â†’ reads communities_v2
--   communities_v2_select â†’ reads community_memberships_v2 â†’ recursion.
--
-- Fix both: no policy may read community_memberships_v2 when evaluating
-- visibility. Communities: visible if PUBLIC or user's school.
-- Memberships: visible if own row, or community is PUBLIC/school.
-- =====================================================

-- 1. communities_v2: remove the clause that reads community_memberships_v2
DROP POLICY IF EXISTS "communities_v2_select" ON public.communities_v2;

CREATE POLICY "communities_v2_select"
ON public.communities_v2 FOR SELECT TO authenticated
USING (
  type = 'PUBLIC'
  OR school_id = public.user_institution_id()
);

-- 2. community_memberships_v2: already fixed in 082 (no self-ref); ensure no cycle
DROP POLICY IF EXISTS "community_memberships_v2_select" ON public.community_memberships_v2;

CREATE POLICY "community_memberships_v2_select"
ON public.community_memberships_v2 FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.communities_v2 c
    WHERE c.id = community_memberships_v2.community_id
    AND (c.type = 'PUBLIC' OR c.school_id = public.user_institution_id())
  )
);


-- ===== FILE: 083_message_attachments.sql =====

-- =====================================================
-- MESSAGE ATTACHMENTS: files, images, voice notes
-- =====================================================

-- 1) Direct messages (conversations)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

COMMENT ON COLUMN public.messages.attachment_url IS 'Storage URL for file/image/voice attachment';
COMMENT ON COLUMN public.messages.attachment_type IS 'image | file | voice';
COMMENT ON COLUMN public.messages.attachment_name IS 'Original filename for display/download';

-- Allow content to be empty when attachment is present
ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_content_not_empty;
ALTER TABLE public.messages ADD CONSTRAINT messages_content_or_attachment CHECK (
  (content IS NOT NULL AND trim(content) != '') OR (attachment_url IS NOT NULL AND attachment_url != '')
);

-- 2) Community messages v2
ALTER TABLE public.community_messages_v2
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

COMMENT ON COLUMN public.community_messages_v2.attachment_url IS 'Storage URL for file/image/voice attachment';
COMMENT ON COLUMN public.community_messages_v2.attachment_type IS 'image | file | voice';
COMMENT ON COLUMN public.community_messages_v2.attachment_name IS 'Original filename for display/download';

-- Community messages: allow empty content when attachment present
ALTER TABLE public.community_messages_v2 ALTER COLUMN content DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_messages_v2_content_or_attachment'
  ) THEN
    ALTER TABLE public.community_messages_v2 ADD CONSTRAINT community_messages_v2_content_or_attachment
    CHECK (
      (content IS NOT NULL AND trim(content) != '') OR (attachment_url IS NOT NULL AND attachment_url != '')
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 3) Storage bucket for message attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-attachments', 'message-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Upload: authenticated users to their own folder {user_id}/{path}
CREATE POLICY "message_attachments_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "message_attachments_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "message_attachments_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "message_attachments_select"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'message-attachments');


-- ===== FILE: 084_community_message_reactions.sql =====

-- =====================================================
-- COMMUNITY MESSAGE REACTIONS (one emoji per user per message)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.community_message_reactions_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.community_messages_v2(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_message_reactions_v2_unique UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_message_reactions_v2_message ON public.community_message_reactions_v2(message_id);

ALTER TABLE public.community_message_reactions_v2 ENABLE ROW LEVEL SECURITY;

-- SELECT: users who can read the community can read reactions
CREATE POLICY "community_message_reactions_v2_select"
ON public.community_message_reactions_v2 FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.community_messages_v2 m
    JOIN public.community_memberships_v2 mem ON mem.community_id = m.community_id AND mem.user_id = auth.uid() AND mem.status = 'ACTIVE'
    WHERE m.id = community_message_reactions_v2.message_id
  )
);

-- INSERT: ACTIVE community members only, own user_id
CREATE POLICY "community_message_reactions_v2_insert"
ON public.community_message_reactions_v2 FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.community_messages_v2 m
    JOIN public.community_memberships_v2 mem ON mem.community_id = m.community_id AND mem.user_id = auth.uid() AND mem.status = 'ACTIVE'
    WHERE m.id = message_id
  )
);

-- UPDATE/DELETE: own reaction only
CREATE POLICY "community_message_reactions_v2_update"
ON public.community_message_reactions_v2 FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "community_message_reactions_v2_delete"
ON public.community_message_reactions_v2 FOR DELETE TO authenticated
USING (user_id = auth.uid());

COMMENT ON TABLE public.community_message_reactions_v2 IS 'Per-message emoji reactions; one per user per message';


-- ===== FILE: 087_group_sessions.sql =====

-- =====================================================
-- GROUPS FEATURE: GROUP SESSIONS, MEMBERS, MESSAGING
-- =====================================================

-- ============================
-- TABLE: groups
-- ============================
CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text,
  pricing text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_groups_tutor_id ON public.groups(tutor_id);
CREATE INDEX IF NOT EXISTS idx_groups_archived ON public.groups(archived_at) WHERE archived_at IS NULL;

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated users can read non-archived groups
CREATE POLICY "groups_select"
ON public.groups FOR SELECT TO authenticated
USING (archived_at IS NULL);

-- INSERT: only tutors can create groups
CREATE POLICY "groups_insert"
ON public.groups FOR INSERT TO authenticated
WITH CHECK (
  tutor_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'tutor'
  )
);

-- UPDATE: tutor can update their own group
CREATE POLICY "groups_update"
ON public.groups FOR UPDATE TO authenticated
USING (tutor_id = auth.uid())
WITH CHECK (tutor_id = auth.uid());

-- DELETE: tutor can delete their own group
CREATE POLICY "groups_delete"
ON public.groups FOR DELETE TO authenticated
USING (tutor_id = auth.uid());

COMMENT ON TABLE public.groups IS 'Group sessions created by tutors for multiple students';


-- ============================
-- TABLE: group_members
-- ============================
CREATE TABLE IF NOT EXISTS public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_members_unique UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_status ON public.group_members(status);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- SELECT: group tutor can see all members; members can see approved peers; user can see own record
CREATE POLICY "group_members_select"
ON public.group_members FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
  OR (
    status = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.status = 'approved'
    )
  )
);

-- INSERT: authenticated users can request to join (students only, one request per group)
CREATE POLICY "group_members_insert"
ON public.group_members FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
);

-- UPDATE: tutor can approve/deny; user cannot change their own status
CREATE POLICY "group_members_update"
ON public.group_members FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
);

-- DELETE: tutor can remove members
CREATE POLICY "group_members_delete"
ON public.group_members FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
);

COMMENT ON TABLE public.group_members IS 'Membership requests and approvals for groups';


-- ============================
-- TABLE: group_sessions
-- ============================
CREATE TABLE IF NOT EXISTS public.group_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  title text NOT NULL,
  recurrence_type text NOT NULL DEFAULT 'none' CHECK (recurrence_type IN ('none', 'weekly', 'daily')),
  recurrence_days integer[] DEFAULT '{}',
  start_time time NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  starts_on date NOT NULL,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_sessions_group_id ON public.group_sessions(group_id);

ALTER TABLE public.group_sessions ENABLE ROW LEVEL SECURITY;

-- SELECT: approved members and tutor can view sessions
CREATE POLICY "group_sessions_select"
ON public.group_sessions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_sessions.group_id
      AND gm.user_id = auth.uid()
      AND gm.status = 'approved'
  )
);

-- INSERT/UPDATE/DELETE: tutor only
CREATE POLICY "group_sessions_insert"
ON public.group_sessions FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
);

CREATE POLICY "group_sessions_update"
ON public.group_sessions FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
);

CREATE POLICY "group_sessions_delete"
ON public.group_sessions FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
);

COMMENT ON TABLE public.group_sessions IS 'Session definitions (possibly recurring) for a group';


-- ============================
-- TABLE: group_session_occurrences
-- ============================
CREATE TABLE IF NOT EXISTS public.group_session_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_session_id uuid NOT NULL REFERENCES public.group_sessions(id) ON DELETE CASCADE,
  scheduled_start_at timestamptz NOT NULL,
  scheduled_end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'cancelled')),
  cancelled_at timestamptz,
  cancellation_note text
);

CREATE INDEX IF NOT EXISTS idx_group_session_occurrences_session_id ON public.group_session_occurrences(group_session_id);
CREATE INDEX IF NOT EXISTS idx_group_session_occurrences_start ON public.group_session_occurrences(scheduled_start_at);

ALTER TABLE public.group_session_occurrences ENABLE ROW LEVEL SECURITY;

-- SELECT: approved members and tutor via parent session
CREATE POLICY "group_session_occurrences_select"
ON public.group_session_occurrences FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_sessions gs
    JOIN public.groups g ON g.id = gs.group_id
    WHERE gs.id = group_session_id AND g.tutor_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.group_sessions gs
    JOIN public.group_members gm ON gm.group_id = gs.group_id
    WHERE gs.id = group_session_id
      AND gm.user_id = auth.uid()
      AND gm.status = 'approved'
  )
);

CREATE POLICY "group_session_occurrences_insert"
ON public.group_session_occurrences FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.group_sessions gs
    JOIN public.groups g ON g.id = gs.group_id
    WHERE gs.id = group_session_id AND g.tutor_id = auth.uid()
  )
);

CREATE POLICY "group_session_occurrences_update"
ON public.group_session_occurrences FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_sessions gs
    JOIN public.groups g ON g.id = gs.group_id
    WHERE gs.id = group_session_id AND g.tutor_id = auth.uid()
  )
);

CREATE POLICY "group_session_occurrences_delete"
ON public.group_session_occurrences FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_sessions gs
    JOIN public.groups g ON g.id = gs.group_id
    WHERE gs.id = group_session_id AND g.tutor_id = auth.uid()
  )
);

COMMENT ON TABLE public.group_session_occurrences IS 'Individual occurrences of group sessions';


-- ============================
-- TABLE: group_messages
-- ============================
CREATE TABLE IF NOT EXISTS public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_message_id uuid REFERENCES public.group_messages(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON public.group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_parent ON public.group_messages(parent_message_id) WHERE parent_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_group_messages_pinned ON public.group_messages(group_id, is_pinned) WHERE is_pinned = true;

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- Helper: user is an approved member or the tutor of a group
-- SELECT: approved members and tutor
CREATE POLICY "group_messages_select"
ON public.group_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_messages.group_id
      AND gm.user_id = auth.uid()
      AND gm.status = 'approved'
  )
);

-- INSERT: approved members and tutor can post; replies only allowed if parent is not locked
CREATE POLICY "group_messages_insert"
ON public.group_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_messages.group_id
        AND gm.user_id = auth.uid()
        AND gm.status = 'approved'
    )
  )
  AND (
    parent_message_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.group_messages pm
      WHERE pm.id = parent_message_id AND pm.is_locked = true
    )
  )
);

-- UPDATE: tutor can pin/lock; sender can edit own non-locked messages
CREATE POLICY "group_messages_update"
ON public.group_messages FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
  OR (sender_id = auth.uid() AND is_locked = false)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
  OR (sender_id = auth.uid() AND is_locked = false)
);

-- DELETE: tutor or sender
CREATE POLICY "group_messages_delete"
ON public.group_messages FOR DELETE TO authenticated
USING (
  sender_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
);

COMMENT ON TABLE public.group_messages IS 'Async message board for group members; supports threaded replies and tutor pin/lock';


-- ============================
-- ALTER: conversations â€” add group_context_id
-- ============================
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS group_context_id uuid REFERENCES public.groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_group_context ON public.conversations(group_context_id) WHERE group_context_id IS NOT NULL;

COMMENT ON COLUMN public.conversations.group_context_id IS 'If set, this 1:1 conversation was initiated from a group page';


-- ===== FILE: 088_group_announcements.sql =====

-- =====================================================
-- GROUP ANNOUNCEMENTS
-- Tutor-only broadcast channel per group.
-- Students can view only. Tutors can post/edit/pin/delete.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.group_announcements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  author_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body         text NOT NULL CHECK (char_length(body) > 0),
  is_pinned    boolean NOT NULL DEFAULT false,
  edited_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_announcements_group_id
  ON public.group_announcements(group_id, created_at DESC);

-- â”€â”€ Row Level Security â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE public.group_announcements ENABLE ROW LEVEL SECURITY;

-- Approved members (and the tutor) can read announcements
CREATE POLICY "group_announcements_select" ON public.group_announcements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_id AND g.tutor_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_id
        AND gm.user_id = auth.uid()
        AND gm.status = 'approved'
    )
  );

-- Only the group's tutor can insert
CREATE POLICY "group_announcements_insert" ON public.group_announcements
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_id AND g.tutor_id = auth.uid()
    )
  );

-- Only the author (tutor) can update
CREATE POLICY "group_announcements_update" ON public.group_announcements
  FOR UPDATE USING (author_id = auth.uid());

-- Only the author (tutor) can delete
CREATE POLICY "group_announcements_delete" ON public.group_announcements
  FOR DELETE USING (author_id = auth.uid());


-- ===== FILE: 088_subject_communities_spec.sql =====

-- =====================================================
-- SUBJECT COMMUNITIES - SPEC-COMPLIANT SCHEMA (idempotent)
-- Safe to re-run. Creates tables/constraints/policies only if missing.
-- =====================================================

-- 1. SUBJECT_COMMUNITIES (Form + Subject per school)
CREATE TABLE IF NOT EXISTS subject_communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  subject_name text NOT NULL,
  form_level text NOT NULL,
  member_count integer NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  -- Skip if constraint or its index already exists (constraint name = index name)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_subject_community')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'unique_subject_community' AND relkind = 'i') THEN
    ALTER TABLE subject_communities
    ADD CONSTRAINT unique_subject_community UNIQUE (school_id, subject_name, form_level);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subject_communities_school ON subject_communities(school_id);
CREATE INDEX IF NOT EXISTS idx_subject_communities_subject_form ON subject_communities(subject_name, form_level);
CREATE INDEX IF NOT EXISTS idx_subject_communities_search ON subject_communities(school_id, subject_name, form_level);

COMMENT ON TABLE subject_communities IS 'Subject communities per school (e.g. Form 4 Chemistry at St. Marys)';

-- 2. SUBJECT_COMMUNITY_MEMBERSHIPS
CREATE TABLE IF NOT EXISTS subject_community_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES subject_communities(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_subject_community_member')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'unique_subject_community_member' AND relkind = 'i') THEN
    ALTER TABLE subject_community_memberships
    ADD CONSTRAINT unique_subject_community_member UNIQUE (community_id, user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subject_memberships_user ON subject_community_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_subject_memberships_community ON subject_community_memberships(community_id);

COMMENT ON TABLE subject_community_memberships IS 'User membership in subject communities';

-- 3. SUBJECT_COMMUNITY_MESSAGES
DO $$ BEGIN
  CREATE TYPE subject_community_message_type AS ENUM ('student', 'system', 'pinned');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS subject_community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES subject_communities(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  message_text text NOT NULL,
  message_type subject_community_message_type NOT NULL DEFAULT 'student',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subject_messages_community_created ON subject_community_messages(community_id, created_at DESC);

COMMENT ON TABLE subject_community_messages IS 'Messages in subject communities; sender_id null for system messages';

-- 4. TRIGGER: Update member_count on membership insert/delete
CREATE OR REPLACE FUNCTION subject_community_update_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE subject_communities SET member_count = member_count + 1 WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE subject_communities SET member_count = GREATEST(0, member_count - 1) WHERE id = OLD.community_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_subject_community_member_count ON subject_community_memberships;
CREATE TRIGGER trigger_subject_community_member_count
  AFTER INSERT OR DELETE ON subject_community_memberships
  FOR EACH ROW
  EXECUTE FUNCTION subject_community_update_member_count();

-- 5. RLS
ALTER TABLE subject_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_community_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_community_messages ENABLE ROW LEVEL SECURITY;

-- Policies: drop if exists so re-run doesn't fail
DROP POLICY IF EXISTS subject_communities_select_policy ON subject_communities;
CREATE POLICY subject_communities_select_policy ON subject_communities
  FOR SELECT USING (
    school_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.user_is_subject_community_member(p_community_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM subject_community_memberships WHERE community_id = p_community_id AND user_id = auth.uid()); $$;

DROP POLICY IF EXISTS subject_memberships_select ON subject_community_memberships;
CREATE POLICY subject_memberships_select ON subject_community_memberships
  FOR SELECT USING (
    user_id = auth.uid() OR public.user_is_subject_community_member(community_id)
  );

DROP POLICY IF EXISTS subject_memberships_insert ON subject_community_memberships;
CREATE POLICY subject_memberships_insert ON subject_community_memberships
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS subject_messages_select ON subject_community_messages;
CREATE POLICY subject_messages_select ON subject_community_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM subject_community_memberships WHERE community_id = subject_community_messages.community_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS subject_messages_insert ON subject_community_messages;
CREATE POLICY subject_messages_insert ON subject_community_messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM subject_community_memberships WHERE community_id = subject_community_messages.community_id AND user_id = auth.uid())
    OR sender_id IS NULL
  );

-- 6. Enable Realtime for messages
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE subject_community_messages;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Realtime: enable subject_community_messages in Supabase Dashboard if needed';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'âœ… Subject communities (spec) migration 088 applied';
END $$;


-- ===== FILE: 089_group_occurrence_meeting_cache.sql =====

-- Cache one provider meeting link per group session occurrence
-- so tutors and students always receive the same URL.

ALTER TABLE public.group_session_occurrences
  ADD COLUMN IF NOT EXISTS meeting_provider text,
  ADD COLUMN IF NOT EXISTS meeting_external_id text,
  ADD COLUMN IF NOT EXISTS meeting_join_url text,
  ADD COLUMN IF NOT EXISTS meeting_created_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_group_session_occurrences_meeting_join_url
  ON public.group_session_occurrences(meeting_join_url)
  WHERE meeting_join_url IS NOT NULL;



-- ===== FILE: 090_group_session_meeting_cache.sql =====

-- Cache one provider meeting link at group-session level.
-- This prevents fallback joins from generating a new meeting each click.

ALTER TABLE public.group_sessions
  ADD COLUMN IF NOT EXISTS meeting_provider text,
  ADD COLUMN IF NOT EXISTS meeting_external_id text,
  ADD COLUMN IF NOT EXISTS meeting_join_url text,
  ADD COLUMN IF NOT EXISTS meeting_created_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_group_sessions_meeting_join_url
  ON public.group_sessions(meeting_join_url)
  WHERE meeting_join_url IS NOT NULL;



-- ===== FILE: 091_subject_community_pinned_sessions.sql =====

-- =====================================================
-- SUBJECT COMMUNITY PINNED SESSIONS (spec Phase 5)
-- Pinned sessions appear in sub-community right panel / drawer.
-- =====================================================

CREATE TABLE IF NOT EXISTS subject_community_pinned_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES subject_communities(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pinned_sessions_community_session
  ON subject_community_pinned_sessions(community_id, session_id);
CREATE INDEX IF NOT EXISTS idx_pinned_sessions_community_expires
  ON subject_community_pinned_sessions(community_id, expires_at);

COMMENT ON TABLE subject_community_pinned_sessions IS 'Sessions pinned to a subject community; visible to members until expires_at';

-- RLS: only community members can read
ALTER TABLE subject_community_pinned_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subject_pinned_sessions_select ON subject_community_pinned_sessions;
CREATE POLICY subject_pinned_sessions_select ON subject_community_pinned_sessions
  FOR SELECT USING (
    public.user_is_subject_community_member(community_id)
  );

-- Only service role / backend can insert (teacher accepts session flow)
DROP POLICY IF EXISTS subject_pinned_sessions_insert ON subject_community_pinned_sessions;
CREATE POLICY subject_pinned_sessions_insert ON subject_community_pinned_sessions
  FOR INSERT WITH CHECK (true);

DO $$
BEGIN
  RAISE NOTICE 'âœ… Subject community pinned sessions migration 091 applied';
END $$;


-- ===== FILE: 092_communities_booking_session_columns.sql =====

-- =====================================================
-- Add community_id to bookings and sessions (spec Phase 4/5)
-- =====================================================

-- Bookings: optional community when student books a "Community Session"
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES subject_communities(id) ON DELETE SET NULL;

-- Sessions: link to community when session is a community session (for pinned display)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES subject_communities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_community ON public.bookings(community_id);
CREATE INDEX IF NOT EXISTS idx_sessions_community ON public.sessions(community_id);

COMMENT ON COLUMN public.bookings.community_id IS 'Set when student selects a community for a community session';
COMMENT ON COLUMN public.sessions.community_id IS 'Set from booking when session is for a community; used for pinned sessions';

DO $$
BEGIN
  RAISE NOTICE 'âœ… Communities booking/session columns migration 092 applied';
END $$;


-- ===== FILE: 092_group_stream.sql =====

-- =====================================================
-- GROUP STREAMS (Google Classroom-style)
-- Posts and threaded replies per group. Tutors post;
-- students view and reply.
-- =====================================================

-- ============================
-- TABLE: stream_posts
-- ============================
CREATE TABLE IF NOT EXISTS public.stream_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_role text NOT NULL CHECK (author_role IN ('tutor', 'student')),
  post_type text NOT NULL CHECK (post_type IN ('announcement', 'content', 'discussion')),
  message_body text NOT NULL CHECK (char_length(trim(message_body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_posts_group_id ON public.stream_posts(group_id);
CREATE INDEX IF NOT EXISTS idx_stream_posts_created_at ON public.stream_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stream_posts_group_created ON public.stream_posts(group_id, created_at DESC);

ALTER TABLE public.stream_posts ENABLE ROW LEVEL SECURITY;

-- SELECT: tutor or approved member of the group
CREATE POLICY "stream_posts_select" ON public.stream_posts
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = stream_posts.group_id
        AND gm.user_id = auth.uid()
        AND gm.status = 'approved'
    )
  );

-- INSERT: tutor can post any type; student can post discussion only
CREATE POLICY "stream_posts_insert" ON public.stream_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      (author_role = 'tutor' AND post_type IN ('announcement', 'content', 'discussion')
        AND EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()))
      OR (author_role = 'student' AND post_type = 'discussion'
        AND EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = stream_posts.group_id AND gm.user_id = auth.uid() AND gm.status = 'approved'
        ))
    )
  );

-- UPDATE: author can edit own post
CREATE POLICY "stream_posts_update" ON public.stream_posts
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- DELETE: only tutor (group owner) or post author
CREATE POLICY "stream_posts_delete" ON public.stream_posts
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.stream_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stream_posts_updated_at
  BEFORE UPDATE ON public.stream_posts
  FOR EACH ROW EXECUTE FUNCTION public.stream_posts_updated_at();

COMMENT ON TABLE public.stream_posts IS 'Group stream posts (announcements, content, discussion).';

-- ============================
-- TABLE: stream_replies
-- ============================
CREATE TABLE IF NOT EXISTS public.stream_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.stream_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_body text NOT NULL CHECK (char_length(trim(message_body)) > 0),
  parent_reply_id uuid REFERENCES public.stream_replies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_replies_post_id ON public.stream_replies(post_id);
CREATE INDEX IF NOT EXISTS idx_stream_replies_parent ON public.stream_replies(parent_reply_id) WHERE parent_reply_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stream_replies_created ON public.stream_replies(created_at);

ALTER TABLE public.stream_replies ENABLE ROW LEVEL SECURITY;

-- SELECT: same as stream_posts (group member or tutor)
CREATE POLICY "stream_replies_select" ON public.stream_replies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stream_posts p
      JOIN public.groups g ON g.id = p.group_id
      WHERE p.id = post_id AND (g.tutor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = p.group_id AND gm.user_id = auth.uid() AND gm.status = 'approved'
        ))
    )
  );

-- INSERT: tutor or approved member can reply
CREATE POLICY "stream_replies_insert" ON public.stream_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.stream_posts p
      JOIN public.groups g ON g.id = p.group_id
      WHERE p.id = post_id
        AND (g.tutor_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = p.group_id AND gm.user_id = auth.uid() AND gm.status = 'approved'
          ))
    )
  );

-- UPDATE: author only
CREATE POLICY "stream_replies_update" ON public.stream_replies
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- DELETE: author or group tutor
CREATE POLICY "stream_replies_delete" ON public.stream_replies
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.stream_posts p
      JOIN public.groups g ON g.id = p.group_id
      WHERE p.id = post_id AND g.tutor_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.stream_replies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stream_replies_updated_at
  BEFORE UPDATE ON public.stream_replies
  FOR EACH ROW EXECUTE FUNCTION public.stream_replies_updated_at();

COMMENT ON TABLE public.stream_replies IS 'Threaded replies to stream posts; supports nested replies via parent_reply_id.';

-- ============================
-- TABLE: stream_attachments
-- ============================
CREATE TABLE IF NOT EXISTS public.stream_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.stream_posts(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_attachments_post_id ON public.stream_attachments(post_id);

ALTER TABLE public.stream_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_attachments_select" ON public.stream_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stream_posts p
      JOIN public.groups g ON g.id = p.group_id
      WHERE p.id = post_id AND (g.tutor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = p.group_id AND gm.user_id = auth.uid() AND gm.status = 'approved'
        ))
    )
  );

CREATE POLICY "stream_attachments_insert" ON public.stream_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stream_posts p
      WHERE p.id = post_id AND p.author_id = auth.uid()
    )
  );

CREATE POLICY "stream_attachments_delete" ON public.stream_attachments
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stream_posts p WHERE p.id = post_id AND p.author_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.stream_posts p
      JOIN public.groups g ON g.id = p.group_id
      WHERE p.id = post_id AND g.tutor_id = auth.uid()
    )
  );

COMMENT ON TABLE public.stream_attachments IS 'Optional file attachments for stream posts.';


-- ===== FILE: 093_booking_request_community_id.sql =====

-- =====================================================
-- create_booking_request: accept optional p_community_id (spec Phase 4)
-- =====================================================
-- Drop old 7-arg version so the 8-arg version is unique
DROP FUNCTION IF EXISTS create_booking_request(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS create_booking_request(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, uuid);

CREATE OR REPLACE FUNCTION create_booking_request(
    p_student_id uuid,
    p_tutor_id uuid,
    p_subject_id uuid,
    p_session_type_id uuid,
    p_requested_start_at timestamptz,
    p_requested_end_at timestamptz,
    p_student_notes text DEFAULT NULL,
    p_community_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_booking_id uuid;
    v_price_ttd numeric;
    v_is_available boolean;
    v_calendar jsonb;
BEGIN
    IF auth.uid() != p_student_id THEN
        RAISE EXCEPTION 'Unauthorized: You can only create bookings for yourself';
    END IF;

    SELECT price_ttd INTO v_price_ttd
    FROM public.session_types
    WHERE id = p_session_type_id
    AND tutor_id = p_tutor_id
    AND is_active = true;

    IF v_price_ttd IS NULL THEN
        RAISE EXCEPTION 'Invalid session type';
    END IF;

    v_calendar := get_tutor_public_calendar(p_tutor_id, p_requested_start_at, p_requested_end_at);

    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_calendar->'busy_blocks') as bb
        WHERE time_ranges_overlap(
            p_requested_start_at,
            p_requested_end_at,
            (bb->>'start_at')::timestamptz,
            (bb->>'end_at')::timestamptz
        )
    ) THEN
        RAISE EXCEPTION 'Requested time slot is not available';
    END IF;

    INSERT INTO public.bookings (
        student_id,
        tutor_id,
        subject_id,
        session_type_id,
        requested_start_at,
        requested_end_at,
        status,
        last_action_by,
        price_ttd,
        student_notes,
        community_id
    ) VALUES (
        p_student_id,
        p_tutor_id,
        p_subject_id,
        p_session_type_id,
        p_requested_start_at,
        p_requested_end_at,
        'PENDING',
        'student',
        v_price_ttd,
        p_student_notes,
        p_community_id
    ) RETURNING id INTO v_booking_id;

    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (v_booking_id, p_student_id, 'system', 'Booking request created');

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_booking_request(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, uuid) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'âœ… create_booking_request community_id migration 093 applied';
END $$;


-- ===== FILE: 094_group_sessions_full_schema.sql =====

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



-- ===== FILE: 095_groups_marketplace_metadata.sql =====

-- Groups marketplace metadata and analytics support (backward-compatible)

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS form_level text,
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS session_length_minutes integer,
  ADD COLUMN IF NOT EXISTS session_frequency text,
  ADD COLUMN IF NOT EXISTS price_per_course numeric(10,2),
  ADD COLUMN IF NOT EXISTS pricing_mode text,
  ADD COLUMN IF NOT EXISTS availability_window text,
  ADD COLUMN IF NOT EXISTS media_gallery jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_groups_form_level ON public.groups(form_level);
CREATE INDEX IF NOT EXISTS idx_groups_session_frequency ON public.groups(session_frequency);
CREATE INDEX IF NOT EXISTS idx_groups_price_per_course ON public.groups(price_per_course);

ALTER TABLE public.group_attendance_records
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS participation_score numeric(5,2);

CREATE INDEX IF NOT EXISTS idx_group_attendance_marked_at
  ON public.group_attendance_records(marked_at DESC);


-- ===== FILE: 095_sea_subjects.sql =====

-- SEA (Secondary Entrance Assessment) subjects for tutor onboarding and discovery
-- Run this whole script once in Supabase â†’ SQL. Required before SEA tutor signup works.
-- (Optional: after this, POST /api/tutor/ensure-sea-subjects can re-seed rows if SUPABASE_SERVICE_ROLE_KEY is set.)

ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_curriculum_check;
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_curriculum_check
  CHECK (curriculum IN ('CSEC', 'CAPE', 'SEA'));

-- Many databases add subjects_level_check so level is only CSEC/CAPE bands (e.g. Form 4-5, Unit 1).
-- SEA uses level = 'SEA', so that check must be removed or recreated to include 'SEA'.
ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_level_check;

ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS label text;

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
  WHERE s.name = v.name AND s.curriculum = v.curriculum AND s.level = v.level
);

COMMENT ON CONSTRAINT subjects_curriculum_check ON public.subjects IS 'CSEC, CAPE, and SEA curriculum subjects';


-- ===== FILE: 096_degree_verification.sql =====

-- Degree verification: submissions + document metadata (files in storage bucket degree-documents)

CREATE TABLE IF NOT EXISTS public.degrees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  school_name text NOT NULL,
  degree text NOT NULL,
  field text,
  graduation_year smallint NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  rejection_reason text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT degrees_user_id_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_degrees_user_id ON public.degrees(user_id);
CREATE INDEX IF NOT EXISTS idx_degrees_status ON public.degrees(status);

CREATE TABLE IF NOT EXISTS public.degree_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  degree_id uuid NOT NULL REFERENCES public.degrees(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_degree_documents_degree_id ON public.degree_documents(degree_id);

ALTER TABLE public.degrees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.degree_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS degrees_select_own ON public.degrees;
CREATE POLICY degrees_select_own ON public.degrees
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS degrees_select_admin ON public.degrees;
CREATE POLICY degrees_select_admin ON public.degrees
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role = 'admin' OR COALESCE(p.is_reviewer, false) = true)
    )
  );

DROP POLICY IF EXISTS degrees_insert_own ON public.degrees;
CREATE POLICY degrees_insert_own ON public.degrees
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS degrees_update_own_rejected ON public.degrees;
CREATE POLICY degrees_update_own_rejected ON public.degrees
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'rejected')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS degrees_update_admin ON public.degrees;
CREATE POLICY degrees_update_admin ON public.degrees
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role = 'admin' OR COALESCE(p.is_reviewer, false) = true)
    )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS degree_documents_select_own ON public.degree_documents;
CREATE POLICY degree_documents_select_own ON public.degree_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.degrees d WHERE d.id = degree_id AND d.user_id = auth.uid())
  );

DROP POLICY IF EXISTS degree_documents_select_admin ON public.degree_documents;
CREATE POLICY degree_documents_select_admin ON public.degree_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role = 'admin' OR COALESCE(p.is_reviewer, false) = true)
    )
  );

DROP POLICY IF EXISTS degree_documents_insert_own ON public.degree_documents;
CREATE POLICY degree_documents_insert_own ON public.degree_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.degrees d WHERE d.id = degree_id AND d.user_id = auth.uid())
  );

DROP POLICY IF EXISTS degree_documents_delete_own ON public.degree_documents;
CREATE POLICY degree_documents_delete_own ON public.degree_documents
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.degrees d WHERE d.id = degree_id AND d.user_id = auth.uid())
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('degree-documents', 'degree-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS degree_verif_storage_insert ON storage.objects;
CREATE POLICY degree_verif_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'degree-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS degree_verif_storage_select_own ON storage.objects;
CREATE POLICY degree_verif_storage_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'degree-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS degree_verif_storage_delete_own ON storage.objects;
CREATE POLICY degree_verif_storage_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'degree-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMENT ON TABLE public.degrees IS 'User degree verification submissions (manual admin review)';
COMMENT ON TABLE public.degree_documents IS 'Storage path references for degree verification uploads';


-- ===== FILE: 097_seed_onboarding_email_templates_stages.sql =====

-- =====================================================
-- Onboarding email templates for cron stages 0â€“4
-- =====================================================
-- Cron (send-onboarding-emails) loads templates by user_type + stage (0â€“4).
-- Legacy seed scripts only inserted tutor 0â€“1 and skipped student stage 2 / tutor 2â€“4;
-- other scripts used wrong stage numbers (5, 7). Insert any missing (user_type, stage).

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Tutor onboarding â€” stage 2',
  '{{firstName}}, tips to get your first booking',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">Hi {{firstName}},</h1>
<p style="color:#4b5563;line-height:1.6;">Students search by subject and availability. Complete your bio, keep your calendar updated, and respond quickly to messages â€” tutors who reply within an hour get booked more often.</p>
<p style="color:#4b5563;line-height:1.6;">Need help? <a href="mailto:hello@myitutor.com" style="color:#199358;">hello@myitutor.com</a></p>
<a href="https://myitutor.com/tutor/dashboard" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Open dashboard</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">Â© iTutor Â· Nora Digital, Ltd.</p>
</div></body></html>',
  'tutor',
  2
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'tutor' AND t.stage = 2);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Tutor onboarding â€” stage 3',
  '{{firstName}}, verification helps students trust you',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">Stand out with verification</h1>
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}},</p>
<p style="color:#4b5563;line-height:1.6;">Uploading credentials and completing verification helps you appear in more searches and gives parents and students confidence to book.</p>
<a href="https://myitutor.com/onboarding/tutor" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Complete verification</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">Â© iTutor Â· Nora Digital, Ltd.</p>
</div></body></html>',
  'tutor',
  3
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'tutor' AND t.stage = 3);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Tutor onboarding â€” stage 4',
  '{{firstName}}, you''re almost ready to earn',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">Finish your profile</h1>
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}},</p>
<p style="color:#4b5563;line-height:1.6;">A full profile with subjects, rates, availability, and a short bio is what turns views into bookings. It only takes a few minutes.</p>
<a href="https://myitutor.com/onboarding/tutor" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Update profile</a>
<p style="color:#6b7280;font-size:14px;margin-top:20px;">Questions? <a href="mailto:hello@myitutor.com" style="color:#199358;">hello@myitutor.com</a></p>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">Â© iTutor Â· Nora Digital, Ltd.</p>
</div></body></html>',
  'tutor',
  4
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'tutor' AND t.stage = 4);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Student onboarding â€” stage 2',
  '{{firstName}}, find the right iTutor in minutes',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">Browse by subject</h1>
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}},</p>
<p style="color:#4b5563;line-height:1.6;">Filter by your form level, read tutor bios, and pick a time that works. Sessions are online â€” no commute.</p>
<a href="https://myitutor.com/student/find-tutors" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Find iTutors</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">Â© iTutor Â· Nora Digital, Ltd.</p>
</div></body></html>',
  'student',
  2
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'student' AND t.stage = 2);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Student onboarding â€” stage 4',
  '{{firstName}}, still looking for help?',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">We''re here to help</h1>
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}},</p>
<p style="color:#4b5563;line-height:1.6;">If you have not booked yet, browse verified iTutors or email us and we''ll point you to a good match.</p>
<a href="https://myitutor.com/student/find-tutors" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Browse iTutors</a>
<p style="color:#6b7280;font-size:14px;margin-top:16px;"><a href="mailto:hello@myitutor.com" style="color:#199358;">hello@myitutor.com</a></p>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">Â© iTutor Â· Nora Digital, Ltd.</p>
</div></body></html>',
  'student',
  4
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'student' AND t.stage = 4);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Parent welcome â€” stage 0',
  'Welcome to iTutor, {{firstName}}',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<h1 style="color:#111827;font-size:22px;">Welcome, {{firstName}}</h1>
<p style="color:#4b5563;line-height:1.6;">Manage your child''s learning on iTutor â€” find verified tutors, book online sessions, and track progress from one place.</p>
<a href="https://myitutor.com/parent/dashboard" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Go to dashboard</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">Â© iTutor Â· Nora Digital, Ltd.</p>
</div></body></html>',
  'parent',
  0
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'parent' AND t.stage = 0);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Parent onboarding â€” stage 1',
  '{{firstName}}, add your child''s profile',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}}, add your student''s form level and subjects so we can recommend the right tutors.</p>
<a href="https://myitutor.com/parent/dashboard" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Open dashboard</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">Â© iTutor Â· Nora Digital, Ltd.</p>
</div></body></html>',
  'parent',
  1
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'parent' AND t.stage = 1);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Parent onboarding â€” stage 2',
  '{{firstName}}, book a session when it suits you',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}}, sessions are online via Meet or Zoom. Pick a tutor, choose a time, and your child learns from home.</p>
<a href="https://myitutor.com/student/find-tutors" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Find iTutors</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">Â© iTutor Â· Nora Digital, Ltd.</p>
</div></body></html>',
  'parent',
  2
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'parent' AND t.stage = 2);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Parent onboarding â€” stage 3',
  '{{firstName}}, verified tutors you can trust',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}}, iTutor verifies credentials for tutors who complete verification â€” look for verified profiles when you browse.</p>
<a href="https://myitutor.com/student/find-tutors" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Browse tutors</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">Â© iTutor Â· Nora Digital, Ltd.</p>
</div></body></html>',
  'parent',
  3
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'parent' AND t.stage = 3);

INSERT INTO public.email_templates (name, subject, html_content, user_type, stage)
SELECT
  'Parent onboarding â€” stage 4',
  '{{firstName}}, need help choosing a tutor?',
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui,sans-serif;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:24px 0;background:#000;border-radius:8px 8px 0 0;"><img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" style="height:56px"/></div>
<div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
<p style="color:#4b5563;line-height:1.6;">Hi {{firstName}}, reply to this thread or email <a href="mailto:hello@myitutor.com" style="color:#199358;">hello@myitutor.com</a> â€” we''re happy to recommend someone for CXC, CAPE, or exam prep.</p>
<a href="https://myitutor.com/parent/dashboard" style="display:inline-block;background:#199358;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-top:12px;">Dashboard</a>
</div>
<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:24px;">Â© iTutor Â· Nora Digital, Ltd.</p>
</div></body></html>',
  'parent',
  4
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates t WHERE t.user_type = 'parent' AND t.stage = 4);


-- ===== FILE: 098_dedupe_email_templates_user_stage.sql =====

-- Remove duplicate email_templates rows (same user_type + stage).
-- Keeps one row per pair: oldest created_at, then smallest id.
-- Then enforce uniqueness so PGRST116 cannot recur from .single() / .maybeSingle().

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_templates'
  ) THEN
    RETURN;
  END IF;

  DELETE FROM public.email_templates t
  WHERE t.id IN (
    SELECT id
    FROM (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY user_type, stage
          ORDER BY created_at ASC NULLS LAST, id ASC
        ) AS rn
      FROM public.email_templates
    ) x
    WHERE x.rn > 1
  );

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_templates_user_type_stage_key'
  ) THEN
    ALTER TABLE public.email_templates
      ADD CONSTRAINT email_templates_user_type_stage_key
      UNIQUE (user_type, stage);
  END IF;
END $$;


-- ===== FILE: 099_seed_trinidad_primary_schools.sql =====

-- Seed Trinidad primary schools for institution search.
-- Inserts only when a matching institution name does not already exist.

DROP TABLE IF EXISTS tmp_trinidad_primary_schools;

CREATE TEMP TABLE tmp_trinidad_primary_schools (
  name text NOT NULL,
  institution_type text NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_trinidad_primary_schools (name, institution_type) VALUES
  ($$Agostini Settlement KPA School$$, 'government_assisted'),
  ($$Siparia Road KPA School$$, 'government_assisted'),
  ($$Anstey Memorial Girls' Anglican School, San Fernando$$, 'government_assisted'),
  ($$Arouca Anglican Primary School, Arouca$$, 'government_assisted'),
  ($$Barataria Anglican Primary School, Barataria$$, 'government_assisted'),
  ($$Brighton Anglican School, La Breacoll$$, 'government_assisted'),
  ($$Cedros Anglican Primary School, Cedros$$, 'government_assisted'),
  ($$Coffee Boys' Anglican School, San Fernando$$, 'government_assisted'),
  ($$Claxton Bay Junior Anglican School, Claxton Bay$$, 'government_assisted'),
  ($$Claxton Bay Senior Anglican School, Claxton Bay$$, 'government_assisted'),
  ($$Couva Anglican School, Couva$$, 'government_assisted'),
  ($$Cumana Anglican School, Cumana Village, Toco$$, 'government_assisted'),
  ($$Eckel Village Anglican School, Williamsville$$, 'government_assisted'),
  ($$Forest Reserve Anglican School, Forest Fyzabad$$, 'government_assisted'),
  ($$Good Shepard Anglican Primary School, Tunapuna$$, 'government_assisted'),
  ($$Grande Riviere Anglican School, Grande Riviere Village, via Toco$$, 'government_assisted'),
  ($$Holy Saviour Curepe Anglican, Curepe$$, 'government_assisted'),
  ($$Marabella Boys' Anglican School, Marabella$$, 'government_assisted'),
  ($$Marabella Girls' Anglican School, Marabella$$, 'government_assisted'),
  ($$Melville Memorial Girls' Anglican School, Belmont$$, 'government_assisted'),
  ($$Morvant Anglican School, Morvant$$, 'government_assisted'),
  ($$Pembroke Anglican School, Port of Spain$$, 'government_assisted'),
  ($$Point Fortin Anglican School, Point Fortin$$, 'government_assisted'),
  ($$Richmond Street Boys' Anglican School (Christus Rex), Port-of-Spain$$, 'government_assisted'),
  ($$San Fernando Girls' Anglican School, San Fernando$$, 'government_assisted'),
  ($$Southern Central Anglican School, Cedros$$, 'government_assisted'),
  ($$St. Christopher's Anglican School, Siparia$$, 'government_assisted'),
  ($$St. Francis boys Roman Catholic$$, 'government_assisted'),
  ($$St Michael's Anglican School, Princes Town$$, 'government_assisted'),
  ($$St John's Anglican Primary School, Cipero Road, San Fernando$$, 'government_assisted'),
  ($$St. Margaret's Boys' School, Belmont$$, 'government_assisted'),
  ($$Sisters Road Anglican School$$, 'government_assisted'),
  ($$St. Paul's Anglican School, San Fernando$$, 'government_assisted'),
  ($$St. Stephen's Anglican School, Princes Town$$, 'government_assisted'),
  ($$St. Ursula's Girls Anglican School, St Vincent street POS$$, 'government_assisted'),
  ($$St. Agnes Anglican School, St. James$$, 'government_assisted'),
  ($$St. Mary's Anglican School, Tacarigua$$, 'government_assisted'),
  ($$St. Catherine Girls' Anglican School Duke Street, POS$$, 'government_assisted'),
  ($$Tableland Anglican (St. Nicholas)$$, 'government_assisted'),
  ($$Toco Anglican, Toco Village, Toco$$, 'government_assisted'),
  ($$ASJA Primary School, Barrackpore$$, 'government_assisted'),
  ($$ASJA Primary School, San Fernando$$, 'government_assisted'),
  ($$ASJA Primary School, Rio Claro$$, 'government_assisted'),
  ($$ASJA Primary School, Point Fortin$$, 'government_assisted'),
  ($$ASJA Primary School, Charlieville$$, 'government_assisted'),
  ($$ASJA Primary School, Carapichaima$$, 'government_assisted'),
  ($$ASJA Primary School, Princes Town$$, 'government_assisted'),
  ($$TML Primary School San Fernando$$, 'government_assisted'),
  ($$TML Primary School St. Joseph$$, 'government_assisted'),
  ($$TML Primary School Libertville$$, 'government_assisted'),
  ($$Arima Presbyterian School, Arima$$, 'government_assisted'),
  ($$Biche Presbyterian School$$, 'government_assisted'),
  ($$Bien Venue Presbyterian School$$, 'government_assisted'),
  ($$Balmain Presbyterian School, Couva$$, 'government_assisted'),
  ($$Bamboo Grove Presbyterian School$$, 'government_assisted'),
  ($$Brothers Presbyterian School, Williamsville$$, 'government_assisted'),
  ($$Bonne Aventure Presbyterian School, Gasparillo$$, 'government_assisted'),
  ($$Canaan Presbyterian School, Duncan Village, San Fernando$$, 'government_assisted'),
  ($$Charlieville Presbyterian School$$, 'government_assisted'),
  ($$Curepe Presbyterian School, Curepe$$, 'government_assisted'),
  ($$Ecclesville Presbyterian Primary School$$, 'government_assisted'),
  ($$Esperanza Presbyterian School, Couva$$, 'government_assisted'),
  ($$Elswick Presbyterian Primary School, Tableland$$, 'government_assisted'),
  ($$Erin Road Presbyterian School$$, 'government_assisted'),
  ($$Exchange Presbyterian School, Couva$$, 'government_assisted'),
  ($$Freeport Presbyterian School$$, 'government_assisted'),
  ($$Fyzabad Presbyterian School$$, 'government_assisted'),
  ($$Grant Memorial Presbyterian School, San Fernando$$, 'government_assisted'),
  ($$Grosvenor Presbyterian School, Sangre Grande$$, 'government_assisted'),
  ($$Inverness Presbyterian School$$, 'government_assisted'),
  ($$Jordan Hill Presbyterian School$$, 'government_assisted'),
  ($$Jubilee Presbyterian School, Guaico Tamana$$, 'government_assisted'),
  ($$Kanhai Presbyterian School$$, 'government_assisted'),
  ($$Lengua Presbyterian School$$, 'government_assisted'),
  ($$McBean Presbyterian School, Couva$$, 'government_assisted'),
  ($$Navet Presbyterian School$$, 'government_assisted'),
  ($$Penal Presbyterian School$$, 'government_assisted'),
  ($$Picton Presbyterian School$$, 'government_assisted'),
  ($$Reform Presbyterian School$$, 'government_assisted'),
  ($$Rochard Douglas Presbyterian School (Barrackpore)$$, 'government_assisted'),
  ($$Rousillac Presbyterian School$$, 'government_assisted'),
  ($$Rio Claro Presbyterian School, Rio Claro$$, 'government_assisted'),
  ($$Saint Julian Presbyterian School$$, 'government_assisted'),
  ($$Sangre Chiquito Presbyterian School$$, 'government_assisted'),
  ($$San Juan Presbyterian School, San Juan$$, 'government_assisted'),
  ($$Santa Cruz Presbyterian School$$, 'government_assisted'),
  ($$Siparia Road Presbyterian School$$, 'government_assisted'),
  ($$Siparia Union Presbyterian School$$, 'government_assisted'),
  ($$Tabaquite Presbyterian School, Tabaquite$$, 'government_assisted'),
  ($$Tunapuna Presbyterian School$$, 'government_assisted'),
  ($$Union Presbyterian School$$, 'government_assisted'),
  ($$Arima Boys' RC School$$, 'government_assisted'),
  ($$Arima Girls' RC School$$, 'government_assisted'),
  ($$Belmont Boys' RC School$$, 'government_assisted'),
  ($$Belmont Girls' RC School$$, 'government_assisted'),
  ($$Biche RC School, New Lands Village, Biche$$, 'government_assisted'),
  ($$Boissiere R.C. School$$, 'government_assisted'),
  ($$Bourg Mulatresse RC School, Santa Cruz$$, 'government_assisted'),
  ($$Brazil RC School$$, 'government_assisted'),
  ($$Carenage Boys R.C$$, 'government_assisted'),
  ($$Caratal Sacred Heart R.C. School$$, 'government_assisted'),
  ($$Chaguanas RC School$$, 'government_assisted'),
  ($$Carapichaima R.C. School$$, 'government_assisted'),
  ($$Chickland RC School Chickland$$, 'government_assisted'),
  ($$Cunapo (St. Francis) RC School, Sangre Grande$$, 'government_assisted'),
  ($$Cumana RC School, Cumana Village, Toco$$, 'government_assisted'),
  ($$Erin RC School$$, 'government_assisted'),
  ($$Exchange RC School Couva$$, 'government_assisted'),
  ($$Flanagin Town RC School Flanagin Town$$, 'government_assisted'),
  ($$Granville RC School, Cedros$$, 'government_assisted'),
  ($$Guayaguayare RC School, Guayaguare$$, 'government_assisted'),
  ($$La Brea RC School$$, 'government_assisted'),
  ($$La Fillette RC School$$, 'government_assisted'),
  ($$Lochmaben RC School, Cedros$$, 'government_assisted'),
  ($$Malick Girls' RC School$$, 'government_assisted'),
  ($$Maraval RC School$$, 'government_assisted'),
  ($$La Lune RC School$$, 'government_assisted'),
  ($$Maria Regina Grade School$$, 'government_assisted'),
  ($$Matelot RC School, Matelot Village, via Toco$$, 'government_assisted'),
  ($$Mayaro (St. Thomas) RC School, Radix Village, Mayaro$$, 'government_assisted'),
  ($$Mayo R.C. School$$, 'government_assisted'),
  ($$Mon Repo RC School$$, 'government_assisted'),
  ($$Mount Russia$$, 'government_assisted'),
  ($$Mucurapo Boys' RC School$$, 'government_assisted'),
  ($$Nelson Street Girls' RC School, Port of Spain$$, 'government_assisted'),
  ($$Nelson Street Boys' RC School, Port of Spain$$, 'government_assisted'),
  ($$Newtown Boys' RC School$$, 'government_assisted'),
  ($$Newtown Girls' RC School$$, 'government_assisted'),
  ($$North Oropouche R.C School, Toco Main Rd$$, 'government_assisted'),
  ($$Ortoire RC School, Ortoire Village, Mayaro$$, 'government_assisted'),
  ($$Paramin RC School$$, 'government_assisted'),
  ($$Petit Valley Boys' R.C School$$, 'government_assisted'),
  ($$Petit Valley Girls' R.C School$$, 'government_assisted'),
  ($$Point Fortin RC School$$, 'government_assisted'),
  ($$Point Cumana RC School$$, 'government_assisted'),
  ($$Poole RC School, Rio Claro$$, 'government_assisted'),
  ($$Princes Town RC School$$, 'government_assisted'),
  ($$Rosary Boys' RC School$$, 'government_assisted'),
  ($$Rampanalgas RC School, Rampanalgas Village, Balandra$$, 'government_assisted'),
  ($$Rose Hill RC School$$, 'government_assisted'),
  ($$St. Dominic's RC School$$, 'government_assisted'),
  ($$South Oropouche RC School$$, 'government_assisted'),
  ($$St. Joseph Boys' RC School$$, 'government_assisted'),
  ($$St. Joseph Girls' RC School$$, 'government_assisted'),
  ($$St. Finbar Girls' RC School, Arouca$$, 'government_assisted'),
  ($$St. Gabriel's Girls' RC School$$, 'government_assisted'),
  ($$St. Mary's Mucurapo Girls' RC School$$, 'government_assisted'),
  ($$St. Pius Boys' RC School, Arouca$$, 'government_assisted'),
  ($$St. Rose's Girls' RC School$$, 'government_assisted'),
  ($$St. Benedict's La Romaine RC School$$, 'government_assisted'),
  ($$St. Theresa's Girls RC School$$, 'government_assisted'),
  ($$St Therese RC School, Rio Claro$$, 'government_assisted'),
  ($$Sacred Heart Girls' RC School$$, 'government_assisted'),
  ($$San Fernando Boys' RC School$$, 'government_assisted'),
  ($$Santa Cruz R.C. School$$, 'government_assisted'),
  ($$The Siparia Boys' R.C. School, Siparia$$, 'government_assisted'),
  ($$Tabaquite RC School$$, 'government_assisted'),
  ($$Toco RC School, Mission Village, Toco$$, 'government_assisted'),
  ($$Todds Road RC School Todds Road$$, 'government_assisted'),
  ($$Tunapuna Boys' RC School$$, 'government_assisted'),
  ($$Tunapuna Girls' RC School$$, 'government_assisted'),
  ($$Upper Guaico RC School, Nestor Village, Guaico Tamana Rd$$, 'government_assisted'),
  ($$San Juan Boys' RC School$$, 'government_assisted'),
  ($$San Juan Girls RC School$$, 'government_assisted'),
  ($$San Souci RC School, San Souci Village, via Toco$$, 'government_assisted'),
  ($$St. Brigid's Girls R.C School$$, 'government_assisted'),
  ($$Success R.C.School, Laventile$$, 'government_assisted'),
  ($$Vance River RC School$$, 'government_assisted'),
  ($$Debe Hindu School$$, 'government_assisted'),
  ($$Sangre Grande Hindu School$$, 'government_assisted'),
  ($$El Socorro Hindu School$$, 'government_assisted'),
  ($$El Dorado North Hindu School$$, 'government_assisted'),
  ($$El Dorado South Hindu School$$, 'government_assisted'),
  ($$Orange Field Hindu School$$, 'government_assisted'),
  ($$Rio Claro Hindu School, Rio Claro$$, 'government_assisted'),
  ($$McBean Hindu School, Couva$$, 'government_assisted'),
  ($$Ramai Trace Hindu School, Ramai Trace Debe$$, 'government_assisted'),
  ($$Riverside* Hindu School$$, 'government_assisted'),
  ($$Robert Village Hindu School$$, 'government_assisted'),
  ($$Spring Village Hindu School$$, 'government_assisted'),
  ($$Freeport Hindu School$$, 'government_assisted'),
  ($$Felicity Hindu School$$, 'government_assisted'),
  ($$Munroe Road Hindu School$$, 'government_assisted'),
  ($$Reform Hindu School$$, 'government_assisted'),
  ($$Mohess Road Hindu School$$, 'government_assisted'),
  ($$Tulsa Trace Hindu School$$, 'government_assisted'),
  ($$Suchit Trace Hindu School$$, 'government_assisted'),
  ($$Rousillac Hindu School$$, 'government_assisted'),
  ($$Arima Boys' Government Primary School, Arima$$, 'public'),
  ($$Arima Girls' Government Primary School, Arima$$, 'public'),
  ($$Arima New Government Primary School$$, 'public'),
  ($$Brasso Venado Government Primary School$$, 'public'),
  ($$Belmont Government Primary School$$, 'public'),
  ($$Cedros Government Primary School, Cedros$$, 'public'),
  ($$Chatham Government Primary School, Cedros$$, 'public'),
  ($$Chaguanas Government Primary School$$, 'public'),
  ($$Clarke Rochard Government, Penal$$, 'public'),
  ($$Cocoyea Government, Cocoyea Village, San Fernando$$, 'public'),
  ($$Couva South Government Primary School$$, 'public'),
  ($$Crystal Stream Government$$, 'public'),
  ($$Cunjal Government, Barrackpore$$, 'public'),
  ($$Cunupia Government Primary School$$, 'public'),
  ($$D'Abadie Government Primary School, D'Abadie$$, 'public'),
  ($$Diamond Vale Government Primary, Diego Martin$$, 'public'),
  ($$Diego Martin Government Primary School$$, 'public'),
  ($$Dinsley Trincity Government Primary School$$, 'public'),
  ($$Dow Village Government Primary School$$, 'public'),
  ($$Guaico Government Primary, Guaico Village, Sangre Grande$$, 'public'),
  ($$Egypt Village Government Primary School, Point Fortin$$, 'public'),
  ($$El Socorro North Government Primary School$$, 'public'),
  ($$Fanny Village Government Primary School, Point Fortin$$, 'public'),
  ($$Icacos Government Primary School, Cedros$$, 'public'),
  ($$Jerningham Government Primary School$$, 'public'),
  ($$La Horquetta North Government Primary School$$, 'public'),
  ($$La Horquetta South Government Primary School$$, 'public'),
  ($$Longdenville Government Primary School, Longdenville$$, 'public'),
  ($$La Puerta Government Primary School, Diego Martin$$, 'public'),
  ($$Macaulay Government Primary School, Macaulay, Claxton Bay$$, 'public'),
  ($$Mafeking Government Primary School, Mafeking Village, Mayaro$$, 'public'),
  ($$Malabar Government Primary School, Malabar, Arima$$, 'public'),
  ($$Maloney Government Primary School, Maloney$$, 'public'),
  ($$Matura Government Primary School, Matura Village$$, 'public'),
  ($$Mayaro Government Primary School, Mayaro$$, 'public'),
  ($$Monkey Town Government Primary School, Barrackpore$$, 'public'),
  ($$Monte Video Government Primary, Monte Video Village, via Toco$$, 'public'),
  ($$Mount Pleasant Government School, Solidad Rd, Claxton Bay$$, 'public'),
  ($$North Oropouche Government Primary School$$, 'public'),
  ($$Raghunanan Road Government Primary School$$, 'public'),
  ($$Tortuga Government Primary School$$, 'public'),
  ($$Tranquility Government Primary School$$, 'public'),
  ($$Vos Government Primary School, Gasparillo$$, 'public'),
  ($$Gasparillo Government Primary School, Gasparillo$$, 'public'),
  ($$San Fernando Girl's Government Primary School, San Fernando$$, 'public'),
  ($$San Fernando Boy's Government Primary School, San Fernando$$, 'public'),
  ($$Adonis Academy (Leviticus Academy) Arima, Trinidad$$, 'private'),
  ($$Ambassador College Private School$$, 'private'),
  ($$Apex International Academy, Chaguanas, Trinidad$$, 'private'),
  ($$Arbor, Maraval$$, 'private'),
  ($$Christian Primary Academy, Arouca$$, 'private'),
  ($$Beach Camp Community School, Palo Seco$$, 'private'),
  ($$Bishop Anstey Junior, Port of Spain$$, 'private'),
  ($$Blackman's Private School, Maraval, Port of Spain$$, 'private'),
  ($$Bryn Mawr Private School, Petite Valley$$, 'private'),
  ($$Cedar Grove Private Primary School, Palmiste, San Fernando$$, 'private'),
  ($$Elders' Classes, Port of Spain$$, 'private'),
  ($$Eniath's Montessori and Prep School, Lange Park, Chaguanas$$, 'private'),
  ($$Explorers Childcare Academy (Lange Park, Chaguanas)$$, 'private'),
  ($$Holy Rosary Preparatory, St. James$$, 'private'),
  ($$Personal Tutoring Institute, Arima$$, 'private'),
  ($$Precious Little Angels, Port of Spain$$, 'private'),
  ($$Savonetta Private School, San Fernando$$, 'private'),
  ($$The Giuseppi Preparatory School, Arima$$, 'private'),
  ($$Nova Satus Private School, Cunupia$$, 'private'),
  ($$Holy Faith Preparatory, Port of Spain$$, 'private'),
  ($$Holy Name Preparatory, Port of Spain$$, 'private'),
  ($$Marabella Learning Centre$$, 'private'),
  ($$St. Peter's Private Primary School, Pointe-a-Pierre$$, 'private'),
  ($$International School of Port of Spain$$, 'private'),
  ($$SuJo's Private School, Woodbrook$$, 'private'),
  ($$Specialist Learning Center$$, 'private'),
  ($$Christian Primary Academy, Trinidad$$, 'private'),
  ($$Regulus Educational Academy, Chaguanas$$, 'private'),
  ($$Scholars Private Primary and Pre School (Tacarigua)$$, 'private'),
  ($$Scholastic Academy, St. Augustine$$, 'private'),
  ($$St. Andrew's Private School, Maraval$$, 'private'),
  ($$St. Joseph Terrace Private School, San Fernando$$, 'private'),
  ($$St. Xavier's Private School, St. Joseph$$, 'private'),
  ($$St. Monica's Preparatory, Port of Spain$$, 'private'),
  ($$St. Catherine's Private School, Woodbrook$$, 'private'),
  ($$Student Remediation Centre, Marabella, San Fernando$$, 'private'),
  ($$The Trinidad Renaissance School, San Fernando$$, 'private'),
  ($$The University School, St. Augustine$$, 'private'),
  ($$Waterman's Preparatory School, La Romain$$, 'private'),
  ($$Dunross Preparatory School$$, 'private'),
  ($$Athenias Presecondary School, St Augustine$$, 'private'),
  ($$Sevilla Private Primary School, Sevilla Compound, Rivulet Road, Brechin Castle, Couva$$, 'private'),
  ($$Scholars Private Primary and Pre-School, Tacarigua$$, 'private'),
  ($$Mayaro Guayaguayare Community School$$, 'private'),
  ($$St. Hilary's Preparatory School$$, 'private'),
  ($$Windermere Private School$$, 'private');

DO $$
DECLARE
  type_constraint_def text;
BEGIN
  SELECT pg_get_constraintdef(con.oid)
  INTO type_constraint_def
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'institutions'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%institution_type%'
  LIMIT 1;

  IF coalesce(type_constraint_def, '') ILIKE '%''assisted''%' THEN
    UPDATE tmp_trinidad_primary_schools
    SET institution_type = 'assisted'
    WHERE institution_type = 'government_assisted';
  END IF;

  IF coalesce(type_constraint_def, '') ILIKE '%''government''%' THEN
    UPDATE tmp_trinidad_primary_schools
    SET institution_type = 'government'
    WHERE institution_type = 'public';
  END IF;
END $$;

DO $$
DECLARE
  level_constraint_name text;
  level_constraint_def text;
BEGIN
  SELECT con.conname, pg_get_constraintdef(con.oid)
  INTO level_constraint_name, level_constraint_def
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'institutions'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%institution_level%'
  LIMIT 1;

  IF level_constraint_name IS NOT NULL
     AND coalesce(level_constraint_def, '') NOT ILIKE '%''primary''%' THEN
    EXECUTE format(
      'ALTER TABLE public.institutions DROP CONSTRAINT %I',
      level_constraint_name
    );

    EXECUTE $sql$
      ALTER TABLE public.institutions
      ADD CONSTRAINT institutions_institution_level_check
      CHECK (institution_level IN ('primary', 'secondary', 'tertiary', 'other'))
    $sql$;
  END IF;
END $$;

DO $$
DECLARE
  has_normalized_name boolean;
  has_island boolean;
  has_region boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'institutions'
      AND column_name = 'normalized_name'
  ) INTO has_normalized_name;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'institutions'
      AND column_name = 'island'
  ) INTO has_island;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'institutions'
      AND column_name = 'region'
  ) INTO has_region;

  IF has_normalized_name AND has_island AND has_region THEN
    EXECUTE $sql$
      INSERT INTO public.institutions (
        name,
        normalized_name,
        institution_level,
        institution_type,
        country_code,
        island,
        region,
        is_active
      )
      SELECT
        s.name,
        regexp_replace(lower(trim(s.name)), '\s+', ' ', 'g'),
        'primary',
        s.institution_type,
        'TT',
        'Trinidad',
        NULL,
        true
      FROM tmp_trinidad_primary_schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.institutions i
        WHERE lower(trim(i.name)) = lower(trim(s.name))
      );
    $sql$;
  ELSIF has_normalized_name AND has_island THEN
    EXECUTE $sql$
      INSERT INTO public.institutions (
        name,
        normalized_name,
        institution_level,
        institution_type,
        country_code,
        island,
        is_active
      )
      SELECT
        s.name,
        regexp_replace(lower(trim(s.name)), '\s+', ' ', 'g'),
        'primary',
        s.institution_type,
        'TT',
        'Trinidad',
        true
      FROM tmp_trinidad_primary_schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.institutions i
        WHERE lower(trim(i.name)) = lower(trim(s.name))
      );
    $sql$;
  ELSIF has_normalized_name AND has_region THEN
    EXECUTE $sql$
      INSERT INTO public.institutions (
        name,
        normalized_name,
        institution_level,
        institution_type,
        country_code,
        region,
        is_active
      )
      SELECT
        s.name,
        regexp_replace(lower(trim(s.name)), '\s+', ' ', 'g'),
        'primary',
        s.institution_type,
        'TT',
        NULL,
        true
      FROM tmp_trinidad_primary_schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.institutions i
        WHERE lower(trim(i.name)) = lower(trim(s.name))
      );
    $sql$;
  ELSIF has_normalized_name THEN
    EXECUTE $sql$
      INSERT INTO public.institutions (
        name,
        normalized_name,
        institution_level,
        institution_type,
        country_code,
        is_active
      )
      SELECT
        s.name,
        regexp_replace(lower(trim(s.name)), '\s+', ' ', 'g'),
        'primary',
        s.institution_type,
        'TT',
        true
      FROM tmp_trinidad_primary_schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.institutions i
        WHERE lower(trim(i.name)) = lower(trim(s.name))
      );
    $sql$;
  ELSIF has_island AND has_region THEN
    EXECUTE $sql$
      INSERT INTO public.institutions (
        name,
        institution_level,
        institution_type,
        country_code,
        island,
        region,
        is_active
      )
      SELECT
        s.name,
        'primary',
        s.institution_type,
        'TT',
        'Trinidad',
        NULL,
        true
      FROM tmp_trinidad_primary_schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.institutions i
        WHERE lower(trim(i.name)) = lower(trim(s.name))
      );
    $sql$;
  ELSIF has_island THEN
    EXECUTE $sql$
      INSERT INTO public.institutions (
        name,
        institution_level,
        institution_type,
        country_code,
        island,
        is_active
      )
      SELECT
        s.name,
        'primary',
        s.institution_type,
        'TT',
        'Trinidad',
        true
      FROM tmp_trinidad_primary_schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.institutions i
        WHERE lower(trim(i.name)) = lower(trim(s.name))
      );
    $sql$;
  ELSIF has_region THEN
    EXECUTE $sql$
      INSERT INTO public.institutions (
        name,
        institution_level,
        institution_type,
        country_code,
        region,
        is_active
      )
      SELECT
        s.name,
        'primary',
        s.institution_type,
        'TT',
        NULL,
        true
      FROM tmp_trinidad_primary_schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.institutions i
        WHERE lower(trim(i.name)) = lower(trim(s.name))
      );
    $sql$;
  ELSE
    EXECUTE $sql$
      INSERT INTO public.institutions (
        name,
        institution_level,
        institution_type,
        country_code,
        is_active
      )
      SELECT
        s.name,
        'primary',
        s.institution_type,
        'TT',
        true
      FROM tmp_trinidad_primary_schools s
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.institutions i
        WHERE lower(trim(i.name)) = lower(trim(s.name))
      );
    $sql$;
  END IF;
END $$;


-- ===== FILE: 100_add_session_reminders.sql =====

-- Session reminder emails for 24-hour and 1-hour notices.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.session_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_type text NOT NULL CHECK (recipient_type IN ('student', 'tutor')),
  reminder_type text NOT NULL CHECK (reminder_type IN ('24h', '1h')),
  send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_reminders_status_send_at
  ON public.session_reminders(status, send_at);

CREATE INDEX IF NOT EXISTS idx_session_reminders_session_id
  ON public.session_reminders(session_id);

CREATE TABLE IF NOT EXISTS public.app_runtime_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_runtime_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage session reminders" ON public.session_reminders;
CREATE POLICY "Service role can manage session reminders"
ON public.session_reminders
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage app runtime config" ON public.app_runtime_config;
CREATE POLICY "Service role can manage app runtime config"
ON public.app_runtime_config
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.trigger_send_session_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  app_url text;
  cron_secret text;
BEGIN
  SELECT value INTO app_url
  FROM public.app_runtime_config
  WHERE key = 'next_public_app_url';

  SELECT value INTO cron_secret
  FROM public.app_runtime_config
  WHERE key = 'cron_secret';

  IF app_url IS NULL OR cron_secret IS NULL THEN
    RAISE NOTICE 'Skipping session reminder cron trigger because app_runtime_config is missing required keys';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := app_url || '/api/cron/send-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'send-session-reminders-every-minute'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'send-session-reminders-every-minute',
    '* * * * *',
    $cron$SELECT public.trigger_send_session_reminders();$cron$
  );
END $$;


-- ===== FILE: 101_whatsapp_secure_links.sql =====

-- Secure WhatsApp group link sharing
-- Layer 1: whatsapp_link stored only on the server
-- Layer 2: single-use tokens with expiry
-- Layer 3: click audit log

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS whatsapp_link text;

-- Single-use redirect tokens (10-minute expiry, burned on use)
CREATE TABLE IF NOT EXISTS public.wa_tokens (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token      text        NOT NULL UNIQUE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id   uuid        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used       boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_tokens_token    ON public.wa_tokens(token);
CREATE INDEX IF NOT EXISTS idx_wa_tokens_user_grp ON public.wa_tokens(user_id, group_id);

-- Audit log: who clicked the WhatsApp link and when
CREATE TABLE IF NOT EXISTS public.wa_clicks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id   uuid        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  clicked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_clicks_group ON public.wa_clicks(group_id);

ALTER TABLE public.wa_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages wa_tokens" ON public.wa_tokens;
CREATE POLICY "Service role manages wa_tokens"
  ON public.wa_tokens FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages wa_clicks" ON public.wa_clicks;
CREATE POLICY "Service role manages wa_clicks"
  ON public.wa_clicks FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ===== FILE: 102_group_auto_archive.sql =====

-- =====================================================
-- AUTO-ARCHIVE INACTIVE GROUPS
-- Adds visit tracking, activity log, and archived_reason
-- =====================================================

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS archived_reason text;

-- Track tutor visits to their group pages (resets inactivity timer)
CREATE TABLE IF NOT EXISTS public.group_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  visited_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_visits_lookup
  ON public.group_visits (group_id, visited_at DESC);

ALTER TABLE public.group_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_visits_insert"
ON public.group_visits FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "group_visits_select"
ON public.group_visits FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Audit log for archive/restore actions
CREATE TABLE IF NOT EXISTS public.group_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_group
  ON public.group_activity_log (group_id, created_at DESC);

ALTER TABLE public.group_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_activity_log_select"
ON public.group_activity_log FOR SELECT TO authenticated
USING (
  tutor_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.tutor_id = auth.uid()
  )
);


-- ===== FILE: 103_stream_pin.sql =====

ALTER TABLE public.stream_posts
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

ALTER TABLE public.stream_posts
  ADD COLUMN IF NOT EXISTS pin_expires_at timestamptz;


-- ===== FILE: 104_profile_banner_url.sql =====

-- Optional hero banner for tutor discovery cards and profile headers
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_banner_url text;

COMMENT ON COLUMN public.profiles.profile_banner_url IS 'Public URL for profile/tutor card banner image (Supabase Storage or external CDN)';


-- ===== FILE: 104_student_feedback.sql =====

-- Feedback settings per group (tutor configures)
CREATE TABLE IF NOT EXISTS public.group_feedback_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  frequency text NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('session', 'weekly', 'monthly')),
  deadline_days integer NOT NULL DEFAULT 3,
  include_ratings boolean NOT NULL DEFAULT true,
  notify_students boolean NOT NULL DEFAULT true,
  allow_parent_access boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id)
);

CREATE INDEX IF NOT EXISTS idx_gfs_group ON public.group_feedback_settings (group_id);

-- Feedback periods (auto-generated or triggered by session)
CREATE TABLE IF NOT EXISTS public.group_feedback_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  frequency text NOT NULL CHECK (frequency IN ('session', 'weekly', 'monthly')),
  period_label text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gfp_group ON public.group_feedback_periods (group_id, period_end DESC);

-- Individual feedback entries (one per student per period)
CREATE TABLE IF NOT EXISTS public.group_feedback_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.group_feedback_periods(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  tutor_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'skipped')),
  rating_participation integer CHECK (rating_participation BETWEEN 1 AND 5),
  rating_understanding integer CHECK (rating_understanding BETWEEN 1 AND 5),
  rating_effort integer CHECK (rating_effort BETWEEN 1 AND 5),
  comment text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_gfe_period ON public.group_feedback_entries (period_id);
CREATE INDEX IF NOT EXISTS idx_gfe_student ON public.group_feedback_entries (student_id, group_id);

-- RLS
ALTER TABLE public.group_feedback_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_feedback_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_feedback_entries ENABLE ROW LEVEL SECURITY;

-- Settings: tutor of the group can read/write
CREATE POLICY gfs_tutor_all ON public.group_feedback_settings
  FOR ALL USING (
    group_id IN (SELECT id FROM public.groups WHERE tutor_id = auth.uid())
  );

-- Periods: tutor can manage, members can read
CREATE POLICY gfp_tutor_all ON public.group_feedback_periods
  FOR ALL USING (
    group_id IN (SELECT id FROM public.groups WHERE tutor_id = auth.uid())
  );

CREATE POLICY gfp_member_read ON public.group_feedback_periods
  FOR SELECT USING (
    group_id IN (
      SELECT group_id FROM public.group_members
      WHERE user_id = auth.uid() AND status = 'approved'
    )
  );

-- Entries: tutor can manage all, student can read own
CREATE POLICY gfe_tutor_all ON public.group_feedback_entries
  FOR ALL USING (tutor_id = auth.uid());

CREATE POLICY gfe_student_read ON public.group_feedback_entries
  FOR SELECT USING (student_id = auth.uid() AND status = 'submitted');


-- ===== FILE: 105_session_student_attendance.sql =====

-- Self-reported attendance: one row per session (single student per session).
-- No row = student has not responded yet.

CREATE TABLE IF NOT EXISTS public.session_student_attendance (
  session_id uuid PRIMARY KEY REFERENCES public.sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status = ANY (ARRAY['attending'::text, 'not_attending'::text])),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_student_attendance_student_id
  ON public.session_student_attendance(student_id);

COMMENT ON TABLE public.session_student_attendance IS 'Student self-reported plan to attend; tutors do not edit this.';

CREATE OR REPLACE FUNCTION public.session_student_attendance_set_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid;
BEGIN
  SELECT s.student_id INTO v_student FROM public.sessions s WHERE s.id = NEW.session_id;
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;
  NEW.student_id := v_student;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_session_student_attendance_bi ON public.session_student_attendance;
CREATE TRIGGER trg_session_student_attendance_bi
  BEFORE INSERT ON public.session_student_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.session_student_attendance_set_student();

CREATE OR REPLACE FUNCTION public.session_student_attendance_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_session_student_attendance_bu ON public.session_student_attendance;
CREATE TRIGGER trg_session_student_attendance_bu
  BEFORE UPDATE ON public.session_student_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.session_student_attendance_touch();

ALTER TABLE public.session_student_attendance ENABLE ROW LEVEL SECURITY;

-- Students: read own rows
CREATE POLICY session_student_attendance_student_select
  ON public.session_student_attendance
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

-- Parents: read rows for linked children only
CREATE POLICY session_student_attendance_parent_select
  ON public.session_student_attendance
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.parent_child_links pcl
      WHERE pcl.parent_id = auth.uid()
        AND pcl.child_id = session_student_attendance.student_id
    )
  );

-- Students may insert only for their own upcoming schedulable sessions (cutoff = session start in DB)
CREATE POLICY session_student_attendance_student_insert
  ON public.session_student_attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id
        AND s.student_id = auth.uid()
        AND s.status = ANY (ARRAY['SCHEDULED'::text, 'JOIN_OPEN'::text])
        AND s.scheduled_start_at > now()
    )
    AND student_id = auth.uid()
  );

CREATE POLICY session_student_attendance_student_update
  ON public.session_student_attendance
  FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_student_attendance.session_id
        AND s.student_id = auth.uid()
        AND s.status = ANY (ARRAY['SCHEDULED'::text, 'JOIN_OPEN'::text])
        AND s.scheduled_start_at > now()
    )
  )
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id
        AND s.student_id = auth.uid()
        AND s.status = ANY (ARRAY['SCHEDULED'::text, 'JOIN_OPEN'::text])
        AND s.scheduled_start_at > now()
    )
  );

CREATE POLICY session_student_attendance_student_delete
  ON public.session_student_attendance
  FOR DELETE
  TO authenticated
  USING (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_student_attendance.session_id
        AND s.student_id = auth.uid()
        AND s.status = ANY (ARRAY['SCHEDULED'::text, 'JOIN_OPEN'::text])
        AND s.scheduled_start_at > now()
    )
  );


-- ===== FILE: 106_session_rsvps.sql =====

CREATE TABLE IF NOT EXISTS public.session_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid NOT NULL REFERENCES public.group_session_occurrences(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('attending', 'not_attending')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_session_rsvp_occurrence_student UNIQUE (occurrence_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_session_rsvps_occurrence ON public.session_rsvps(occurrence_id);
CREATE INDEX IF NOT EXISTS idx_session_rsvps_student ON public.session_rsvps(student_id);

ALTER TABLE public.session_rsvps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='session_rsvps' AND policyname='Session rsvps select'
  ) THEN
    CREATE POLICY "Session rsvps select" ON public.session_rsvps
      FOR SELECT TO authenticated
      USING (
        student_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.group_session_occurrences o
          JOIN public.group_sessions s ON s.id = o.group_session_id
          JOIN public.groups g ON g.id = s.group_id
          WHERE o.id = occurrence_id AND g.tutor_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='session_rsvps' AND policyname='Session rsvps upsert own'
  ) THEN
    CREATE POLICY "Session rsvps upsert own" ON public.session_rsvps
      FOR ALL TO authenticated
      USING (student_id = auth.uid())
      WITH CHECK (student_id = auth.uid());
  END IF;
END $$;


-- ===== FILE: 107_calendar_windows_tutor_slots.sql =====

-- MYI-202: Availability windows should reflect tutor-defined rule bounds, not clip start to "now".
-- Booking validation still happens client-side and in is_time_slot_available; display uses true window edges.

CREATE OR REPLACE FUNCTION get_tutor_public_calendar(
    p_tutor_id uuid,
    p_range_start timestamptz,
    p_range_end timestamptz
) RETURNS jsonb AS $$
DECLARE
    v_result jsonb;
    v_availability_windows jsonb DEFAULT '[]'::jsonb;
    v_busy_blocks jsonb DEFAULT '[]'::jsonb;
    v_allow_same_day boolean;
    v_minimum_notice interval;
    v_timezone text := 'America/Port_of_Spain';
BEGIN
    SELECT COALESCE(allow_same_day_bookings, true) INTO v_allow_same_day
    FROM profiles
    WHERE id = p_tutor_id;

    IF v_allow_same_day THEN
        v_minimum_notice := interval '0 minutes';
    ELSE
        v_minimum_notice := interval '24 hours';
    END IF;

    IF p_range_end > p_range_start + interval '30 days' THEN
        p_range_end := p_range_start + interval '30 days';
    END IF;

    WITH RECURSIVE date_series AS (
        SELECT p_range_start::date as day
        UNION ALL
        SELECT (day + interval '1 day')::date
        FROM date_series
        WHERE day < p_range_end::date
    ),
    raw_windows AS (
        SELECT
            ((ds.day || ' ' || ar.start_time)::timestamp AT TIME ZONE v_timezone)::timestamptz as window_start,
            ((ds.day || ' ' ||
                CASE
                    WHEN ar.end_time = '00:00:00'::time THEN '23:59:59'::time
                    ELSE ar.end_time
                END
            )::timestamp AT TIME ZONE v_timezone)::timestamptz as window_end
        FROM date_series ds
        CROSS JOIN public.tutor_availability_rules ar
        WHERE ar.tutor_id = p_tutor_id
        AND ar.is_active = true
        AND EXTRACT(DOW FROM ds.day) = ar.day_of_week
        AND ((ds.day || ' ' || ar.start_time)::timestamp AT TIME ZONE v_timezone)::timestamptz >= p_range_start
        AND ((ds.day || ' ' ||
            CASE
                WHEN ar.end_time = '00:00:00'::time THEN '23:59:59'::time
                ELSE ar.end_time
            END
        )::timestamp AT TIME ZONE v_timezone)::timestamptz <= p_range_end
    ),
    busy_periods AS (
        SELECT confirmed_start_at as busy_start, confirmed_end_at as busy_end, 'BOOKED' as busy_type
        FROM public.bookings
        WHERE tutor_id = p_tutor_id
        AND status = 'CONFIRMED'
        AND confirmed_start_at IS NOT NULL
        AND confirmed_end_at IS NOT NULL
        AND time_ranges_overlap(confirmed_start_at, confirmed_end_at, p_range_start, p_range_end)

        UNION ALL

        SELECT start_at as busy_start, end_at as busy_end, 'UNAVAILABLE' as busy_type
        FROM public.tutor_unavailability_blocks
        WHERE tutor_id = p_tutor_id
        AND time_ranges_overlap(start_at, end_at, p_range_start, p_range_end)
    ),
    future_windows AS (
        SELECT window_start, window_end
        FROM raw_windows
        WHERE window_end > now() + v_minimum_notice
        AND window_start < window_end
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', window_start,
            'end_at', window_end
        )
        ORDER BY window_start
    ) INTO v_availability_windows
    FROM future_windows;

    SELECT jsonb_agg(
        jsonb_build_object(
            'start_at', busy_start,
            'end_at', busy_end,
            'type', busy_type
        )
        ORDER BY busy_start
    ) INTO v_busy_blocks
    FROM busy_periods;

    v_result := jsonb_build_object(
        'availability_windows', COALESCE(v_availability_windows, '[]'::jsonb),
        'busy_blocks', COALESCE(v_busy_blocks, '[]'::jsonb),
        'allows_flexible_booking', true
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_tutor_public_calendar TO authenticated;


-- ===== FILE: 107_handle_new_user_signup_hardening.sql =====

-- Harden handle_new_user so email/password signup never inserts NULL role/username
-- (avoids NOT NULL / CHECK failures that can surface as Auth 500 on some setups).

BEGIN;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_full_name text;
  v_username text;
  v_role text;
  v_country text;
BEGIN
  v_full_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
    split_part(NEW.email, '@', 1)
  );

  v_role := lower(COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'role'), ''), 'student'));
  IF v_role NOT IN ('student', 'parent', 'tutor', 'admin') THEN
    v_role := 'student';
  END IF;

  v_username := NULLIF(trim(NEW.raw_user_meta_data->>'username'), '');
  IF v_username IS NULL THEN
    v_username := 'user_' || replace(NEW.id::text, '-', '');
  END IF;

  v_country := NULLIF(trim(NEW.raw_user_meta_data->>'country'), '');

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    username,
    role,
    country,
    terms_accepted,
    terms_accepted_at,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_username,
    v_role,
    v_country,
    COALESCE((NEW.raw_user_meta_data->>'terms_accepted')::boolean, false),
    CASE
      WHEN (NEW.raw_user_meta_data->>'terms_accepted')::boolean = true THEN NOW()
      ELSE NULL
    END,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    username = COALESCE(EXCLUDED.username, profiles.username),
    role = COALESCE(EXCLUDED.role, profiles.role),
    country = COALESCE(EXCLUDED.country, profiles.country),
    terms_accepted = COALESCE(EXCLUDED.terms_accepted, profiles.terms_accepted),
    terms_accepted_at = COALESCE(EXCLUDED.terms_accepted_at, profiles.terms_accepted_at),
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMIT;


-- ===== FILE: 108_booking_cancellation_reason.sql =====

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE OR REPLACE FUNCTION student_cancel_booking(
    p_booking_id uuid,
    p_reason text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_student_id uuid;
BEGIN
    SELECT student_id INTO v_student_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_student_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    UPDATE public.bookings
    SET
        status = 'CANCELLED',
        last_action_by = 'student',
        cancellation_reason = NULLIF(TRIM(COALESCE(p_reason, '')), '')
    WHERE id = p_booking_id;

    UPDATE public.sessions
    SET
        status = 'CANCELLED',
        updated_at = NOW()
    WHERE booking_id = p_booking_id;

    IF p_reason IS NOT NULL AND TRIM(p_reason) <> '' THEN
        INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
        VALUES (p_booking_id, auth.uid(), 'text', p_reason);
    END IF;

    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (p_booking_id, auth.uid(), 'system', 'Booking cancelled by student');

    RETURN jsonb_build_object('success', true, 'status', 'CANCELLED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ===== FILE: 120_verification_codes_table.sql =====

CREATE TABLE IF NOT EXISTS verification_codes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes (email);

ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_only_verification_codes') THEN
    CREATE POLICY service_role_only_verification_codes ON verification_codes FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;


-- ===== FILE: 121_group_occurrence_title.sql =====

-- Add per-occurrence title override so individual sessions in a series
-- can be renamed independently. NULL means "inherit from parent series".

ALTER TABLE public.group_session_occurrences
  ADD COLUMN IF NOT EXISTS title text;


-- ===== FILE: 122_ai_usage_limit.sql =====

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_uses_count INTEGER NOT NULL DEFAULT 0;


NOTIFY pgrst, 'reload schema';

