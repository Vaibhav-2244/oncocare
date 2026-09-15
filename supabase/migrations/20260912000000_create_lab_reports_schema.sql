CREATE TABLE IF NOT EXISTS lab_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  report_date timestamptz,
  laboratory_name text,
  report_title text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  sha256 text NOT NULL,
  storage_path text NOT NULL,
  extraction_status text NOT NULL DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'completed', 'failed')),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'confirmed', 'edited', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE TABLE IF NOT EXISTS lab_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES lab_reports(id) ON DELETE CASCADE,
  test_date timestamptz,
  test_name text NOT NULL,
  canonical_name text NOT NULL,
  original_value text,
  numeric_value numeric,
  normalized_value numeric,
  unit text,
  original_unit text,
  normalized_unit text,
  reference_low numeric,
  reference_high numeric,
  reference_text text,
  source text DEFAULT 'auto-extraction',
  extraction_confidence numeric DEFAULT 0,
  notes text,
  reviewed_state text,
  corrected_state boolean DEFAULT false,
  rejected_state boolean DEFAULT false,
  reviewer uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id uuid REFERENCES lab_reports(id) ON DELETE CASCADE,
  lab_value_id uuid REFERENCES lab_values(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_reports_user 
  ON lab_reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_reports_sha 
  ON lab_reports (user_id, sha256);
CREATE INDEX IF NOT EXISTS idx_lab_values_report 
  ON lab_values (report_id, canonical_name, test_date);
CREATE INDEX IF NOT EXISTS idx_lab_values_user_report 
  ON lab_values (report_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_report 
  ON audit_logs (report_id, created_at DESC);

ALTER TABLE lab_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lab_reports_select_own" ON lab_reports;
CREATE POLICY "lab_reports_select_own" ON lab_reports
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "lab_reports_insert_own" ON lab_reports;
CREATE POLICY "lab_reports_insert_own" ON lab_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "lab_reports_update_own" ON lab_reports;
CREATE POLICY "lab_reports_update_own" ON lab_reports
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "lab_reports_delete_own" ON lab_reports;
CREATE POLICY "lab_reports_delete_own" ON lab_reports
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "lab_values_select_own" ON lab_values;
CREATE POLICY "lab_values_select_own" ON lab_values
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lab_reports lr
      WHERE lr.id = lab_values.report_id
        AND lr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lab_values_insert_own" ON lab_values;
CREATE POLICY "lab_values_insert_own" ON lab_values
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lab_reports lr
      WHERE lr.id = lab_values.report_id
        AND lr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lab_values_update_own" ON lab_values;
CREATE POLICY "lab_values_update_own" ON lab_values
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lab_reports lr
      WHERE lr.id = lab_values.report_id
        AND lr.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lab_reports lr
      WHERE lr.id = lab_values.report_id
        AND lr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lab_values_delete_own" ON lab_values;
CREATE POLICY "lab_values_delete_own" ON lab_values
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lab_reports lr
      WHERE lr.id = lab_values.report_id
        AND lr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "audit_logs_select_own" ON audit_logs;
CREATE POLICY "audit_logs_select_own" ON audit_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "audit_logs_insert_own" ON audit_logs;
CREATE POLICY "audit_logs_insert_own" ON audit_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "audit_logs_update_own" ON audit_logs;
CREATE POLICY "audit_logs_update_own" ON audit_logs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "audit_logs_delete_own" ON audit_logs;
CREATE POLICY "audit_logs_delete_own" ON audit_logs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lab-reports', 'lab-reports', false, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "lab_reports_bucket_select_own" ON storage.objects;
CREATE POLICY "lab_reports_bucket_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'lab-reports' AND auth.uid()::text = split_part(name, '/', 1));

DROP POLICY IF EXISTS "lab_reports_bucket_insert_own" ON storage.objects;
CREATE POLICY "lab_reports_bucket_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lab-reports' AND auth.uid()::text = split_part(name, '/', 1));

DROP POLICY IF EXISTS "lab_reports_bucket_update_own" ON storage.objects;
CREATE POLICY "lab_reports_bucket_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'lab-reports' AND auth.uid()::text = split_part(name, '/', 1))
  WITH CHECK (bucket_id = 'lab-reports' AND auth.uid()::text = split_part(name, '/', 1));

DROP POLICY IF EXISTS "lab_reports_bucket_delete_own" ON storage.objects;
CREATE POLICY "lab_reports_bucket_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'lab-reports' AND auth.uid()::text = split_part(name, '/', 1));
