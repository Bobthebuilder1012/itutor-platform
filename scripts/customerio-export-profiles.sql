-- =====================================================
-- EXPORT PROFILES: name, email, iTutor id
-- =====================================================
-- Run in the Supabase SQL editor. "Download CSV" on the results gives you a
-- file you can drop straight into Customer.io under Profiles -> Import.
--
-- The `itutor_id` column is aliased to `id` on purpose: `id` is the column
-- Customer.io uses as the profile identifier on import, and it must match the
-- identifier the app sends at runtime (lib/customerio/client.ts identifies by
-- the Supabase user UUID). If these two disagree, an import creates a second
-- profile for every user instead of updating the one the app already made.
--
-- Verified against staging 2026-08-26: 307 profiles, 296 importable.

SELECT
  p.id                                   AS id,          -- iTutor / Supabase UUID
  p.email                                AS email,
  p.full_name                            AS full_name,
  -- Customer.io personalisation ({{customer.first_name}}) wants a given name,
  -- not the whole string. display_name is already a first name where it is set;
  -- otherwise take the first word of full_name.
  COALESCE(NULLIF(TRIM(p.display_name), ''), SPLIT_PART(TRIM(p.full_name), ' ', 1))
                                         AS first_name,
  p.role                                 AS role,
  p.created_at                           AS created_at
FROM public.profiles p
WHERE
  -- No email means nothing Customer.io can key a message to. Importing the row
  -- anyway creates a permanently unreachable profile that still counts toward
  -- the billable profile total.
  p.email IS NOT NULL
  AND TRIM(p.email) <> ''

  -- Undeliverable addresses. These are the ones that matter most to exclude:
  -- every hard bounce damages the sending reputation of the whole domain, so a
  -- first import full of fake addresses makes real mail land in spam later.
  --
  -- NOTE: is_dev_account alone is NOT enough here. Only 1 row on staging has it
  -- set, while 10 carry @demo.itutor.test seed addresses that would all bounce.
  AND COALESCE(p.is_dev_account, FALSE) = FALSE
  AND p.email NOT ILIKE '%@demo.itutor.test'
  AND p.email NOT ILIKE '%.test'
  AND p.email NOT ILIKE '%@example.com'

  -- Internal staff accounts (13 on staging). Commented out rather than removed:
  -- you probably DO want these in Customer.io for testing a campaign against a
  -- real inbox, and only want them gone from a genuine customer import.
  -- AND p.email NOT ILIKE '%@myitutor.com'

  -- Suspended accounts are left IN deliberately, so a reinstatement campaign is
  -- possible. Uncomment to drop them.
  -- AND COALESCE(p.is_suspended, FALSE) = FALSE
ORDER BY p.created_at DESC;


-- =====================================================
-- Plain version — no filtering, every profile
-- =====================================================
-- Use when you want the raw list rather than an import file.
--
-- SELECT p.id AS itutor_id, p.full_name, p.email, p.role
-- FROM public.profiles p
-- ORDER BY p.full_name;


-- =====================================================
-- Sanity check before importing
-- =====================================================
-- Confirms the import will not create duplicates or unreachable profiles.
-- Expect: duplicate_emails = 0, missing_email = 0, missing_name = 0.
--
-- SELECT
--   COUNT(*)                                            AS total,
--   COUNT(*) - COUNT(DISTINCT LOWER(TRIM(p.email)))     AS duplicate_emails,
--   COUNT(*) FILTER (WHERE p.email IS NULL
--                       OR TRIM(p.email) = '')          AS missing_email,
--   COUNT(*) FILTER (WHERE p.full_name IS NULL
--                       OR TRIM(p.full_name) = '')      AS missing_name,
--   COUNT(*) FILTER (WHERE p.email ILIKE '%.test'
--                       OR p.email ILIKE '%@example.com') AS undeliverable
-- FROM public.profiles p;
