-- =====================================================
-- 242: Add missing CSEC and CAPE subjects
-- =====================================================
-- The original seed (006_enable_extensions_and_seed_subjects.sql) plus later
-- top-ups left a number of current CXC subjects unseeded, so they never appear
-- in the tutor signup subject search.
--
-- NUMBERED 242, NOT 217. 217 is profiles_privileged_column_guard; 218-220 are
-- attendance and parent approval; 238-240 are the Finder; 241 is venues and
-- class format. A migration written to a taken number is never applied and
-- never errors.
--
-- ---------------------------------------------------------------------------
-- THREE CORRECTIONS AGAINST THE LIVE SCHEMA (both databases read 2026-08-22)
-- ---------------------------------------------------------------------------
--
-- 1. subjects.label is NOT NULL. The draft omitted label from every INSERT and
--    backfilled it afterwards, which cannot work: the first row fails with
--    23502 and aborts the transaction before the backfill is reached. Verified
--    against production. label is supplied inline here.
--
-- 2. The ON CONFLICT target must be (curriculum, name), not
--    (name, curriculum, level):
--
--      * unique_subject_curriculum_level (name, curriculum, level) exists on
--        PRODUCTION ONLY. On staging the draft would fail outright with "no
--        unique or exclusion constraint matching the ON CONFLICT
--        specification".
--      * subjects_curriculum_name_unique (curriculum, name) exists on BOTH,
--        and is the stricter guard. It is also the constraint that would
--        actually fire: 'Caribbean Studies' already exists as
--        curriculum='CAPE', level='CSEC', so an insert at level='Unit 1' does
--        NOT conflict on the level-bearing index, proceeds, and then violates
--        the (curriculum, name) one — a violation the draft's ON CONFLICT does
--        not cover, aborting everything.
--
-- 3. The label format is '<CURRICULUM> <name>', not '<name> (<CURRICULUM>)'.
--    Production reads 'CSEC Additional Mathematics' and
--    'CAPE Accounting Unit 1'. The draft's backfill would have produced
--    'Portuguese (CSEC)', a second convention in the same column — and
--    subjects_label_key is UNIQUE on label, so a mismatched format is a
--    silent split rather than an error.
--
-- ---------------------------------------------------------------------------
-- NOT FIXED HERE, DELIBERATELY
-- ---------------------------------------------------------------------------
-- subjects.level is corrupted: it reads 'CSEC' on nearly every row, including
-- CAPE ones. New rows below carry correct levels ('Form 4-5', 'Unit 1',
-- 'Unit 2') per migration 006's convention. That leaves the column mixed, and
-- the tutor search badge renders `{curriculum} {level}` — which is why an
-- existing row shows "CSEC CSEC" today and a new one will show
-- "CSEC Form 4-5". Correcting the existing rows is a separate change with its
-- own review: nothing matches on this column (lib/matching/subjects.ts keys on
-- curriculum, never level), so it is a display defect, not a matching one.
--
-- Safe to re-run: every INSERT is guarded by subjects_curriculum_name_unique.

BEGIN;

-- -----------------------------------------------------
-- CSEC
-- -----------------------------------------------------
INSERT INTO public.subjects (name, curriculum, level, code, label) VALUES
  ('Electronic Document Preparation and Management', 'CSEC', 'Form 4-5', 'EDPM',    'CSEC Electronic Document Preparation and Management'),
  ('Family and Resource Management',                 'CSEC', 'Form 4-5', 'FRM',     'CSEC Family and Resource Management'),
  ('Industrial Technology',                          'CSEC', 'Form 4-5', 'INDTECH', 'CSEC Industrial Technology'),
  ('Office Administration',                          'CSEC', 'Form 4-5', 'OA',      'CSEC Office Administration'),
  ('Portuguese',                                     'CSEC', 'Form 4-5', 'PORT',    'CSEC Portuguese'),
  ('Religious Education',                            'CSEC', 'Form 4-5', 'RE',      'CSEC Religious Education'),
  ('Textiles, Clothing and Fashion',                 'CSEC', 'Form 4-5', 'TCF',     'CSEC Textiles, Clothing and Fashion'),
  ('Theatre Arts',                                   'CSEC', 'Form 4-5', 'THARTS',  'CSEC Theatre Arts')
ON CONFLICT (curriculum, name) DO NOTHING;

