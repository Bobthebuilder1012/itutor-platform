-- =====================================================
-- SEED SUBJECTS - CORRECTED FOR ACTUAL SCHEMA
-- =====================================================

-- Add unique constraint if needed
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'subjects_level_name_key'
    ) THEN
        ALTER TABLE public.subjects 
        ADD CONSTRAINT subjects_level_name_key 
        UNIQUE (level, name);
    END IF;
END $$;

-- Seed CSEC subjects
INSERT INTO public.subjects (name, label, level, code) VALUES
  ('Mathematics', 'CSEC Mathematics', 'CSEC', 'CSEC-MATH'),
  ('English A', 'CSEC English A', 'CSEC', 'CSEC-ENGA'),
  ('English B', 'CSEC English B', 'CSEC', 'CSEC-ENGB'),
  ('Integrated Science', 'CSEC Integrated Science', 'CSEC', 'CSEC-ISCI'),
  ('Physics', 'CSEC Physics', 'CSEC', 'CSEC-PHYS'),
  ('Chemistry', 'CSEC Chemistry', 'CSEC', 'CSEC-CHEM'),
  ('Biology', 'CSEC Biology', 'CSEC', 'CSEC-BIOL'),
  ('Spanish', 'CSEC Spanish', 'CSEC', 'CSEC-SPAN'),
  ('French', 'CSEC French', 'CSEC', 'CSEC-FREN'),
  ('Information Technology', 'CSEC Information Technology', 'CSEC', 'CSEC-IT'),
  ('Additional Mathematics', 'CSEC Additional Mathematics', 'CSEC', 'CSEC-ADDMATH'),
  ('Social Studies', 'CSEC Social Studies', 'CSEC', 'CSEC-SOCSTD'),
  ('Geography', 'CSEC Geography', 'CSEC', 'CSEC-GEOG'),
  ('History', 'CSEC History', 'CSEC', 'CSEC-HIST'),
  ('Economics', 'CSEC Economics', 'CSEC', 'CSEC-ECON'),
  ('Principles of Accounts', 'CSEC Principles of Accounts', 'CSEC', 'CSEC-POA'),
  ('Principles of Business', 'CSEC Principles of Business', 'CSEC', 'CSEC-POB'),
  ('Technical Drawing', 'CSEC Technical Drawing', 'CSEC', 'CSEC-TD'),
  ('Visual Arts', 'CSEC Visual Arts', 'CSEC', 'CSEC-VARTS'),
  ('Music', 'CSEC Music', 'CSEC', 'CSEC-MUSIC'),
  ('Physical Education & Sport', 'CSEC Physical Education & Sport', 'CSEC', 'CSEC-PE'),
  ('Food & Nutrition', 'CSEC Food & Nutrition', 'CSEC', 'CSEC-FOODNUT'),
  ('Agricultural Science', 'CSEC Agricultural Science', 'CSEC', 'CSEC-AGRISCI'),
  ('Human & Social Biology', 'CSEC Human & Social Biology', 'CSEC', 'CSEC-HSB')
ON CONFLICT (level, name) DO NOTHING;

