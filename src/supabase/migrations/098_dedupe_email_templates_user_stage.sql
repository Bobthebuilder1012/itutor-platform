-- Remove duplicate email_templates rows (same user_type + stage).
-- Keeps one row per pair: oldest created_at, then smallest id.
-- Then enforce uniqueness so PGRST116 cannot recur from .single() / .maybeSingle().

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_templates'
  ) THEN
    RETURN;
  END IF;

  DELETE FROM public.email_templates t
  WHERE t.id IN (
    SELECT id
    FROM (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY user_type, stage
          ORDER BY created_at ASC NULLS LAST, id ASC
        ) AS rn
      FROM public.email_templates
    ) x
    WHERE x.rn > 1
  );

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_templates_user_type_stage_key'
  ) THEN
    ALTER TABLE public.email_templates
      ADD CONSTRAINT email_templates_user_type_stage_key
      UNIQUE (user_type, stage);
  END IF;
END $$;
