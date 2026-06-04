-- =====================================================
-- PAYMENT RECEIPT EMAIL TRIGGER
-- =====================================================
-- Fires the send-payment-receipt edge function via pg_net
-- immediately after payments.status transitions to 'succeeded'.
-- pg_net is enabled by default on all Supabase projects.

CREATE OR REPLACE FUNCTION public.trigger_payment_receipt_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'succeeded' AND (OLD.status IS NULL OR OLD.status <> 'succeeded') THEN
    PERFORM net.http_post(
      url     := 'https://nfkrfciozjxrodkusrhh.supabase.co/functions/v1/send-payment-receipt',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ma3JmY2lvemp4cm9ka3VzcmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NjM3NDQsImV4cCI6MjA4MDQzOTc0NH0.3V31jk286c4TGqC4zio3sB6wxOqAMCbDChOysh8b-D8"}'::jsonb,
      body    := jsonb_build_object('payment_id', NEW.id)::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_receipt_email_trigger ON public.payments;

CREATE TRIGGER payment_receipt_email_trigger
  AFTER UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_payment_receipt_email();
