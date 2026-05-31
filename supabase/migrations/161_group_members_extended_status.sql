-- Extend group_members.status to support suspension and banning actions
-- performed by the tutor through the Class Hub roster.

-- Drop the existing inline check (auto-named group_members_status_check by PostgreSQL)
ALTER TABLE public.group_members
  DROP CONSTRAINT IF EXISTS group_members_status_check;

-- Add extended constraint with NOT VALID so existing rows are not scanned.
-- Only new/updated rows will be enforced going forward.
ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_status_check
  CHECK (status IN ('pending', 'approved', 'denied', 'suspended', 'banned', 'removed'))
  NOT VALID;

-- Extend notifications type constraint to include class-related notification types
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (
    type IN (
      'booking_request',
      'booking_accepted',
      'booking_declined',
      'booking_counter_offer',
      'booking_cancelled',
      'new_message',
      'SESSION_REMINDER',
      'ENROLLMENT_CONFIRMED',
      'NEW_ANNOUNCEMENT',
      'SESSION_CANCELLED',
      'NEW_REVIEW',
      'WAITLIST_AVAILABLE',
      'new_stream_post',
      'class_invite',
      'new_class_member'
    )
  )
  NOT VALID;
