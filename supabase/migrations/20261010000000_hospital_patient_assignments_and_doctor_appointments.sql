ALTER TABLE public.hospital_patients
  ADD COLUMN IF NOT EXISTS assigned_doctor_id uuid
    REFERENCES public.hospital_doctors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hospital_patients_assigned_doctor
  ON public.hospital_patients (hospital_id, assigned_doctor_id)
  WHERE assigned_doctor_id IS NOT NULL;

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
    WHERE hm.hospital_id = p_hospital_id
      AND hm.user_id = auth.uid()
      AND hm.is_active
      AND public.hospital_role_can(hm.staff_role, p_cap)
      AND (
        p_cap IN ('config.manage', 'staff.manage')
        OR EXISTS (
          SELECT 1
          FROM public.hospital_orgs h
          WHERE h.id = hm.hospital_id
            AND h.verification_status = 'verified'
        )
      )
      AND (p_cap NOT IN ('patients.read', 'clinical.read') OR hm.staff_role <> 'doctor')
  );
$$;

CREATE OR REPLACE FUNCTION public.doctor_hospital_can_read_record(
  p_hospital_id uuid,
  p_doctor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.hospital_doctors d
    JOIN public.doctor_profiles dp
      ON dp.user_id = d.user_id
     AND dp.verification_status = 'verified'
    JOIN public.hospital_members hm
      ON hm.hospital_id = d.hospital_id
     AND hm.user_id = d.user_id
     AND hm.staff_role = 'doctor'
     AND hm.is_active
    JOIN public.hospital_orgs h
      ON h.id = d.hospital_id
     AND h.verification_status = 'verified'
    WHERE d.hospital_id = p_hospital_id
      AND d.id = p_doctor_id
      AND d.is_active
      AND d.employment_status = 'active'
      AND d.verification_status = 'verified'
      AND (
        d.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.hospital_doctor_care_team_assignments ca
          JOIN public.hospital_members staff
            ON staff.hospital_id = ca.hospital_id
           AND staff.user_id = ca.staff_user_id
           AND staff.staff_role = ca.staff_role
           AND staff.is_active
          WHERE ca.hospital_id = d.hospital_id
            AND ca.doctor_id = d.id
            AND ca.staff_user_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.doctor_hospital_can_read_patient(
  p_hospital_id uuid,
  p_patient_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hospital_appointments a
    WHERE a.hospital_id = p_hospital_id
      AND a.patient_id = p_patient_id
      AND public.doctor_hospital_can_read_record(a.hospital_id, a.doctor_id)
    UNION ALL
    SELECT 1
    FROM public.consultations c
    WHERE c.hospital_id = p_hospital_id
      AND c.patient_id = p_patient_id
      AND public.doctor_hospital_can_read_record(c.hospital_id, c.doctor_id)
    UNION ALL
    SELECT 1
    FROM public.investigation_orders io
    WHERE io.hospital_id = p_hospital_id
      AND io.patient_id = p_patient_id
      AND public.doctor_hospital_can_read_record(io.hospital_id, io.ordered_by_doctor_id)
    UNION ALL
    SELECT 1
    FROM public.hospital_admissions ha
    WHERE ha.hospital_id = p_hospital_id
      AND ha.patient_id = p_patient_id
      AND public.doctor_hospital_can_read_record(ha.hospital_id, ha.admitting_doctor_id)
    UNION ALL
    SELECT 1
    FROM public.hospital_patients hp
    JOIN public.doctor_patients dp ON dp.patient_user_id = hp.patient_user_id
    JOIN public.hospital_doctors d
      ON d.hospital_id = hp.hospital_id
     AND d.user_id = auth.uid()
     AND d.is_active
    JOIN public.hospital_members hm
      ON hm.hospital_id = d.hospital_id
     AND hm.user_id = d.user_id
     AND hm.staff_role = 'doctor'
     AND hm.is_active
    WHERE hp.hospital_id = p_hospital_id
      AND hp.id = p_patient_id
      AND dp.doctor_id = auth.uid()
      AND dp.status = 'active'
    UNION ALL
    SELECT 1
    FROM public.hospital_patients hp
    WHERE hp.hospital_id = p_hospital_id
      AND hp.id = p_patient_id
      AND hp.assigned_doctor_id IS NOT NULL
      AND public.doctor_hospital_can_read_record(hp.hospital_id, hp.assigned_doctor_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.doctor_hospital_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'patients', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', hp.id,
          'hospital_id', h.id,
          'hospital_name', h.name,
          'identifier', hp.patient_identifier,
          'name', hp.name,
          'age', hp.age,
          'gender', hp.gender,
          'linked', hp.patient_user_id IS NOT NULL,
          'doctor_id', hp.assigned_doctor_id
        )
        ORDER BY hp.updated_at DESC
      )
      FROM public.hospital_doctors d
      JOIN public.hospital_members hm
        ON hm.hospital_id = d.hospital_id
       AND hm.user_id = d.user_id
       AND hm.staff_role = 'doctor'
       AND hm.is_active
      JOIN public.hospital_orgs h
        ON h.id = d.hospital_id
       AND h.verification_status = 'verified'
      JOIN public.hospital_patients hp
        ON hp.hospital_id = d.hospital_id
       AND hp.assigned_doctor_id = d.id
      WHERE d.user_id = auth.uid()
        AND d.is_active
        AND d.employment_status = 'active'
        AND d.verification_status = 'verified'
        AND public.doctor_hospital_can_read_patient(hp.hospital_id, hp.id)
    ), '[]'::jsonb),
    'appointments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'hospital_id', a.hospital_id,
          'hospital_name', h.name,
          'patient_id', p.id,
          'patient_identifier', p.patient_identifier,
          'patient_name', p.name,
          'scheduled_at', a.scheduled_at,
          'kind', a.kind,
          'status', a.status,
          'reason', a.reason
        )
        ORDER BY a.scheduled_at
      )
      FROM public.hospital_appointments a
      JOIN public.hospital_doctors d ON d.id = a.doctor_id
      JOIN public.hospital_members hm
        ON hm.hospital_id = d.hospital_id
       AND hm.user_id = d.user_id
       AND hm.staff_role = 'doctor'
       AND hm.is_active
      JOIN public.hospital_orgs h
        ON h.id = a.hospital_id
       AND h.verification_status = 'verified'
      JOIN public.hospital_patients p ON p.id = a.patient_id
      WHERE d.user_id = auth.uid()
        AND d.is_active
        AND a.status IN ('scheduled', 'confirmed', 'checked_in', 'in_consultation')
        AND a.scheduled_at >= now() - interval '1 day'
        AND a.scheduled_at < now() + interval '30 days'
    ), '[]'::jsonb)
  );
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
      AND h.verification_status = 'verified'
  ) THEN
    RAISE EXCEPTION 'Hospital must be verified before assigning patients' USING ERRCODE = '42501';
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
    JOIN public.hospital_members hm
      ON hm.hospital_id = d.hospital_id
     AND hm.user_id = d.user_id
     AND hm.staff_role = 'doctor'
     AND hm.is_active
    JOIN public.doctor_profiles dp
      ON dp.user_id = d.user_id
     AND dp.verification_status = 'verified'
    WHERE d.id = p_doctor_id
      AND d.hospital_id = p_hospital_id
      AND d.is_active
      AND d.employment_status = 'active'
      AND d.verification_status = 'verified'
  ) THEN
    RAISE EXCEPTION 'An active, verified doctor from this hospital is required' USING ERRCODE = '22023';
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

