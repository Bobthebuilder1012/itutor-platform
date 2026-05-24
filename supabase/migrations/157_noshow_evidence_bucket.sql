-- =====================================================
-- NO-SHOW EVIDENCE STORAGE BUCKET
-- =====================================================
-- Private bucket. Uploaders write to <auth_uid>/<claim_id>/<file>.
-- Admin (service-role) reads everything for review.
-- =====================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('noshow-evidence', 'noshow-evidence', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS noshow_evidence_insert ON storage.objects;
CREATE POLICY noshow_evidence_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'noshow-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS noshow_evidence_select_own ON storage.objects;
CREATE POLICY noshow_evidence_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'noshow-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS noshow_evidence_delete_own ON storage.objects;
CREATE POLICY noshow_evidence_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'noshow-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
