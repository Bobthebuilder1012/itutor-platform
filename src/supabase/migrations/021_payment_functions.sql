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
    RAISE NOTICE '✅ Payment system functions created successfully!';
    RAISE NOTICE 'Functions: compute_platform_fee, complete_booking_payment, mark_session_completed_with_payout, release_payout, get_payer_for_student';
END $$;




