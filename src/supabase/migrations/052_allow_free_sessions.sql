-- =====================================================
-- ALLOW FREE SESSIONS
-- =====================================================
-- Enable tutors to offer free sessions ($0/hour)
-- Recommended for new tutors to build ratings
-- No platform commission on free sessions
-- =====================================================

-- Drop existing price check constraints
ALTER TABLE public.tutor_subjects
DROP CONSTRAINT IF EXISTS tutor_subjects_price_per_hour_ttd_check;

ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_price_per_hour_ttd_check;

-- Add new constraints allowing $0 (free sessions)
ALTER TABLE public.tutor_subjects
ADD CONSTRAINT tutor_subjects_price_per_hour_ttd_check 
CHECK (price_per_hour_ttd >= 0);

ALTER TABLE public.bookings
ADD CONSTRAINT bookings_price_per_hour_ttd_check 
CHECK (price_per_hour_ttd >= 0);

-- Add comment explaining free sessions
COMMENT ON COLUMN public.tutor_subjects.price_per_hour_ttd IS 
'Hourly rate in TTD. Can be 0 for free sessions (recommended for new tutors to build ratings).';

COMMENT ON COLUMN public.bookings.price_per_hour_ttd IS 
'Hourly rate in TTD. Can be 0 for free sessions.';











