CREATE OR REPLACE FUNCTION public.start_consultation_record(
  p_hospital_id uuid,
  p_patient_id uuid,
  p_queue_entry_id uuid DEFAULT NULL,
  p_doctor_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL,
  p_complaint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.consultations;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.consultations (
    hospital_id, patient_id, queue_entry_id, session_id, doctor_id, complaint, status, version
  ) VALUES (
    p_hospital_id, p_patient_id, p_queue_entry_id, p_session_id, p_doctor_id, NULLIF(btrim(p_complaint), ''), 'draft', 1
  ) RETURNING * INTO v_row;

  IF p_queue_entry_id IS NOT NULL THEN
    UPDATE public.queue_entries
      SET status = 'in_consultation', started_at = COALESCE(started_at, now()), updated_at = now()
      WHERE id = p_queue_entry_id AND hospital_id = p_hospital_id;
  END IF;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.save_consultation_draft(
  p_consultation_id uuid,
  p_complaint text DEFAULT NULL,
  p_assessment text DEFAULT NULL,
  p_plan text DEFAULT NULL,
  p_advice text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.consultations;
BEGIN
  SELECT * INTO v_row
  FROM public.consultations
  WHERE id = p_consultation_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Consultation not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.hospital_has_cap(v_row.hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.consultations
  SET complaint = COALESCE(NULLIF(btrim(p_complaint), ''), complaint),
      assessment = COALESCE(NULLIF(btrim(p_assessment), ''), assessment),
      plan = COALESCE(NULLIF(btrim(p_plan), ''), plan),
      advice = COALESCE(NULLIF(btrim(p_advice), ''), advice),
      updated_at = now()
  WHERE id = p_consultation_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.finalize_consultation(
  p_consultation_id uuid,
  p_assessment text DEFAULT NULL,
  p_plan text DEFAULT NULL,
  p_advice text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.consultations;
BEGIN
  SELECT * INTO v_row
  FROM public.consultations
  WHERE id = p_consultation_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Consultation not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.hospital_has_cap(v_row.hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.consultations
  SET assessment = COALESCE(NULLIF(btrim(p_assessment), ''), assessment),
      plan = COALESCE(NULLIF(btrim(p_plan), ''), plan),
      advice = COALESCE(NULLIF(btrim(p_advice), ''), advice),
      status = 'final',
      finalised_at = now(),
      updated_at = now()
  WHERE id = p_consultation_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.amend_consultation(
  p_consultation_id uuid,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_old public.consultations;
  v_new public.consultations;
BEGIN
  SELECT * INTO v_old FROM public.consultations WHERE id = p_consultation_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Consultation not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.hospital_has_cap(v_old.hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.consultations (
    hospital_id, patient_id, queue_entry_id, session_id, doctor_id,
    complaint, assessment, plan, advice, status, version, parent_id, created_by, is_demo
  )
  VALUES (
    v_old.hospital_id, v_old.patient_id, v_old.queue_entry_id, v_old.session_id, v_old.doctor_id,
    NULLIF(btrim(p_message), '') || COALESCE(' | ' || v_old.complaint, ''),
    v_old.assessment, v_old.plan, v_old.advice, 'draft', v_old.version + 1, v_old.id, auth.uid(), false
  ) RETURNING * INTO v_new;

  RETURN to_jsonb(v_new);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_prescription(
  p_hospital_id uuid,
  p_consultation_id uuid,
  p_patient_id uuid,
  p_doctor_id uuid,
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_prescription public.prescriptions;
  v_item jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.prescriptions (hospital_id, patient_id, consultation_id, doctor_id, notes)
  VALUES (p_hospital_id, p_patient_id, p_consultation_id, p_doctor_id, NULLIF(btrim(p_notes), ''))
  RETURNING * INTO v_prescription;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    INSERT INTO public.prescription_items (
      hospital_id, prescription_id, medicine_name, dose, frequency, duration, instructions
    ) VALUES (
      p_hospital_id,
      v_prescription.id,
      COALESCE(v_item->>'medicine_name', 'Medication'),
      v_item->>'dose',
      v_item->>'frequency',
      v_item->>'duration',
      v_item->>'instructions'
    );
  END LOOP;

  RETURN to_jsonb(v_prescription);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_referral(
  p_hospital_id uuid,
  p_patient_id uuid,
  p_from_consultation_id uuid,
  p_from_doctor_id uuid,
  p_to_department_id uuid,
  p_to_doctor_id uuid DEFAULT NULL,
  p_priority text DEFAULT 'routine',
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.referrals;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.referrals (
    hospital_id, patient_id, from_consultation_id, from_doctor_id,
    to_department_id, to_doctor_id, priority, reason, status
  ) VALUES (
    p_hospital_id, p_patient_id, p_from_consultation_id, p_from_doctor_id,
    p_to_department_id, p_to_doctor_id, p_priority, NULLIF(btrim(p_reason), ''), 'pending'
  ) RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.accept_referral(p_referral_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.referrals;
BEGIN
  SELECT * INTO v_row FROM public.referrals WHERE id = p_referral_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Referral not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.hospital_has_cap(v_row.hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.referrals
  SET status = 'accepted', updated_at = now()
  WHERE id = p_referral_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.schedule_follow_up(
  p_hospital_id uuid,
  p_patient_id uuid,
  p_consultation_id uuid,
  p_due_date date,
  p_advice text DEFAULT NULL,
  p_depends_on_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.follow_ups;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.follow_ups (
    hospital_id, patient_id, consultation_id, due_date, advice, depends_on_order_id, status
  ) VALUES (
    p_hospital_id, p_patient_id, p_consultation_id, p_due_date, NULLIF(btrim(p_advice), ''), p_depends_on_order_id, 'pending'
  ) RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_consultation_context(p_hospital_id uuid, p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_patient public.hospital_patients;
  v_consultations jsonb;
  v_prescriptions jsonb;
  v_followups jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'clinical.read') THEN
    RAISE EXCEPTION 'clinical.read capability required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_patient
  FROM public.hospital_patients
  WHERE id = p_patient_id AND hospital_id = p_hospital_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
  INTO v_consultations
  FROM public.consultations c
  WHERE c.hospital_id = p_hospital_id AND c.patient_id = p_patient_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC), '[]'::jsonb)
  INTO v_prescriptions
  FROM public.prescriptions p
  WHERE p.hospital_id = p_hospital_id AND p.patient_id = p_patient_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.due_date ASC), '[]'::jsonb)
  INTO v_followups
  FROM public.follow_ups f
  WHERE f.hospital_id = p_hospital_id AND f.patient_id = p_patient_id;

  RETURN jsonb_build_object(
    'patient', to_jsonb(v_patient),
    'consultations', v_consultations,
    'prescriptions', v_prescriptions,
    'follow_ups', v_followups
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.demo_seed_clinical(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_patient uuid;
  v_doctor uuid;
  v_session uuid;
  v_queue uuid;
  v_consultation uuid;
  v_count integer := 0;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  FOR v_patient IN
    SELECT id FROM public.hospital_patients WHERE hospital_id = p_hospital_id AND is_demo ORDER BY patient_identifier LIMIT 40
  LOOP
    SELECT id INTO v_doctor FROM public.hospital_doctors WHERE hospital_id = p_hospital_id AND is_demo ORDER BY doctor_name LIMIT 1;
    SELECT id INTO v_session FROM public.opd_sessions WHERE hospital_id = p_hospital_id AND is_demo ORDER BY session_date, start_time LIMIT 1;

    INSERT INTO public.consultations (hospital_id, patient_id, doctor_id, session_id, complaint, assessment, plan, advice, status, version, is_demo)
    VALUES (p_hospital_id, v_patient, v_doctor, v_session, 'Follow-up review', 'Stable condition', 'Continue surveillance', 'Hydration and review', 'final', 1, true)
    RETURNING id INTO v_consultation;

    INSERT INTO public.prescriptions (hospital_id, patient_id, consultation_id, doctor_id, notes, is_demo)
    VALUES (p_hospital_id, v_patient, v_consultation, v_doctor, 'Daily continuation plan', true);

    INSERT INTO public.referrals (hospital_id, patient_id, from_doctor_id, to_department_id, priority, reason, status, is_demo)
    SELECT p_hospital_id, v_patient, v_doctor, d.id, 'routine', 'Clinical follow-up', 'accepted', true
    FROM public.hospital_departments d
    WHERE d.hospital_id = p_hospital_id AND d.department_type = 'diagnostic'
    LIMIT 1;

    INSERT INTO public.follow_ups (hospital_id, patient_id, consultation_id, due_date, advice, status, is_demo)
    VALUES (p_hospital_id, v_patient, v_consultation, current_date + (v_count % 10) + 7, 'Return in 2 weeks', 'pending', true);

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('consultations_created', v_count);
END;
$fn$;
