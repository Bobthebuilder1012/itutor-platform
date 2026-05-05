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
-- 2. PARENT_CHILD_LINKS (Parent ↔ Student relationships)
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

