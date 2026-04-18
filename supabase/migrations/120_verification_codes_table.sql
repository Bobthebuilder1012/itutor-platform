CREATE TABLE IF NOT EXISTS verification_codes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes (email);

ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_only_verification_codes') THEN
    CREATE POLICY service_role_only_verification_codes ON verification_codes FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
