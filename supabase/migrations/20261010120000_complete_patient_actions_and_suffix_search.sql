CREATE OR REPLACE FUNCTION public.search_hospital_patients(
  p_hospital_id uuid,
  p_query text,
  p_limit integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_norm text;
  v_digits text;
  v_result jsonb;
  v_doctor_id uuid;
BEGIN
  SELECT d.id INTO v_doctor_id
  FROM public.hospital_doctors d
  JOIN public.hospital_members hm ON hm.hospital_id = d.hospital_id
    AND hm.user_id = d.user_id AND hm.staff_role = 'doctor' AND hm.is_active
  WHERE d.hospital_id = p_hospital_id AND d.user_id = auth.uid() AND d.is_active;

  IF v_doctor_id IS NULL AND NOT public.hospital_has_cap(p_hospital_id, 'patients.read') THEN
    RAISE EXCEPTION 'patients.read capability required' USING ERRCODE = '42501';
  END IF;

  v_norm := public.hospital_normalize_id(p_hospital_id, v_query);
  v_digits := regexp_replace(COALESCE(v_query, ''), '[^0-9]', '', 'g');
  SELECT jsonb_build_object(
    'patients', COALESCE((
      SELECT jsonb_agg(patient_json ORDER BY result_rank, name_similarity DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', p.id,
          'identifier', p.patient_identifier,
          'name', p.name,
          'age', p.age,
          'gender', p.gender,
          'mobile_masked', CASE WHEN p.mobile IS NULL THEN NULL ELSE repeat('X', greatest(length(p.mobile) - 4, 0)) || right(p.mobile, 4) END,
          'today_status', qe.status,
          'token', qe.token_number
        ) AS patient_json,
        CASE
          WHEN p.normalized_identifier = v_norm THEN 0
          WHEN length(v_digits) >= 2
            AND regexp_replace(p.patient_identifier, '[^0-9]', '', 'g') LIKE '%' || v_digits THEN 1
          WHEN v_digits <> ''
            AND regexp_replace(COALESCE(p.mobile, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%' THEN 2
          ELSE 3
        END AS result_rank,
        similarity(p.name, COALESCE(v_query, '')) AS name_similarity,
        p.name
        FROM public.hospital_patients p
        LEFT JOIN LATERAL (
          SELECT q.status, q.token_number
          FROM public.queue_entries q
          JOIN public.opd_sessions s ON s.id = q.session_id
          WHERE q.hospital_id = p_hospital_id
            AND q.patient_id = p.id
            AND s.session_date = public.hospital_today(p_hospital_id)
            AND (v_doctor_id IS NULL OR s.doctor_id = v_doctor_id)
          ORDER BY q.created_at DESC
          LIMIT 1
        ) qe ON true
        WHERE p.hospital_id = p_hospital_id
          AND (v_doctor_id IS NULL OR public.doctor_hospital_can_read_patient(p_hospital_id, p.id))
          AND (
            v_query IS NULL
            OR p.normalized_identifier = v_norm
            OR (length(v_digits) >= 2 AND regexp_replace(p.patient_identifier, '[^0-9]', '', 'g') LIKE '%' || v_digits)
            OR (v_digits <> '' AND regexp_replace(COALESCE(p.mobile, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%')
            OR p.name % v_query
            OR p.name ILIKE '%' || v_query || '%'
          )
        ORDER BY result_rank, name_similarity DESC, p.name
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 50))
      ) result_rows
    ), '[]'::jsonb),
    'doctors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.doctor_name, 'department', dep.name))
      FROM public.hospital_doctors d
      LEFT JOIN public.hospital_departments dep ON dep.id = d.department_id
      WHERE d.hospital_id = p_hospital_id
        AND d.is_active
        AND (v_doctor_id IS NULL OR d.id = v_doctor_id)
        AND (v_query IS NULL OR d.doctor_name ILIKE '%' || v_query || '%' OR dep.name ILIKE '%' || v_query || '%')
    ), '[]'::jsonb),
    'departments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name))
      FROM public.hospital_departments d
      WHERE d.hospital_id = p_hospital_id
        AND d.is_active
        AND (v_query IS NULL OR d.name ILIKE '%' || v_query || '%')
    ), '[]'::jsonb),
    'appointments_today', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'patient_id', a.patient_id,
        'identifier', p.patient_identifier,
        'patient', p.name,
        'doctor', d.doctor_name,
        'scheduled_at', a.scheduled_at,
        'status', a.status
      ))
      FROM public.hospital_appointments a
      JOIN public.hospital_patients p ON p.id = a.patient_id
      JOIN public.hospital_doctors d ON d.id = a.doctor_id
      WHERE a.hospital_id = p_hospital_id
        AND (v_doctor_id IS NULL OR a.doctor_id = v_doctor_id)
        AND (a.scheduled_at AT TIME ZONE (SELECT h.timezone FROM public.hospital_orgs h WHERE h.id = p_hospital_id))::date = public.hospital_today(p_hospital_id)
        AND a.status IN ('scheduled', 'confirmed')
        AND (v_query IS NULL OR p.name ILIKE '%' || v_query || '%' OR d.doctor_name ILIKE '%' || v_query || '%')
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.hospital_staff_book_appointment(
  p_hospital_id uuid,
  p_patient_id uuid,
  p_doctor_id uuid,
  p_scheduled_at timestamptz,
  p_kind text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appointment public.hospital_appointments;
BEGIN
  IF NOT (
    public.hospital_has_cap(p_hospital_id, 'patients.register')
    OR public.hospital_has_cap(p_hospital_id, 'queue.manage')
  ) THEN
    RAISE EXCEPTION 'Appointment capability required' USING ERRCODE = '42501';
  END IF;
  IF p_scheduled_at IS NULL OR p_scheduled_at <= now() THEN
    RAISE EXCEPTION 'Appointment must be scheduled in the future' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('opd', 'follow_up', 'referral') THEN
    RAISE EXCEPTION 'Invalid appointment kind' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hospital_patients
    WHERE id = p_patient_id AND hospital_id = p_hospital_id
  ) THEN
    RAISE EXCEPTION 'Patient not found in this hospital' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hospital_doctors
    WHERE id = p_doctor_id
      AND hospital_id = p_hospital_id
      AND is_active
      AND employment_status = 'active'
  ) THEN
    RAISE EXCEPTION 'An active doctor from this hospital is required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.hospital_doctors
  WHERE id = p_doctor_id AND hospital_id = p_hospital_id
  FOR UPDATE;
  IF EXISTS (
    SELECT 1
    FROM public.hospital_appointments a
    WHERE a.hospital_id = p_hospital_id
      AND a.doctor_id = p_doctor_id
      AND a.status NOT IN ('cancelled', 'no_show')
      AND a.scheduled_at < p_scheduled_at + interval '30 minutes'
      AND a.scheduled_at + interval '30 minutes' > p_scheduled_at
  ) THEN
    RAISE EXCEPTION 'Appointment overlaps an existing hospital appointment' USING ERRCODE = '23P01';
  END IF;

  INSERT INTO public.hospital_appointments (
    hospital_id, patient_id, doctor_id, department_id, scheduled_at, kind, reason, created_by
  )
  SELECT p_hospital_id, p_patient_id, d.id, d.department_id, p_scheduled_at, p_kind,
         NULLIF(btrim(p_reason), ''), auth.uid()
  FROM public.hospital_doctors d
  WHERE d.id = p_doctor_id AND d.hospital_id = p_hospital_id
  RETURNING * INTO v_appointment;

  PERFORM public.hospital_log_event(
    p_hospital_id,
    p_patient_id,
    'appointment.booked',
    jsonb_build_object('appointment_id', v_appointment.id, 'scheduled_at', p_scheduled_at),
    true
  );
  RETURN to_jsonb(v_appointment);
