-- 20261003000000_create_doctor_workspace_roster.sql
-- Doctor workspace and roster foundation.
-- Clinical records and patient consent are added in later doctor migrations.

CREATE TABLE IF NOT EXISTS public.doctor_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  registration_no text,
  registration_council text,
  specialization text DEFAULT 'Medical Oncology',
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'submitted', 'verified', 'rejected')),
  demo_data_loaded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  slot_minutes smallint NOT NULL DEFAULT 30 CHECK (slot_minutes BETWEEN 5 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, weekday),
  CHECK (start_time < end_time)
);

CREATE TABLE IF NOT EXISTS public.doctor_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at)
);

CREATE TABLE IF NOT EXISTS public.doctor_patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_code text NOT NULL,
  full_name text NOT NULL,
  date_of_birth date,
  sex text,
  phone text,
  cancer_type text,
  stage text,
  current_treatment text,
  cycle_label text,
  risk_level text NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'moderate', 'high')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, patient_code)
);

CREATE TABLE IF NOT EXISTS public.doctor_patient_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note text NOT NULL CHECK (length(trim(note)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctor_patients_doctor_status
  ON public.doctor_patients (doctor_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_doctor_patient_notes_patient
  ON public.doctor_patient_notes (doctor_patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doctor_leaves_doctor_dates
  ON public.doctor_leaves (doctor_id, starts_at, ends_at);

ALTER TABLE public.doctor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_patient_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctor_profiles_owner ON public.doctor_profiles;
CREATE POLICY doctor_profiles_owner ON public.doctor_profiles
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS doctor_availability_owner ON public.doctor_availability;
CREATE POLICY doctor_availability_owner ON public.doctor_availability
  FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_leaves_owner ON public.doctor_leaves;
CREATE POLICY doctor_leaves_owner ON public.doctor_leaves
  FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_patients_owner ON public.doctor_patients;
CREATE POLICY doctor_patients_owner ON public.doctor_patients
  FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_patient_notes_owner ON public.doctor_patient_notes;
CREATE POLICY doctor_patient_notes_owner ON public.doctor_patient_notes
  FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.doctor_has_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name = 'doctor'
  );
$$;

CREATE OR REPLACE FUNCTION public.ensure_doctor_workspace()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_row public.doctor_profiles;
  display_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(NULLIF(trim(p.full_name), ''), split_part(COALESCE(p.email, ''), '@', 1), 'Doctor')
    INTO display_name
  FROM public.profiles p
  WHERE p.id = auth.uid();

  INSERT INTO public.doctor_profiles (user_id, full_name)
  VALUES (auth.uid(), COALESCE(display_name, 'Doctor'))
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.doctor_availability (doctor_id, weekday, start_time, end_time)
  SELECT auth.uid(), day_number, '09:00', '17:00'
  FROM generate_series(1, 5) AS day_number
  ON CONFLICT (doctor_id, weekday) DO NOTHING;

  SELECT * INTO profile_row FROM public.doctor_profiles WHERE user_id = auth.uid();
  RETURN jsonb_build_object(
    'profile', to_jsonb(profile_row),
    'affiliations', '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_update_profile(p_fields jsonb)
RETURNS public.doctor_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated public.doctor_profiles;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.doctor_profiles
  SET full_name = COALESCE(NULLIF(trim(p_fields->>'full_name'), ''), full_name),
      registration_no = CASE WHEN p_fields ? 'registration_no' THEN NULLIF(trim(p_fields->>'registration_no'), '') ELSE registration_no END,
      registration_council = CASE WHEN p_fields ? 'registration_council' THEN NULLIF(trim(p_fields->>'registration_council'), '') ELSE registration_council END,
      specialization = COALESCE(NULLIF(trim(p_fields->>'specialization'), ''), specialization),
      updated_at = now()
  WHERE user_id = auth.uid()
  RETURNING * INTO updated;

  IF updated.user_id IS NULL THEN
    RAISE EXCEPTION 'Doctor workspace is not initialized';
  END IF;
  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_list_patients(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  query_text text := NULLIF(trim(COALESCE(p_filters->>'q', '')), '');
  risk_filter text := NULLIF(trim(COALESCE(p_filters->>'risk', '')), '');
  status_filter text := COALESCE(NULLIF(p_filters->>'status', ''), 'active');
  result_rows jsonb;
  result_total bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO result_total
  FROM public.doctor_patients p
  WHERE p.doctor_id = auth.uid()
    AND (status_filter = 'all' OR p.status = status_filter)
    AND (risk_filter IS NULL OR p.risk_level = risk_filter)
    AND (query_text IS NULL OR p.full_name ILIKE '%' || query_text || '%' OR p.patient_code ILIKE '%' || query_text || '%');

  SELECT COALESCE(jsonb_agg(to_jsonb(rows) ORDER BY rows.updated_at DESC), '[]'::jsonb)
    INTO result_rows
  FROM (
    SELECT p.id, p.patient_code, p.full_name,
      extract(year FROM age(current_date, p.date_of_birth))::int AS age,
      p.sex, p.phone, p.cancer_type, p.stage, p.current_treatment, p.cycle_label,
      p.risk_level AS risk, p.status, p.patient_user_id, p.updated_at
    FROM public.doctor_patients p
    WHERE p.doctor_id = auth.uid()
      AND (status_filter = 'all' OR p.status = status_filter)
      AND (risk_filter IS NULL OR p.risk_level = risk_filter)
      AND (query_text IS NULL OR p.full_name ILIKE '%' || query_text || '%' OR p.patient_code ILIKE '%' || query_text || '%')
    ORDER BY p.updated_at DESC
    LIMIT LEAST(GREATEST(COALESCE((p_filters->>'limit')::int, 100), 1), 200)
    OFFSET GREATEST(COALESCE((p_filters->>'offset')::int, 0), 0)
  ) rows;

  RETURN jsonb_build_object('total', result_total, 'rows', result_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_create_patient(p_fields jsonb)
RETURNS public.doctor_patients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number integer;
  created public.doctor_patients;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(trim(p_fields->>'full_name'), '') IS NULL THEN
    RAISE EXCEPTION 'Patient name is required' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max((regexp_match(patient_code, '^OC-([0-9]+)$'))[1]::int), 0) + 1
    INTO next_number
  FROM public.doctor_patients
  WHERE doctor_id = auth.uid();

  INSERT INTO public.doctor_patients (
    doctor_id, patient_code, full_name, date_of_birth, sex, phone,
    cancer_type, stage, current_treatment, cycle_label, risk_level
  )
  VALUES (
    auth.uid(), 'OC-' || lpad(next_number::text, 4, '0'), trim(p_fields->>'full_name'),
    NULLIF(p_fields->>'date_of_birth', '')::date, NULLIF(trim(p_fields->>'sex'), ''),
    NULLIF(trim(p_fields->>'phone'), ''), NULLIF(trim(p_fields->>'cancer_type'), ''),
    NULLIF(trim(p_fields->>'stage'), ''), NULLIF(trim(p_fields->>'current_treatment'), ''),
    NULLIF(trim(p_fields->>'cycle_label'), ''), COALESCE(NULLIF(p_fields->>'risk_level', ''), 'low')
  )
  RETURNING * INTO created;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_get_patient(p_patient_id uuid)
RETURNS public.doctor_patients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  patient public.doctor_patients;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO patient FROM public.doctor_patients
  WHERE id = p_patient_id AND doctor_id = auth.uid();
  IF patient.id IS NULL THEN
    RAISE EXCEPTION 'Patient not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN patient;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count bigint;
  high_risk_count bigint;
  next_patients jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO active_count FROM public.doctor_patients WHERE doctor_id = auth.uid() AND status = 'active';
  SELECT count(*) INTO high_risk_count FROM public.doctor_patients WHERE doctor_id = auth.uid() AND status = 'active' AND risk_level = 'high';
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC), '[]'::jsonb) INTO next_patients
    FROM (SELECT id, patient_code, full_name, risk_level, updated_at FROM public.doctor_patients
      WHERE doctor_id = auth.uid() AND status = 'active' ORDER BY updated_at DESC LIMIT 5) p;
  RETURN jsonb_build_object(
    'kpis', jsonb_build_object('active_patients', active_count, 'appointments_today', 0,
      'pending_confirmations', 0, 'high_risk', high_risk_count, 'unread_items', 0),
    'next_appointments', '[]'::jsonb, 'attention', next_patients, 'trend_14d', '[]'::jsonb,
    'quick_counts', jsonb_build_object('unsigned_consultations', 0, 'unreviewed_reports', 0, 'unread_messages', 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_save_availability(p_rows jsonb)
RETURNS SETOF public.doctor_availability
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE row_data jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.doctor_availability WHERE doctor_id = auth.uid();
  FOR row_data IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) LOOP
    INSERT INTO public.doctor_availability (doctor_id, weekday, start_time, end_time, slot_minutes)
    VALUES (auth.uid(), (row_data->>'weekday')::smallint, (row_data->>'start_time')::time, (row_data->>'end_time')::time, COALESCE((row_data->>'slot_minutes')::smallint, 30));
  END LOOP;
  RETURN QUERY SELECT * FROM public.doctor_availability WHERE doctor_id = auth.uid() ORDER BY weekday;
END;
$$;

REVOKE ALL ON FUNCTION public.doctor_has_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doctor_has_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_doctor_workspace() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_update_profile(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_list_patients(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_create_patient(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_get_patient(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_dashboard_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_save_availability(jsonb) TO authenticated;

-- 20261003010000_doctor_clinical_records.sql
-- Doctor-owned clinical records. Patient links and consent scopes are added separately.

CREATE TABLE IF NOT EXISTS public.doctor_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  duration_minutes smallint NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 240),
  visit_type text NOT NULL DEFAULT 'follow_up' CHECK (visit_type IN ('initial', 'follow_up', 'teleconsultation', 'treatment')),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE RESTRICT,
  appointment_id uuid REFERENCES public.doctor_appointments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  subjective text,
  objective text,
  assessment text,
  plan text,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE RESTRICT,
  consultation_id uuid REFERENCES public.doctor_consultations(id) ON DELETE SET NULL,
  prescription_no text NOT NULL,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'cancelled', 'expired')),
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, prescription_no)
);

CREATE TABLE IF NOT EXISTS public.doctor_treatment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE RESTRICT,
  name text NOT NULL,
  protocol text,
  cycles_total integer CHECK (cycles_total IS NULL OR cycles_total > 0),
  cycles_completed integer NOT NULL DEFAULT 0 CHECK (cycles_completed >= 0),
  progress_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'review_required', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE RESTRICT,
  report_type text NOT NULL,
  report_date date NOT NULL DEFAULT current_date,
  flag text NOT NULL DEFAULT 'normal' CHECK (flag IN ('normal', 'attention', 'critical')),
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctor_appointments_schedule ON public.doctor_appointments (doctor_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_doctor_consultations_patient ON public.doctor_consultations (doctor_id, doctor_patient_id, updated_at DESC);

ALTER TABLE public.doctor_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctor_appointments_owner ON public.doctor_appointments;
CREATE POLICY doctor_appointments_owner ON public.doctor_appointments FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_consultations_owner ON public.doctor_consultations;
CREATE POLICY doctor_consultations_owner ON public.doctor_consultations FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_prescriptions_owner ON public.doctor_prescriptions;
CREATE POLICY doctor_prescriptions_owner ON public.doctor_prescriptions FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_treatment_plans_owner ON public.doctor_treatment_plans;
CREATE POLICY doctor_treatment_plans_owner ON public.doctor_treatment_plans FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_reports_owner ON public.doctor_reports;
CREATE POLICY doctor_reports_owner ON public.doctor_reports FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.doctor_list_appointments(p_from timestamptz DEFAULT now(), p_to timestamptz DEFAULT now() + interval '30 days')
RETURNS SETOF public.doctor_appointments
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.* FROM public.doctor_appointments a
  WHERE a.doctor_id = auth.uid() AND a.starts_at >= p_from AND a.starts_at < p_to
  ORDER BY a.starts_at;
$$;

CREATE OR REPLACE FUNCTION public.doctor_create_appointment(p_patient_id uuid, p_at timestamptz, p_visit_type text DEFAULT 'follow_up', p_reason text DEFAULT NULL, p_duration smallint DEFAULT 30)
RETURNS public.doctor_appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created public.doctor_appointments;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doctor_patients WHERE id = p_patient_id AND doctor_id = auth.uid() AND status = 'active') THEN
    RAISE EXCEPTION 'Patient is not in your active roster' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.doctor_appointments WHERE doctor_id = auth.uid() AND status NOT IN ('cancelled', 'no_show') AND starts_at < p_at + make_interval(mins => p_duration) AND starts_at + make_interval(mins => duration_minutes) > p_at) THEN
    RAISE EXCEPTION 'Appointment overlaps an existing appointment' USING ERRCODE = '23P01';
  END IF;
  INSERT INTO public.doctor_appointments (doctor_id, doctor_patient_id, starts_at, visit_type, reason, duration_minutes)
  VALUES (auth.uid(), p_patient_id, p_at, p_visit_type, p_reason, p_duration)
  RETURNING * INTO created;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_list_consultations()
RETURNS SETOF public.doctor_consultations
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT c.* FROM public.doctor_consultations c WHERE c.doctor_id = auth.uid() ORDER BY c.updated_at DESC; $$;

CREATE OR REPLACE FUNCTION public.doctor_save_consultation(p_id uuid, p_patient_id uuid, p_fields jsonb)
RETURNS public.doctor_consultations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE saved public.doctor_consultations;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.doctor_consultations (doctor_id, doctor_patient_id, subjective, objective, assessment, plan)
    VALUES (auth.uid(), p_patient_id, p_fields->>'subjective', p_fields->>'objective', p_fields->>'assessment', p_fields->>'plan') RETURNING * INTO saved;
  ELSE
    UPDATE public.doctor_consultations SET subjective = p_fields->>'subjective', objective = p_fields->>'objective',
      assessment = p_fields->>'assessment', plan = p_fields->>'plan', updated_at = now()
      WHERE id = p_id AND doctor_id = auth.uid() AND status = 'draft' RETURNING * INTO saved;
  END IF;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'Draft consultation not found or is already signed'; END IF;
  RETURN saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_sign_consultation(p_id uuid)
RETURNS public.doctor_consultations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE signed public.doctor_consultations;
BEGIN
  UPDATE public.doctor_consultations SET status = 'signed', signed_at = now(), updated_at = now()
  WHERE id = p_id AND doctor_id = auth.uid() AND status = 'draft' RETURNING * INTO signed;
  IF signed.id IS NULL THEN RAISE EXCEPTION 'Only an existing draft can be signed'; END IF;
  RETURN signed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_list_appointments(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_create_appointment(uuid, timestamptz, text, text, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_list_consultations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_save_consultation(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_sign_consultation(uuid) TO authenticated;

-- 20261003020000_doctor_links_prescriptions_reports.sql
-- Consent-first patient links and the remaining doctor record RPCs.

CREATE TABLE IF NOT EXISTS public.doctor_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_consents (
  doctor_patient_id uuid PRIMARY KEY REFERENCES public.doctor_patients(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scopes text[] NOT NULL DEFAULT '{}',
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE OR REPLACE FUNCTION public.redeem_doctor_link_code(p_code text, p_scopes text[] DEFAULT ARRAY['appointments']::text[])
RETURNS public.doctor_consents
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE link_row public.doctor_link_codes; consent_row public.doctor_consents;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name = 'patient'
  ) THEN RAISE EXCEPTION 'Patient role is required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO link_row FROM public.doctor_link_codes
  WHERE code_hash = encode(digest(upper(trim(p_code)), 'sha256'), 'hex')
    AND redeemed_at IS NULL AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;
  IF link_row.id IS NULL THEN RAISE EXCEPTION 'Invalid or expired link code' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.doctor_consents (doctor_patient_id, patient_user_id, scopes)
  VALUES (link_row.doctor_patient_id, auth.uid(), COALESCE(p_scopes, ARRAY['appointments']::text[]))
  ON CONFLICT (doctor_patient_id) DO UPDATE SET patient_user_id = EXCLUDED.patient_user_id, scopes = EXCLUDED.scopes, granted_at = now(), revoked_at = NULL
  RETURNING * INTO consent_row;
  UPDATE public.doctor_link_codes SET redeemed_at = now() WHERE id = link_row.id;
  UPDATE public.doctor_patients SET patient_user_id = auth.uid(), updated_at = now() WHERE id = link_row.doctor_patient_id;
  RETURN consent_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_doctor_verifications()
RETURNS SETOF public.doctor_profiles
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT dp.* FROM public.doctor_profiles dp
  WHERE EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'super_admin')
  ) ORDER BY dp.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_doctor_verification(p_doctor_user_id uuid, p_status text)
RETURNS public.doctor_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE updated public.doctor_profiles;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'super_admin')
  ) THEN RAISE EXCEPTION 'Administrator role is required' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('pending', 'submitted', 'verified', 'rejected') THEN RAISE EXCEPTION 'Invalid verification status' USING ERRCODE = '22023'; END IF;
  UPDATE public.doctor_profiles SET verification_status = p_status, updated_at = now()
  WHERE user_id = p_doctor_user_id RETURNING * INTO updated;
  RETURN updated;
END;
$$;

ALTER TABLE public.doctor_link_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doctor_link_codes_owner ON public.doctor_link_codes;
CREATE POLICY doctor_link_codes_owner ON public.doctor_link_codes FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_consents_doctor_owner ON public.doctor_consents;
CREATE POLICY doctor_consents_doctor_owner ON public.doctor_consents FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.doctor_patients p WHERE p.id = doctor_patient_id AND p.doctor_id = auth.uid())
);
DROP POLICY IF EXISTS doctor_consents_patient_owner ON public.doctor_consents;
CREATE POLICY doctor_consents_patient_owner ON public.doctor_consents FOR SELECT TO authenticated USING (patient_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.doctor_create_link_code(p_doctor_patient_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE raw_code text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doctor_profiles WHERE user_id = auth.uid() AND verification_status = 'verified') THEN
    RAISE EXCEPTION 'Doctor verification is required before inviting a patient' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doctor_patients WHERE id = p_doctor_patient_id AND doctor_id = auth.uid() AND status = 'active') THEN
    RAISE EXCEPTION 'Patient is not in your active roster' USING ERRCODE = '42501';
  END IF;
  raw_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.doctor_link_codes (doctor_id, doctor_patient_id, code_hash, expires_at)
  VALUES (auth.uid(), p_doctor_patient_id, encode(digest(raw_code, 'sha256'), 'hex'), now() + interval '7 days');
  RETURN raw_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_list_link_codes()
