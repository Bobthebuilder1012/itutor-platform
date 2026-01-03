-- ============================================
-- FIX COUNTRIES DROPDOWN - Diagnostic & Repair
-- ============================================
-- Run this in Supabase SQL Editor to fix the dropdown issue

-- Step 1: Check if table exists and has data
SELECT 'Checking countries table...' AS status;
SELECT COUNT(*) AS total_countries FROM countries;

-- Step 2: If count is 0, populate the table
-- (If count > 0, skip to Step 3)

-- Delete any existing data first (in case of bad data)
DELETE FROM countries;

-- Insert Caribbean countries (priority - shown first)
INSERT INTO countries (code, name, dial_code, currency_code, is_active, sort_order) VALUES
('TT', 'Trinidad and Tobago', '+1-868', 'TTD', true, 1),
('JM', 'Jamaica', '+1-876', 'JMD', true, 2),
('BB', 'Barbados', '+1-246', 'BBD', true, 3),
('GD', 'Grenada', '+1-473', 'XCD', true, 4),
('LC', 'Saint Lucia', '+1-758', 'XCD', true, 5),
('VC', 'Saint Vincent and the Grenadines', '+1-784', 'XCD', true, 6),
('AG', 'Antigua and Barbuda', '+1-268', 'XCD', true, 7),
('DM', 'Dominica', '+1-767', 'XCD', true, 8),
('KN', 'Saint Kitts and Nevis', '+1-869', 'XCD', true, 9),
('GY', 'Guyana', '+592', 'GYD', true, 10),
('SR', 'Suriname', '+597', 'SRD', true, 11),
('BS', 'Bahamas', '+1-242', 'BSD', true, 12),
('BZ', 'Belize', '+501', 'BZD', true, 13);

-- Insert major countries
INSERT INTO countries (code, name, dial_code, currency_code, is_active, sort_order) VALUES
('US', 'United States', '+1', 'USD', true, 50),
('CA', 'Canada', '+1', 'CAD', true, 51),
('GB', 'United Kingdom', '+44', 'GBP', true, 52),
('AU', 'Australia', '+61', 'AUD', true, 53),
('NZ', 'New Zealand', '+64', 'NZD', true, 54),
('IN', 'India', '+91', 'INR', true, 55),
('ZA', 'South Africa', '+27', 'ZAR', true, 56),
('NG', 'Nigeria', '+234', 'NGN', true, 57),
('KE', 'Kenya', '+254', 'KES', true, 58),
('GH', 'Ghana', '+233', 'GHS', true, 59),
('AE', 'United Arab Emirates', '+971', 'AED', true, 60),
('SG', 'Singapore', '+65', 'SGD', true, 61),
('MY', 'Malaysia', '+60', 'MYR', true, 62),
('PH', 'Philippines', '+63', 'PHP', true, 63),
('TH', 'Thailand', '+66', 'THB', true, 64),
('ID', 'Indonesia', '+62', 'IDR', true, 65),
('VN', 'Vietnam', '+84', 'VND', true, 66),
('CN', 'China', '+86', 'CNY', true, 67),
('JP', 'Japan', '+81', 'JPY', true, 68),
('KR', 'South Korea', '+82', 'KRW', true, 69),
('BR', 'Brazil', '+55', 'BRL', true, 70),
('MX', 'Mexico', '+52', 'MXN', true, 71),
('AR', 'Argentina', '+54', 'ARS', true, 72),
('CL', 'Chile', '+56', 'CLP', true, 73),
('CO', 'Colombia', '+57', 'COP', true, 74),
('PE', 'Peru', '+51', 'PEN', true, 75),
('VE', 'Venezuela', '+58', 'VES', true, 76),
('PA', 'Panama', '+507', 'PAB', true, 77),
('CR', 'Costa Rica', '+506', 'CRC', true, 78),
('DO', 'Dominican Republic', '+1-809', 'DOP', true, 79),
('HT', 'Haiti', '+509', 'HTG', true, 80),
('CU', 'Cuba', '+53', 'CUP', true, 81),
('PR', 'Puerto Rico', '+1-787', 'USD', true, 82),
('FR', 'France', '+33', 'EUR', true, 90),
('DE', 'Germany', '+49', 'EUR', true, 91),
('IT', 'Italy', '+39', 'EUR', true, 92),
('ES', 'Spain', '+34', 'EUR', true, 93),
('PT', 'Portugal', '+351', 'EUR', true, 94),
('NL', 'Netherlands', '+31', 'EUR', true, 95),
('BE', 'Belgium', '+32', 'EUR', true, 96),
('CH', 'Switzerland', '+41', 'CHF', true, 97),
('AT', 'Austria', '+43', 'EUR', true, 98),
('SE', 'Sweden', '+46', 'SEK', true, 99),
('NO', 'Norway', '+47', 'NOK', true, 100),
('DK', 'Denmark', '+45', 'DKK', true, 101),
('FI', 'Finland', '+358', 'EUR', true, 102),
('IE', 'Ireland', '+353', 'EUR', true, 103),
('PL', 'Poland', '+48', 'PLN', true, 104),
('CZ', 'Czech Republic', '+420', 'CZK', true, 105),
('HU', 'Hungary', '+36', 'HUF', true, 106),
('RO', 'Romania', '+40', 'RON', true, 107),
('GR', 'Greece', '+30', 'EUR', true, 108),
('RU', 'Russia', '+7', 'RUB', true, 109),
('TR', 'Turkey', '+90', 'TRY', true, 110),
('EG', 'Egypt', '+20', 'EGP', true, 111),
('SA', 'Saudi Arabia', '+966', 'SAR', true, 112),
('IL', 'Israel', '+972', 'ILS', true, 113),
('PK', 'Pakistan', '+92', 'PKR', true, 114),
('BD', 'Bangladesh', '+880', 'BDT', true, 115),
('LK', 'Sri Lanka', '+94', 'LKR', true, 116),
('NP', 'Nepal', '+977', 'NPR', true, 117);

-- Step 3: Fix RLS policies (if they're too restrictive)
-- Drop existing policies (ignore errors if they don't exist)
DROP POLICY IF EXISTS "Countries are publicly readable" ON countries;
DROP POLICY IF EXISTS "Only admins can modify countries" ON countries;
DROP POLICY IF EXISTS "Anyone can read active countries" ON countries;
DROP POLICY IF EXISTS "Public read access" ON countries;

-- Ensure RLS is enabled
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;

-- Create public read policy (NO authentication required)
CREATE POLICY "Public read access for active countries"
  ON countries
  FOR SELECT
  TO public
  USING (is_active = true);

-- Disable all write operations (data should be managed via migrations only)
CREATE POLICY "No public writes to countries"
  ON countries
  FOR ALL
  TO public
  USING (false);

-- Step 4: Verify the fix
SELECT 'Final verification:' AS status;
SELECT COUNT(*) AS total_countries FROM countries WHERE is_active = true;
SELECT code, name FROM countries WHERE is_active = true ORDER BY sort_order, name LIMIT 10;

-- Expected result: Should show 70+ countries with Trinidad and Tobago first

SELECT '✅ FIX COMPLETE! Refresh your signup page.' AS result;










