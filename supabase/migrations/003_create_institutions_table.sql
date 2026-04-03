-- =====================================================
-- CREATE INSTITUTIONS TABLE
-- Stores schools, colleges, and universities
-- =====================================================

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

-- Full text search index for institution names
CREATE INDEX IF NOT EXISTS idx_institutions_name_trgm ON public.institutions USING gin (name gin_trgm_ops);

-- Enable RLS
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access to active institutions
CREATE POLICY "Public read access to active institutions"
  ON public.institutions
  FOR SELECT
  USING (is_active = true);

-- Seed some Trinidad & Tobago secondary schools
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

-- Add comment
COMMENT ON TABLE public.institutions IS 'Educational institutions (schools, colleges, universities)';


