-- =====================================================
-- LESSON OFFERS SYSTEM
-- =====================================================
-- Allows tutors to send lesson offers to students
-- Students can accept, decline, or counter-offer

-- 1. Create lesson_offers table
CREATE TABLE IF NOT EXISTS public.lesson_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tutor_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  proposed_start TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'countered', 'expired')),
  counter_proposed_start TIMESTAMPTZ,
  counter_duration_minutes INTEGER,
  counter_note TEXT,
  last_action_by TEXT CHECK (last_action_by IN ('tutor', 'student')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_duration CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  CONSTRAINT valid_counter_duration CHECK (counter_duration_minutes IS NULL OR (counter_duration_minutes > 0 AND counter_duration_minutes <= 480))
);

-- 2. Create indexes for performance
CREATE INDEX idx_lesson_offers_tutor ON public.lesson_offers(tutor_user_id, status);
CREATE INDEX idx_lesson_offers_student ON public.lesson_offers(student_user_id, status);
CREATE INDEX idx_lesson_offers_status ON public.lesson_offers(status);
CREATE INDEX idx_lesson_offers_created ON public.lesson_offers(created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.lesson_offers ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies if any
DROP POLICY IF EXISTS "Tutors can view their sent offers" ON public.lesson_offers;
DROP POLICY IF EXISTS "Students can view their received offers" ON public.lesson_offers;
DROP POLICY IF EXISTS "Tutors can create offers" ON public.lesson_offers;
DROP POLICY IF EXISTS "Tutors can update their sent offers" ON public.lesson_offers;
DROP POLICY IF EXISTS "Students can update their received offers" ON public.lesson_offers;
DROP POLICY IF EXISTS "Users can delete their own offers" ON public.lesson_offers;

-- 5. Create RLS policies

-- Tutors can view offers they sent
CREATE POLICY "Tutors can view their sent offers"
ON public.lesson_offers FOR SELECT
TO authenticated
USING (
  tutor_user_id = auth.uid()
);

-- Students can view offers they received
CREATE POLICY "Students can view their received offers"
ON public.lesson_offers FOR SELECT
TO authenticated
USING (
  student_user_id = auth.uid()
);

-- Tutors can create offers (must be a tutor role)
CREATE POLICY "Tutors can create offers"
ON public.lesson_offers FOR INSERT
TO authenticated
WITH CHECK (
  tutor_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'tutor'
  )
);

-- Tutors can update their sent offers (only for counter-offer responses)
CREATE POLICY "Tutors can update their sent offers"
ON public.lesson_offers FOR UPDATE
TO authenticated
USING (
  tutor_user_id = auth.uid()
)
WITH CHECK (
  tutor_user_id = auth.uid()
);

-- Students can update offers they received (to accept/decline/counter)
CREATE POLICY "Students can update their received offers"
ON public.lesson_offers FOR UPDATE
TO authenticated
USING (
  student_user_id = auth.uid()
)
WITH CHECK (
  student_user_id = auth.uid()
);

-- Users can delete offers they're involved in (before acceptance)
CREATE POLICY "Users can delete their own offers"
ON public.lesson_offers FOR DELETE
TO authenticated
USING (
  (tutor_user_id = auth.uid() OR student_user_id = auth.uid())
  AND status IN ('pending', 'countered')
);

-- 6. Create updated_at trigger
CREATE OR REPLACE FUNCTION update_lesson_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_lesson_offers_updated_at
BEFORE UPDATE ON public.lesson_offers
FOR EACH ROW
EXECUTE FUNCTION update_lesson_offers_updated_at();

-- 7. Create notification trigger for new offers
CREATE OR REPLACE FUNCTION notify_new_lesson_offer()
RETURNS TRIGGER AS $$
BEGIN
  -- Create notification for student
  INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
  VALUES (
    NEW.student_user_id,
    'lesson_offer_received',
    'New Lesson Offer',
    'You have received a new lesson offer',
    '/student/offers',
    jsonb_build_object(
      'offer_id', NEW.id,
      'tutor_id', NEW.tutor_user_id,
      'subject', NEW.subject,
      'proposed_start', NEW.proposed_start
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_lesson_offer_created
AFTER INSERT ON public.lesson_offers
FOR EACH ROW
EXECUTE FUNCTION notify_new_lesson_offer();

-- 8. Create notification trigger for offer status changes
CREATE OR REPLACE FUNCTION notify_lesson_offer_status_change()
RETURNS TRIGGER AS $$
DECLARE
  notify_user_id UUID;
  notification_type TEXT;
  notification_title TEXT;
  notification_message TEXT;
BEGIN
  -- Only notify on status change
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Determine who to notify and what to say
  IF NEW.status = 'accepted' THEN
    notify_user_id := NEW.tutor_user_id;
    notification_type := 'lesson_offer_accepted';
    notification_title := 'Offer Accepted!';
    notification_message := 'Your lesson offer has been accepted';
  ELSIF NEW.status = 'declined' THEN
    notify_user_id := NEW.tutor_user_id;
    notification_type := 'lesson_offer_declined';
    notification_title := 'Offer Declined';
    notification_message := 'Your lesson offer was declined';
  ELSIF NEW.status = 'countered' THEN
    notify_user_id := NEW.tutor_user_id;
    notification_type := 'lesson_offer_countered';
    notification_title := 'Counter-Offer Received';
    notification_message := 'The student has sent a counter-offer';
  END IF;
  
  -- Create notification
  IF notify_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link, metadata)
    VALUES (
      notify_user_id,
      notification_type,
      notification_title,
      notification_message,
      '/tutor/offers',
      jsonb_build_object(
        'offer_id', NEW.id,
        'student_id', NEW.student_user_id,
        'subject', NEW.subject,
        'status', NEW.status
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_lesson_offer_status_change
AFTER UPDATE ON public.lesson_offers
FOR EACH ROW
EXECUTE FUNCTION notify_lesson_offer_status_change();

-- 9. Verify setup
SELECT 'Lesson offers table created successfully' AS status;













