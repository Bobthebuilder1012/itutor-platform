-- =====================================================
-- FIX SUBJECTS TABLE AND RLS POLICIES
-- Run this in Supabase SQL Editor
-- =====================================================

-- Step 1: Check if subjects table has RLS enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'subjects';

-- Step 2: Enable RLS on subjects table (if not already enabled)
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop existing policies (to avoid conflicts)
DROP POLICY IF EXISTS "Anyone can read subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admins can insert subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admins can update subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admins can delete subjects" ON public.subjects;

-- Step 4: Create RLS policy for public read access
CREATE POLICY "Anyone can read subjects"
ON public.subjects FOR SELECT
USING (true);

-- Step 5: Create admin-only policies for write operations
CREATE POLICY "Admins can insert subjects"
ON public.subjects FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can update subjects"
ON public.subjects FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can delete subjects"
ON public.subjects FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Step 6: Check existing unique constraints
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'public.subjects'::regclass 
  AND contype = 'u';

-- Step 7: Clear existing subjects (optional - uncomment if you want to start fresh)
-- DELETE FROM public.subjects;

-- Step 7b: Check current subjects count
SELECT COUNT(*) as total_subjects FROM public.subjects;

-- Step 8: Seed CSEC subjects (if table is empty)
INSERT INTO public.subjects (name, label, curriculum, level, code) VALUES
  ('Mathematics', 'Mathematics (CSEC)', 'CSEC', 'CSEC', 'MATH'),
  ('English A', 'English A (CSEC)', 'CSEC', 'CSEC', 'ENGA'),
  ('English B', 'English B (CSEC)', 'CSEC', 'CSEC', 'ENGB'),
  ('Integrated Science', 'Integrated Science (CSEC)', 'CSEC', 'CSEC', 'ISCI'),
  ('Physics', 'Physics (CSEC)', 'CSEC', 'CSEC', 'PHYS'),
  ('Chemistry', 'Chemistry (CSEC)', 'CSEC', 'CSEC', 'CHEM'),
  ('Biology', 'Biology (CSEC)', 'CSEC', 'CSEC', 'BIOL'),
  ('Spanish', 'Spanish (CSEC)', 'CSEC', 'CSEC', 'SPAN'),
  ('French', 'French (CSEC)', 'CSEC', 'CSEC', 'FREN'),
  ('Information Technology', 'Information Technology (CSEC)', 'CSEC', 'CSEC', 'IT'),
  ('Additional Mathematics', 'Additional Mathematics (CSEC)', 'CSEC', 'CSEC', 'ADDMATH'),
  ('Social Studies', 'Social Studies (CSEC)', 'CSEC', 'CSEC', 'SOCSTD'),
  ('Geography', 'Geography (CSEC)', 'CSEC', 'CSEC', 'GEOG'),
  ('History', 'History (CSEC)', 'CSEC', 'CSEC', 'HIST'),
  ('Economics', 'Economics (CSEC)', 'CSEC', 'CSEC', 'ECON'),
  ('Principles of Accounts', 'Principles of Accounts (CSEC)', 'CSEC', 'CSEC', 'POA'),
  ('Principles of Business', 'Principles of Business (CSEC)', 'CSEC', 'CSEC', 'POB'),
  ('Technical Drawing', 'Technical Drawing (CSEC)', 'CSEC', 'CSEC', 'TD'),
  ('Visual Arts', 'Visual Arts (CSEC)', 'CSEC', 'CSEC', 'VARTS'),
  ('Music', 'Music (CSEC)', 'CSEC', 'CSEC', 'MUSIC'),
  ('Physical Education & Sport', 'Physical Education & Sport (CSEC)', 'CSEC', 'CSEC', 'PE'),
  ('Food & Nutrition', 'Food & Nutrition (CSEC)', 'CSEC', 'CSEC', 'FOODNUT'),
  ('Agricultural Science', 'Agricultural Science (CSEC)', 'CSEC', 'CSEC', 'AGRISCI'),
  ('Human & Social Biology', 'Human & Social Biology (CSEC)', 'CSEC', 'CSEC', 'HSB')
ON CONFLICT (curriculum, name) DO NOTHING;

