-- =====================================================
-- SEED SUBJECTS WITH LABEL COLUMN
-- =====================================================

-- Add the unique constraint if it doesn't exist
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

-- Seed CSEC subjects
INSERT INTO public.subjects (name, label, curriculum, level, code) VALUES
  ('Mathematics', 'Mathematics', 'CSEC', 'Form 4-5', 'MATH'),
  ('English A', 'English A', 'CSEC', 'Form 4-5', 'ENGA'),
  ('English B', 'English B', 'CSEC', 'Form 4-5', 'ENGB'),
  ('Integrated Science', 'Integrated Science', 'CSEC', 'Form 4-5', 'ISCI'),
  ('Physics', 'Physics', 'CSEC', 'Form 4-5', 'PHYS'),
  ('Chemistry', 'Chemistry', 'CSEC', 'Form 4-5', 'CHEM'),
  ('Biology', 'Biology', 'CSEC', 'Form 4-5', 'BIOL'),
  ('Spanish', 'Spanish', 'CSEC', 'Form 4-5', 'SPAN'),
  ('French', 'French', 'CSEC', 'Form 4-5', 'FREN'),
  ('Information Technology', 'Information Technology', 'CSEC', 'Form 4-5', 'IT'),
  ('Additional Mathematics', 'Additional Mathematics', 'CSEC', 'Form 4-5', 'ADDMATH'),
  ('Social Studies', 'Social Studies', 'CSEC', 'Form 4-5', 'SOCSTD'),
  ('Geography', 'Geography', 'CSEC', 'Form 4-5', 'GEOG'),
  ('History', 'History', 'CSEC', 'Form 4-5', 'HIST'),
  ('Economics', 'Economics', 'CSEC', 'Form 4-5', 'ECON'),
  ('Principles of Accounts', 'Principles of Accounts', 'CSEC', 'Form 4-5', 'POA'),
  ('Principles of Business', 'Principles of Business', 'CSEC', 'Form 4-5', 'POB'),
  ('Technical Drawing', 'Technical Drawing', 'CSEC', 'Form 4-5', 'TD'),
  ('Visual Arts', 'Visual Arts', 'CSEC', 'Form 4-5', 'VARTS'),
  ('Music', 'Music', 'CSEC', 'Form 4-5', 'MUSIC'),
  ('Physical Education & Sport', 'Physical Education & Sport', 'CSEC', 'Form 4-5', 'PE'),
  ('Food & Nutrition', 'Food & Nutrition', 'CSEC', 'Form 4-5', 'FOODNUT'),
  ('Agricultural Science', 'Agricultural Science', 'CSEC', 'Form 4-5', 'AGRISCI'),
  ('Human & Social Biology', 'Human & Social Biology', 'CSEC', 'Form 4-5', 'HSB')
ON CONFLICT (name, curriculum, level) DO NOTHING;