RETURNS TABLE(id uuid, doctor_patient_id uuid, expires_at timestamptz, redeemed_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT id, doctor_patient_id, expires_at, redeemed_at FROM public.doctor_link_codes WHERE doctor_id = auth.uid() ORDER BY created_at DESC; $$;

CREATE OR REPLACE FUNCTION public.doctor_create_prescription(p_patient_id uuid, p_items jsonb, p_valid_until date DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS public.doctor_prescriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE created public.doctor_prescriptions; next_no integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN RAISE EXCEPTION 'At least one prescription item is required' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doctor_patients WHERE id = p_patient_id AND doctor_id = auth.uid()) THEN RAISE EXCEPTION 'Patient is not in your roster' USING ERRCODE = '42501'; END IF;
  SELECT count(*) + 1 INTO next_no FROM public.doctor_prescriptions WHERE doctor_id = auth.uid();
  INSERT INTO public.doctor_prescriptions (doctor_id, doctor_patient_id, prescription_no, items, valid_until, notes)
  VALUES (auth.uid(), p_patient_id, 'RX-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(next_no::text, 4, '0'), p_items, p_valid_until, p_notes)
  RETURNING * INTO created;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_list_reports()
RETURNS SETOF public.doctor_reports
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT r.* FROM public.doctor_reports r WHERE r.doctor_id = auth.uid() ORDER BY r.report_date DESC, r.created_at DESC; $$;

CREATE OR REPLACE FUNCTION public.doctor_add_manual_report(p_patient_id uuid, p_type text, p_date date, p_flag text, p_summary text)
RETURNS public.doctor_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE created public.doctor_reports;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.doctor_reports (doctor_id, doctor_patient_id, report_type, report_date, flag, summary)
  SELECT auth.uid(), p.id, p_type, COALESCE(p_date, current_date), COALESCE(p_flag, 'normal'), p_summary
  FROM public.doctor_patients p WHERE p.id = p_patient_id AND p.doctor_id = auth.uid()
  RETURNING * INTO created;
  IF created.id IS NULL THEN RAISE EXCEPTION 'Patient is not in your roster' USING ERRCODE = '42501'; END IF;
  RETURN created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_create_link_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_doctor_link_code(text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_list_link_codes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_create_prescription(uuid, jsonb, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_list_reports() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_add_manual_report(uuid, text, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_doctor_verifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_doctor_verification(uuid, text) TO authenticated;

-- 20261003030000_doctor_live_data_messaging.sql
-- Consent-scoped access to existing patient data and doctor messaging.

CREATE OR REPLACE FUNCTION public.doctor_get_patient_live_data(p_doctor_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE patient_user uuid; granted text[]; result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  SELECT p.patient_user_id, c.scopes INTO patient_user, granted
  FROM public.doctor_patients p
  LEFT JOIN public.doctor_consents c ON c.doctor_patient_id = p.id AND c.revoked_at IS NULL
  WHERE p.id = p_doctor_patient_id AND p.doctor_id = auth.uid();
  IF patient_user IS NULL OR granted IS NULL THEN RAISE EXCEPTION 'Patient has not granted active consent' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object(
    'symptoms', CASE WHEN 'symptoms' = ANY(granted) THEN COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.recorded_at DESC) FROM public.symptoms s WHERE s.user_id = patient_user AND s.recorded_at > now() - interval '30 days'), '[]'::jsonb) ELSE '[]'::jsonb END,
    'side_effects', CASE WHEN 'side_effects' = ANY(granted) THEN COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.recorded_at DESC) FROM public.side_effect_entries s WHERE s.user_id = patient_user AND s.recorded_at > now() - interval '30 days'), '[]'::jsonb) ELSE '[]'::jsonb END,
    'medications', CASE WHEN 'medications' = ANY(granted) THEN COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC) FROM public.medications m WHERE m.user_id = patient_user AND m.is_active), '[]'::jsonb) ELSE '[]'::jsonb END,
    'timeline', CASE WHEN 'timeline' = ANY(granted) THEN COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.event_date DESC) FROM public.health_timeline t WHERE t.user_id = patient_user), '[]'::jsonb) ELSE '[]'::jsonb END,
    'consent_scopes', to_jsonb(granted)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_list_messages(p_doctor_patient_id uuid)
