-- =====================================================
-- AUTOMATED ONBOARDING EMAIL SYSTEM - DATABASE SETUP (CLEAN)
-- =====================================================

-- Drop existing tables if needed (uncomment to rebuild)
-- DROP TABLE IF EXISTS email_send_logs CASCADE;
-- DROP TABLE IF EXISTS onboarding_email_queue CASCADE;
-- DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- 1. Email Queue Table
CREATE TABLE IF NOT EXISTS onboarding_email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type TEXT NOT NULL CHECK (user_type IN ('student', 'tutor', 'parent')),
  stage INTEGER NOT NULL CHECK (stage >= 0),
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Email Send Logs Table
CREATE TABLE IF NOT EXISTS email_send_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_queue_user_id ON onboarding_email_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_queue_status ON onboarding_email_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_scheduled ON onboarding_email_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_queue_user_stage ON onboarding_email_queue(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON email_send_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_sent_at ON email_send_logs(sent_at);

-- 4. Enable RLS
ALTER TABLE onboarding_email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_send_logs ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own email queue" ON onboarding_email_queue;
DROP POLICY IF EXISTS "Admins can view all email queues" ON onboarding_email_queue;
DROP POLICY IF EXISTS "System can insert email queue entries" ON onboarding_email_queue;
DROP POLICY IF EXISTS "System can update email queue entries" ON onboarding_email_queue;
DROP POLICY IF EXISTS "Users can view their own email logs" ON email_send_logs;
DROP POLICY IF EXISTS "Admins can view all email logs" ON email_send_logs;
DROP POLICY IF EXISTS "System can insert email logs" ON email_send_logs;

-- 6. Create RLS Policies for onboarding_email_queue
CREATE POLICY "Users can view their own email queue"
  ON onboarding_email_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all email queues"
  ON onboarding_email_queue FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "System can insert email queue entries"
  ON onboarding_email_queue FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update email queue entries"
  ON onboarding_email_queue FOR UPDATE
  USING (true);

-- 7. Create RLS Policies for email_send_logs
CREATE POLICY "Users can view their own email logs"
  ON email_send_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all email logs"
  ON email_send_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "System can insert email logs"
  ON email_send_logs FOR INSERT
  WITH CHECK (true);

-- 8. Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Create trigger
DROP TRIGGER IF EXISTS update_queue_updated_at ON onboarding_email_queue;
CREATE TRIGGER update_queue_updated_at
  BEFORE UPDATE ON onboarding_email_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 10. Verify setup
SELECT 'Setup complete!' as message;
SELECT COUNT(*) as queue_rows FROM onboarding_email_queue;
SELECT COUNT(*) as log_rows FROM email_send_logs;
