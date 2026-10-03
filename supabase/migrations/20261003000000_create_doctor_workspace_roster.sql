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
