CREATE OR REPLACE FUNCTION public.generate_patient_link_code(
  p_hospital_id uuid,
  p_patient_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  raw_code text;
  code_row public.patient_link_codes;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.hospital_has_cap(p_hospital_id, 'patients.register')
     OR NOT EXISTS (
       SELECT 1
       FROM public.hospital_patients
       WHERE id = p_patient_id
         AND hospital_id = p_hospital_id
         AND patient_user_id IS NULL
     ) THEN
    RAISE EXCEPTION 'Hospital patient-link permission is required'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.patient_link_codes
  SET expires_at = now()
  WHERE hospital_id = p_hospital_id
    AND patient_id = p_patient_id
    AND consumed_at IS NULL
    AND expires_at > now();

  raw_code := upper(encode(gen_random_bytes(16), 'hex'));
  INSERT INTO public.patient_link_codes (
    hospital_id, patient_id, code_hash, expires_at
  )
  VALUES (
    p_hospital_id,
    p_patient_id,
    encode(digest(raw_code, 'sha256'), 'hex'),
    now() + interval '7 days'
  )
  RETURNING * INTO code_row;

  INSERT INTO public.hospital_access_audit (
    hospital_id, patient_id, actor_user_id, action, details
  )
  VALUES (
    p_hospital_id,
    p_patient_id,
    auth.uid(),
    'patient.link_code_issued',
    jsonb_build_object('link_code_id', code_row.id, 'expires_at', code_row.expires_at)
  );

  PERFORM public.hospital_log_event(
    p_hospital_id,
    p_patient_id,
    'Patient link code issued',
    jsonb_build_object('link_code_id', code_row.id),
    true
  );
  RETURN raw_code;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_patient_link_code(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_patient_link_code(uuid, uuid) TO authenticated;
ALTER FUNCTION public.link_patient_account(uuid, text) SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.generate_default_sessions(
  p_hospital_id uuid,
  p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created integer;
  v_existing integer;
  v_eligible integer;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'queue.manage') THEN
    RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF p_date IS NULL OR p_date < public.hospital_today(p_hospital_id) THEN
    RAISE EXCEPTION 'OPD sessions can only be generated for today or a future date' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_eligible
  FROM public.hospital_doctors d
  JOIN public.hospital_departments dep
    ON dep.id = d.department_id
   AND dep.hospital_id = d.hospital_id
   AND dep.department_type = 'clinical'
   AND dep.is_active
  WHERE d.hospital_id = p_hospital_id
    AND d.is_active
    AND d.employment_status = 'active';

  INSERT INTO public.opd_sessions (
    hospital_id, doctor_id, department_id, session_date,
    start_time, end_time, room, default_consult_minutes
  )
  SELECT
    p_hospital_id,
    d.id,
    d.department_id,
    p_date,
    time '09:00',
    time '13:00',
    'OPD-' || row_number() OVER (ORDER BY d.doctor_name),
    COALESCE(
      (public.hospital_setting(p_hospital_id, 'default_consult_minutes', '10'::jsonb))::text::integer,
      10
    )
  FROM public.hospital_doctors d
  JOIN public.hospital_departments dep
    ON dep.id = d.department_id
   AND dep.hospital_id = d.hospital_id
   AND dep.department_type = 'clinical'
   AND dep.is_active
  WHERE d.hospital_id = p_hospital_id
    AND d.is_active
    AND d.employment_status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.opd_sessions s
      WHERE s.hospital_id = p_hospital_id
        AND s.doctor_id = d.id
        AND s.session_date = p_date
    )
  ON CONFLICT (hospital_id, doctor_id, session_date, start_time) DO NOTHING;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  SELECT count(*)::integer INTO v_existing
  FROM public.opd_sessions s
  WHERE s.hospital_id = p_hospital_id
    AND s.session_date = p_date;

  RETURN jsonb_build_object(
    'created', v_created,
    'existing', v_existing,
    'eligible_doctors', v_eligible
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_default_sessions(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_default_sessions(uuid, date) TO authenticated;
