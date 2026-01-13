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
    RAISE NOTICE '✅ Tutor verification schema created successfully!';
    RAISE NOTICE 'Tables: tutor_verification_requests, tutor_verification_events';
    RAISE NOTICE 'Extended: profiles (is_reviewer, tutor_verification_status, tutor_verified_at)';
    RAISE NOTICE 'Updated: notifications table constraint';
END $$;













