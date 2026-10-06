-- Restrict BPL reads to the intentionally public fundraising surface and keep
-- hospital demo data unavailable to ordinary production staff.

DROP POLICY IF EXISTS "auth_view_all_patients" ON public.bpl_patients;
DROP POLICY IF EXISTS "public_view_verified_patients" ON public.bpl_patients;

CREATE POLICY "bpl_owner_read" ON public.bpl_patients
FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'super_admin')
  )
);

CREATE POLICY "bpl_public_verified_read" ON public.bpl_patients
FOR SELECT TO anon, authenticated
USING (verified = true);

CREATE OR REPLACE VIEW public.bpl_public_patients
WITH (security_invoker = true)
AS
SELECT
  id, name, age, gender, cancer_type, stage, location, treatment,
  goal_amount, raised_amount, donors_count, urgent, image_url, summary,
  verified, created_at, updated_at
FROM public.bpl_patients;

GRANT SELECT ON public.bpl_public_patients TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.load_demo_data(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.environment', true) NOT IN ('development', 'staging') THEN
    RAISE EXCEPTION 'Demo data is disabled outside development and staging'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'Use the development/staging demo bundle to load sample data'
    USING ERRCODE = '0A000';
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_demo_data(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.environment', true) NOT IN ('development', 'staging') THEN
    RAISE EXCEPTION 'Demo data is disabled outside development and staging'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'Demo data removal must be performed by the staging maintenance job'
    USING ERRCODE = '0A000';
END;
$$;

REVOKE ALL ON FUNCTION public.load_demo_data(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_demo_data(uuid) FROM PUBLIC, anon, authenticated;
