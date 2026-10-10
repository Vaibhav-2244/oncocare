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
