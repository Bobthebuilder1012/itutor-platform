-- =====================================================
-- FIX LESSON OFFER NOTIFICATION LINK
-- =====================================================
-- Updates the notification trigger to link directly to the offers section

-- Drop the old trigger first
DROP TRIGGER IF EXISTS on_lesson_offer_created ON public.lesson_offers;

-- Recreate the trigger with updated link
CREATE OR REPLACE FUNCTION notify_new_lesson_offer()
RETURNS TRIGGER AS $$
BEGIN
  -- Create notification for student with link to offers section
  INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
  VALUES (
    NEW.student_id,
    'lesson_offer_received',
    'New Lesson Offer',
    'You have received a new lesson offer',
    '/student/dashboard#lesson-offers',  -- Link to offers section with anchor
    jsonb_build_object(
      'offer_id', NEW.id,
      'tutor_id', NEW.tutor_id,
      'subject_id', NEW.subject_id,
      'proposed_start_at', NEW.proposed_start_at
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER on_lesson_offer_created
AFTER INSERT ON public.lesson_offers
FOR EACH ROW
EXECUTE FUNCTION notify_new_lesson_offer();

SELECT '✅ Notification link updated to scroll to offers section!' AS status;






