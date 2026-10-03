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
  v_age integer;
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
  v_age := CASE WHEN p_dob IS NOT NULL THEN date_part('year', age(current_date, p_dob))::integer ELSE p_age END;
  IF v_age IS NOT NULL AND v_age < 0 THEN
    RAISE EXCEPTION 'Patient age cannot be negative' USING ERRCODE = '22023';
  END IF;

  v_identifier := public.normalize_patient_identifier(p_hospital_id, p_identifier);
  BEGIN
    INSERT INTO public.hospital_patients (hospital_id, patient_identifier, name, mobile, dob, age, gender)
    VALUES (p_hospital_id, v_identifier, btrim(p_name), NULLIF(btrim(p_mobile), ''), p_dob, v_age, p_gender)
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

REVOKE ALL ON FUNCTION public.register_hospital_patient(uuid, text, text, text, date, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_hospital_patient(uuid, text, text, text, date, integer, text) TO authenticated;
NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.import_hospital_patients(p_hospital_id uuid, p_rows jsonb, p_dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_row jsonb; v_status text; v_message text; v_identifier text; v_patient_id uuid; v_dob date; v_age integer; v_output jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.register') THEN RAISE EXCEPTION 'patients.register capability required' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Rows must be a JSON array' USING ERRCODE = '22023'; END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_identifier := public.hospital_normalize_id(p_hospital_id, v_row ->> 'identifier');
    v_dob := NULLIF(v_row ->> 'dob', '')::date;
    IF v_dob > current_date THEN RAISE EXCEPTION 'Patient date of birth cannot be in the future' USING ERRCODE = '22023'; END IF;
    v_age := CASE WHEN v_dob IS NOT NULL THEN date_part('year', age(current_date, v_dob))::integer ELSE NULLIF(v_row ->> 'age', '')::integer END;
    IF NULLIF(v_identifier,'') IS NULL OR NULLIF(btrim(v_row ->> 'name'),'') IS NULL THEN
      v_status := 'error'; v_message := 'Identifier and name are required';
    ELSIF EXISTS (SELECT 1 FROM public.hospital_patients WHERE hospital_id = p_hospital_id AND normalized_identifier = upper(regexp_replace(v_identifier,'[[:space:]_-]+','','g'))) THEN
      v_status := 'duplicate'; v_message := 'Patient identifier already exists';
    ELSIF p_dry_run THEN
      v_status := 'new'; v_message := 'Ready to import';
    ELSE
      INSERT INTO public.hospital_patients (hospital_id, patient_identifier, name, mobile, dob, age, gender)
      VALUES (p_hospital_id, v_identifier, btrim(v_row ->> 'name'), NULLIF(btrim(v_row ->> 'mobile'),''), v_dob, v_age, NULLIF(btrim(v_row ->> 'gender'),''))
      ON CONFLICT (hospital_id, patient_identifier) DO NOTHING RETURNING id INTO v_patient_id;
      IF v_patient_id IS NULL THEN v_status := 'duplicate'; v_message := 'Patient identifier already exists';
      ELSE v_status := 'new'; v_message := 'Imported';
        INSERT INTO public.hospital_access_audit (hospital_id, patient_id, actor_user_id, action, details) VALUES (p_hospital_id, v_patient_id, auth.uid(), 'patient.imported', jsonb_build_object('identifier',v_identifier));
      END IF;
    END IF;
    v_output := v_output || jsonb_build_array(jsonb_build_object('row',v_row,'status',v_status,'message',v_message));
  END LOOP;
  RETURN jsonb_build_object('rows',v_output,'dry_run',p_dry_run);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.import_hospital_patients(uuid, jsonb, boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