-- Seed CAPE subjects
INSERT INTO public.subjects (name, label, level, code) VALUES
  ('Pure Mathematics Unit 1', 'CAPE Pure Mathematics Unit 1', 'CAPE', 'CAPE-PMATH1'),
  ('Pure Mathematics Unit 2', 'CAPE Pure Mathematics Unit 2', 'CAPE', 'CAPE-PMATH2'),
  ('Applied Mathematics Unit 1', 'CAPE Applied Mathematics Unit 1', 'CAPE', 'CAPE-AMATH1'),
  ('Applied Mathematics Unit 2', 'CAPE Applied Mathematics Unit 2', 'CAPE', 'CAPE-AMATH2'),
  ('Physics Unit 1', 'CAPE Physics Unit 1', 'CAPE', 'CAPE-PHYS1'),
  ('Physics Unit 2', 'CAPE Physics Unit 2', 'CAPE', 'CAPE-PHYS2'),
  ('Chemistry Unit 1', 'CAPE Chemistry Unit 1', 'CAPE', 'CAPE-CHEM1'),
  ('Chemistry Unit 2', 'CAPE Chemistry Unit 2', 'CAPE', 'CAPE-CHEM2'),
  ('Biology Unit 1', 'CAPE Biology Unit 1', 'CAPE', 'CAPE-BIOL1'),
  ('Biology Unit 2', 'CAPE Biology Unit 2', 'CAPE', 'CAPE-BIOL2'),
  ('Economics Unit 1', 'CAPE Economics Unit 1', 'CAPE', 'CAPE-ECON1'),
  ('Economics Unit 2', 'CAPE Economics Unit 2', 'CAPE', 'CAPE-ECON2'),
  ('Accounting Unit 1', 'CAPE Accounting Unit 1', 'CAPE', 'CAPE-ACCT1'),
  ('Accounting Unit 2', 'CAPE Accounting Unit 2', 'CAPE', 'CAPE-ACCT2'),
  ('Management of Business Unit 1', 'CAPE Management of Business Unit 1', 'CAPE', 'CAPE-MOB1'),
  ('Management of Business Unit 2', 'CAPE Management of Business Unit 2', 'CAPE', 'CAPE-MOB2'),
  ('Geography Unit 1', 'CAPE Geography Unit 1', 'CAPE', 'CAPE-GEOG1'),
  ('Geography Unit 2', 'CAPE Geography Unit 2', 'CAPE', 'CAPE-GEOG2'),
  ('History Unit 1', 'CAPE History Unit 1', 'CAPE', 'CAPE-HIST1'),
  ('History Unit 2', 'CAPE History Unit 2', 'CAPE', 'CAPE-HIST2'),
  ('Sociology Unit 1', 'CAPE Sociology Unit 1', 'CAPE', 'CAPE-SOC1'),
  ('Sociology Unit 2', 'CAPE Sociology Unit 2', 'CAPE', 'CAPE-SOC2'),
  ('Law Unit 1', 'CAPE Law Unit 1', 'CAPE', 'CAPE-LAW1'),
  ('Law Unit 2', 'CAPE Law Unit 2', 'CAPE', 'CAPE-LAW2'),
  ('Literatures in English Unit 1', 'CAPE Literatures in English Unit 1', 'CAPE', 'CAPE-LIT1'),
  ('Literatures in English Unit 2', 'CAPE Literatures in English Unit 2', 'CAPE', 'CAPE-LIT2'),
  ('Spanish Unit 1', 'CAPE Spanish Unit 1', 'CAPE', 'CAPE-SPAN1'),
  ('Spanish Unit 2', 'CAPE Spanish Unit 2', 'CAPE', 'CAPE-SPAN2'),
  ('French Unit 1', 'CAPE French Unit 1', 'CAPE', 'CAPE-FREN1'),
  ('French Unit 2', 'CAPE French Unit 2', 'CAPE', 'CAPE-FREN2'),
  ('Computer Science Unit 1', 'CAPE Computer Science Unit 1', 'CAPE', 'CAPE-CS1'),
  ('Computer Science Unit 2', 'CAPE Computer Science Unit 2', 'CAPE', 'CAPE-CS2'),
  ('Communication Studies Unit 1', 'CAPE Communication Studies Unit 1', 'CAPE', 'CAPE-COMM1'),
  ('Communication Studies Unit 2', 'CAPE Communication Studies Unit 2', 'CAPE', 'CAPE-COMM2'),
  ('Environmental Science Unit 1', 'CAPE Environmental Science Unit 1', 'CAPE', 'CAPE-ENVSCI1'),
  ('Environmental Science Unit 2', 'CAPE Environmental Science Unit 2', 'CAPE', 'CAPE-ENVSCI2')
ON CONFLICT (level, name) DO NOTHING;

-- Verify the data
SELECT COUNT(*) as total_subjects FROM public.subjects;
SELECT level, COUNT(*) as count FROM public.subjects GROUP BY level;





