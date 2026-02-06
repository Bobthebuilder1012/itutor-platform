-- =====================================================
-- AUTOMATED ONBOARDING EMAIL SYSTEM - DATABASE SETUP
-- =====================================================
-- Creates tables for managing automated email sequences

-- 1. Email Queue Table
-- Tracks scheduled emails for each user
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
-- Records all automated emails sent for tracking and debugging
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_queue_user_id ON onboarding_email_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_queue_status ON onboarding_email_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_scheduled ON onboarding_email_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_queue_user_stage ON onboarding_email_queue(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON email_send_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_sent_at ON email_send_logs(sent_at);

-- Enable RLS
ALTER TABLE onboarding_email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_send_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for onboarding_email_queue
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

-- RLS Policies for email_send_logs
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

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for onboarding_email_queue
DROP TRIGGER IF EXISTS update_queue_updated_at ON onboarding_email_queue;
CREATE TRIGGER update_queue_updated_at
  BEFORE UPDATE ON onboarding_email_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Verify tables created
SELECT 
  'onboarding_email_queue' as table_name,
  COUNT(*) as row_count
FROM onboarding_email_queue
UNION ALL
SELECT 
  'email_send_logs' as table_name,
  COUNT(*) as row_count
FROM email_send_logs;
