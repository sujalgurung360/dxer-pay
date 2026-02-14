-- ============================================================
-- Storage bucket for receipts
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: Authenticated users can upload to their org's folder
CREATE POLICY receipts_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
  );

-- Policy: Members can view their org's receipts
CREATE POLICY receipts_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
  );

-- Policy: Admin+ can delete receipts
CREATE POLICY receipts_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND user_has_role((storage.foldername(name))[1]::uuid, 'admin')
  );