CREATE OR REPLACE FUNCTION public.create_hospital_appointment(
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
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.hospital_doctors d
    JOIN public.hospital_members hm
      ON hm.hospital_id = d.hospital_id
     AND hm.user_id = d.user_id
     AND hm.staff_role = 'doctor'
     AND hm.is_active
    WHERE d.id = p_doctor_id
      AND d.hospital_id = p_hospital_id
      AND d.user_id = auth.uid()
      AND d.is_active
  ) THEN
    RAISE EXCEPTION 'Only the assigned active hospital doctor can book this appointment' USING ERRCODE = '42501';
  END IF;

  RETURN public.doctor_create_hospital_appointment(
    p_hospital_id,
    p_patient_id,
    p_scheduled_at,
    p_kind,
    p_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_create_hospital_appointment(
  p_hospital_id uuid,
  p_patient_id uuid,
  p_scheduled_at timestamptz,
  p_kind text DEFAULT 'opd',
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  doctor_row public.hospital_doctors;
  timezone_name text;
  local_start timestamp;
  created public.hospital_appointments;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_scheduled_at IS NULL OR p_scheduled_at <= now() THEN
    RAISE EXCEPTION 'Appointment must be scheduled in the future' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('opd', 'follow_up', 'referral') THEN
    RAISE EXCEPTION 'Invalid appointment kind' USING ERRCODE = '22023';
  END IF;

  SELECT h.timezone
  INTO timezone_name
  FROM public.hospital_orgs h
  WHERE h.id = p_hospital_id
    AND h.verification_status = 'verified';
  IF timezone_name IS NULL THEN
    RAISE EXCEPTION 'Verified hospital workspace required' USING ERRCODE = '42501';
  END IF;

  SELECT d.*
  INTO doctor_row
  FROM public.hospital_doctors d
  JOIN public.hospital_members hm
    ON hm.hospital_id = d.hospital_id
   AND hm.user_id = d.user_id
   AND hm.staff_role = 'doctor'
   AND hm.is_active
  JOIN public.doctor_profiles dp
    ON dp.user_id = d.user_id
   AND dp.verification_status = 'verified'
  WHERE d.hospital_id = p_hospital_id
    AND d.user_id = auth.uid()
    AND d.is_active
    AND d.employment_status = 'active'
    AND d.verification_status = 'verified'
  ORDER BY d.created_at
  LIMIT 1
  FOR UPDATE OF d;
  IF doctor_row.id IS NULL THEN
    RAISE EXCEPTION 'An active, verified hospital doctor profile is required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.hospital_patients hp
    WHERE hp.id = p_patient_id
      AND hp.hospital_id = p_hospital_id
      AND hp.assigned_doctor_id = doctor_row.id
  ) THEN
    RAISE EXCEPTION 'Patient is not assigned to this doctor' USING ERRCODE = '42501';
  END IF;

  local_start := p_scheduled_at AT TIME ZONE timezone_name;
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(doctor_row.shift_schedule, '[]'::jsonb)) AS shifts(value)
    WHERE CASE
        WHEN COALESCE(value->>'day', '') ~ '^[0-6]$' THEN (value->>'day')::integer
        ELSE -1
      END = extract(dow FROM local_start)::integer
      AND CASE
        WHEN COALESCE(value->>'start', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         AND COALESCE(value->>'end', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        THEN local_start::time >= (value->>'start')::time
          AND (local_start + interval '30 minutes')::time <= (value->>'end')::time
        ELSE false
      END
  ) THEN
    RAISE EXCEPTION 'Appointment is outside the doctor''s configured hospital working hours' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.hospital_holidays holiday
    WHERE holiday.hospital_id = p_hospital_id
      AND holiday.holiday_date = local_start::date
  ) THEN
    RAISE EXCEPTION 'The hospital is closed on the selected date' USING ERRCODE = '22023';
  END IF;

  IF doctor_row.department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.hospital_departments department
    WHERE department.id = doctor_row.department_id
      AND department.hospital_id = p_hospital_id
      AND department.is_active
  ) THEN
    RAISE EXCEPTION 'The doctor department is inactive' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.doctor_leaves leave
    WHERE leave.doctor_id = auth.uid()
      AND leave.starts_at < p_scheduled_at + interval '30 minutes'
      AND leave.ends_at > p_scheduled_at
  ) THEN
    RAISE EXCEPTION 'Doctor is unavailable during the selected time' USING ERRCODE = '23P01';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.hospital_appointments appointment
    WHERE appointment.doctor_id = doctor_row.id
      AND appointment.status NOT IN ('cancelled', 'no_show')
      AND appointment.scheduled_at < p_scheduled_at + interval '30 minutes'
      AND appointment.scheduled_at + interval '30 minutes' > p_scheduled_at
  ) THEN
    RAISE EXCEPTION 'Appointment overlaps an existing hospital appointment' USING ERRCODE = '23P01';
  END IF;

  INSERT INTO public.hospital_appointments (
    hospital_id,
    patient_id,
    doctor_id,
    department_id,
    scheduled_at,
    kind,
    reason,
    created_by
  )
  VALUES (
    p_hospital_id,
    p_patient_id,
    doctor_row.id,
    doctor_row.department_id,
    p_scheduled_at,
    p_kind,
    NULLIF(btrim(p_reason), ''),
    auth.uid()
  )
  RETURNING * INTO created;

  PERFORM public.hospital_log_event(
    p_hospital_id,
    p_patient_id,
    'appointment.booked',
    jsonb_build_object('appointment_id', created.id, 'scheduled_at', created.scheduled_at),
    true
  );

  RETURN to_jsonb(created);
