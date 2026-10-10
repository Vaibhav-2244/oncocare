ALTER TABLE public.hospital_beds
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.set_bed_status(
  p_hospital_id uuid,
  p_bed_id uuid,
  p_status text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bed public.hospital_beds;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'admissions.manage') THEN
    RAISE EXCEPTION 'admissions.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('available', 'cleaning', 'blocked') THEN
    RAISE EXCEPTION 'Bed status must be available, cleaning, or blocked' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'blocked' AND NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required when blocking a bed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hospital_beds
  SET status = p_status,
      blocked_reason = CASE WHEN p_status = 'blocked' THEN btrim(p_reason) ELSE NULL END,
      blocked_at = CASE WHEN p_status = 'blocked' THEN now() ELSE NULL END,
      blocked_by = CASE WHEN p_status = 'blocked' THEN auth.uid() ELSE NULL END,
      updated_at = now()
  WHERE id = p_bed_id
    AND hospital_id = p_hospital_id
    AND status <> 'occupied'
    AND NOT EXISTS (
      SELECT 1
      FROM public.hospital_admissions a
      WHERE a.bed_id = p_bed_id
        AND a.hospital_id = p_hospital_id
        AND a.status IN ('admitted', 'transferred')
    )
  RETURNING * INTO v_bed;
  IF v_bed.id IS NULL THEN
    RAISE EXCEPTION 'Bed not found or currently assigned to an active admission' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
  VALUES (
    p_hospital_id,
    auth.uid(),
    'bed.status_changed',
    jsonb_build_object('bed_id', p_bed_id, 'status', p_status, 'reason', v_bed.blocked_reason)
  );

  RETURN to_jsonb(v_bed);
END;
$$;

REVOKE ALL ON FUNCTION public.set_bed_status(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_bed_status(uuid, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_bed_status(
  p_hospital_id uuid,
  p_bed_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.set_bed_status(p_hospital_id, p_bed_id, p_status, NULL)
$$;

REVOKE ALL ON FUNCTION public.set_bed_status(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_bed_status(uuid, uuid, text) TO authenticated;

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
  IF NOT EXISTS (
    SELECT 1
    FROM public.hospital_orgs h
    WHERE h.id = p_hospital_id
      AND h.verification_status <> 'suspended'
  ) THEN
    RAISE EXCEPTION 'Hospital workspace is unavailable' USING ERRCODE = '42501';
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
  WHERE id = link_row.id
    AND consumed_at IS NULL;

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

REVOKE ALL ON FUNCTION public.link_patient_account(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_patient_account(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_hospital_patient_daily_status(
  p_hospital_id uuid,
  p_patient_ids uuid[]
)
RETURNS TABLE(patient_id uuid, status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF cardinality(COALESCE(p_patient_ids, ARRAY[]::uuid[])) > 100 THEN
    RAISE EXCEPTION 'At most 100 patients can be requested at once' USING ERRCODE = '22023';
  END IF;
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.read')
     AND EXISTS (
       SELECT 1
       FROM unnest(COALESCE(p_patient_ids, ARRAY[]::uuid[])) AS requested(patient_id)
       WHERE NOT public.doctor_hospital_can_read_patient(p_hospital_id, requested.patient_id)
     ) THEN
    RAISE EXCEPTION 'patients.read capability required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH status_events AS (
    SELECT q.patient_id, q.status, 1 AS source_rank, q.updated_at AS event_at
    FROM public.queue_entries q
    JOIN public.opd_sessions s
      ON s.id = q.session_id
     AND s.hospital_id = q.hospital_id
    WHERE q.hospital_id = p_hospital_id
      AND q.patient_id = ANY(p_patient_ids)
      AND s.session_date = public.hospital_today(p_hospital_id)
      AND q.status IN ('waiting', 'called', 'in_consultation', 'completed', 'skipped', 'no_show', 'referred', 'cancelled')

    UNION ALL

    SELECT a.patient_id, a.status, 2, a.updated_at
    FROM public.hospital_appointments a
    WHERE a.hospital_id = p_hospital_id
      AND a.patient_id = ANY(p_patient_ids)
      AND (a.scheduled_at AT TIME ZONE COALESCE(
        (SELECT h.timezone FROM public.hospital_orgs h WHERE h.id = p_hospital_id),
        'Asia/Kolkata'
      ))::date = public.hospital_today(p_hospital_id)
      AND a.status IN ('scheduled', 'confirmed', 'checked_in', 'in_consultation', 'completed', 'cancelled', 'no_show')

    UNION ALL

    SELECT v.patient_id, 'checked_in', 3, v.checked_in_at
    FROM public.hospital_visits v
    WHERE v.hospital_id = p_hospital_id
      AND v.patient_id = ANY(p_patient_ids)
      AND v.visit_date = public.hospital_today(p_hospital_id)
  ),
  ranked AS (
    SELECT event.patient_id, event.status,
      row_number() OVER (
        PARTITION BY event.patient_id
        ORDER BY
          CASE event.status
            WHEN 'in_consultation' THEN 1
            WHEN 'called' THEN 2
            WHEN 'waiting' THEN 3
            WHEN 'checked_in' THEN 4
            WHEN 'scheduled' THEN 5
            WHEN 'confirmed' THEN 5
            WHEN 'completed' THEN 6
            WHEN 'no_show' THEN 7
            WHEN 'skipped' THEN 8
            WHEN 'referred' THEN 9
            WHEN 'cancelled' THEN 10
            ELSE 11
          END,
          event.source_rank,
          event.event_at DESC
      ) AS position
    FROM status_events event
  )
  SELECT requested.patient_id, COALESCE(ranked.status, 'no_visit')
  FROM unnest(COALESCE(p_patient_ids, ARRAY[]::uuid[])) AS requested(patient_id)
  LEFT JOIN ranked
    ON ranked.patient_id = requested.patient_id
   AND ranked.position = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_hospital_patient_daily_status(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_hospital_patient_daily_status(uuid, uuid[]) TO authenticated;