RETURNS SETOF public.messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE patient_user uuid; granted text[];
BEGIN
  SELECT p.patient_user_id, c.scopes INTO patient_user, granted
  FROM public.doctor_patients p JOIN public.doctor_consents c ON c.doctor_patient_id = p.id AND c.revoked_at IS NULL
  WHERE p.id = p_doctor_patient_id AND p.doctor_id = auth.uid();
  IF NOT ('messages' = ANY(COALESCE(granted, '{}'::text[]))) THEN RAISE EXCEPTION 'Messaging consent is not active' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT m.* FROM public.messages m
  WHERE (m.sender_id = auth.uid() AND m.recipient_id = patient_user)
     OR (m.sender_id = patient_user AND m.recipient_id = auth.uid())
  ORDER BY m.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_send_message(p_doctor_patient_id uuid, p_content text)
RETURNS public.messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE patient_user uuid; granted text[]; created public.messages;
BEGIN
  SELECT p.patient_user_id, c.scopes INTO patient_user, granted
  FROM public.doctor_patients p JOIN public.doctor_consents c ON c.doctor_patient_id = p.id AND c.revoked_at IS NULL
  WHERE p.id = p_doctor_patient_id AND p.doctor_id = auth.uid();
  IF patient_user IS NULL OR NOT ('messages' = ANY(COALESCE(granted, '{}'::text[]))) THEN RAISE EXCEPTION 'Messaging consent is not active' USING ERRCODE = '42501'; END IF;
  IF NULLIF(trim(p_content), '') IS NULL THEN RAISE EXCEPTION 'Message cannot be empty' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.messages (sender_id, recipient_id, content) VALUES (auth.uid(), patient_user, trim(p_content)) RETURNING * INTO created;
  INSERT INTO public.notifications (user_id, title, message, type) VALUES (patient_user, 'New message from your doctor', trim(p_content), 'message');
  RETURN created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_get_patient_live_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_list_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_send_message(uuid, text) TO authenticated;

