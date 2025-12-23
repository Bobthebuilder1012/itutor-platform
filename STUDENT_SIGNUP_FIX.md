# Student Signup & Login Fix

## Problem
After completing the student onboarding (secondary signup), students were redirected back to the onboarding page instead of the dashboard. This also happened when logging in.

## Root Causes

1. **Missing `subjects_of_study` in profiles table**: The onboarding page was saving subjects to a junction table but not to the `subjects_of_study` column in the profiles table, which the dashboard was checking.

2. **Login page not checking profile completeness**: The login page wasn't checking if student profiles were complete before redirecting to the dashboard.

3. **Missing database tables**: The `institutions` table and seeded `subjects` data didn't exist in your Supabase database.

## Fixes Applied

### 1. Updated Student Onboarding (`app/onboarding/student/page.tsx`)
- Now saves `subjects_of_study` array to the profiles table
- Keeps the junction table update for flexibility

### 2. Updated Login Page (`app/login/page.tsx`)
- Now checks if student profiles are complete (school, form_level, subjects_of_study)
- Redirects incomplete profiles to onboarding instead of dashboard

### 3. Created Database Migrations
- `003_create_institutions_table.sql` - Creates institutions table with Trinidad schools
- `006_enable_extensions_and_seed_subjects.sql` - Enables search extension and seeds CSEC/CAPE subjects

## What You Need to Do

### Run These SQL Scripts in Supabase

Go to your Supabase SQL Editor: https://app.supabase.com/project/nfkrfciozjxrodkusrhh/sql

#### Step 1: Create Institutions Table

```sql
-- Enable pg_trgm extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create institutions table
CREATE TABLE IF NOT EXISTS public.institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  institution_level text NOT NULL CHECK (institution_level IN ('primary', 'secondary', 'tertiary', 'other')),
  institution_type text CHECK (institution_type IN ('public', 'private', 'government_assisted', 'denominational')),
  country_code text NOT NULL,
  region text,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for faster searches
CREATE INDEX IF NOT EXISTS idx_institutions_name ON public.institutions(name);
CREATE INDEX IF NOT EXISTS idx_institutions_country ON public.institutions(country_code);
CREATE INDEX IF NOT EXISTS idx_institutions_level ON public.institutions(institution_level);
CREATE INDEX IF NOT EXISTS idx_institutions_active ON public.institutions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_institutions_name_trgm ON public.institutions USING gin (name gin_trgm_ops);

-- Enable RLS
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access to active institutions
CREATE POLICY "Public read access to active institutions"
  ON public.institutions
  FOR SELECT
  USING (is_active = true);

-- Seed Trinidad & Tobago secondary schools
INSERT INTO public.institutions (name, institution_level, institution_type, country_code, region, is_active) VALUES
  ('Queen''s Royal College', 'secondary', 'government_assisted', 'TT', 'Port of Spain', true),
  ('St. Joseph''s Convent, Port of Spain', 'secondary', 'denominational', 'TT', 'Port of Spain', true),
  ('Presentation College, San Fernando', 'secondary', 'denominational', 'TT', 'San Fernando', true),
  ('Naparima College', 'secondary', 'denominational', 'TT', 'San Fernando', true),
  ('Naparima Girls'' High School', 'secondary', 'denominational', 'TT', 'San Fernando', true),
  ('St. Augustine Girls'' High School', 'secondary', 'government_assisted', 'TT', 'Tunapuna', true),
  ('Fatima College', 'secondary', 'denominational', 'TT', 'Port of Spain', true),
  ('St. Mary''s College', 'secondary', 'denominational', 'TT', 'Port of Spain', true),
  ('Holy Name Convent', 'secondary', 'denominational', 'TT', 'Port of Spain', true),
  ('St. Joseph''s Convent, St. Joseph', 'secondary', 'denominational', 'TT', 'St. Joseph', true),
  ('San Fernando Boys'' R.C.', 'secondary', 'denominational', 'TT', 'San Fernando', true),
  ('Tranquility Government Secondary School', 'secondary', 'public', 'TT', 'Port of Spain', true),
  ('St. Benedict''s College', 'secondary', 'denominational', 'TT', 'La Romaine', true),
  ('Mucurapo Senior Comprehensive', 'secondary', 'public', 'TT', 'Port of Spain', true),
  ('Diego Martin North Secondary', 'secondary', 'public', 'TT', 'Diego Martin', true),
  ('Malick Secondary School', 'secondary', 'public', 'TT', 'Barataria', true),
  ('Arima North Secondary', 'secondary', 'public', 'TT', 'Arima', true),
  ('Point Fortin East Secondary', 'secondary', 'public', 'TT', 'Point Fortin', true),
  ('Princes Town Secondary', 'secondary', 'public', 'TT', 'Princes Town', true),
  ('Siparia West Secondary', 'secondary', 'public', 'TT', 'Siparia', true)
ON CONFLICT DO NOTHING;
```

#### Step 2: Seed CSEC & CAPE Subjects

```sql
-- Seed CSEC subjects (Forms 1-5)
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

-- Seed CAPE subjects (Unit 1 & Unit 2)
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
```

#### Step 3: Run the institution_id migration (if not already done)

```sql
-- Add institution_id column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS institution_id uuid 
REFERENCES public.institutions(id) 
ON DELETE SET NULL;

-- Create index for better join performance
CREATE INDEX IF NOT EXISTS idx_profiles_institution_id 
ON public.profiles(institution_id);
```

## Test the Fix

After running the SQL:

1. **Refresh your browser** at `http://localhost:3000/signup`
2. **Create a new student account** with:
   - Full name, email, country, password
3. **Complete the onboarding**:
   - Search for a school (e.g., "Queen's")
   - Select form level
   - Select subjects
4. **Click "Complete Profile"**
5. You should be redirected to `/student/dashboard` ✅

## Test Login Flow

1. Log out
2. Log back in with the same credentials
3. You should go directly to the dashboard (not onboarding) ✅

---

All fixes have been applied to your code! Just run the SQL scripts above and test. 🚀


