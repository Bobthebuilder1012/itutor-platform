-- =====================================================
-- FIX AND SEED SUBJECTS TABLE
-- =====================================================

-- Step 1: Add the unique constraint if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_subject_curriculum_level'
    ) THEN
        ALTER TABLE public.subjects 
        ADD CONSTRAINT unique_subject_curriculum_level 
        UNIQUE (name, curriculum, level);
    END IF;
END $$;

-- Step 2: Enable pg_trgm extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Step 3: Seed CSEC subjects (Forms 1-5)
INSERT INTO public.subjects (name, curriculum, level, code) VALUES
  -- Core CSEC subjects
  ('Mathematics', 'CSEC', 'Form 4-5', 'MATH'),
  ('English A', 'CSEC', 'Form 4-5', 'ENGA'),
  ('English B', 'CSEC', 'Form 4-5', 'ENGB'),
  ('Integrated Science', 'CSEC', 'Form 4-5', 'ISCI'),
  ('Physics', 'CSEC', 'Form 4-5', 'PHYS'),
  ('Chemistry', 'CSEC', 'Form 4-5', 'CHEM'),
  ('Biology', 'CSEC', 'Form 4-5', 'BIOL'),
  ('Spanish', 'CSEC', 'Form 4-5', 'SPAN'),
  ('French', 'CSEC', 'Form 4-5', 'FREN'),
  ('Information Technology', 'CSEC', 'Form 4-5', 'IT'),
  ('Additional Mathematics', 'CSEC', 'Form 4-5', 'ADDMATH'),
  ('Social Studies', 'CSEC', 'Form 4-5', 'SOCSTD'),
  ('Geography', 'CSEC', 'Form 4-5', 'GEOG'),
  ('History', 'CSEC', 'Form 4-5', 'HIST'),
  ('Economics', 'CSEC', 'Form 4-5', 'ECON'),
  ('Principles of Accounts', 'CSEC', 'Form 4-5', 'POA'),
  ('Principles of Business', 'CSEC', 'Form 4-5', 'POB'),
  ('Technical Drawing', 'CSEC', 'Form 4-5', 'TD'),
  ('Visual Arts', 'CSEC', 'Form 4-5', 'VARTS'),
  ('Music', 'CSEC', 'Form 4-5', 'MUSIC'),
  ('Physical Education & Sport', 'CSEC', 'Form 4-5', 'PE'),
  ('Food & Nutrition', 'CSEC', 'Form 4-5', 'FOODNUT'),
  ('Agricultural Science', 'CSEC', 'Form 4-5', 'AGRISCI'),
  ('Human & Social Biology', 'CSEC', 'Form 4-5', 'HSB')
ON CONFLICT (name, curriculum, level) DO NOTHING;

-- Step 4: Seed CAPE subjects (Unit 1 & Unit 2 / Lower 6 & Upper 6)
INSERT INTO public.subjects (name, curriculum, level, code) VALUES
  -- Pure Sciences
  ('Pure Mathematics Unit 1', 'CAPE', 'Unit 1', 'PMATH1'),
  ('Pure Mathematics Unit 2', 'CAPE', 'Unit 2', 'PMATH2'),
  ('Applied Mathematics Unit 1', 'CAPE', 'Unit 1', 'AMATH1'),
  ('Applied Mathematics Unit 2', 'CAPE', 'Unit 2', 'AMATH2'),
  ('Physics Unit 1', 'CAPE', 'Unit 1', 'PHYS1'),
  ('Physics Unit 2', 'CAPE', 'Unit 2', 'PHYS2'),
  ('Chemistry Unit 1', 'CAPE', 'Unit 1', 'CHEM1'),
  ('Chemistry Unit 2', 'CAPE', 'Unit 2', 'CHEM2'),
  ('Biology Unit 1', 'CAPE', 'Unit 1', 'BIOL1'),
  ('Biology Unit 2', 'CAPE', 'Unit 2', 'BIOL2'),
  
  -- Business & Social Sciences
  ('Economics Unit 1', 'CAPE', 'Unit 1', 'ECON1'),
  ('Economics Unit 2', 'CAPE', 'Unit 2', 'ECON2'),
  ('Accounting Unit 1', 'CAPE', 'Unit 1', 'ACCT1'),
  ('Accounting Unit 2', 'CAPE', 'Unit 2', 'ACCT2'),
  ('Management of Business Unit 1', 'CAPE', 'Unit 1', 'MOB1'),
  ('Management of Business Unit 2', 'CAPE', 'Unit 2', 'MOB2'),
  ('Geography Unit 1', 'CAPE', 'Unit 1', 'GEOG1'),
  ('Geography Unit 2', 'CAPE', 'Unit 2', 'GEOG2'),
  ('History Unit 1', 'CAPE', 'Unit 1', 'HIST1'),
  ('History Unit 2', 'CAPE', 'Unit 2', 'HIST2'),
  ('Sociology Unit 1', 'CAPE', 'Unit 1', 'SOC1'),
  ('Sociology Unit 2', 'CAPE', 'Unit 2', 'SOC2'),
  ('Law Unit 1', 'CAPE', 'Unit 1', 'LAW1'),
  ('Law Unit 2', 'CAPE', 'Unit 2', 'LAW2'),
  
  -- Languages & Literature
  ('Literatures in English Unit 1', 'CAPE', 'Unit 1', 'LIT1'),
  ('Literatures in English Unit 2', 'CAPE', 'Unit 2', 'LIT2'),
  ('Spanish Unit 1', 'CAPE', 'Unit 1', 'SPAN1'),
  ('Spanish Unit 2', 'CAPE', 'Unit 2', 'SPAN2'),
  ('French Unit 1', 'CAPE', 'Unit 1', 'FREN1'),
  ('French Unit 2', 'CAPE', 'Unit 2', 'FREN2'),
  
  -- Technical & Vocational
  ('Computer Science Unit 1', 'CAPE', 'Unit 1', 'CS1'),
  ('Computer Science Unit 2', 'CAPE', 'Unit 2', 'CS2'),
  ('Communication Studies Unit 1', 'CAPE', 'Unit 1', 'COMM1'),
  ('Communication Studies Unit 2', 'CAPE', 'Unit 2', 'COMM2'),
  ('Environmental Science Unit 1', 'CAPE', 'Unit 1', 'ENVSCI1'),
  ('Environmental Science Unit 2', 'CAPE', 'Unit 2', 'ENVSCI2')
ON CONFLICT (name, curriculum, level) DO NOTHING;

-- Step 5: Verify the data was inserted
SELECT COUNT(*) as total_subjects FROM public.subjects;

-- Step 6: Show a sample of the subjects
SELECT curriculum, COUNT(*) as subject_count 
FROM public.subjects 
GROUP BY curriculum 
ORDER BY curriculum;