-- 20261003040000_doctor_hospital_affiliation.sql
-- Connect verified doctor accounts to the existing hospital membership and OPD system.

CREATE OR REPLACE FUNCTION public.ensure_doctor_hospital_workspace()
RETURNS public.hospital_orgs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_invite public.hospital_invites;
  v_org public.hospital_orgs;
  v_doctor public.doctor_profiles;
BEGIN
  IF v_user_id IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_doctor FROM public.doctor_profiles WHERE user_id = v_user_id;
  IF v_doctor.verification_status IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'Doctor verification is required for hospital affiliation' USING ERRCODE = '42501';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  SELECT hi.* INTO v_invite
  FROM public.hospital_invites hi
  WHERE lower(hi.email) = lower(v_email)
    AND hi.staff_role = 'doctor'
    AND hi.accepted_at IS NULL
    AND hi.expires_at > now()
  ORDER BY hi.created_at
  LIMIT 1
  FOR UPDATE;

  IF v_invite.id IS NOT NULL THEN
    INSERT INTO public.hospital_members (hospital_id, user_id, staff_role)
    VALUES (v_invite.hospital_id, v_user_id, 'doctor')
    ON CONFLICT (hospital_id, user_id, staff_role) DO UPDATE SET is_active = true;

    INSERT INTO public.hospital_doctors (hospital_id, user_id, doctor_name, specialty, is_active)
    VALUES (v_invite.hospital_id, v_user_id, v_doctor.full_name, v_doctor.specialization, true)
    ON CONFLICT (hospital_id, doctor_name)
    DO UPDATE SET user_id = EXCLUDED.user_id, is_active = true;

    UPDATE public.hospital_invites SET accepted_at = now() WHERE id = v_invite.id;
    INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
    VALUES (v_invite.hospital_id, v_user_id, 'doctor.invite_accepted', jsonb_build_object('invite_id', v_invite.id));
  END IF;

  SELECT h.* INTO v_org
  FROM public.hospital_orgs h
  JOIN public.hospital_members hm ON hm.hospital_id = h.id
  WHERE hm.user_id = v_user_id AND hm.is_active AND hm.staff_role = 'doctor'
  ORDER BY hm.created_at, h.created_at
  LIMIT 1;
  RETURN v_org;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_hospital_affiliations()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'hospital_id', h.id, 'name', h.name,
    'verification_status', h.verification_status,
    'staff_roles', roles.staff_roles
  ) ORDER BY h.name), '[]'::jsonb)
  FROM public.hospital_orgs h
  JOIN public.hospital_members hm ON hm.hospital_id = h.id AND hm.user_id = auth.uid() AND hm.is_active
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(DISTINCT hm2.staff_role ORDER BY hm2.staff_role) AS staff_roles
    FROM public.hospital_members hm2
    WHERE hm2.hospital_id = h.id AND hm2.user_id = auth.uid() AND hm2.is_active
  ) roles ON true
  WHERE public.doctor_has_role();
