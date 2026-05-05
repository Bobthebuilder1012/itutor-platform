-- Degree verification: submissions + document metadata (files in storage bucket degree-documents)

CREATE TABLE IF NOT EXISTS public.degrees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  school_name text NOT NULL,
  degree text NOT NULL,
  field text,
  graduation_year smallint NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  rejection_reason text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT degrees_user_id_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_degrees_user_id ON public.degrees(user_id);
CREATE INDEX IF NOT EXISTS idx_degrees_status ON public.degrees(status);

CREATE TABLE IF NOT EXISTS public.degree_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  degree_id uuid NOT NULL REFERENCES public.degrees(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_degree_documents_degree_id ON public.degree_documents(degree_id);

ALTER TABLE public.degrees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.degree_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS degrees_select_own ON public.degrees;
CREATE POLICY degrees_select_own ON public.degrees
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS degrees_select_admin ON public.degrees;
CREATE POLICY degrees_select_admin ON public.degrees
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role = 'admin' OR COALESCE(p.is_reviewer, false) = true)
    )
  );

DROP POLICY IF EXISTS degrees_insert_own ON public.degrees;
CREATE POLICY degrees_insert_own ON public.degrees
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS degrees_update_own_rejected ON public.degrees;
CREATE POLICY degrees_update_own_rejected ON public.degrees
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'rejected')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS degrees_update_admin ON public.degrees;
CREATE POLICY degrees_update_admin ON public.degrees
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role = 'admin' OR COALESCE(p.is_reviewer, false) = true)
    )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS degree_documents_select_own ON public.degree_documents;
CREATE POLICY degree_documents_select_own ON public.degree_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.degrees d WHERE d.id = degree_id AND d.user_id = auth.uid())
  );

DROP POLICY IF EXISTS degree_documents_select_admin ON public.degree_documents;
CREATE POLICY degree_documents_select_admin ON public.degree_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.role = 'admin' OR COALESCE(p.is_reviewer, false) = true)
    )
  );

DROP POLICY IF EXISTS degree_documents_insert_own ON public.degree_documents;
CREATE POLICY degree_documents_insert_own ON public.degree_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.degrees d WHERE d.id = degree_id AND d.user_id = auth.uid())
  );

DROP POLICY IF EXISTS degree_documents_delete_own ON public.degree_documents;
CREATE POLICY degree_documents_delete_own ON public.degree_documents
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.degrees d WHERE d.id = degree_id AND d.user_id = auth.uid())
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('degree-documents', 'degree-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS degree_verif_storage_insert ON storage.objects;
CREATE POLICY degree_verif_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'degree-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS degree_verif_storage_select_own ON storage.objects;
CREATE POLICY degree_verif_storage_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'degree-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS degree_verif_storage_delete_own ON storage.objects;
CREATE POLICY degree_verif_storage_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'degree-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMENT ON TABLE public.degrees IS 'User degree verification submissions (manual admin review)';
COMMENT ON TABLE public.degree_documents IS 'Storage path references for degree verification uploads';
