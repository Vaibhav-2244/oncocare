CREATE OR REPLACE FUNCTION public.hospital_normalize_id(p_hospital_id uuid, p_input text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_input text;
  v_prefix text;
BEGIN
  IF p_input IS NULL OR NULLIF(btrim(p_input), '') IS NULL THEN
    RETURN NULL;
  END IF;

  v_input := upper(regexp_replace(btrim(p_input), '[[:space:]_-]+', '', 'g'));
  IF EXISTS (
    SELECT 1
    FROM public.hospital_patients hp
    WHERE hp.hospital_id = p_hospital_id
      AND hp.normalized_identifier = v_input
  ) THEN
    RETURN v_input;
  END IF;

  SELECT COALESCE(h.patient_id_prefix, '')
  INTO v_prefix
  FROM public.hospital_orgs h
  WHERE h.id = p_hospital_id;

  IF v_input ~ '^[0-9]+$' THEN
    RETURN upper(regexp_replace(COALESCE(v_prefix, ''), '[[:space:]_-]+', '', 'g')) || v_input;
  END IF;
  IF v_input ~ '^[A-Z]+[0-9]+$' THEN
    RETURN upper(regexp_replace(COALESCE(v_prefix, ''), '[[:space:]_-]+', '', 'g'))
      || substring(v_input FROM '([0-9]+)$');
  END IF;
  RETURN v_input;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_hospital_patient_doctor(
  p_hospital_id uuid,
  p_patient_id uuid,
  p_doctor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  patient_row public.hospital_patients;
BEGIN
  IF auth.uid() IS NULL OR NOT public.hospital_has_cap(p_hospital_id, 'staff.manage') THEN
    RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.hospital_orgs h
    WHERE h.id = p_hospital_id
      AND h.verification_status <> 'suspended'
  ) THEN
    RAISE EXCEPTION 'Hospital workspace is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO patient_row
  FROM public.hospital_patients
  WHERE id = p_patient_id
    AND hospital_id = p_hospital_id
  FOR UPDATE;
  IF patient_row.id IS NULL THEN
    RAISE EXCEPTION 'Patient not found in this hospital' USING ERRCODE = 'P0002';
  END IF;

  IF p_doctor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.hospital_doctors d
    WHERE d.id = p_doctor_id
      AND d.hospital_id = p_hospital_id
      AND d.is_active
      AND d.employment_status = 'active'
  ) THEN
    RAISE EXCEPTION 'An active doctor from this hospital is required' USING ERRCODE = '22023';
  END IF;

  IF patient_row.assigned_doctor_id IS DISTINCT FROM p_doctor_id THEN
    UPDATE public.hospital_patients
    SET assigned_doctor_id = p_doctor_id,
        updated_at = now()
    WHERE id = p_patient_id
      AND hospital_id = p_hospital_id;

    INSERT INTO public.hospital_access_audit (hospital_id, patient_id, actor_user_id, action, details)
    VALUES (
      p_hospital_id,
      p_patient_id,
      auth.uid(),
      CASE WHEN p_doctor_id IS NULL THEN 'patient.doctor_unassigned' ELSE 'patient.doctor_assigned' END,
      jsonb_build_object(
        'previous_doctor_id', patient_row.assigned_doctor_id,
        'doctor_id', p_doctor_id
      )
    );

    PERFORM public.hospital_log_event(
      p_hospital_id,
      p_patient_id,
      CASE WHEN p_doctor_id IS NULL THEN 'Doctor unassigned' ELSE 'Doctor assigned' END,
      jsonb_build_object('doctor_id', p_doctor_id),
      true
    );
    IF p_doctor_id IS NOT NULL THEN
      PERFORM public.hospital_notify_patient(
        p_hospital_id,
        p_patient_id,
        'care_team_updated',
        jsonb_build_object('message', 'Your hospital care team was updated.')
      );
    END IF;
  END IF;

  RETURN p_doctor_id;
END;
$$;