$$;

GRANT EXECUTE ON FUNCTION public.ensure_doctor_hospital_workspace() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_hospital_affiliations() TO authenticated;

-- 20261003050000_patient_doctor_link_surfaces.sql
-- Patient-facing access to the consented doctor workspace.

CREATE OR REPLACE FUNCTION public.patient_list_doctor_appointments()
RETURNS SETOF public.doctor_appointments
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.*
  FROM public.doctor_appointments a
  JOIN public.doctor_patients dp ON dp.id = a.doctor_patient_id
  JOIN public.doctor_consents c ON c.doctor_patient_id = dp.id
    AND c.revoked_at IS NULL AND dp.doctor_id = a.doctor_id
  WHERE dp.patient_user_id = auth.uid()
  ORDER BY a.starts_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.patient_request_doctor_appointment(
  p_doctor_id uuid,
  p_starts_at timestamptz,
  p_visit_type text,
  p_reason text
)
RETURNS public.doctor_appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient public.doctor_patients;
  v_appointment public.doctor_appointments;
BEGIN
  SELECT dp.* INTO v_patient
  FROM public.doctor_patients dp
  JOIN public.doctor_consents c ON c.doctor_patient_id = dp.id
    AND c.revoked_at IS NULL AND dp.doctor_id = p_doctor_id
  WHERE dp.patient_user_id = auth.uid()
  ORDER BY c.granted_at DESC
  LIMIT 1;
  IF v_patient.id IS NULL THEN RAISE EXCEPTION 'Active doctor consent is required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.doctor_appointments (doctor_id, doctor_patient_id, starts_at, visit_type, status, reason)
  VALUES (p_doctor_id, v_patient.id, p_starts_at, p_visit_type, 'pending', NULLIF(btrim(p_reason), ''))
  RETURNING * INTO v_appointment;
  RETURN v_appointment;
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_list_doctor_messages(p_doctor_id uuid)
RETURNS TABLE(id uuid, sender_id uuid, recipient_id uuid, content text, is_read boolean, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.sender_id, m.recipient_id, m.content, m.is_read, m.created_at
  FROM public.messages m
  JOIN public.doctor_patients dp ON (m.sender_id = p_doctor_id AND m.recipient_id = dp.patient_user_id)
    OR (m.recipient_id = p_doctor_id AND m.sender_id = dp.patient_user_id)
  JOIN public.doctor_consents c ON c.doctor_patient_id = dp.id
    AND c.revoked_at IS NULL AND dp.doctor_id = p_doctor_id
  WHERE dp.patient_user_id = auth.uid()
  ORDER BY m.created_at;
$$;

CREATE OR REPLACE FUNCTION public.patient_send_doctor_message(p_doctor_id uuid, p_content text)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id uuid;
  v_message public.messages;
BEGIN
  SELECT dp.id INTO v_patient_id
  FROM public.doctor_patients dp
  JOIN public.doctor_consents c ON c.doctor_patient_id = dp.id
    AND c.revoked_at IS NULL AND dp.doctor_id = p_doctor_id
  WHERE dp.patient_user_id = auth.uid()
  LIMIT 1;
  IF v_patient_id IS NULL OR p_content IS NULL OR btrim(p_content) = '' THEN
    RAISE EXCEPTION 'Active doctor consent and message content are required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.messages (sender_id, recipient_id, content)
  VALUES (auth.uid(), p_doctor_id, btrim(p_content))
  RETURNING * INTO v_message;
  RETURN v_message;
END;
$$;

GRANT EXECUTE ON FUNCTION public.patient_list_doctor_appointments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_request_doctor_appointment(uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_list_doctor_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_send_doctor_message(uuid, text) TO authenticated;

-- 20261003060000_doctor_prescription_versions_audit.sql
-- Immutable prescription history and security audit trail.

CREATE TABLE IF NOT EXISTS public.doctor_prescription_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES public.doctor_prescriptions(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
  notes text,
  status text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prescription_id, version)
);

CREATE TABLE IF NOT EXISTS public.doctor_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  doctor_patient_id uuid REFERENCES public.doctor_patients(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doctor_prescription_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY doctor_prescription_versions_owner ON public.doctor_prescription_versions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.doctor_prescriptions p
    WHERE p.id = prescription_id AND p.doctor_id = auth.uid()
  ));
