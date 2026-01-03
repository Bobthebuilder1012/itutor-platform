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
  RAISE NOTICE '✅ DM request system created';
  RAISE NOTICE '   - dm_requests table with status tracking';
  RAISE NOTICE '   - RLS policies for privacy';
  RAISE NOTICE '   - Helper functions for connection checking';
  RAISE NOTICE '   - Integration with existing bookings system';
END $$;






