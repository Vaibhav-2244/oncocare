CREATE OR REPLACE FUNCTION public.hospital_has_cap(p_hospital_id uuid, p_cap text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.hospital_members hm
    JOIN public.hospital_orgs h ON h.id = hm.hospital_id
    WHERE hm.hospital_id = p_hospital_id
      AND hm.user_id = auth.uid()
      AND hm.is_active
      AND public.hospital_role_can(hm.staff_role, p_cap)
      AND (
        p_cap IN ('config.manage', 'staff.manage')
        OR h.verification_status <> 'suspended'
      )
      AND (p_cap NOT IN ('patients.read', 'clinical.read') OR hm.staff_role <> 'doctor')
  );
$$;

REVOKE ALL ON FUNCTION public.hospital_has_cap(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hospital_has_cap(uuid, text) TO authenticated;

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
          WHEN v_digits <> '' AND regexp_replace(COALESCE(p.mobile, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%' THEN 1
          ELSE 2
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
            OR (v_digits <> '' AND regexp_replace(COALESCE(p.mobile, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%')
            OR p.name % v_query
            OR p.name ILIKE '%' || v_query || '%'
          )
        ORDER BY result_rank, name_similarity DESC
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

REVOKE ALL ON FUNCTION public.search_hospital_patients(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_hospital_patients(uuid, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admit_patient(
  p_hospital_id uuid,
  p_patient_id uuid,
  p_ward_id uuid,
  p_bed_id uuid,
  p_doctor_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hospital_admissions;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'admissions.manage') THEN
    RAISE EXCEPTION 'admissions.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hospital_patients
    WHERE id = p_patient_id AND hospital_id = p_hospital_id
  ) THEN
    RAISE EXCEPTION 'Patient not found in this hospital' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hospital_wards
    WHERE id = p_ward_id AND hospital_id = p_hospital_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Active ward not found in this hospital' USING ERRCODE = 'P0002';
  END IF;
  IF p_doctor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hospital_doctors
    WHERE id = p_doctor_id AND hospital_id = p_hospital_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Doctor not found in this hospital' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
  FROM public.hospital_beds
  WHERE id = p_bed_id
    AND hospital_id = p_hospital_id
    AND ward_id = p_ward_id
    AND status = 'available'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Available bed not found in the selected ward' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.hospital_admissions (
    hospital_id, patient_id, ward_id, bed_id, admitting_doctor_id, reason, status
  ) VALUES (
    p_hospital_id, p_patient_id, p_ward_id, p_bed_id, p_doctor_id, NULLIF(btrim(p_reason), ''), 'admitted'
  ) RETURNING * INTO v_row;

  UPDATE public.hospital_beds
  SET status = 'occupied', updated_at = now()
  WHERE id = p_bed_id AND hospital_id = p_hospital_id;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.transfer_patient(
  p_hospital_id uuid,
  p_admission_id uuid,
  p_new_ward_id uuid,
  p_new_bed_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hospital_admissions;
  v_old_bed_id uuid;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'admissions.manage') THEN
    RAISE EXCEPTION 'admissions.manage capability required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.hospital_admissions
  WHERE id = p_admission_id
    AND hospital_id = p_hospital_id
    AND status IN ('admitted', 'transferred')
  FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Active admission not found in this hospital' USING ERRCODE = 'P0002';
  END IF;
  v_old_bed_id := v_row.bed_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.hospital_wards
    WHERE id = p_new_ward_id AND hospital_id = p_hospital_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Active ward not found in this hospital' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1
  FROM public.hospital_beds
  WHERE id = p_new_bed_id
    AND hospital_id = p_hospital_id
    AND ward_id = p_new_ward_id
    AND status = 'available'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Available bed not found in the selected ward' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.hospital_admissions
  SET ward_id = p_new_ward_id, bed_id = p_new_bed_id, status = 'transferred', updated_at = now()
  WHERE id = p_admission_id AND hospital_id = p_hospital_id
  RETURNING * INTO v_row;
  UPDATE public.hospital_beds
  SET status = 'cleaning', updated_at = now()
  WHERE id = v_old_bed_id AND hospital_id = p_hospital_id;
  UPDATE public.hospital_beds
  SET status = 'occupied', updated_at = now()
  WHERE id = p_new_bed_id AND hospital_id = p_hospital_id;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.discharge_patient(
  p_hospital_id uuid,
  p_admission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hospital_admissions;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'admissions.manage') THEN
    RAISE EXCEPTION 'admissions.manage capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.hospital_admissions
  SET status = 'discharged', discharged_at = now(), updated_at = now()
  WHERE id = p_admission_id
    AND hospital_id = p_hospital_id
    AND status IN ('admitted', 'transferred')
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Active admission not found in this hospital' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.hospital_beds
  SET status = 'cleaning', updated_at = now()
  WHERE id = v_row.bed_id AND hospital_id = p_hospital_id;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.set_bed_status(
  p_hospital_id uuid,
  p_bed_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'admissions.manage') THEN
    RAISE EXCEPTION 'admissions.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('available', 'cleaning', 'blocked') THEN
    RAISE EXCEPTION 'Bed status must be available, cleaning, or blocked' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hospital_beds
  SET status = p_status, updated_at = now()
  WHERE id = p_bed_id
    AND hospital_id = p_hospital_id
    AND status <> 'occupied'
    AND NOT EXISTS (
      SELECT 1 FROM public.hospital_admissions a
      WHERE a.bed_id = p_bed_id AND a.hospital_id = p_hospital_id
        AND a.status IN ('admitted', 'transferred')
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bed not found or currently assigned to an active admission' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('bed_id', p_bed_id, 'status', p_status);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_ward_with_beds(
  p_hospital_id uuid,
  p_name text,
  p_bed_count integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ward_id uuid;
  v_i integer;
  v_name text := NULLIF(btrim(p_name), '');
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL OR p_bed_count NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Ward name and a bed count between 1 and 100 are required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.hospital_wards (hospital_id, name, is_active)
  VALUES (p_hospital_id, v_name, true)
  RETURNING id INTO v_ward_id;

  FOR v_i IN 1..p_bed_count LOOP
    INSERT INTO public.hospital_beds (hospital_id, ward_id, bed_label, status)
    VALUES (p_hospital_id, v_ward_id, v_name || '-BED-' || v_i, 'available');
  END LOOP;

  RETURN jsonb_build_object('ward_id', v_ward_id, 'bed_count', p_bed_count);
END;
$fn$;

NOTIFY pgrst, 'reload schema';
