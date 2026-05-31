-- ============================================================
-- 155_booking_slot_exclusion.sql
-- ============================================================
-- Audit Medium #11: bookings rely on a soft SELECT-then-INSERT
-- check to keep two CONFIRMED bookings from claiming the same
-- tutor at the same time. Two webhooks racing to materialise
-- bookings whose checkouts completed within milliseconds of each
-- other can both pass that check and both insert.
--
-- This migration adds a Postgres EXCLUSION constraint that
-- prevents the race at the database level. btree_gist is needed
-- to combine the equality predicate on tutor_id with the range
-- overlap predicate on the time window.
--
-- Scope: only CONFIRMED bookings participate. Once a booking is
-- CANCELLED / DECLINED, it stops blocking the slot. PENDING /
-- COUNTER_PROPOSED bookings don't claim the slot yet â€” they
-- become CONFIRMED only after acceptance, at which point the
-- constraint kicks in.
--
-- If the constraint creation fails because pre-existing rows
-- already overlap, run the diagnostic in the verification block
-- below to find them and reconcile manually before re-running.
-- ============================================================


-- 1. Required extension. Idempotent.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Drop any prior version of the constraint so re-running is safe.
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_tutor_no_overlap;

-- 3. The exclusion constraint itself. Half-open interval [start, end)
--    so a session ending at 14:00 doesn't conflict with one starting
--    at 14:00.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_tutor_no_overlap
  EXCLUDE USING gist (
    tutor_id WITH =,
    tstzrange(confirmed_start_at, confirmed_end_at, '[)') WITH &&
  )
  WHERE (
    status = 'CONFIRMED'
    AND confirmed_start_at IS NOT NULL
    AND confirmed_end_at IS NOT NULL
  );


-- ============================================================
-- Diagnostic for existing overlaps (run before applying if the
-- migration errors out):
--
--   SELECT a.id AS booking_a, b.id AS booking_b,
--          a.tutor_id, a.confirmed_start_at, a.confirmed_end_at,
--          b.confirmed_start_at, b.confirmed_end_at
--     FROM bookings a
--     JOIN bookings b
--       ON a.tutor_id = b.tutor_id
--      AND a.id < b.id
--      AND a.status = 'CONFIRMED'
--      AND b.status = 'CONFIRMED'
--      AND tstzrange(a.confirmed_start_at, a.confirmed_end_at, '[)')
--          && tstzrange(b.confirmed_start_at, b.confirmed_end_at, '[)');
-- ============================================================
