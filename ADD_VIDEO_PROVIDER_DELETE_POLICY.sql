-- =====================================================
-- ADD DELETE POLICY FOR VIDEO PROVIDER CONNECTIONS
-- =====================================================
-- Allows tutors to disconnect their video provider
-- (needed for reconnecting with new encryption key)

-- Add DELETE policy for tutors to delete their own video connections
CREATE POLICY "Tutors can delete their own video connections"
ON public.tutor_video_provider_connections
FOR DELETE
TO authenticated
USING (tutor_id = auth.uid());

-- Verify the policy was created
SELECT 
    '✅ DELETE policy added successfully!' as status,
    schemaname, 
    tablename, 
    policyname, 
    cmd
FROM pg_policies
WHERE tablename = 'tutor_video_provider_connections'
AND cmd = 'DELETE';
