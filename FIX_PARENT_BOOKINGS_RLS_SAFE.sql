-- =====================================================
-- FIX RLS FOR PARENT VIEWING CHILD BOOKINGS (SAFE)
-- =====================================================
-- Adds parent policy without touching existing ones

-- First, check if the parent policy exists
DO $$
BEGIN
    -- Drop parent policy if it exists
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'bookings' 
        AND policyname = 'Parents can view their children''s bookings'
    ) THEN
        DROP POLICY "Parents can view their children's bookings" ON bookings;
        RAISE NOTICE 'Dropped existing parent policy';
    END IF;
END $$;

-- Create the parent policy
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
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    roles
FROM pg_policies 
WHERE tablename = 'bookings'
ORDER BY policyname;













