-- =====================================================
-- GRANDFATHER EXISTING BOOKINGS MIGRATION
-- =====================================================
-- Marks all existing bookings and sessions as paid (no payment required)
-- Run this AFTER the payment system migrations are complete

-- Display current counts
DO $$
DECLARE
    v_bookings_count integer;
    v_sessions_count integer;
BEGIN
    SELECT COUNT(*) INTO v_bookings_count FROM bookings WHERE payment_required IS NULL OR payment_status IS NULL;
    SELECT COUNT(*) INTO v_sessions_count FROM sessions WHERE payment_status IS NULL;
    
    RAISE NOTICE '📊 Migration Stats:';
    RAISE NOTICE '  - Bookings to update: %', v_bookings_count;
    RAISE NOTICE '  - Sessions to update: %', v_sessions_count;
END $$;

-- 1. UPDATE BOOKINGS
-- Mark all existing bookings as not requiring payment and already paid
UPDATE bookings
SET 
  payment_required = false,
  payment_status = 'paid',
  payer_id = COALESCE(payer_id, student_id),  -- Set payer to student if not already set
  currency = COALESCE(currency, 'TTD'),
  platform_fee_pct = COALESCE(platform_fee_pct, 0),
  platform_fee_ttd = COALESCE(platform_fee_ttd, 0),
  tutor_payout_ttd = COALESCE(tutor_payout_ttd, price_ttd),
  updated_at = now()
WHERE payment_required IS NULL OR payment_status IS NULL;

-- Get count of updated bookings
DO $$
DECLARE
    v_updated_count integer;
BEGIN
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RAISE NOTICE '✅ Updated % bookings', v_updated_count;
END $$;

-- 2. UPDATE SESSIONS
-- Mark all existing sessions as paid
UPDATE sessions
SET 
  payment_status = 'paid',
  payer_id = COALESCE(payer_id, student_id),  -- Set payer to student if not already set
  currency = COALESCE(currency, 'TTD'),
  platform_fee_pct = COALESCE(platform_fee_pct, 0),
  platform_fee_ttd = COALESCE(platform_fee_ttd, 0),
  tutor_payout_ttd = COALESCE(tutor_payout_ttd, 0),
  updated_at = now()
WHERE payment_status IS NULL;

-- Get count of updated sessions
DO $$
DECLARE
    v_updated_count integer;
BEGIN
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RAISE NOTICE '✅ Updated % sessions', v_updated_count;
END $$;

-- 3. VERIFY MIGRATION
-- Check that all bookings and sessions now have payment info
DO $$
DECLARE
    v_bookings_null_count integer;
    v_sessions_null_count integer;
BEGIN
    SELECT COUNT(*) INTO v_bookings_null_count 
    FROM bookings 
    WHERE payment_required IS NULL OR payment_status IS NULL;
    
    SELECT COUNT(*) INTO v_sessions_null_count 
    FROM sessions 
    WHERE payment_status IS NULL;
    
    RAISE NOTICE '🔍 Verification:';
    RAISE NOTICE '  - Bookings with NULL payment fields: %', v_bookings_null_count;
    RAISE NOTICE '  - Sessions with NULL payment fields: %', v_sessions_null_count;
    
    IF v_bookings_null_count = 0 AND v_sessions_null_count = 0 THEN
        RAISE NOTICE '✅ Migration completed successfully!';
        RAISE NOTICE 'All existing bookings and sessions have been grandfathered.';
    ELSE
        RAISE WARNING '⚠️ Some records still have NULL payment fields. Please investigate.';
    END IF;
END $$;

-- 4. DISPLAY SAMPLE DATA
-- Show a few examples of updated records
DO $$
DECLARE
    sample_booking record;
    sample_session record;
BEGIN
    RAISE NOTICE '📋 Sample updated booking:';
    SELECT id, payment_required, payment_status, payer_id 
    INTO sample_booking
    FROM bookings 
    WHERE payment_required = false 
    LIMIT 1;
    
    IF FOUND THEN
        RAISE NOTICE '  ID: %, Payment Required: %, Payment Status: %, Payer ID: %',
            sample_booking.id,
            sample_booking.payment_required,
            sample_booking.payment_status,
            sample_booking.payer_id;
    END IF;
    
    RAISE NOTICE '📋 Sample updated session:';
    SELECT id, payment_status, payer_id 
    INTO sample_session
    FROM sessions 
    WHERE payment_status = 'paid' 
    LIMIT 1;
    
    IF FOUND THEN
        RAISE NOTICE '  ID: %, Payment Status: %, Payer ID: %',
            sample_session.id,
            sample_session.payment_status,
            sample_session.payer_id;
    END IF;
END $$;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '🎉 Grandfather migration complete!';
    RAISE NOTICE 'Existing bookings and sessions will not require payment.';
    RAISE NOTICE 'New bookings created after this migration will require payment.';
END $$;
