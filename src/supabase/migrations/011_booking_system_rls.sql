-- =====================================================
-- RLS POLICIES FOR BOOKING SYSTEM
-- =====================================================

-- Enable RLS on all booking tables
ALTER TABLE public.tutor_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_unavailability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_response_metrics ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- TUTOR_AVAILABILITY_RULES
-- =====================================================

-- Tutors can manage their own rules
CREATE POLICY "Tutors can view own availability rules"
ON public.tutor_availability_rules
FOR SELECT
TO authenticated
USING (auth.uid() = tutor_id);

CREATE POLICY "Tutors can insert own availability rules"
ON public.tutor_availability_rules
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = tutor_id);

CREATE POLICY "Tutors can update own availability rules"
ON public.tutor_availability_rules
FOR UPDATE
TO authenticated
USING (auth.uid() = tutor_id)
WITH CHECK (auth.uid() = tutor_id);

CREATE POLICY "Tutors can delete own availability rules"
ON public.tutor_availability_rules
FOR DELETE
TO authenticated
USING (auth.uid() = tutor_id);

-- Students cannot read raw rules (they use public calendar RPC instead)

-- =====================================================
-- TUTOR_UNAVAILABILITY_BLOCKS
-- =====================================================

-- Tutors can manage their own unavailability blocks
CREATE POLICY "Tutors can view own unavailability blocks"
ON public.tutor_unavailability_blocks
FOR SELECT
TO authenticated
USING (auth.uid() = tutor_id);

CREATE POLICY "Tutors can insert own unavailability blocks"
ON public.tutor_unavailability_blocks
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = tutor_id);

CREATE POLICY "Tutors can update own unavailability blocks"
ON public.tutor_unavailability_blocks
FOR UPDATE
TO authenticated
USING (auth.uid() = tutor_id)
WITH CHECK (auth.uid() = tutor_id);

CREATE POLICY "Tutors can delete own unavailability blocks"
ON public.tutor_unavailability_blocks
FOR DELETE
TO authenticated
USING (auth.uid() = tutor_id);

-- Students cannot read blocks with private reasons (they use public calendar RPC)

-- =====================================================
-- SESSION_TYPES
-- =====================================================

-- Tutors can manage their session types
CREATE POLICY "Tutors can manage own session types"
ON public.session_types
FOR ALL
TO authenticated
USING (auth.uid() = tutor_id)
WITH CHECK (auth.uid() = tutor_id);

-- Students can view active session types for browsing/booking
CREATE POLICY "Students can view active session types"
ON public.session_types
FOR SELECT
TO authenticated
USING (is_active = true);

-- =====================================================
-- BOOKINGS
-- =====================================================

-- Students can view their own bookings
CREATE POLICY "Students can view own bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

-- Tutors can view bookings for them
CREATE POLICY "Tutors can view their bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (auth.uid() = tutor_id);

-- Students can create bookings (requests)
CREATE POLICY "Students can create booking requests"
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id);

-- Students can update their own bookings (cancel)
CREATE POLICY "Students can update own bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (auth.uid() = student_id)
WITH CHECK (auth.uid() = student_id);

-- Tutors can update their bookings (confirm, decline, etc.)
CREATE POLICY "Tutors can update their bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (auth.uid() = tutor_id)
WITH CHECK (auth.uid() = tutor_id);

-- =====================================================
-- BOOKING_MESSAGES
-- =====================================================

-- Participants can view messages for their bookings
CREATE POLICY "Participants can view booking messages"
ON public.booking_messages
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.bookings
        WHERE bookings.id = booking_messages.booking_id
        AND (bookings.student_id = auth.uid() OR bookings.tutor_id = auth.uid())
    )
);

-- Participants can send messages
CREATE POLICY "Participants can send booking messages"
ON public.booking_messages
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
        SELECT 1 FROM public.bookings
        WHERE bookings.id = booking_messages.booking_id
        AND (bookings.student_id = auth.uid() OR bookings.tutor_id = auth.uid())
    )
);

-- =====================================================
-- TUTOR_RESPONSE_METRICS
-- =====================================================

-- Anyone can view metrics (for displaying on tutor profiles)
CREATE POLICY "Anyone can view tutor metrics"
ON public.tutor_response_metrics
FOR SELECT
TO authenticated
USING (true);

-- Only system/admins should update metrics (via functions)
-- For now, allow tutors to view their own
CREATE POLICY "Tutors can view own metrics"
ON public.tutor_response_metrics
FOR SELECT
TO authenticated
USING (auth.uid() = tutor_id);

-- Verify policies
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN (
    'tutor_availability_rules',
    'tutor_unavailability_blocks',
    'session_types',
    'bookings',
    'booking_messages',
    'tutor_response_metrics'
)
ORDER BY tablename, policyname;







