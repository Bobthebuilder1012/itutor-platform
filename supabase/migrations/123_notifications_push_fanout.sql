-- =====================================================
-- NOTIFICATIONS PUSH FAN-OUT
-- =====================================================
-- Extends the notifications.type CHECK constraint to cover all new types,
-- and installs an AFTER INSERT trigger that asynchronously invokes the
-- send-push-on-notification Edge Function via pg_net so every in-app
-- notification automatically attempts a push delivery.

-- 0) Add columns that several routes already try to write to
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS group_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 1) Allow new notification type strings
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- existing / legacy
    'booking_request',
    'booking_request_received',
    'booking_accepted',
    'booking_confirmed',
    'booking_declined',
    'booking_counter_offer',
    'booking_cancelled',
    'new_message',
    'lesson_offer_received',
    'lesson_offer_accepted',
    -- new
    'session_reminder',
    'tutor_cancelled_session',
    'tutor_added_session',
    'new_class_member',
    'member_approved',
    'new_stream_post',
    'new_chat_message',
    'booking_offer',
    'counter_offer',
    'new_feedback',
    'rsvp_received'
  ));

-- 2) Ensure pg_net is available (Supabase exposes it as the `net` schema)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 3) Fan-out function: posts the new notification id to the Edge Function
CREATE OR REPLACE FUNCTION public.dispatch_push_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url text := 'https://thjsdcbzlvjradczhgso.supabase.co/functions/v1/send-push-on-notification';
  v_auth text := 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoanNkY2J6bHZqcmFkY3poZ3NvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NDA5MTQsImV4cCI6MjA5MDIxNjkxNH0.4LijqbJ0BugzWUwiZqF3_Lz1E79ect_sMCBtvxpl0jA';
BEGIN
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', v_auth
    ),
    body := jsonb_build_object('notification_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the inserting transaction
  RETURN NEW;
END;
$$;

-- 4) AFTER INSERT trigger
DROP TRIGGER IF EXISTS trigger_dispatch_push_for_notification ON public.notifications;
CREATE TRIGGER trigger_dispatch_push_for_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_push_for_notification();

NOTIFY pgrst, 'reload schema';
