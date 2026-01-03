-- =====================================================
-- FIX RLS FOR PARENT VIEWING CHILD BOOKINGS
-- =====================================================
-- Parents need to be able to view bookings for their children

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view their own bookings" ON bookings;
DROP POLICY IF EXISTS "Tutors can view bookings" ON bookings;
DROP POLICY IF EXISTS "Students can view their bookings" ON bookings;
DROP POLICY IF EXISTS "Parents can view their children's bookings" ON bookings;

-- Policy for students to view their own bookings
CREATE POLICY "Students can view their own bookings"
ON bookings FOR SELECT
TO authenticated
USING (student_id = auth.uid());

-- Policy for tutors to view their bookings
CREATE POLICY "Tutors can view their bookings"
ON bookings FOR SELECT
TO authenticated
USING (tutor_id = auth.uid());

-- Policy for parents to view their children's bookings
CREATE POLICY "Parents can view their children's bookings"
ON bookings FOR SELECT
TO authenticated
USING (
    student_id IN (
        SELECT child_id 
        FROM parent_child_links 
        WHERE parent_id = auth.uid()
    )
);

-- Verification
SELECT 'Parent bookings RLS policies created!' AS status;






