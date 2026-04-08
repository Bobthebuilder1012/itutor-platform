-- =====================================================
-- NOTIFICATIONS AND MESSAGING SYSTEM
-- Real-time notifications + inbox for tutors & students
-- =====================================================

-- 1) NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN (
        'booking_request',
        'booking_accepted',
        'booking_declined',
        'booking_counter_offer',
        'booking_cancelled',
        'new_message'
    )),
    title text NOT NULL,
    message text NOT NULL,
    link text, -- URL to navigate to
    related_booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
    related_message_id uuid REFERENCES public.booking_messages(id) ON DELETE CASCADE,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own notifications
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- System can insert notifications (via triggers/functions)
CREATE POLICY "System can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 2) CONVERSATIONS TABLE (for direct messaging)
CREATE TABLE IF NOT EXISTS public.conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_1_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    participant_2_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_message_at timestamptz,
    last_message_preview text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    -- Ensure unique conversation between two users
    CONSTRAINT unique_conversation UNIQUE (participant_1_id, participant_2_id),
    -- Ensure participants are different
    CONSTRAINT different_participants CHECK (participant_1_id != participant_2_id)
);

CREATE INDEX idx_conversations_participant1 ON public.conversations(participant_1_id, last_message_at DESC);
CREATE INDEX idx_conversations_participant2 ON public.conversations(participant_2_id, last_message_at DESC);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can see conversations they're part of
CREATE POLICY "Users can view their conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

CREATE POLICY "Users can create conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

CREATE POLICY "Users can update their conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

-- 3) DIRECT MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content text NOT NULL,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can see messages in their conversations
CREATE POLICY "Users can view messages in their conversations"
ON public.messages
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.conversations
        WHERE id = conversation_id
        AND (participant_1_id = auth.uid() OR participant_2_id = auth.uid())
    )
);

CREATE POLICY "Users can send messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.conversations
        WHERE id = conversation_id
        AND (participant_1_id = auth.uid() OR participant_2_id = auth.uid())
    )
);

-- 4) TRIGGER: Update conversation on new message
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.conversations
    SET 
        last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.content, 100),
        updated_at = now()
    WHERE id = NEW.conversation_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_conversation_on_message
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_on_message();

-- 5) TRIGGER: Create notification on new booking request
CREATE OR REPLACE FUNCTION notify_on_booking_request()
RETURNS TRIGGER AS $$
DECLARE
    v_student_name text;
    v_subject_name text;
BEGIN
    -- Only for new PENDING bookings
    IF NEW.status = 'PENDING' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        -- Get student name
        SELECT COALESCE(display_name, username, full_name) INTO v_student_name
        FROM public.profiles WHERE id = NEW.student_id;
        
        -- Get subject name
        SELECT COALESCE(label, name) INTO v_subject_name
        FROM public.subjects WHERE id = NEW.subject_id;
        
        -- Create notification for tutor
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            message,
            link,
            related_booking_id
        ) VALUES (
            NEW.tutor_id,
            'booking_request',
            'New Booking Request',
            v_student_name || ' wants to book a ' || v_subject_name || ' session',
            '/tutor/bookings/' || NEW.id,
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_on_booking_request
    AFTER INSERT OR UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_booking_request();

-- 6) TRIGGER: Create notification on booking status change
CREATE OR REPLACE FUNCTION notify_on_booking_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_tutor_name text;
    v_subject_name text;
    v_notif_type text;
    v_notif_title text;
    v_notif_message text;
BEGIN
    -- Only notify on status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Get tutor name
        SELECT COALESCE(display_name, username, full_name) INTO v_tutor_name
        FROM public.profiles WHERE id = NEW.tutor_id;
        
        -- Get subject name
        SELECT COALESCE(label, name) INTO v_subject_name
        FROM public.subjects WHERE id = NEW.subject_id;
        
        -- Determine notification type and message
        CASE NEW.status
            WHEN 'CONFIRMED' THEN
                v_notif_type := 'booking_accepted';
                v_notif_title := 'Booking Accepted! ✅';
                v_notif_message := v_tutor_name || ' accepted your ' || v_subject_name || ' session';
            WHEN 'DECLINED' THEN
                v_notif_type := 'booking_declined';
                v_notif_title := 'Booking Declined';
                v_notif_message := v_tutor_name || ' declined your ' || v_subject_name || ' session';
            WHEN 'COUNTER_PROPOSED' THEN
                v_notif_type := 'booking_counter_offer';
                v_notif_title := 'New Time Proposed';
                v_notif_message := v_tutor_name || ' proposed a different time for your ' || v_subject_name || ' session';
            WHEN 'CANCELLED' THEN
                v_notif_type := 'booking_cancelled';
                v_notif_title := 'Booking Cancelled';
                v_notif_message := 'Your ' || v_subject_name || ' session was cancelled';
            ELSE
                RETURN NEW; -- Don't notify for other statuses
        END CASE;
        
        -- Create notification for student
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            message,
            link,
            related_booking_id
        ) VALUES (
            NEW.student_id,
            v_notif_type,
            v_notif_title,
            v_notif_message,
            '/student/bookings/' || NEW.id,
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_on_booking_status_change
    AFTER UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_booking_status_change();

-- 7) TRIGGER: Create notification on new booking message
CREATE OR REPLACE FUNCTION notify_on_booking_message()
RETURNS TRIGGER AS $$
DECLARE
    v_booking record;
    v_recipient_id uuid;
    v_sender_name text;
    v_is_tutor boolean;
BEGIN
    -- Get booking info
    SELECT * INTO v_booking
    FROM public.bookings WHERE id = NEW.booking_id;
    
    -- Determine recipient (the person who DIDN'T send the message)
    IF NEW.sender_id = v_booking.student_id THEN
        v_recipient_id := v_booking.tutor_id;
        v_is_tutor := true;
    ELSE
        v_recipient_id := v_booking.student_id;
        v_is_tutor := false;
    END IF;
    
    -- Get sender name
    SELECT COALESCE(display_name, username, full_name) INTO v_sender_name
    FROM public.profiles WHERE id = NEW.sender_id;
    
    -- Create notification for recipient
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        link,
        related_booking_id,
        related_message_id
    ) VALUES (
        v_recipient_id,
        'new_message',
        'New Message',
        v_sender_name || ': ' || LEFT(COALESCE(NEW.body, 'Sent a time proposal'), 50),
        CASE 
            WHEN v_is_tutor THEN '/tutor/bookings/' || NEW.booking_id
            ELSE '/student/bookings/' || NEW.booking_id
        END,
        NEW.booking_id,
        NEW.id
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_on_booking_message
    AFTER INSERT ON public.booking_messages
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_booking_message();

-- 8) Trigger for conversations updated_at
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Verify tables created
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('notifications', 'conversations', 'messages')
ORDER BY tablename;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  NOTIFICATIONS & MESSAGING COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✓ Notifications table created';
    RAISE NOTICE '✓ Conversations table created';
    RAISE NOTICE '✓ Messages table created';
    RAISE NOTICE '✓ Real-time triggers installed';
    RAISE NOTICE '✓ RLS policies configured';
    RAISE NOTICE '';
    RAISE NOTICE 'Features enabled:';
    RAISE NOTICE '- Booking request notifications';
    RAISE NOTICE '- Status change notifications';
    RAISE NOTICE '- Message notifications';
    RAISE NOTICE '- Direct messaging inbox';
    RAISE NOTICE '';
END $$;














