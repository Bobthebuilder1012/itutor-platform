-- =====================================================
-- MIGRATE SCHOOL TEXT TO INSTITUTION_ID
-- =====================================================
-- Updates profiles to use institution_id based on their school text field
-- This triggers the auto-assignment to school communities

-- Function to match school text to institution_id
CREATE OR REPLACE FUNCTION migrate_school_to_institution_id()
RETURNS void AS $$
DECLARE
  v_profile RECORD;
  v_institution_id uuid;
  v_matched_count integer := 0;
  v_unmatched_count integer := 0;
BEGIN
  RAISE NOTICE 'Starting migration of school text to institution_id...';

  -- Loop through all profiles with school set but no institution_id
  FOR v_profile IN
    SELECT id, school, form_level
    FROM profiles
    WHERE school IS NOT NULL
      AND school != ''
      AND institution_id IS NULL
  LOOP
    -- Try to find matching institution (case-insensitive, handles variations)
    SELECT i.id INTO v_institution_id
    FROM institutions i
    WHERE 
      -- Exact match (case-insensitive)
      LOWER(i.name) = LOWER(v_profile.school)
      OR
      -- Match without "Presentation College" variations
      (v_profile.school ILIKE '%Presentation College%' AND i.name ILIKE '%Presentation College%' 
       AND (
         (v_profile.school ILIKE '%Chaguanas%' AND i.name ILIKE '%Chaguanas%')
         OR (v_profile.school ILIKE '%San Fernando%' AND i.name ILIKE '%San Fernando%')
       ))
      OR
      -- Match "St. Joseph's Convent" variations
      (v_profile.school ILIKE '%St. Joseph%Convent%' AND i.name ILIKE '%St. Joseph%Convent%'
       AND (
         (v_profile.school ILIKE '%Port of Spain%' AND i.name ILIKE '%Port of Spain%')
         OR (v_profile.school ILIKE '%St. Joseph%' AND i.name ILIKE '%St. Joseph%' AND i.name NOT ILIKE '%Port of Spain%')
       ))
      OR
      -- Partial match for other schools (e.g., "Fatima" matches "Fatima College")
      (LENGTH(v_profile.school) > 5 AND i.name ILIKE '%' || v_profile.school || '%')
    ORDER BY 
      -- Prioritize exact matches
      CASE WHEN LOWER(i.name) = LOWER(v_profile.school) THEN 1 ELSE 2 END,
      -- Then prioritize longer matches
      LENGTH(i.name)
    LIMIT 1;

    IF v_institution_id IS NOT NULL THEN
      -- Update the profile with the institution_id
      -- This will trigger the auto_assign_school_communities trigger
      UPDATE profiles
      SET institution_id = v_institution_id
      WHERE id = v_profile.id;

      v_matched_count := v_matched_count + 1;
      
      RAISE NOTICE 'Matched: % → %', v_profile.school, v_institution_id;
    ELSE
      v_unmatched_count := v_unmatched_count + 1;
      RAISE NOTICE 'No match found for: %', v_profile.school;
    END IF;
  END LOOP;

  RAISE NOTICE '✅ Migration complete:';
  RAISE NOTICE '   - % profiles matched and updated', v_matched_count;
  RAISE NOTICE '   - % profiles unmatched (manual review needed)', v_unmatched_count;
  RAISE NOTICE '   - Auto-assignment trigger will create community memberships';
END;
$$ LANGUAGE plpgsql;

-- Run the migration
SELECT migrate_school_to_institution_id();

-- Drop the function after use (optional, keep if you want to run manually later)
-- DROP FUNCTION migrate_school_to_institution_id();

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ School to institution_id migration executed';
  RAISE NOTICE '   - Profiles updated with institution_id where matches found';
  RAISE NOTICE '   - Community memberships auto-created by trigger';
  RAISE NOTICE '   - Check logs above for unmatched schools';
END $$;











