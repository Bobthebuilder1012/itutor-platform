-- =====================================================
-- ADD MISSING SCHOOLS TO INSTITUTIONS TABLE
-- =====================================================
-- Robust migration that handles any schema variation

DO $$ 
DECLARE
  v_columns text;
  v_insert_sql text;
  v_institution_type_to_use text := 'denominational';
BEGIN
  -- Build dynamic column list based on what exists
  SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
  INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'institutions'
    AND column_name IN (
      'name', 'normalized_name', 'institution_level', 'institution_type', 
      'country_code', 'island', 'region', 'is_active'
    );

  -- Try to get an allowed institution_type value from existing data
  BEGIN
    SELECT institution_type INTO v_institution_type_to_use
    FROM institutions
    WHERE institution_type IS NOT NULL
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_institution_type_to_use := 'denominational';
  END;

  -- Use denominational for all schools to avoid check constraint issues
  -- Build appropriate INSERT based on available columns
  IF v_columns LIKE '%normalized_name%' AND v_columns LIKE '%island%' AND v_columns LIKE '%region%' THEN
    -- Full schema
    EXECUTE format($sql$
      INSERT INTO public.institutions (name, normalized_name, institution_level, institution_type, country_code, island, region, is_active)
      VALUES 
        ('Presentation College Chaguanas', LOWER('Presentation College Chaguanas'), 'secondary', %L, 'TT', 'Trinidad', 'Chaguanas', true),
        ('St. Joseph''s Convent, San Fernando', LOWER('St. Joseph''s Convent, San Fernando'), 'secondary', %L, 'TT', 'Trinidad', 'San Fernando', true)
      ON CONFLICT DO NOTHING
    $sql$, v_institution_type_to_use, v_institution_type_to_use);
    
  ELSIF v_columns LIKE '%normalized_name%' AND v_columns LIKE '%island%' THEN
    -- With island
    EXECUTE format($sql$
      INSERT INTO public.institutions (name, normalized_name, institution_level, institution_type, country_code, island, is_active)
      VALUES 
        ('Presentation College Chaguanas', LOWER('Presentation College Chaguanas'), 'secondary', %L, 'TT', 'Trinidad', true),
        ('St. Joseph''s Convent, San Fernando', LOWER('St. Joseph''s Convent, San Fernando'), 'secondary', %L, 'TT', 'Trinidad', true)
      ON CONFLICT DO NOTHING
    $sql$, v_institution_type_to_use, v_institution_type_to_use);
    
  ELSIF v_columns LIKE '%normalized_name%' THEN
    -- With normalized_name
    EXECUTE format($sql$
      INSERT INTO public.institutions (name, normalized_name, institution_level, institution_type, country_code, is_active)
      VALUES 
        ('Presentation College Chaguanas', LOWER('Presentation College Chaguanas'), 'secondary', %L, 'TT', true),
        ('St. Joseph''s Convent, San Fernando', LOWER('St. Joseph''s Convent, San Fernando'), 'secondary', %L, 'TT', true)
      ON CONFLICT DO NOTHING
    $sql$, v_institution_type_to_use, v_institution_type_to_use);
    
  ELSE
    -- Minimal schema
    EXECUTE format($sql$
      INSERT INTO public.institutions (name, institution_level, institution_type, country_code, is_active)
      VALUES 
        ('Presentation College Chaguanas', 'secondary', %L, 'TT', true),
        ('St. Joseph''s Convent, San Fernando', 'secondary', %L, 'TT', true)
      ON CONFLICT DO NOTHING
    $sql$, v_institution_type_to_use, v_institution_type_to_use);
  END IF;

  RAISE NOTICE '✅ Missing schools added successfully';
  RAISE NOTICE '   - Presentation College Chaguanas';
  RAISE NOTICE '   - St. Joseph''s Convent, San Fernando';
  RAISE NOTICE '   - Using institution_type: %', v_institution_type_to_use;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '❌ Error adding schools: %', SQLERRM;
    RAISE NOTICE '   Columns available: %', v_columns;
    RAISE;
END $$;