END;
$$;

REVOKE ALL ON FUNCTION public.hospital_staff_book_appointment(uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hospital_staff_book_appointment(uuid, uuid, uuid, timestamptz, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.order_investigation(
  p_hospital_id uuid,
  p_patient_id uuid,
  p_type_id uuid,
  p_doctor_id uuid DEFAULT NULL,
  p_priority text DEFAULT 'routine',
  p_consultation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.investigation_orders;
  v_doctor_id uuid;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.create') THEN
    RAISE EXCEPTION 'orders.create capability required' USING ERRCODE = '42501';
  END IF;
  SELECT d.id INTO v_doctor_id
  FROM public.hospital_doctors d
  JOIN public.hospital_members hm
    ON hm.hospital_id = d.hospital_id
   AND hm.user_id = d.user_id
   AND hm.staff_role = 'doctor'
   AND hm.is_active
  WHERE d.hospital_id = p_hospital_id
    AND d.user_id = auth.uid()
    AND d.is_active
    AND d.employment_status = 'active'
  ORDER BY d.created_at
  LIMIT 1;
  IF v_doctor_id IS NULL THEN
    RAISE EXCEPTION 'An active hospital doctor profile is required to order an investigation' USING ERRCODE = '42501';
  END IF;
  IF p_doctor_id IS NOT NULL AND p_doctor_id <> v_doctor_id THEN
    RAISE EXCEPTION 'Investigation orders must be placed by the signed-in doctor' USING ERRCODE = '42501';
  END IF;
  IF p_priority NOT IN ('routine', 'urgent', 'emergency', 'clinically_priority') THEN
    RAISE EXCEPTION 'Invalid investigation priority' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hospital_patients
    WHERE id = p_patient_id AND hospital_id = p_hospital_id
  ) THEN
    RAISE EXCEPTION 'Patient not found in this hospital' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.investigation_types
    WHERE id = p_type_id AND hospital_id = p_hospital_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Active investigation type not found in this hospital' USING ERRCODE = 'P0002';
  END IF;
  IF p_consultation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.consultations
    WHERE id = p_consultation_id
      AND hospital_id = p_hospital_id
      AND patient_id = p_patient_id
      AND doctor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Consultation does not belong to this patient, hospital, and doctor' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.investigation_orders (
    hospital_id, patient_id, type_id, ordered_by_doctor_id, consultation_id, priority, status
  ) VALUES (
    p_hospital_id, p_patient_id, p_type_id, v_doctor_id, p_consultation_id, p_priority, 'ordered'
  ) RETURNING * INTO v_order;

  PERFORM public.hospital_log_event(
    p_hospital_id,
    p_patient_id,
    'Investigation ordered',
    jsonb_build_object('order_id', v_order.id, 'type_id', p_type_id, 'priority', p_priority),
    false
  );
  RETURN to_jsonb(v_order);
END;
$$;
