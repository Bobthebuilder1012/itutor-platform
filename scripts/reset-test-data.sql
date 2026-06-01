-- ============================================================
-- reset-test-data.sql
-- Clears all transactional data for a clean testing slate.
--
-- KEEPS: profiles, groups, group_session_occurrences,
--        tutor_payout_accounts
--
-- CLEARS: payments, sessions, bookings, subscriptions,
--         enrollments, payout ledger, disputes, strikes,
--         notifications
--
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

DO $$
DECLARE
  tbl            text;
  rel            regclass;
  balance_sets   text[] := ARRAY[]::text[];
BEGIN

  -- ── Break bookings <-> payments circular FK ──────────────────────────────
  IF to_regclass('public.bookings') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = 'bookings'
         AND column_name  = 'payment_id'
     )
  THEN
    UPDATE public.bookings SET payment_id = NULL;
    RAISE NOTICE 'Nulled bookings.payment_id';
  END IF;

  -- ── Delete transactional tables (children first) ─────────────────────────
  FOREACH tbl IN ARRAY ARRAY[
    'public.payout_case_events',
    'public.cancellation_events',
    'public.payout_cases',
    'public.noshow_claims',
    'public.tutor_strikes',
    'public.student_strikes',
    'public.tutor_deductions',
    'public.payout_ledger',
    'public.payout_batches',
    'public.payments',
    'public.sessions',
    'public.bookings',
    'public.subscription_refunds',
    'public.group_removals',
    'public.subscription_payments',
    'public.group_enrollments',
    'public.notifications'
  ]
  LOOP
    rel := to_regclass(tbl);
    IF rel IS NOT NULL THEN
      EXECUTE format('DELETE FROM %s', rel);
      RAISE NOTICE 'Cleared %', tbl;
    ELSE
      RAISE NOTICE 'Skipped (table not found): %', tbl;
    END IF;
  END LOOP;

  -- ── Reset tutor_balances to zero ─────────────────────────────────────────
  IF to_regclass('public.tutor_balances') IS NOT NULL THEN

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='tutor_balances'
                 AND column_name='pending_ttd') THEN
      balance_sets := array_append(balance_sets, 'pending_ttd = 0');
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='tutor_balances'
                 AND column_name='available_ttd') THEN
      balance_sets := array_append(balance_sets, 'available_ttd = 0');
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='tutor_balances'
                 AND column_name='last_updated') THEN
      balance_sets := array_append(balance_sets, 'last_updated = now()');
    END IF;

    IF array_length(balance_sets, 1) IS NOT NULL THEN
      EXECUTE 'UPDATE public.tutor_balances SET ' || array_to_string(balance_sets, ', ');
      RAISE NOTICE 'Reset tutor_balances: %', array_to_string(balance_sets, ', ');
    END IF;

  END IF;

  RAISE NOTICE '✓ Reset complete. Profiles, groups, schedules, and payout accounts untouched.';

END $$;
