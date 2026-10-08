-- Keep the patient treatment tracker aligned with its persisted form fields.
ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS scheduled_time time,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS doctor text,
  ADD COLUMN IF NOT EXISTS reminder boolean NOT NULL DEFAULT true;

-- These fields are written by the shared symptom-monitor service.
ALTER TABLE public.side_effect_entries
  ADD COLUMN IF NOT EXISTS cancer_type text,
  ADD COLUMN IF NOT EXISTS treatment_type text,
  ADD COLUMN IF NOT EXISTS journey_phase text;

-- Patient photos are optional, but the configured bucket must exist in every
-- Supabase project receiving this migration.
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
  FOR SELECT TO public
  USING (bucket_id = 'bpl-patients');

DROP POLICY IF EXISTS "bpl_patient_photos_authenticated_upload" ON storage.objects;
CREATE POLICY "bpl_patient_photos_authenticated_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bpl-patients'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

DROP POLICY IF EXISTS "bpl_patient_photos_owner_update" ON storage.objects;
CREATE POLICY "bpl_patient_photos_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
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
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'bpl-patients'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

NOTIFY pgrst, 'reload schema';
