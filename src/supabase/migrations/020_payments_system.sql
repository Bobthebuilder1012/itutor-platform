-- =====================================================
-- PAYMENTS SYSTEM MIGRATION
-- =====================================================
-- Extends existing booking/session tables and adds payment tracking

-- 1. EXTEND BOOKINGS TABLE
-- Add payment tracking columns to existing bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payer_id uuid REFERENCES profiles(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_required boolean DEFAULT true;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid' 
  CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'refunded', 'failed'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS currency text DEFAULT 'TTD';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS platform_fee_pct integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS platform_fee_ttd numeric(10,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tutor_payout_ttd numeric(10,2);

-- Create index on payment_status for faster queries
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_payer_id ON bookings(payer_id);

-- 2. EXTEND SESSIONS TABLE
-- Add payment tracking to existing sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS payer_id uuid REFERENCES profiles(id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'paid', 'release_ready', 'released', 'refunded'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS currency text DEFAULT 'TTD';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS platform_fee_pct integer;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS platform_fee_ttd numeric(10,2);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tutor_payout_ttd numeric(10,2);

-- Create index on payment_status
CREATE INDEX IF NOT EXISTS idx_sessions_payment_status ON sessions(payment_status);
CREATE INDEX IF NOT EXISTS idx_sessions_payer_id ON sessions(payer_id);

-- 3. CREATE TUTOR_PAYOUT_ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS tutor_payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'wipay',
  payout_name text,
  payout_account_identifier text,
  payout_metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index on tutor_id
CREATE INDEX IF NOT EXISTS idx_tutor_payout_accounts_tutor_id ON tutor_payout_accounts(tutor_id);

-- Enable RLS
ALTER TABLE tutor_payout_accounts ENABLE ROW LEVEL SECURITY;

-- 4. CREATE PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL REFERENCES profiles(id),
  provider text NOT NULL DEFAULT 'wipay',
  provider_reference text UNIQUE,
  amount_ttd numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'initiated' 
    CHECK (status IN ('initiated', 'requires_action', 'succeeded', 'failed', 'refunded', 'cancelled')),
  raw_provider_payload jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_payer_id ON payments(payer_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_reference ON payments(provider_reference);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 5. CREATE PAYOUT_LEDGER TABLE
CREATE TABLE IF NOT EXISTS payout_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid UNIQUE NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES profiles(id),
  amount_ttd numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'owed' 
    CHECK (status IN ('owed', 'release_ready', 'released', 'reversed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payout_ledger_session_id ON payout_ledger(session_id);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_tutor_id ON payout_ledger(tutor_id);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_status ON payout_ledger(status);

-- Enable RLS
ALTER TABLE payout_ledger ENABLE ROW LEVEL SECURITY;

-- 6. CREATE TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at on new tables
DROP TRIGGER IF EXISTS update_tutor_payout_accounts_updated_at ON tutor_payout_accounts;
CREATE TRIGGER update_tutor_payout_accounts_updated_at
    BEFORE UPDATE ON tutor_payout_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payout_ledger_updated_at ON payout_ledger;
CREATE TRIGGER update_payout_ledger_updated_at
    BEFORE UPDATE ON payout_ledger
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Payments system tables created successfully!';
    RAISE NOTICE 'Tables: bookings (extended), sessions (extended), tutor_payout_accounts, payments, payout_ledger';
END $$;






