-- =====================================================
-- FIX PROFILE CREATION TRIGGER - HANDLE CONSTRAINTS
-- =====================================================
-- The previous trigger was failing because of NOT NULL constraints
-- This version handles all required fields properly

BEGIN;

-- Drop the old trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create improved function that handles all constraints
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only create profile if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    INSERT INTO public.profiles (
      id,
      email,
      full_name,
      role,
      username,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      NULL,  -- Role will be set by the signup flow
      NULL,  -- Username will be set by the signup flow
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;  -- Prevent duplicate insert errors
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the signup
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Make sure username can be NULL temporarily during signup
ALTER TABLE public.profiles 
  ALTER COLUMN username DROP NOT NULL;

-- Make sure role can be NULL temporarily during signup  
ALTER TABLE public.profiles 
  ALTER COLUMN role DROP NOT NULL;

COMMENT ON FUNCTION public.handle_new_user IS 'Automatically creates a basic profile when a new user signs up, with role and username to be filled in by signup flow';

COMMIT;









