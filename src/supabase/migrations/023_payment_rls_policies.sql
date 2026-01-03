-- =====================================================
-- RLS POLICIES FOR PAYMENT TABLES
-- =====================================================
-- Security policies for tutor_payout_accounts, payments, payout_ledger

-- 1. TUTOR_PAYOUT_ACCOUNTS POLICIES

-- Tutors can view their own payout accounts
DROP POLICY IF EXISTS "Tutors can view their own payout accounts" ON tutor_payout_accounts;
CREATE POLICY "Tutors can view their own payout accounts"
ON tutor_payout_accounts
FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

-- Tutors can insert their own payout accounts
DROP POLICY IF EXISTS "Tutors can create their own payout accounts" ON tutor_payout_accounts;
CREATE POLICY "Tutors can create their own payout accounts"
ON tutor_payout_accounts
FOR INSERT
TO authenticated
WITH CHECK (tutor_id = auth.uid());

-- Tutors can update their own payout accounts
DROP POLICY IF EXISTS "Tutors can update their own payout accounts" ON tutor_payout_accounts;
CREATE POLICY "Tutors can update their own payout accounts"
ON tutor_payout_accounts
FOR UPDATE
TO authenticated
USING (tutor_id = auth.uid());

-- Tutors can delete their own payout accounts
DROP POLICY IF EXISTS "Tutors can delete their own payout accounts" ON tutor_payout_accounts;
CREATE POLICY "Tutors can delete their own payout accounts"
ON tutor_payout_accounts
FOR DELETE
TO authenticated
USING (tutor_id = auth.uid());

-- Service role has full access
DROP POLICY IF EXISTS "Service role full access to payout accounts" ON tutor_payout_accounts;
CREATE POLICY "Service role full access to payout accounts"
ON tutor_payout_accounts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2. PAYMENTS POLICIES

-- Payers can view their own payments
DROP POLICY IF EXISTS "Payers can view their payments" ON payments;
CREATE POLICY "Payers can view their payments"
ON payments
FOR SELECT
TO authenticated
USING (payer_id = auth.uid());

-- Students can view payments for their bookings
DROP POLICY IF EXISTS "Students can view their booking payments" ON payments;
CREATE POLICY "Students can view their booking payments"
ON payments
FOR SELECT
TO authenticated
USING (
    booking_id IN (
        SELECT id FROM bookings WHERE student_id = auth.uid()
    )
);

-- Tutors can view payments for their bookings
DROP POLICY IF EXISTS "Tutors can view their booking payments" ON payments;
CREATE POLICY "Tutors can view their booking payments"
ON payments
FOR SELECT
TO authenticated
USING (
    booking_id IN (
        SELECT id FROM bookings WHERE tutor_id = auth.uid()
    )
);

-- Parents can view payments for their children's bookings
DROP POLICY IF EXISTS "Parents can view their children's payments" ON payments;
CREATE POLICY "Parents can view their children's payments"
ON payments
FOR SELECT
TO authenticated
USING (
    booking_id IN (
        SELECT b.id 
        FROM bookings b
        INNER JOIN parent_child_links pcl ON pcl.child_id = b.student_id
        WHERE pcl.parent_id = auth.uid()
    )
);

-- Service role can manage all payments (for webhook processing)
DROP POLICY IF EXISTS "Service role full access to payments" ON payments;
CREATE POLICY "Service role full access to payments"
ON payments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users can insert payments (for initiating payment)
DROP POLICY IF EXISTS "Authenticated users can create payments" ON payments;
CREATE POLICY "Authenticated users can create payments"
ON payments
FOR INSERT
TO authenticated
WITH CHECK (payer_id = auth.uid());

-- 3. PAYOUT_LEDGER POLICIES

-- Tutors can view their own payout ledger
DROP POLICY IF EXISTS "Tutors can view their payout ledger" ON payout_ledger;
CREATE POLICY "Tutors can view their payout ledger"
ON payout_ledger
FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

-- Service role can manage all payout ledger entries
DROP POLICY IF EXISTS "Service role full access to payout ledger" ON payout_ledger;
CREATE POLICY "Service role full access to payout ledger"
ON payout_ledger
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Students can view payout ledger for their sessions (transparency)
DROP POLICY IF EXISTS "Students can view payout ledger for their sessions" ON payout_ledger;
CREATE POLICY "Students can view payout ledger for their sessions"
ON payout_ledger
FOR SELECT
TO authenticated
USING (
    session_id IN (
        SELECT id FROM sessions WHERE student_id = auth.uid()
    )
);

-- Parents can view payout ledger for their children's sessions
DROP POLICY IF EXISTS "Parents can view payout ledger for children's sessions" ON payout_ledger;
CREATE POLICY "Parents can view payout ledger for children's sessions"
ON payout_ledger
FOR SELECT
TO authenticated
USING (
    session_id IN (
        SELECT s.id 
        FROM sessions s
        INNER JOIN parent_child_links pcl ON pcl.child_id = s.student_id
        WHERE pcl.parent_id = auth.uid()
    )
);

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ RLS policies created for payment tables!';
    RAISE NOTICE 'Policies: tutor_payout_accounts (4), payments (6), payout_ledger (4)';
END $$;






