-- =====================================================
-- FIX PROFILE CREATION FOR SIGNUP FLOW
-- =====================================================
-- The trigger-based approach wasn't working reliably because RLS blocks
-- the trigger from inserting. Instead, we'll temporarily disable RLS
-- for profile creation during signup by allowing inserts from both
-- authenticated users AND unauthenticated contexts (for the brief moment
-- between auth.users creation and session establishment).

BEGIN;

-- First, let's fix the trigger function to work around RLS
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recreate the trigger function with proper RLS bypass
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert profile with RLS effectively bypassed via SECURITY DEFINER
  -- and explicit INSERT from a function that runs as the DB owner
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the signup
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Now fix the INSERT policy to allow both trigger and client-side inserts
DROP POLICY IF EXISTS "profiles_user_insert_own_v2" ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_role_insert_v2" ON public.profiles;

-- Create a policy that allows profile creation from client side too
-- This is needed because the trigger might not complete before the client checks
CREATE POLICY "profiles_insert_own_or_new_user_v3"
ON public.profiles FOR INSERT
WITH CHECK (
  -- Allow authenticated users to insert their own profile
  (auth.uid() IS NOT NULL AND id = auth.uid())
  OR
  -- Allow inserts for NEW auth users (id exists in auth.users but no session yet)
  -- This covers the brief window between signup and email confirmation
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = profiles.id 
    AND auth.users.created_at > (NOW() - INTERVAL '5 minutes')
  )
);

-- Service role policy for admin operations
CREATE POLICY "profiles_service_role_insert_v3"
ON public.profiles FOR INSERT
TO service_role
WITH CHECK (true);

COMMIT;