-- Seed CAPE subjects
INSERT INTO public.subjects (name, label, curriculum, level, code) VALUES
  ('Pure Mathematics Unit 1', 'Pure Mathematics Unit 1', 'CAPE', 'Unit 1', 'PMATH1'),
  ('Pure Mathematics Unit 2', 'Pure Mathematics Unit 2', 'CAPE', 'Unit 2', 'PMATH2'),
  ('Applied Mathematics Unit 1', 'Applied Mathematics Unit 1', 'CAPE', 'Unit 1', 'AMATH1'),
  ('Applied Mathematics Unit 2', 'Applied Mathematics Unit 2', 'CAPE', 'Unit 2', 'AMATH2'),
  ('Physics Unit 1', 'Physics Unit 1', 'CAPE', 'Unit 1', 'PHYS1'),
  ('Physics Unit 2', 'Physics Unit 2', 'CAPE', 'Unit 2', 'PHYS2'),
  ('Chemistry Unit 1', 'Chemistry Unit 1', 'CAPE', 'Unit 1', 'CHEM1'),
  ('Chemistry Unit 2', 'Chemistry Unit 2', 'CAPE', 'Unit 2', 'CHEM2'),
  ('Biology Unit 1', 'Biology Unit 1', 'CAPE', 'Unit 1', 'BIOL1'),
  ('Biology Unit 2', 'Biology Unit 2', 'CAPE', 'Unit 2', 'BIOL2'),
  ('Economics Unit 1', 'Economics Unit 1', 'CAPE', 'Unit 1', 'ECON1'),
  ('Economics Unit 2', 'Economics Unit 2', 'CAPE', 'Unit 2', 'ECON2'),
  ('Accounting Unit 1', 'Accounting Unit 1', 'CAPE', 'Unit 1', 'ACCT1'),
  ('Accounting Unit 2', 'Accounting Unit 2', 'CAPE', 'Unit 2', 'ACCT2'),
  ('Management of Business Unit 1', 'Management of Business Unit 1', 'CAPE', 'Unit 1', 'MOB1'),
  ('Management of Business Unit 2', 'Management of Business Unit 2', 'CAPE', 'Unit 2', 'MOB2'),
  ('Geography Unit 1', 'Geography Unit 1', 'CAPE', 'Unit 1', 'GEOG1'),
  ('Geography Unit 2', 'Geography Unit 2', 'CAPE', 'Unit 2', 'GEOG2'),
  ('History Unit 1', 'History Unit 1', 'CAPE', 'Unit 1', 'HIST1'),
  ('History Unit 2', 'History Unit 2', 'CAPE', 'Unit 2', 'HIST2'),
  ('Sociology Unit 1', 'Sociology Unit 1', 'CAPE', 'Unit 1', 'SOC1'),
  ('Sociology Unit 2', 'Sociology Unit 2', 'CAPE', 'Unit 2', 'SOC2'),
  ('Law Unit 1', 'Law Unit 1', 'CAPE', 'Unit 1', 'LAW1'),
  ('Law Unit 2', 'Law Unit 2', 'CAPE', 'Unit 2', 'LAW2'),
  ('Literatures in English Unit 1', 'Literatures in English Unit 1', 'CAPE', 'Unit 1', 'LIT1'),
  ('Literatures in English Unit 2', 'Literatures in English Unit 2', 'CAPE', 'Unit 2', 'LIT2'),
  ('Spanish Unit 1', 'Spanish Unit 1', 'CAPE', 'Unit 1', 'SPAN1'),
  ('Spanish Unit 2', 'Spanish Unit 2', 'CAPE', 'Unit 2', 'SPAN2'),
  ('French Unit 1', 'French Unit 1', 'CAPE', 'Unit 1', 'FREN1'),
  ('French Unit 2', 'French Unit 2', 'CAPE', 'Unit 2', 'FREN2'),
  ('Computer Science Unit 1', 'Computer Science Unit 1', 'CAPE', 'Unit 1', 'CS1'),
  ('Computer Science Unit 2', 'Computer Science Unit 2', 'CAPE', 'Unit 2', 'CS2'),
  ('Communication Studies Unit 1', 'Communication Studies Unit 1', 'CAPE', 'Unit 1', 'COMM1'),
  ('Communication Studies Unit 2', 'Communication Studies Unit 2', 'CAPE', 'Unit 2', 'COMM2'),
  ('Environmental Science Unit 1', 'Environmental Science Unit 1', 'CAPE', 'Unit 1', 'ENVSCI1'),
  ('Environmental Science Unit 2', 'Environmental Science Unit 2', 'CAPE', 'Unit 2', 'ENVSCI2')
ON CONFLICT (name, curriculum, level) DO NOTHING;

-- Verify
SELECT COUNT(*) as total_subjects FROM public.subjects;
SELECT curriculum, COUNT(*) as count FROM public.subjects GROUP BY curriculum;





