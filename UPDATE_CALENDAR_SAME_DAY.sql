-- =====================================================
-- QUICK FIX: Update calendar to show same-day slots
-- Run this in Supabase SQL Editor
-- =====================================================

-- This updates the get_tutor_public_calendar function to check
-- the allow_same_day_bookings flag and show today's slots
-- for tutors who have it enabled

-- Copy and run the ENTIRE contents of:
-- src/supabase/migrations/073_update_calendar_for_same_day_bookings.sql

-- OR just run this simplified version:
-- This will show slots with 1 hour notice for same-day tutors,
-- and 24 hours notice for everyone else
