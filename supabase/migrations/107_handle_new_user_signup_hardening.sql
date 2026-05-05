-- Harden handle_new_user so email/password signup never inserts NULL role/username
-- (avoids NOT NULL / CHECK failures that can surface as Auth 500 on some setups).

BEGIN;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_full_name text;
  v_username text;
  v_role text;
  v_country text;
BEGIN
  v_full_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
    split_part(NEW.email, '@', 1)
  );

  v_role := lower(COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'role'), ''), 'student'));
  IF v_role NOT IN ('student', 'parent', 'tutor', 'admin') THEN
    v_role := 'student';
  END IF;

  v_username := NULLIF(trim(NEW.raw_user_meta_data->>'username'), '');
  IF v_username IS NULL THEN
    v_username := 'user_' || replace(NEW.id::text, '-', '');
  END IF;

  v_country := NULLIF(trim(NEW.raw_user_meta_data->>'country'), '');

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
    v_full_name,
    v_username,
    v_role,
    v_country,
    COALESCE((NEW.raw_user_meta_data->>'terms_accepted')::boolean, false),
    CASE
      WHEN (NEW.raw_user_meta_data->>'terms_accepted')::boolean = true THEN NOW()
      ELSE NULL
    END,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    username = COALESCE(EXCLUDED.username, profiles.username),
    role = COALESCE(EXCLUDED.role, profiles.role),
    country = COALESCE(EXCLUDED.country, profiles.country),
    terms_accepted = COALESCE(EXCLUDED.terms_accepted, profiles.terms_accepted),
    terms_accepted_at = COALESCE(EXCLUDED.terms_accepted_at, profiles.terms_accepted_at),
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMIT;
