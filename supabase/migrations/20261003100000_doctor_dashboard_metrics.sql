CREATE OR REPLACE FUNCTION public.doctor_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count bigint;
  high_risk_count bigint;
  appointments_today bigint;
  pending_confirmations bigint;
  unread_items bigint;
  unsigned_consultations bigint;
  unreviewed_reports bigint;
  unread_messages bigint;
  attention_rows jsonb;
  next_appointments jsonb;
  appointment_trend jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO active_count
  FROM public.doctor_patients
  WHERE doctor_id = auth.uid() AND status = 'active';

  SELECT count(*) INTO high_risk_count
  FROM public.doctor_patients
  WHERE doctor_id = auth.uid() AND status = 'active' AND risk_level = 'high';

  SELECT count(*) INTO appointments_today
  FROM public.doctor_appointments a
  WHERE a.doctor_id = auth.uid()
    AND a.status NOT IN ('cancelled', 'no_show')
    AND (a.starts_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT count(*) INTO pending_confirmations
  FROM public.doctor_appointments
  WHERE doctor_id = auth.uid() AND status = 'pending' AND starts_at >= now();

  SELECT count(*) INTO unread_items
  FROM public.notifications
  WHERE user_id = auth.uid() AND is_read = false;

  SELECT count(*) INTO unsigned_consultations
  FROM public.doctor_consultations
  WHERE doctor_id = auth.uid() AND status = 'draft';

  SELECT count(*) INTO unreviewed_reports
  FROM public.doctor_reports
  WHERE doctor_id = auth.uid() AND flag IN ('attention', 'critical');

  SELECT count(*) INTO unread_messages
  FROM public.messages
  WHERE recipient_id = auth.uid() AND is_read = false;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC), '[]'::jsonb)
  INTO attention_rows
  FROM (
    SELECT id, patient_code, full_name, risk_level, updated_at
    FROM public.doctor_patients
    WHERE doctor_id = auth.uid() AND status = 'active' AND risk_level IN ('high', 'moderate')
    ORDER BY CASE risk_level WHEN 'high' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 5
  ) p;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.starts_at), '[]'::jsonb)
  INTO next_appointments
  FROM (
    SELECT a.id, a.doctor_patient_id, p.patient_code, p.full_name AS patient_name,
      a.starts_at, a.duration_minutes, a.visit_type, a.status, a.reason
    FROM public.doctor_appointments a
    JOIN public.doctor_patients p ON p.id = a.doctor_patient_id
    WHERE a.doctor_id = auth.uid()
      AND a.status IN ('pending', 'confirmed')
      AND a.starts_at >= now()
    ORDER BY a.starts_at
    LIMIT 5
  ) a;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', day::date,
    'appointments', count
  ) ORDER BY day), '[]'::jsonb)
  INTO appointment_trend
  FROM (
    SELECT days.day, count(a.id) AS count
    FROM generate_series(current_date - 13, current_date, interval '1 day') AS days(day)
    LEFT JOIN public.doctor_appointments a
      ON a.doctor_id = auth.uid()
      AND a.status NOT IN ('cancelled', 'no_show')
      AND (a.starts_at AT TIME ZONE 'Asia/Kolkata')::date = days.day::date
    GROUP BY days.day
  ) trend;

  RETURN jsonb_build_object(
    'kpis', jsonb_build_object(
      'active_patients', active_count,
      'appointments_today', appointments_today,
      'pending_confirmations', pending_confirmations,
      'high_risk', high_risk_count,
      'unread_items', unread_items
    ),
    'next_appointments', next_appointments,
    'attention', attention_rows,
    'trend_14d', appointment_trend,
    'quick_counts', jsonb_build_object(
      'unsigned_consultations', unsigned_consultations,
      'unreviewed_reports', unreviewed_reports,
      'unread_messages', unread_messages
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.doctor_dashboard_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_dashboard_summary() TO authenticated;
