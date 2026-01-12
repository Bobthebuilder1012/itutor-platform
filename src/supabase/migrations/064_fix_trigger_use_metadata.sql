-- =====================================================
-- FIX TRIGGER TO USE USER METADATA
-- =====================================================
-- Update the handle_new_user trigger to extract signup
-- data from user_metadata and populate the profile
-- This allows the profile to be complete even when
-- email confirmation is required

BEGIN;

-- Drop the existing trigger function
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Create improved function that uses user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert profile with data from user metadata
  -- SECURITY DEFINER bypasses RLS
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    username,
    role,
    country,
    terms_accepted,
    terms_accepted_at,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'role',
    NEW.raw_user_meta_data->>'country',
    COALESCE((NEW.raw_user_meta_data->>'terms_accepted')::boolean, false),
    CASE 
      WHEN (NEW.raw_user_meta_data->>'terms_accepted')::boolean = true 
      THEN NOW()
      ELSE NULL
    END,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    -- Update with metadata if it was provided
    full_name = COALESCE(
      EXCLUDED.full_name,
      profiles.full_name
    ),
    username = COALESCE(
      EXCLUDED.username,
      profiles.username
    ),
    role = COALESCE(
      EXCLUDED.role,
      profiles.role
    ),
    country = COALESCE(
      EXCLUDED.country,
      profiles.country
    ),
    terms_accepted = COALESCE(
      EXCLUDED.terms_accepted,
      profiles.terms_accepted
    ),
    terms_accepted_at = COALESCE(
      EXCLUDED.terms_accepted_at,
      profiles.terms_accepted_at
    ),
    updated_at = NOW();
  
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

COMMIT;

-- This trigger now creates complete profiles using the metadata
-- passed during signup, so email confirmation doesn't block
-- profile completion

