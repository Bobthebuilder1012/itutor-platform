-- =====================================================
-- PARENT APPROVAL WORKFLOW FOR CHILD BOOKINGS
-- =====================================================
-- Implements a multi-stage approval system where child bookings
-- must be approved by parents before going to tutors

-- =====================================================
-- STEP 1: ADD NEW BOOKING STATUSES
-- =====================================================

-- Add new statuses to handle parent approval workflow
-- Current statuses: PENDING, CONFIRMED, DECLINED, COUNTERED, CANCELLED
-- New statuses: PENDING_PARENT_APPROVAL, PARENT_APPROVED, PARENT_REJECTED

-- Check if status column is an ENUM or TEXT
-- If it's ENUM, we need to add new values
-- If it's TEXT with CHECK constraint, we need to update the constraint

-- For now, let's assume it uses a CHECK constraint (more flexible)
-- Drop existing constraint if it exists
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

-- Add new CHECK constraint with all statuses including parent approval ones
ALTER TABLE bookings
ADD CONSTRAINT bookings_status_check
CHECK (status IN (
    'PENDING',                    -- Waiting for tutor response (original flow)
    'PENDING_PARENT_APPROVAL',    -- Waiting for parent approval (child accounts)
    'PARENT_APPROVED',            -- Parent approved, now goes to tutor
    'PARENT_REJECTED',            -- Parent rejected the booking request
    'CONFIRMED',                  -- Tutor confirmed
    'DECLINED',                   -- Tutor declined
    'COUNTERED',                  -- Tutor countered
    'CANCELLED',                  -- Cancelled by either party
    'COMPLETED'                   -- Session completed
));

-- =====================================================
-- STEP 2: ADD PARENT APPROVAL TRACKING COLUMNS
-- =====================================================

-- Add columns to track parent approval
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS parent_approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS parent_rejected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS parent_notes TEXT;

-- =====================================================
-- STEP 3: CREATE PARENT_BOOKING_APPROVALS TABLE
-- =====================================================
-- Track the approval history for audit purposes

