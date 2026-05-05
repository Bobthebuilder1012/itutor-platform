-- =====================================================
-- COMMUNITY AUTO-ASSIGNMENT SYSTEM
-- =====================================================
-- Automatically assigns users to school and form communities
-- based on their institution_id and form_level

-- 1. CREATE FUNCTION TO AUTO-CREATE SCHOOL COMMUNITIES
CREATE OR REPLACE FUNCTION ensure_school_communities(p_institution_id uuid)
RETURNS void AS $$
DECLARE
  v_institution_name text;
  v_form_levels text[] := ARRAY['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5', 'Form 6', 'Lower 6', 'Upper 6'];
  v_form_level text;
BEGIN
  -- Get institution name
  SELECT name INTO v_institution_name
  FROM institutions
  WHERE id = p_institution_id;
  
  IF v_institution_name IS NULL THEN
    RETURN;
  END IF;
  
  -- Create main school community if doesn't exist
  INSERT INTO communities (
    name,
    type,
    audience,
    institution_id,
    is_auto,
    is_joinable,
    description
  ) VALUES (
    v_institution_name,
    'school',
    'mixed',
    p_institution_id,
    true,
    false,
    'Main community for ' || v_institution_name
  ) ON CONFLICT (type, institution_id, form_level) DO NOTHING;
  
  -- Create form communities for each form level
  FOREACH v_form_level IN ARRAY v_form_levels
  LOOP
    INSERT INTO communities (
      name,
      type,
      audience,
      institution_id,
      form_level,
      is_auto,
      is_joinable,
      description
    ) VALUES (
      v_institution_name || ' - ' || v_form_level,
      'school_form',
      'mixed',
      p_institution_id,
      v_form_level,
      true,
      false,
      v_form_level || ' community for ' || v_institution_name
    ) ON CONFLICT (type, institution_id, form_level) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. CREATE FUNCTION TO AUTO-ASSIGN USER TO COMMUNITIES
CREATE OR REPLACE FUNCTION auto_assign_school_communities()
RETURNS TRIGGER AS $$
DECLARE
  v_school_community_id uuid;
  v_form_community_id uuid;
BEGIN
  -- Only process if institution_id is set
  IF NEW.institution_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Ensure communities exist for this institution
  PERFORM ensure_school_communities(NEW.institution_id);
  
  -- Get school community ID
  SELECT id INTO v_school_community_id
  FROM communities
  WHERE type = 'school'
    AND institution_id = NEW.institution_id;
  
  -- Assign to school community if found
  IF v_school_community_id IS NOT NULL THEN
    INSERT INTO community_memberships (
      community_id,
      user_id,
      role,
      status
    ) VALUES (
      v_school_community_id,
      NEW.id,
      'member',
      'active'
    ) ON CONFLICT (community_id, user_id) DO NOTHING;
  END IF;
  
  -- If form_level is set, assign to form community
  IF NEW.form_level IS NOT NULL AND NEW.form_level != '' THEN
    SELECT id INTO v_form_community_id
    FROM communities
    WHERE type = 'school_form'
      AND institution_id = NEW.institution_id
      AND form_level = NEW.form_level;
    
    IF v_form_community_id IS NOT NULL THEN
      INSERT INTO community_memberships (
        community_id,
        user_id,
        role,
        status
      ) VALUES (
        v_form_community_id,
        NEW.id,
        'member',
        'active'
      ) ON CONFLICT (community_id, user_id) DO NOTHING;
    END IF;
  END IF;
  
  -- Handle changes: remove old memberships if institution or form changed
  IF TG_OP = 'UPDATE' THEN
    -- If institution changed, remove old school community memberships
    IF OLD.institution_id IS DISTINCT FROM NEW.institution_id AND OLD.institution_id IS NOT NULL THEN
      DELETE FROM community_memberships
      WHERE user_id = NEW.id
        AND community_id IN (
          SELECT id FROM communities
          WHERE institution_id = OLD.institution_id
            AND type IN ('school', 'school_form')
            AND is_auto = true
        );
    END IF;
    
    -- If form_level changed within same institution, remove old form membership
    IF OLD.form_level IS DISTINCT FROM NEW.form_level 
       AND NEW.institution_id = OLD.institution_id 
       AND OLD.form_level IS NOT NULL THEN
      DELETE FROM community_memberships
      WHERE user_id = NEW.id
        AND community_id IN (
          SELECT id FROM communities
          WHERE institution_id = NEW.institution_id
            AND type = 'school_form'
            AND form_level = OLD.form_level
            AND is_auto = true
        );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. CREATE TRIGGER ON PROFILES TABLE
DROP TRIGGER IF EXISTS trigger_auto_assign_communities ON profiles;
CREATE TRIGGER trigger_auto_assign_communities
  AFTER INSERT OR UPDATE OF institution_id, form_level ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_school_communities();

-- 4. CREATE FUNCTION TO BACKFILL EXISTING USERS
CREATE OR REPLACE FUNCTION backfill_school_community_memberships()
RETURNS void AS $$
DECLARE
  v_profile RECORD;
  v_count integer := 0;
BEGIN
  RAISE NOTICE 'Starting backfill of school community memberships...';
  
  -- Process all users with institution_id
  FOR v_profile IN
    SELECT id, institution_id, form_level
    FROM profiles
    WHERE institution_id IS NOT NULL
  LOOP
    -- Ensure communities exist
    PERFORM ensure_school_communities(v_profile.institution_id);
    
    -- Assign to school community
    INSERT INTO community_memberships (community_id, user_id, role, status)
    SELECT c.id, v_profile.id, 'member', 'active'
    FROM communities c
    WHERE c.type = 'school'
      AND c.institution_id = v_profile.institution_id
    ON CONFLICT (community_id, user_id) DO NOTHING;
    
    -- Assign to form community if form_level set
    IF v_profile.form_level IS NOT NULL AND v_profile.form_level != '' THEN
      INSERT INTO community_memberships (community_id, user_id, role, status)
      SELECT c.id, v_profile.id, 'member', 'active'
      FROM communities c
      WHERE c.type = 'school_form'
        AND c.institution_id = v_profile.institution_id
        AND c.form_level = v_profile.form_level
      ON CONFLICT (community_id, user_id) DO NOTHING;
    END IF;
    
    v_count := v_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Backfill complete: processed % users', v_count;
END;
$$ LANGUAGE plpgsql;

-- 5. RUN BACKFILL FOR EXISTING USERS
SELECT backfill_school_community_memberships();

-- 6. COMMENTS
COMMENT ON FUNCTION ensure_school_communities IS 'Creates school and form communities for an institution if they don''t exist';
COMMENT ON FUNCTION auto_assign_school_communities IS 'Trigger function to auto-assign users to school/form communities';
COMMENT ON FUNCTION backfill_school_community_memberships IS 'One-time function to backfill existing users into communities';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Community auto-assignment system created';
  RAISE NOTICE '   - ensure_school_communities() creates communities on demand';
  RAISE NOTICE '   - auto_assign_school_communities() trigger on profiles';
  RAISE NOTICE '   - Automatically assigns users on insert/update';
  RAISE NOTICE '   - Handles institution and form_level changes';
  RAISE NOTICE '   - Backfilled existing users into communities';
END $$;












