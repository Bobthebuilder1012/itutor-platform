-- =====================================================
-- ADD USERNAME AND DISPLAY_NAME TO PROFILES
-- =====================================================
-- USERNAME: Mandatory, unique (e.g., "joshua_solomon_314")
-- DISPLAY_NAME: Optional (e.g., "Joshua Solomon"), falls back to username if not provided
-- =====================================================

-- Step 1: Add columns (username nullable first for existing data)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS username text UNIQUE,
ADD COLUMN IF NOT EXISTS display_name text;

-- Step 2: Generate usernames for existing users (from email prefix)
UPDATE public.profiles
SET username = LOWER(REPLACE(REPLACE(SPLIT_PART(email, '@', 1), '.', '_'), '+', '_'))
WHERE username IS NULL;

-- Step 3: Handle duplicate usernames by adding suffix
DO $$
DECLARE
    rec RECORD;
    new_username text;
    counter int;
BEGIN
    FOR rec IN 
        SELECT id, username
        FROM public.profiles
        WHERE username IN (
            SELECT username 
            FROM public.profiles 
            GROUP BY username 
            HAVING COUNT(*) > 1
        )
        ORDER BY created_at
    LOOP
        counter := 1;
        new_username := rec.username || '_' || counter;
        
        WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = new_username) LOOP
            counter := counter + 1;
            new_username := rec.username || '_' || counter;
        END LOOP;
        
        UPDATE public.profiles 
        SET username = new_username 
        WHERE id = rec.id;
    END LOOP;
END $$;

-- Step 4: Make username NOT NULL now that all rows have values
ALTER TABLE public.profiles 
ALTER COLUMN username SET NOT NULL;

-- Step 5: Add constraints
ALTER TABLE public.profiles
ADD CONSTRAINT username_not_empty CHECK (username <> '');

ALTER TABLE public.profiles
ADD CONSTRAINT display_name_not_empty CHECK (display_name IS NULL OR display_name <> '');

-- Step 6: Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- Step 7: Optionally copy full_name to display_name for existing users
-- (They can change it later if they want just their username shown)
UPDATE public.profiles 
SET display_name = full_name 
WHERE display_name IS NULL AND full_name IS NOT NULL AND full_name <> '';

-- Verify the changes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'profiles'
  AND column_name IN ('username', 'display_name', 'full_name', 'email')
ORDER BY ordinal_position;
