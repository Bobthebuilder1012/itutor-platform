-- Add is_test_data column to bookings, sessions, and ratings tables
-- This allows us to easily identify and remove test/seed data

ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS is_test_data boolean DEFAULT false;

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS is_test_data boolean DEFAULT false;

ALTER TABLE ratings
ADD COLUMN IF NOT EXISTS is_test_data boolean DEFAULT false;

-- Create indexes for faster cleanup
CREATE INDEX IF NOT EXISTS idx_bookings_test_data ON bookings(is_test_data)
WHERE is_test_data = true;

CREATE INDEX IF NOT EXISTS idx_sessions_test_data ON sessions(is_test_data)
WHERE is_test_data = true;

CREATE INDEX IF NOT EXISTS idx_ratings_test_data ON ratings(is_test_data)
WHERE is_test_data = true;