-- Step 9: Seed CAPE subjects
INSERT INTO public.subjects (name, label, curriculum, level, code) VALUES
  ('Pure Mathematics Unit 1', 'Pure Mathematics (CAPE Unit 1)', 'CAPE', 'CAPE', 'PMATH1'),
  ('Pure Mathematics Unit 2', 'Pure Mathematics (CAPE Unit 2)', 'CAPE', 'CAPE', 'PMATH2'),
  ('Applied Mathematics Unit 1', 'Applied Mathematics (CAPE Unit 1)', 'CAPE', 'CAPE', 'AMATH1'),
  ('Applied Mathematics Unit 2', 'Applied Mathematics (CAPE Unit 2)', 'CAPE', 'CAPE', 'AMATH2'),
  ('Physics Unit 1', 'Physics (CAPE Unit 1)', 'CAPE', 'CAPE', 'PHYS1'),
  ('Physics Unit 2', 'Physics (CAPE Unit 2)', 'CAPE', 'CAPE', 'PHYS2'),
  ('Chemistry Unit 1', 'Chemistry (CAPE Unit 1)', 'CAPE', 'CAPE', 'CHEM1'),
  ('Chemistry Unit 2', 'Chemistry (CAPE Unit 2)', 'CAPE', 'CAPE', 'CHEM2'),
  ('Biology Unit 1', 'Biology (CAPE Unit 1)', 'CAPE', 'CAPE', 'BIOL1'),
  ('Biology Unit 2', 'Biology (CAPE Unit 2)', 'CAPE', 'CAPE', 'BIOL2'),
  ('Economics Unit 1', 'Economics (CAPE Unit 1)', 'CAPE', 'CAPE', 'ECON1'),
  ('Economics Unit 2', 'Economics (CAPE Unit 2)', 'CAPE', 'CAPE', 'ECON2'),
  ('Accounting Unit 1', 'Accounting (CAPE Unit 1)', 'CAPE', 'CAPE', 'ACCT1'),
  ('Accounting Unit 2', 'Accounting (CAPE Unit 2)', 'CAPE', 'CAPE', 'ACCT2'),
  ('Management of Business Unit 1', 'Management of Business (CAPE Unit 1)', 'CAPE', 'CAPE', 'MOB1'),
  ('Management of Business Unit 2', 'Management of Business (CAPE Unit 2)', 'CAPE', 'CAPE', 'MOB2'),
  ('Geography Unit 1', 'Geography (CAPE Unit 1)', 'CAPE', 'CAPE', 'GEOG1'),
  ('Geography Unit 2', 'Geography (CAPE Unit 2)', 'CAPE', 'CAPE', 'GEOG2'),
  ('History Unit 1', 'History (CAPE Unit 1)', 'CAPE', 'CAPE', 'HIST1'),
  ('History Unit 2', 'History (CAPE Unit 2)', 'CAPE', 'CAPE', 'HIST2'),
  ('Sociology Unit 1', 'Sociology (CAPE Unit 1)', 'CAPE', 'CAPE', 'SOC1'),
  ('Sociology Unit 2', 'Sociology (CAPE Unit 2)', 'CAPE', 'CAPE', 'SOC2'),
  ('Law Unit 1', 'Law (CAPE Unit 1)', 'CAPE', 'CAPE', 'LAW1'),
  ('Law Unit 2', 'Law (CAPE Unit 2)', 'CAPE', 'CAPE', 'LAW2'),
  ('Communication Studies Unit 1', 'Communication Studies (CAPE Unit 1)', 'CAPE', 'CAPE', 'COMM1'),
  ('Communication Studies Unit 2', 'Communication Studies (CAPE Unit 2)', 'CAPE', 'CAPE', 'COMM2'),
  ('Literatures in English Unit 1', 'Literatures in English (CAPE Unit 1)', 'CAPE', 'CAPE', 'LIT1'),
  ('Literatures in English Unit 2', 'Literatures in English (CAPE Unit 2)', 'CAPE', 'CAPE', 'LIT2'),
  ('Spanish Unit 1', 'Spanish (CAPE Unit 1)', 'CAPE', 'CAPE', 'SPAN1'),
  ('Spanish Unit 2', 'Spanish (CAPE Unit 2)', 'CAPE', 'CAPE', 'SPAN2'),
  ('French Unit 1', 'French (CAPE Unit 1)', 'CAPE', 'CAPE', 'FREN1'),
  ('French Unit 2', 'French (CAPE Unit 2)', 'CAPE', 'CAPE', 'FREN2'),
  ('Computer Science Unit 1', 'Computer Science (CAPE Unit 1)', 'CAPE', 'CAPE', 'CS1'),
  ('Computer Science Unit 2', 'Computer Science (CAPE Unit 2)', 'CAPE', 'CAPE', 'CS2'),
  ('Environmental Science Unit 1', 'Environmental Science (CAPE Unit 1)', 'CAPE', 'CAPE', 'ENVSCI1'),
  ('Environmental Science Unit 2', 'Environmental Science (CAPE Unit 2)', 'CAPE', 'CAPE', 'ENVSCI2')
ON CONFLICT (curriculum, name) DO NOTHING;

-- Step 10: Verify subjects were added
SELECT curriculum, COUNT(*) as subject_count 
FROM public.subjects 
GROUP BY curriculum;

-- Step 11: Test that anonymous users can read subjects
-- (Run this in an unauthenticated session to verify RLS)
SELECT COUNT(*) as accessible_subjects FROM public.subjects;

