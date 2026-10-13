CREATE OR REPLACE FUNCTION public.get_today_sessions(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hospital_wide_access boolean := public.hospital_has_cap(p_hospital_id, 'patients.read');
  v_doctor_access boolean;
BEGIN
  IF NOT v_hospital_wide_access THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.hospital_doctors d
      WHERE d.hospital_id = p_hospital_id
        AND d.user_id = auth.uid()
        AND public.doctor_hospital_can_read_record(p_hospital_id, d.id)
    ) INTO v_doctor_access;

    IF NOT v_doctor_access THEN
      RAISE EXCEPTION 'patients.read capability required' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'session_id', s.id,
        'doctor', d.doctor_name,
        'department', dep.name,
        'room', s.room,
        'status', s.status,
        'serving_token', (
          SELECT q.token_number
          FROM public.queue_entries q
          WHERE q.session_id = s.id AND q.status = 'in_consultation'
          ORDER BY q.token_number
          LIMIT 1
        ),
        'next_token', (
          SELECT q.token_number
          FROM public.queue_entries q
          WHERE q.session_id = s.id AND q.status = 'waiting'
          ORDER BY q.priority_rank, q.token_number
          LIMIT 1
        ),
        'waiting', (
          SELECT count(*)
          FROM public.queue_entries q
          WHERE q.session_id = s.id AND q.status = 'waiting'
        ),
        'completed', (
          SELECT count(*)
          FROM public.queue_entries q
          WHERE q.session_id = s.id AND q.status = 'completed'
        ),
        'delay_flag', s.delay_note IS NOT NULL
      )
      ORDER BY s.start_time
    )
    FROM public.opd_sessions s
    JOIN public.hospital_doctors d ON d.id = s.doctor_id
    LEFT JOIN public.hospital_departments dep ON dep.id = s.department_id
    WHERE s.hospital_id = p_hospital_id
      AND s.session_date = public.hospital_today(p_hospital_id)
      AND (
        v_hospital_wide_access
        OR public.doctor_hospital_can_read_record(s.hospital_id, s.doctor_id)
      )
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_today_sessions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_today_sessions(uuid) TO authenticated;
