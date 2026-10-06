CREATE OR REPLACE FUNCTION public.next_hospital_patient_identifier(p_hospital_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_number integer := 24601;
  v_candidate text;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.register') THEN
    RAISE EXCEPTION 'patients.register capability required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(NULLIF(patient_id_prefix, ''), 'PID-')
  INTO v_prefix
  FROM public.hospital_orgs
  WHERE id = p_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hospital workspace not found' USING ERRCODE = 'P0002';
  END IF;

  LOOP
    v_candidate := v_prefix || v_number::text;
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.hospital_patients
      WHERE hospital_id = p_hospital_id
        AND normalized_identifier = upper(regexp_replace(v_candidate, '[[:space:]_-]+', '', 'g'))
    );
    v_number := v_number + 1;
  END LOOP;

  RETURN v_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_hospital_patient(
  p_hospital_id uuid,
  p_identifier text,
  p_name text,
  p_mobile text DEFAULT NULL,
  p_dob date DEFAULT NULL,
  p_age integer DEFAULT NULL,
  p_gender text DEFAULT NULL
)
RETURNS public.hospital_patients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient public.hospital_patients;
  v_identifier text;
  v_prefix text;
  v_number integer := 24601;
  v_candidate text;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.register') THEN
    RAISE EXCEPTION 'patients.register capability required' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Patient name is required' USING ERRCODE = '22023';
  END IF;
  IF p_dob > current_date THEN
    RAISE EXCEPTION 'Patient date of birth cannot be in the future' USING ERRCODE = '22023';
  END IF;
  v_identifier := NULLIF(btrim(p_identifier), '');

  IF v_identifier IS NULL THEN
    SELECT COALESCE(NULLIF(patient_id_prefix, ''), 'PID-')
    INTO v_prefix
    FROM public.hospital_orgs
    WHERE id = p_hospital_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Hospital workspace not found' USING ERRCODE = 'P0002';
    END IF;

    LOOP
      v_candidate := v_prefix || v_number::text;
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM public.hospital_patients
        WHERE hospital_id = p_hospital_id
          AND normalized_identifier = upper(regexp_replace(v_candidate, '[[:space:]_-]+', '', 'g'))
      );
      v_number := v_number + 1;
    END LOOP;
    v_identifier := v_candidate;
  ELSE
    v_identifier := public.normalize_patient_identifier(p_hospital_id, v_identifier);
  END IF;

  BEGIN
    INSERT INTO public.hospital_patients (hospital_id, patient_identifier, name, mobile, dob, age, gender)
    VALUES (
      p_hospital_id,
      v_identifier,
      btrim(p_name),
      NULLIF(btrim(p_mobile), ''),
      p_dob,
      CASE WHEN p_dob IS NOT NULL THEN date_part('year', age(current_date, p_dob))::integer ELSE p_age END,
      p_gender
    )
    RETURNING * INTO v_patient;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A patient with this identifier already exists in this hospital' USING ERRCODE = '23505';
  END;

  INSERT INTO public.patient_journey_events (hospital_id, patient_id, actor_user_id, event_type, details)
  VALUES (p_hospital_id, v_patient.id, auth.uid(), 'patient.registered', jsonb_build_object('identifier', v_patient.patient_identifier));
  INSERT INTO public.hospital_access_audit (hospital_id, patient_id, actor_user_id, action, details)
  VALUES (p_hospital_id, v_patient.id, auth.uid(), 'patient.registered', jsonb_build_object('identifier', v_patient.patient_identifier));
  RETURN v_patient;
END;
$$;

REVOKE ALL ON FUNCTION public.next_hospital_patient_identifier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_hospital_patient_identifier(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.register_hospital_patient(uuid, text, text, text, date, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_hospital_patient(uuid, text, text, text, date, integer, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