-- -----------------------------------------------------
-- CAPE — two-unit subjects
-- -----------------------------------------------------
INSERT INTO public.subjects (name, curriculum, level, code, label) VALUES
  ('Agricultural Science Unit 1',                             'CAPE', 'Unit 1', 'CAGRI1',  'CAPE Agricultural Science Unit 1'),
  ('Agricultural Science Unit 2',                             'CAPE', 'Unit 2', 'CAGRI2',  'CAPE Agricultural Science Unit 2'),
  ('Animation and Game Design Unit 1',                        'CAPE', 'Unit 1', 'AGD1',    'CAPE Animation and Game Design Unit 1'),
  ('Animation and Game Design Unit 2',                        'CAPE', 'Unit 2', 'AGD2',    'CAPE Animation and Game Design Unit 2'),
  ('Art and Design Unit 1',                                   'CAPE', 'Unit 1', 'ARTD1',   'CAPE Art and Design Unit 1'),
  ('Art and Design Unit 2',                                   'CAPE', 'Unit 2', 'ARTD2',   'CAPE Art and Design Unit 2'),
  ('Building and Mechanical Engineering Unit 1',              'CAPE', 'Unit 1', 'BME1',    'CAPE Building and Mechanical Engineering Unit 1'),
  ('Building and Mechanical Engineering Unit 2',              'CAPE', 'Unit 2', 'BME2',    'CAPE Building and Mechanical Engineering Unit 2'),
  ('Design and Technology Unit 1',                            'CAPE', 'Unit 1', 'DNT1',    'CAPE Design and Technology Unit 1'),
  ('Design and Technology Unit 2',                            'CAPE', 'Unit 2', 'DNT2',    'CAPE Design and Technology Unit 2'),
  ('Digital Media Unit 1',                                    'CAPE', 'Unit 1', 'DIGMED1', 'CAPE Digital Media Unit 1'),
  ('Digital Media Unit 2',                                    'CAPE', 'Unit 2', 'DIGMED2', 'CAPE Digital Media Unit 2'),
  ('Electrical and Electronic Engineering Technology Unit 1', 'CAPE', 'Unit 1', 'EEET1',   'CAPE Electrical and Electronic Engineering Technology Unit 1'),
  ('Electrical and Electronic Engineering Technology Unit 2', 'CAPE', 'Unit 2', 'EEET2',   'CAPE Electrical and Electronic Engineering Technology Unit 2'),
  ('Entrepreneurship Unit 1',                                 'CAPE', 'Unit 1', 'ENT1',    'CAPE Entrepreneurship Unit 1'),
  ('Entrepreneurship Unit 2',                                 'CAPE', 'Unit 2', 'ENT2',    'CAPE Entrepreneurship Unit 2'),
  ('Financial Services Studies Unit 1',                       'CAPE', 'Unit 1', 'FSS1',    'CAPE Financial Services Studies Unit 1'),
  ('Financial Services Studies Unit 2',                       'CAPE', 'Unit 2', 'FSS2',    'CAPE Financial Services Studies Unit 2'),
  ('Food and Nutrition Unit 1',                               'CAPE', 'Unit 1', 'CFN1',    'CAPE Food and Nutrition Unit 1'),
  ('Food and Nutrition Unit 2',                               'CAPE', 'Unit 2', 'CFN2',    'CAPE Food and Nutrition Unit 2'),
  ('Green Engineering Unit 1',                                'CAPE', 'Unit 1', 'GRENG1',  'CAPE Green Engineering Unit 1'),
  ('Green Engineering Unit 2',                                'CAPE', 'Unit 2', 'GRENG2',  'CAPE Green Engineering Unit 2'),
  ('Logistics and Supply Chain Operations Unit 1',            'CAPE', 'Unit 1', 'LSCO1',   'CAPE Logistics and Supply Chain Operations Unit 1'),
  ('Logistics and Supply Chain Operations Unit 2',            'CAPE', 'Unit 2', 'LSCO2',   'CAPE Logistics and Supply Chain Operations Unit 2'),
  ('Performing Arts Unit 1',                                  'CAPE', 'Unit 1', 'PERF1',   'CAPE Performing Arts Unit 1'),
  ('Performing Arts Unit 2',                                  'CAPE', 'Unit 2', 'PERF2',   'CAPE Performing Arts Unit 2'),
  ('Physical Education and Sport Unit 1',                     'CAPE', 'Unit 1', 'CPE1',    'CAPE Physical Education and Sport Unit 1'),
  ('Physical Education and Sport Unit 2',                     'CAPE', 'Unit 2', 'CPE2',    'CAPE Physical Education and Sport Unit 2'),
  ('Tourism Unit 1',                                          'CAPE', 'Unit 1', 'TOUR1',   'CAPE Tourism Unit 1'),
  ('Tourism Unit 2',                                          'CAPE', 'Unit 2', 'TOUR2',   'CAPE Tourism Unit 2')
ON CONFLICT (curriculum, name) DO NOTHING;

-- -----------------------------------------------------
-- CAPE — single-unit subjects
-- Caribbean Studies is compulsory for the CAPE diploma, so it would be the
-- highest-demand row here — but it ALREADY EXISTS on both databases (as
-- curriculum='CAPE', level='CSEC'), so this insert is a no-op for it. Its
-- level is left alone; see the note at the top.
-- -----------------------------------------------------
INSERT INTO public.subjects (name, curriculum, level, code, label) VALUES
  ('Caribbean Studies',      'CAPE', 'Unit 1', 'CARST', 'CAPE Caribbean Studies'),
  ('Integrated Mathematics', 'CAPE', 'Unit 1', 'IMATH', 'CAPE Integrated Mathematics')
ON CONFLICT (curriculum, name) DO NOTHING;

COMMIT;

-- -----------------------------------------------------
-- Verification
-- -----------------------------------------------------
-- SELECT curriculum, COUNT(*) FROM public.subjects GROUP BY curriculum;
--   baseline before this migration, BOTH databases: CSEC 54, CAPE 77, SEA 3
--   (the draft's "expected CSEC 32, CAPE 68" was measured against an older
--    database and is not reachable from here)