CREATE POLICY doctor_audit_log_owner ON public.doctor_audit_log
  FOR SELECT TO authenticated USING (actor_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.doctor_amend_prescription(
  p_prescription_id uuid, p_items jsonb, p_notes text
)
RETURNS public.doctor_prescription_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prescription public.doctor_prescriptions;
  v_version public.doctor_prescription_versions;
  v_next integer;
BEGIN
  SELECT * INTO v_prescription FROM public.doctor_prescriptions
  WHERE id = p_prescription_id AND doctor_id = auth.uid() FOR UPDATE;
  IF v_prescription.id IS NULL OR v_prescription.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active prescription owned by the doctor can be amended' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Prescription items are required' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(max(version), 0) + 1 INTO v_next
  FROM public.doctor_prescription_versions WHERE prescription_id = p_prescription_id;
  INSERT INTO public.doctor_prescription_versions (prescription_id, version, items, notes, status, created_by)
  VALUES (p_prescription_id, v_next, p_items, p_notes, 'active', auth.uid())
  RETURNING * INTO v_version;
  UPDATE public.doctor_prescriptions SET items = p_items, notes = p_notes WHERE id = p_prescription_id;
  INSERT INTO public.doctor_audit_log (actor_user_id, doctor_patient_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), v_prescription.doctor_patient_id, 'prescription.amended', 'doctor_prescription', p_prescription_id, jsonb_build_object('version', v_next));
  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_record_audit(
  p_action text, p_entity_type text, p_entity_id uuid, p_doctor_patient_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.doctor_audit_log (actor_user_id, doctor_patient_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_doctor_patient_id, p_action, p_entity_type, p_entity_id, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_amend_prescription(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_record_audit(text, text, uuid, uuid, jsonb) TO authenticated;

-- 20261003100000_doctor_dashboard_metrics.sql
CREATE OR REPLACE FUNCTION public.doctor_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count bigint;
  high_risk_count bigint;
  appointments_today bigint;
  pending_confirmations bigint;
  unread_items bigint;
  unsigned_consultations bigint;
  unreviewed_reports bigint;
  unread_messages bigint;
  attention_rows jsonb;
  next_appointments jsonb;
  appointment_trend jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO active_count
  FROM public.doctor_patients
  WHERE doctor_id = auth.uid() AND status = 'active';

  SELECT count(*) INTO high_risk_count
  FROM public.doctor_patients
  WHERE doctor_id = auth.uid() AND status = 'active' AND risk_level = 'high';

  SELECT count(*) INTO appointments_today
  FROM public.doctor_appointments a
  WHERE a.doctor_id = auth.uid()
    AND a.status NOT IN ('cancelled', 'no_show')
    AND (a.starts_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT count(*) INTO pending_confirmations
  FROM public.doctor_appointments
  WHERE doctor_id = auth.uid() AND status = 'pending' AND starts_at >= now();

  SELECT count(*) INTO unread_items
  FROM public.notifications
  WHERE user_id = auth.uid() AND is_read = false;

  SELECT count(*) INTO unsigned_consultations
  FROM public.doctor_consultations
  WHERE doctor_id = auth.uid() AND status = 'draft';

  SELECT count(*) INTO unreviewed_reports
  FROM public.doctor_reports
  WHERE doctor_id = auth.uid() AND flag IN ('attention', 'critical');

  SELECT count(*) INTO unread_messages
  FROM public.messages
  WHERE recipient_id = auth.uid() AND is_read = false;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC), '[]'::jsonb)
  INTO attention_rows
  FROM (
    SELECT id, patient_code, full_name, risk_level, updated_at
    FROM public.doctor_patients
    WHERE doctor_id = auth.uid() AND status = 'active' AND risk_level IN ('high', 'moderate')
    ORDER BY CASE risk_level WHEN 'high' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 5
  ) p;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.starts_at), '[]'::jsonb)
  INTO next_appointments
  FROM (
    SELECT a.id, a.doctor_patient_id, p.patient_code, p.full_name AS patient_name,
      a.starts_at, a.duration_minutes, a.visit_type, a.status, a.reason
    FROM public.doctor_appointments a
    JOIN public.doctor_patients p ON p.id = a.doctor_patient_id
    WHERE a.doctor_id = auth.uid()
      AND a.status IN ('pending', 'confirmed')
      AND a.starts_at >= now()
    ORDER BY a.starts_at
    LIMIT 5
  ) a;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', day::date,
    'appointments', count
  ) ORDER BY day), '[]'::jsonb)
  INTO appointment_trend
  FROM (
    SELECT days.day, count(a.id) AS count
    FROM generate_series(current_date - 13, current_date, interval '1 day') AS days(day)
    LEFT JOIN public.doctor_appointments a
      ON a.doctor_id = auth.uid()
      AND a.status NOT IN ('cancelled', 'no_show')
      AND (a.starts_at AT TIME ZONE 'Asia/Kolkata')::date = days.day::date
    GROUP BY days.day
  ) trend;

  RETURN jsonb_build_object(
    'kpis', jsonb_build_object(
      'active_patients', active_count,
      'appointments_today', appointments_today,
      'pending_confirmations', pending_confirmations,
      'high_risk', high_risk_count,
      'unread_items', unread_items
    ),
    'next_appointments', next_appointments,
    'attention', attention_rows,
    'trend_14d', appointment_trend,
    'quick_counts', jsonb_build_object(
      'unsigned_consultations', unsigned_consultations,
      'unreviewed_reports', unreviewed_reports,
      'unread_messages', unread_messages
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.doctor_dashboard_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_dashboard_summary() TO authenticated;

-- 20261003110000_doctor_workflow_actions.sql
CREATE OR REPLACE FUNCTION public.doctor_update_patient(
  p_patient_id uuid,
  p_fields jsonb
)
RETURNS public.doctor_patients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_patient public.doctor_patients;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  IF p_fields ? 'risk_level' AND p_fields->>'risk_level' NOT IN ('low', 'moderate', 'high') THEN
    RAISE EXCEPTION 'Invalid patient risk level' USING ERRCODE = '22023';
  END IF;
  IF p_fields ? 'full_name' AND NULLIF(trim(p_fields->>'full_name'), '') IS NULL THEN
    RAISE EXCEPTION 'Patient name is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.doctor_patients
  SET full_name = CASE WHEN p_fields ? 'full_name' THEN trim(p_fields->>'full_name') ELSE full_name END,
      date_of_birth = CASE WHEN p_fields ? 'date_of_birth' THEN NULLIF(p_fields->>'date_of_birth', '')::date ELSE date_of_birth END,
      sex = CASE WHEN p_fields ? 'sex' THEN NULLIF(trim(p_fields->>'sex'), '') ELSE sex END,
      phone = CASE WHEN p_fields ? 'phone' THEN NULLIF(trim(p_fields->>'phone'), '') ELSE phone END,
      cancer_type = CASE WHEN p_fields ? 'cancer_type' THEN NULLIF(trim(p_fields->>'cancer_type'), '') ELSE cancer_type END,
      stage = CASE WHEN p_fields ? 'stage' THEN NULLIF(trim(p_fields->>'stage'), '') ELSE stage END,
      current_treatment = CASE WHEN p_fields ? 'current_treatment' THEN NULLIF(trim(p_fields->>'current_treatment'), '') ELSE current_treatment END,
      cycle_label = CASE WHEN p_fields ? 'cycle_label' THEN NULLIF(trim(p_fields->>'cycle_label'), '') ELSE cycle_label END,
      risk_level = CASE WHEN p_fields ? 'risk_level' THEN p_fields->>'risk_level' ELSE risk_level END,
      updated_at = now()
  WHERE id = p_patient_id AND doctor_id = auth.uid()
  RETURNING * INTO updated_patient;

  IF updated_patient.id IS NULL THEN
    RAISE EXCEPTION 'Patient not found in your roster' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.doctor_audit_log (actor_user_id, doctor_patient_id, action, entity_type, entity_id)
  VALUES (auth.uid(), updated_patient.id, 'patient.updated', 'doctor_patient', updated_patient.id);
  RETURN updated_patient;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_set_patient_status(
  p_patient_id uuid,
  p_status text
)
RETURNS public.doctor_patients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_patient public.doctor_patients;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'Invalid patient status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.doctor_patients
  SET status = p_status, updated_at = now()
  WHERE id = p_patient_id AND doctor_id = auth.uid()
  RETURNING * INTO updated_patient;

  IF updated_patient.id IS NULL THEN
    RAISE EXCEPTION 'Patient not found in your roster' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.doctor_audit_log (actor_user_id, doctor_patient_id, action, entity_type, entity_id)
  VALUES (auth.uid(), updated_patient.id, 'patient.' || p_status, 'doctor_patient', updated_patient.id);
  RETURN updated_patient;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_update_appointment_status(
  p_appointment_id uuid,
  p_status text
)
RETURNS public.doctor_appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appointment_row public.doctor_appointments;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO appointment_row
  FROM public.doctor_appointments
  WHERE id = p_appointment_id AND doctor_id = auth.uid()
  FOR UPDATE;
  IF appointment_row.id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    (appointment_row.status = 'pending' AND p_status IN ('confirmed', 'cancelled'))
    OR (appointment_row.status = 'confirmed' AND p_status IN ('completed', 'cancelled', 'no_show'))
  ) THEN
    RAISE EXCEPTION 'Invalid appointment status transition' USING ERRCODE = '22023';
  END IF;

  UPDATE public.doctor_appointments
  SET status = p_status, updated_at = now()
  WHERE id = appointment_row.id
  RETURNING * INTO appointment_row;

  INSERT INTO public.doctor_audit_log (actor_user_id, doctor_patient_id, action, entity_type, entity_id)
  VALUES (auth.uid(), appointment_row.doctor_patient_id, 'appointment.' || p_status, 'doctor_appointment', appointment_row.id);
  RETURN appointment_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_save_treatment_plan(
  p_plan_id uuid,
  p_patient_id uuid,
  p_fields jsonb
)
RETURNS public.doctor_treatment_plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved_plan public.doctor_treatment_plans;
  v_progress numeric;
  v_cycles_total integer;
  v_cycles_completed integer;
  v_plan_status text;
  v_plan_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  v_plan_name := NULLIF(trim(p_fields->>'name'), '');
  v_progress := COALESCE(NULLIF(p_fields->>'progress_percent', '')::numeric, 0);
  v_cycles_total := NULLIF(p_fields->>'cycles_total', '')::integer;
  v_cycles_completed := COALESCE(NULLIF(p_fields->>'cycles_completed', '')::integer, 0);
  v_plan_status := COALESCE(NULLIF(p_fields->>'status', ''), 'active');
  IF v_plan_name IS NULL THEN RAISE EXCEPTION 'Treatment plan name is required' USING ERRCODE = '22023'; END IF;
  IF v_progress < 0 OR v_progress > 100 THEN RAISE EXCEPTION 'Progress must be between 0 and 100' USING ERRCODE = '22023'; END IF;
  IF v_cycles_completed < 0 OR (v_cycles_total IS NOT NULL AND v_cycles_completed > v_cycles_total) THEN
    RAISE EXCEPTION 'Completed cycles must be within the plan total' USING ERRCODE = '22023';
  END IF;
  IF v_plan_status NOT IN ('active', 'review_required', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid treatment plan status' USING ERRCODE = '22023';
  END IF;

  IF p_plan_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.doctor_patients
      WHERE id = p_patient_id AND doctor_id = auth.uid() AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Patient is not in your active roster' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.doctor_treatment_plans (
      doctor_id, doctor_patient_id, name, protocol, cycles_total, cycles_completed, progress_percent, status
    )
    VALUES (
      auth.uid(), p_patient_id, v_plan_name, NULLIF(trim(p_fields->>'protocol'), ''),
      v_cycles_total, v_cycles_completed, v_progress, v_plan_status
    )
    RETURNING * INTO saved_plan;
  ELSE
    UPDATE public.doctor_treatment_plans
    SET name = v_plan_name,
        protocol = NULLIF(trim(p_fields->>'protocol'), ''),
        cycles_total = v_cycles_total,
        cycles_completed = v_cycles_completed,
        progress_percent = v_progress,
        status = v_plan_status,
        updated_at = now()
    WHERE id = p_plan_id
      AND doctor_id = auth.uid()
      AND doctor_patient_id = p_patient_id
    RETURNING * INTO saved_plan;
    IF saved_plan.id IS NULL THEN
      RAISE EXCEPTION 'Treatment plan not found in your workspace' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.doctor_audit_log (actor_user_id, doctor_patient_id, action, entity_type, entity_id)
  VALUES (auth.uid(), saved_plan.doctor_patient_id, 'treatment_plan.saved', 'doctor_treatment_plan', saved_plan.id);
  RETURN saved_plan;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_cancel_prescription(p_prescription_id uuid)
RETURNS public.doctor_prescriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prescription_row public.doctor_prescriptions;
  next_version integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO prescription_row
  FROM public.doctor_prescriptions
  WHERE id = p_prescription_id AND doctor_id = auth.uid()
  FOR UPDATE;
  IF prescription_row.id IS NULL OR prescription_row.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active prescription in your workspace can be discontinued' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(max(version), 0) + 1 INTO next_version
  FROM public.doctor_prescription_versions
  WHERE prescription_id = prescription_row.id;
  INSERT INTO public.doctor_prescription_versions (
    prescription_id, version, items, notes, status, created_by
  )
  VALUES (
    prescription_row.id, next_version, prescription_row.items, prescription_row.notes, 'cancelled', auth.uid()
  );
  UPDATE public.doctor_prescriptions
  SET status = 'cancelled'
  WHERE id = prescription_row.id
  RETURNING * INTO prescription_row;
  INSERT INTO public.doctor_audit_log (actor_user_id, doctor_patient_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(), prescription_row.doctor_patient_id, 'prescription.cancelled',
    'doctor_prescription', prescription_row.id, jsonb_build_object('version', next_version)
  );
  RETURN prescription_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_save_consultation(
  p_id uuid,
  p_patient_id uuid,
  p_fields jsonb
)
RETURNS public.doctor_consultations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved public.doctor_consultations;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;

  IF p_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.doctor_patients
      WHERE id = p_patient_id AND doctor_id = auth.uid() AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Patient is not in your active roster' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.doctor_consultations (
      doctor_id, doctor_patient_id, subjective, objective, assessment, plan
    )
    VALUES (
      auth.uid(), p_patient_id, p_fields->>'subjective', p_fields->>'objective',
      p_fields->>'assessment', p_fields->>'plan'
    )
    RETURNING * INTO saved;
  ELSE
    UPDATE public.doctor_consultations
    SET subjective = p_fields->>'subjective',
        objective = p_fields->>'objective',
        assessment = p_fields->>'assessment',
        plan = p_fields->>'plan',
        updated_at = now()
    WHERE id = p_id
      AND doctor_id = auth.uid()
      AND doctor_patient_id = p_patient_id
      AND status = 'draft'
    RETURNING * INTO saved;
    IF saved.id IS NULL THEN
      RAISE EXCEPTION 'Draft consultation not found or already signed' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.doctor_audit_log (actor_user_id, doctor_patient_id, action, entity_type, entity_id)
  VALUES (auth.uid(), saved.doctor_patient_id, 'consultation.saved', 'doctor_consultation', saved.id);
  RETURN saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_sign_consultation(p_id uuid)
RETURNS public.doctor_consultations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  signed public.doctor_consultations;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.doctor_consultations
  SET status = 'signed', signed_at = now(), updated_at = now()
  WHERE id = p_id AND doctor_id = auth.uid() AND status = 'draft'
  RETURNING * INTO signed;
  IF signed.id IS NULL THEN
    RAISE EXCEPTION 'Only an existing draft can be signed' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.doctor_audit_log (actor_user_id, doctor_patient_id, action, entity_type, entity_id)
  VALUES (auth.uid(), signed.doctor_patient_id, 'consultation.signed', 'doctor_consultation', signed.id);
  RETURN signed;
END;
$$;

REVOKE ALL ON FUNCTION public.doctor_update_patient(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_set_patient_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_update_appointment_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_save_treatment_plan(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_cancel_prescription(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_save_consultation(uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_sign_consultation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_update_patient(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_set_patient_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_update_appointment_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_save_treatment_plan(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_cancel_prescription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_save_consultation(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_sign_consultation(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