END;
$$;

CREATE OR REPLACE FUNCTION public.link_patient_account(
  p_hospital_id uuid,
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link_row public.patient_link_codes;
BEGIN
  IF auth.uid() IS NULL OR NULLIF(btrim(p_code), '') IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.name = 'patient'
  ) THEN
    RAISE EXCEPTION 'An authenticated patient account and link code are required'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO link_row
  FROM public.patient_link_codes
  WHERE hospital_id = p_hospital_id
    AND code_hash IN (
      encode(digest(upper(btrim(p_code)), 'sha256'), 'hex'),
      md5(upper(btrim(p_code)))
    )
    AND consumed_at IS NULL
    AND expires_at > now()
    AND EXISTS (
      SELECT 1
      FROM public.hospital_orgs h
      WHERE h.id = p_hospital_id
        AND h.verification_status = 'verified'
    )
  ORDER BY created_at DESC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF link_row.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link code' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.hospital_patients
  SET patient_user_id = auth.uid(), updated_at = now()
  WHERE id = link_row.patient_id
    AND hospital_id = p_hospital_id
    AND (patient_user_id IS NULL OR patient_user_id = auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient account is already linked' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patient_link_codes
  SET consumed_at = now()
  WHERE id = link_row.id AND consumed_at IS NULL;

  INSERT INTO public.hospital_access_audit (
    hospital_id, patient_id, actor_user_id, action, details
  )
  VALUES (
    p_hospital_id,
    link_row.patient_id,
    auth.uid(),
    'patient.account_linked',
    jsonb_build_object('link_code_id', link_row.id)
  );

  PERFORM public.hospital_log_event(
    p_hospital_id,
    link_row.patient_id,
    'Patient account linked',
    jsonb_build_object('patient_user_id', auth.uid()),
    true
  );

  RETURN jsonb_build_object(
    'hospital_id', p_hospital_id,
    'patient_id', link_row.patient_id,
    'linked', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_patient_link_code(
  p_hospital_id uuid,
  p_patient_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.claim_hospital_patient_link(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_hospital_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NULLIF(btrim(p_code), '') IS NULL THEN
    RAISE EXCEPTION 'Authentication and link code are required'
      USING ERRCODE = '42501';
  END IF;

  SELECT hospital_id
  INTO target_hospital_id
  FROM public.patient_link_codes
  WHERE code_hash IN (
    encode(digest(upper(btrim(p_code)), 'sha256'), 'hex'),
    md5(upper(btrim(p_code)))
  )
    AND consumed_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF target_hospital_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link code' USING ERRCODE = 'P0002';
  END IF;

  RETURN public.link_patient_account(target_hospital_id, p_code);
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_hospital_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'appointment_count', (
      SELECT count(*)
      FROM public.hospital_patients p
      JOIN public.hospital_appointments a ON a.patient_id = p.id
      JOIN public.hospital_orgs h ON h.id = a.hospital_id AND h.verification_status = 'verified'
      WHERE p.patient_user_id = auth.uid()
    ),
    'appointments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'hospital_name', h.name,
          'patient_identifier', p.patient_identifier,
          'doctor_name', d.doctor_name,
          'scheduled_at', a.scheduled_at,
          'kind', a.kind,
          'status', a.status,
          'reason', a.reason
        )
        ORDER BY a.scheduled_at
      )
      FROM public.hospital_patients p
      JOIN public.hospital_appointments a ON a.patient_id = p.id
      JOIN public.hospital_orgs h ON h.id = a.hospital_id AND h.verification_status = 'verified'
      JOIN public.hospital_doctors d ON d.id = a.doctor_id
      WHERE p.patient_user_id = auth.uid()
        AND a.status IN ('scheduled', 'confirmed', 'checked_in', 'in_consultation')
        AND a.scheduled_at >= now() - interval '1 day'
        AND a.scheduled_at < now() + interval '30 days'
    ), '[]'::jsonb),
    'assigned_doctors', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'hospital_id', h.id,
          'hospital_name', h.name,
          'doctor_name', d.doctor_name,
          'specialty', d.specialty,
          'department', department.name
        )
        ORDER BY h.name, d.doctor_name
      )
      FROM public.hospital_patients p
      JOIN public.hospital_orgs h ON h.id = p.hospital_id AND h.verification_status = 'verified'
      JOIN public.hospital_doctors d ON d.id = p.assigned_doctor_id
        AND d.hospital_id = p.hospital_id
        AND d.is_active
      LEFT JOIN public.hospital_departments department ON department.id = d.department_id
      WHERE p.patient_user_id = auth.uid()
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_hospital_patient_doctor(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_patient_link_code(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_patient_account(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_hospital_patient_link(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_hospital_appointment(uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_create_hospital_appointment(uuid, uuid, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_hospital_dashboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_hospital_can_read_patient(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_hospital_can_read_record(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_hospital_patient_doctor(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_patient_link_code(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_patient_account(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_hospital_patient_link(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_hospital_appointment(uuid, uuid, uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_create_hospital_appointment(uuid, uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_hospital_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_hospital_can_read_patient(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_hospital_can_read_record(uuid, uuid) TO authenticated;