CREATE TABLE IF NOT EXISTS parent_booking_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    parent_id UUID NOT NULL REFERENCES profiles(id),
    student_id UUID NOT NULL REFERENCES profiles(id),
    action TEXT NOT NULL CHECK (action IN ('APPROVED', 'REJECTED')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_parent_approvals_booking ON parent_booking_approvals(booking_id);
CREATE INDEX IF NOT EXISTS idx_parent_approvals_parent ON parent_booking_approvals(parent_id);

-- Enable RLS
ALTER TABLE parent_booking_approvals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Parents can view their approval history"
ON parent_booking_approvals FOR SELECT
TO authenticated
USING (
    parent_id = auth.uid() OR
    student_id IN (
        SELECT child_id FROM parent_child_links WHERE parent_id = auth.uid()
    )
);

CREATE POLICY "Parents can create approval records"
ON parent_booking_approvals FOR INSERT
TO authenticated
WITH CHECK (
    parent_id = auth.uid() AND
    student_id IN (
        SELECT child_id FROM parent_child_links WHERE parent_id = auth.uid()
    )
);

-- =====================================================
-- STEP 4: UPDATE create_booking_request FUNCTION
-- =====================================================
-- Modify to route child bookings to parent first

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
    v_is_child_account boolean := false;
    v_parent_id uuid;
    v_initial_status text;
BEGIN
    -- Validate auth: Allow if user is the student OR if user is the parent of the student
    IF auth.uid() != p_student_id THEN
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

    -- Check if this is a child account (needs parent approval)
    SELECT billing_mode = 'parent_required' INTO v_is_child_account
    FROM profiles
    WHERE id = p_student_id;

    -- Get parent ID if child account
    IF v_is_child_account THEN
        SELECT parent_id INTO v_parent_id
        FROM parent_child_links
        WHERE child_id = p_student_id
        LIMIT 1;
    END IF;

    -- Determine initial status based on account type
    IF v_is_child_account THEN
        v_initial_status := 'PENDING_PARENT_APPROVAL';
    ELSE
        v_initial_status := 'PENDING';
    END IF;

    -- Calculate actual duration
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

    -- Validate consecutive slots if function exists
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_consecutive_slots') THEN
        IF NOT validate_consecutive_slots(p_tutor_id, p_requested_start_at, v_actual_duration_minutes) THEN
            RAISE EXCEPTION 'The requested time slot(s) are not available. Please choose a different time.';
        END IF;
    END IF;

    -- Get tutor's hourly rate
    SELECT price_per_hour_ttd INTO v_tutor_hourly_rate
    FROM tutor_subjects
    WHERE tutor_id = p_tutor_id
    AND subject_id = p_subject_id
    LIMIT 1;

    IF v_tutor_hourly_rate IS NULL THEN
        RAISE EXCEPTION 'Tutor does not teach this subject';
    END IF;

    -- Calculate price
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
        v_initial_status,
        now(),
        now()
    ) RETURNING id INTO v_booking_id;

    -- Create appropriate notification based on account type
    IF v_is_child_account AND v_parent_id IS NOT NULL THEN
        -- Notify parent for approval
        INSERT INTO notifications (user_id, type, title, message, link, created_at)
        VALUES (
            v_parent_id,
            'booking_needs_parent_approval',
            'Booking Approval Needed',
            'Your child has requested a tutoring session that needs your approval',
            '/parent/approve-bookings',
            now()
        );
    ELSE
        -- Notify tutor directly (normal flow)
        INSERT INTO notifications (user_id, type, title, message, link, created_at)
        VALUES (
            p_tutor_id,
            'booking_request_received',
            'New Booking Request',
            'You have a new booking request',
            '/tutor/bookings/' || v_booking_id,
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'price', v_calculated_price,
        'duration_minutes', v_actual_duration_minutes,
        'status', v_initial_status,
        'requires_parent_approval', v_is_child_account
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_booking_request TO authenticated;

-- =====================================================
-- STEP 5: CREATE PARENT APPROVAL FUNCTIONS
-- =====================================================

-- Function for parent to approve booking
CREATE OR REPLACE FUNCTION parent_approve_booking(
    p_booking_id uuid,
    p_parent_notes text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_booking record;
    v_is_parent boolean;
BEGIN
    -- Get booking details
    SELECT * INTO v_booking
    FROM bookings
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;

    -- Verify user is parent of the student
    SELECT EXISTS(
        SELECT 1 
        FROM parent_child_links 
        WHERE parent_id = auth.uid() 
        AND child_id = v_booking.student_id
    ) INTO v_is_parent;

    IF NOT v_is_parent THEN
        RAISE EXCEPTION 'Unauthorized: Only the parent can approve this booking';
    END IF;

    -- Check booking is in correct status
    IF v_booking.status != 'PENDING_PARENT_APPROVAL' THEN
        RAISE EXCEPTION 'Booking is not pending parent approval';
    END IF;

    -- Update booking status to send to tutor
    UPDATE bookings
    SET 
        status = 'PENDING',  -- Now goes to tutor
        parent_approved_at = now(),
        parent_notes = p_parent_notes,
        updated_at = now()
    WHERE id = p_booking_id;

    -- Record approval
    INSERT INTO parent_booking_approvals (booking_id, parent_id, student_id, action, notes)
    VALUES (p_booking_id, auth.uid(), v_booking.student_id, 'APPROVED', p_parent_notes);

    -- Notify tutor
    INSERT INTO notifications (user_id, type, title, message, link, created_at)
    VALUES (
        v_booking.tutor_id,
        'booking_request_received',
        'New Booking Request',
        'You have a new booking request',
        '/tutor/bookings/' || p_booking_id,
        now()
    );

    -- Notify student
    INSERT INTO notifications (user_id, type, title, message, link, created_at)
    VALUES (
        v_booking.student_id,
        'booking_parent_approved',
        'Parent Approved',
        'Your parent has approved your booking request',
        '/student/bookings/' || p_booking_id,
        now()
    );

    RETURN jsonb_build_object('success', true, 'status', 'PENDING');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for parent to reject booking
CREATE OR REPLACE FUNCTION parent_reject_booking(
    p_booking_id uuid,
    p_parent_notes text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_booking record;
    v_is_parent boolean;
BEGIN
    -- Get booking details
    SELECT * INTO v_booking
    FROM bookings
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;

    -- Verify user is parent of the student
    SELECT EXISTS(
        SELECT 1 
        FROM parent_child_links 
        WHERE parent_id = auth.uid() 
        AND child_id = v_booking.student_id
    ) INTO v_is_parent;

    IF NOT v_is_parent THEN
        RAISE EXCEPTION 'Unauthorized: Only the parent can reject this booking';
    END IF;

    -- Check booking is in correct status
    IF v_booking.status != 'PENDING_PARENT_APPROVAL' THEN
        RAISE EXCEPTION 'Booking is not pending parent approval';
    END IF;

    -- Update booking status
    UPDATE bookings
    SET 
        status = 'PARENT_REJECTED',
        parent_rejected_at = now(),
        parent_notes = p_parent_notes,
        updated_at = now()
    WHERE id = p_booking_id;

    -- Record rejection
    INSERT INTO parent_booking_approvals (booking_id, parent_id, student_id, action, notes)
    VALUES (p_booking_id, auth.uid(), v_booking.student_id, 'REJECTED', p_parent_notes);

    -- Notify student
    INSERT INTO notifications (user_id, type, title, message, link, created_at)
    VALUES (
        v_booking.student_id,
        'booking_parent_rejected',
        'Parent Declined',
        'Your parent has declined your booking request',
        '/student/bookings/' || p_booking_id,
        now()
    );

    RETURN jsonb_build_object('success', true, 'status', 'PARENT_REJECTED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION parent_approve_booking TO authenticated;
GRANT EXECUTE ON FUNCTION parent_reject_booking TO authenticated;

-- =====================================================
-- VERIFICATION
-- =====================================================

SELECT 'Parent approval workflow setup complete!' AS status;







