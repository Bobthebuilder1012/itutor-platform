-- =====================================================
-- DEPRECATE LEGACY student_cancel_booking RPC
-- =====================================================
-- The /api/bookings/student-cancel route no longer calls this RPC
-- (it now goes through lib/payments/refundService + reliability
-- helpers directly). The function is kept on the database for
-- backward compat with any rows whose audit trail references it,
-- but it should not be called by new code.
--
-- Drop in a future migration once we're confident nothing else
-- references it.
-- =====================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'student_cancel_booking'
  ) THEN
    EXECUTE 'COMMENT ON FUNCTION public.student_cancel_booking(uuid, text) IS '
      || quote_literal(
        'DEPRECATED 2026-05. Bypasses refundService and reliability layer. '
        || 'Do not call from new code; use POST /api/bookings/student-cancel '
        || 'which goes through lib/payments/refundService and '
        || 'lib/reliability writeCancellationEvent instead. Kept temporarily '
        || 'for audit trail compatibility.'
      );
  END IF;
END $$;
