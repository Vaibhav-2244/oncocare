-- Store optional patient campaign photos uploaded by authenticated users.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bpl-patients',
  'bpl-patients',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "bpl_patient_photos_public_read" ON storage.objects;
CREATE POLICY "bpl_patient_photos_public_read" ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'bpl-patients');

DROP POLICY IF EXISTS "bpl_patient_photos_authenticated_upload" ON storage.objects;
CREATE POLICY "bpl_patient_photos_authenticated_upload" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'bpl-patients'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

DROP POLICY IF EXISTS "bpl_patient_photos_owner_update" ON storage.objects;
CREATE POLICY "bpl_patient_photos_owner_update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'bpl-patients'
    AND auth.uid()::text = split_part(name, '/', 1)
  )
  WITH CHECK (
    bucket_id = 'bpl-patients'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

DROP POLICY IF EXISTS "bpl_patient_photos_owner_delete" ON storage.objects;
CREATE POLICY "bpl_patient_photos_owner_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'bpl-patients'
    AND auth.uid()::text = split_part(name, '/', 1)
  );