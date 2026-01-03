-- =====================================================
-- AUTO-CREATE CONVERSATIONS ON BOOKING CONFIRMATION
-- When a booking is confirmed, create a conversation
-- =====================================================

-- Function to create or get conversation between tutor and student
CREATE OR REPLACE FUNCTION create_conversation_on_booking_confirmed()
RETURNS TRIGGER AS $$
DECLARE
  existing_conversation_id UUID;
BEGIN
  -- Only proceed if status changed to CONFIRMED
  IF NEW.status = 'CONFIRMED' AND (OLD.status IS NULL OR OLD.status != 'CONFIRMED') THEN
    
    -- Check if conversation already exists between these users
    SELECT id INTO existing_conversation_id
    FROM public.conversations
    WHERE (participant_1_id = NEW.student_id AND participant_2_id = NEW.tutor_id)
       OR (participant_1_id = NEW.tutor_id AND participant_2_id = NEW.student_id)
    LIMIT 1;
    
    -- If no conversation exists, create one
    IF existing_conversation_id IS NULL THEN
      INSERT INTO public.conversations (
        participant_1_id,
        participant_2_id,
        created_at
      ) VALUES (
        NEW.student_id,
        NEW.tutor_id,
        NOW()
      );
      
      RAISE NOTICE 'Created conversation between student % and tutor %', NEW.student_id, NEW.tutor_id;
    ELSE
      RAISE NOTICE 'Conversation already exists: %', existing_conversation_id;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on bookings table
DROP TRIGGER IF EXISTS trigger_create_conversation_on_booking_confirmed ON public.bookings;

CREATE TRIGGER trigger_create_conversation_on_booking_confirmed
AFTER INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION create_conversation_on_booking_confirmed();

-- =====================================================
-- BACKFILL: Create conversations for existing confirmed bookings
-- =====================================================

INSERT INTO public.conversations (participant_1_id, participant_2_id, created_at)
SELECT DISTINCT
  b.student_id,
  b.tutor_id,
  NOW()
FROM public.bookings b
WHERE b.status = 'CONFIRMED'
  AND NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE (c.participant_1_id = b.student_id AND c.participant_2_id = b.tutor_id)
       OR (c.participant_1_id = b.tutor_id AND c.participant_2_id = b.student_id)
  )
ON CONFLICT DO NOTHING;

-- =====================================================
-- VERIFY
-- =====================================================

-- Check how many conversations were created
SELECT COUNT(*) as conversation_count FROM public.conversations;

-- Check trigger exists
SELECT trigger_name, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_name = 'trigger_create_conversation_on_booking_confirmed';

-- ✅ Done! Conversations will now be auto-created when bookings are confirmed







