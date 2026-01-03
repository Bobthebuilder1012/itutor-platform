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
  
  RAISE NOTICE '✅ Commission tiers updated successfully!';
END $$;






