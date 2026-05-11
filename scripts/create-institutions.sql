-- ============================================================
-- institutions table + seed data (Trinidad & Tobago schools)
-- Run this in the Supabase SQL editor
-- ============================================================

-- Drop and recreate cleanly (removes any bad column from prior attempt)
DROP TABLE IF EXISTS public.institutions CASCADE;

CREATE TABLE public.institutions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  country_code     text NOT NULL DEFAULT 'TT',
  island           text CHECK (island IN ('Trinidad', 'Tobago')),
  institution_level text NOT NULL CHECK (institution_level IN ('primary', 'secondary', 'tertiary')),
  institution_type  text NOT NULL DEFAULT 'government',
  denomination      text,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

-- Index for fast name searches
CREATE INDEX idx_institutions_name ON public.institutions USING gin(to_tsvector('english', name));
CREATE INDEX idx_institutions_level ON public.institutions (institution_level);
CREATE INDEX idx_institutions_active ON public.institutions (is_active) WHERE is_active = true;

-- RLS: public read, no public write
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read institutions" ON public.institutions;
CREATE POLICY "Anyone can read institutions" ON public.institutions
  FOR SELECT USING (true);

-- Clear any stale institution_id values that no longer exist, then add FK
UPDATE public.profiles SET institution_id = NULL
WHERE institution_id IS NOT NULL
  AND institution_id NOT IN (SELECT id FROM public.institutions);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_institution_id_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE SET NULL;

-- ============================================================
-- SEED: Trinidad & Tobago Secondary Schools
-- ============================================================

INSERT INTO public.institutions (name, country_code, island, institution_level, institution_type, denomination) VALUES

-- === TRINIDAD: Government / Government-Assisted ===
('Queen''s Royal College', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('St. Mary''s College', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Catholic'),
('Naparima College', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Presbyterian'),
('Presentation College San Fernando', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Catholic'),
('Presentation College Chaguanas', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Catholic'),
('Presentation College Siparia', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Catholic'),
('Holy Name Convent', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Catholic'),
('St. Joseph''s Convent Port of Spain', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Catholic'),
('St. Joseph''s Convent San Fernando', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Catholic'),
('St. Joseph''s Convent St. Joseph', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Catholic'),
('Naparima Girls'' High School', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Presbyterian'),
('Bishop Anstey High School', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Anglican'),
('Bishop Anstey Trinity College East', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Anglican'),
('Trinity College Moka', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Anglican'),
('Trinity College Pembroke', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Anglican'),
('Fatima College', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Catholic'),
('St. Anthony''s College', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Catholic'),
('St. Benedict''s College', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Catholic'),
('De La Salle College', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Catholic'),
('Fyzabad Anglican Secondary', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Anglican'),
('Couva East Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Couva West Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Carapichaima East Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Chaguanas North Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Chaguanas South Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Arima North Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Arima South Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Tunapuna Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('San Juan Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Mucurapo Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('St. George''s College', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Catholic'),
('Hillview College', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Anglican'),
('El Dorado East Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Pleasantville Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Fyzabad Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Point Fortin East Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Point Fortin Civic Centre Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Speyside High School', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Mayaro Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Rio Claro East Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Princes Town West Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Princes Town East Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Pointe-a-Pierre Senior Comprehensive', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Gasparillo Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Marabella North Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Marabella South Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Preysal Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('San Fernando East Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('San Fernando West Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Siparia Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Barrackpore West Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Barrackpore East Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Moruga Composite', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Sangre Grande Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Toco Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Valencia Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Diego Martin North Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Diego Martin West Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Diego Martin Central Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Belmont Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Morvant/Laventille Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Laventille Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Signal Hill Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Caura Valley Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Malick Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('St. Francois Girls'' College', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Tranquility Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('ASJA Boys'' College San Fernando', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Muslim'),
('ASJA Girls'' College San Fernando', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Muslim'),
('ASJA Boys'' College Charlieville', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Muslim'),
('ASJA Girls'' College Charlieville', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Muslim'),
('Lakshmi Girls'' Hindu College', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Hindu'),
('Hindu College', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Hindu'),
('Maha Sabha Girls'' College', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Hindu'),
('Penal/Debe Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Charlieville Secondary', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Pleasantville Senior Comprehensive', 'TT', 'Trinidad', 'secondary', 'government', NULL),
('Iere High School', 'TT', 'Trinidad', 'secondary', 'government-assisted', 'Presbyterian'),

-- === TOBAGO ===
('Bishop''s High School', 'TT', 'Tobago', 'secondary', 'government', NULL),
('Scarborough Secondary', 'TT', 'Tobago', 'secondary', 'government', NULL),
('Mason Hall Secondary', 'TT', 'Tobago', 'secondary', 'government', NULL),
('Roxborough Secondary', 'TT', 'Tobago', 'secondary', 'government', NULL),
('Speyside High School', 'TT', 'Tobago', 'secondary', 'government', NULL),
('Bethel High School', 'TT', 'Tobago', 'secondary', 'government-assisted', 'Anglican'),
('Signal Hill Senior Comprehensive', 'TT', 'Tobago', 'secondary', 'government', NULL),

-- === TERTIARY ===
('The University of the West Indies (UWI) St. Augustine', 'TT', 'Trinidad', 'tertiary', 'government', NULL),
('University of Trinidad and Tobago (UTT)', 'TT', 'Trinidad', 'tertiary', 'government', NULL),
('University of the Southern Caribbean (USC)', 'TT', 'Trinidad', 'tertiary', 'private', 'Adventist'),
('COSTAATT', 'TT', 'Trinidad', 'tertiary', 'government', NULL),
('Trinidad and Tobago Institute of Technology (TTIT)', 'TT', 'Trinidad', 'tertiary', 'government', NULL),
('Cipriani College of Labour and Co-operative Studies', 'TT', 'Trinidad', 'tertiary', 'government', NULL)

ON CONFLICT DO NOTHING;
