CREATE OR REPLACE FUNCTION public.hospital_command_center(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'patients.read') THEN RAISE EXCEPTION 'patients.read capability required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'kpis',jsonb_build_object('opd_patients_today',(SELECT count(*) FROM public.hospital_visits WHERE hospital_id=p_hospital_id AND visit_date=public.hospital_today(p_hospital_id)),'checked_in',(SELECT count(*) FROM public.hospital_visits WHERE hospital_id=p_hospital_id AND visit_date=public.hospital_today(p_hospital_id)),'waiting',(SELECT count(*) FROM public.queue_entries WHERE hospital_id=p_hospital_id AND status='waiting' AND session_id IN(SELECT id FROM public.opd_sessions WHERE hospital_id=p_hospital_id AND session_date=public.hospital_today(p_hospital_id))),'in_consultation',(SELECT count(*) FROM public.queue_entries WHERE hospital_id=p_hospital_id AND status='in_consultation' AND session_id IN(SELECT id FROM public.opd_sessions WHERE hospital_id=p_hospital_id AND session_date=public.hospital_today(p_hospital_id))),'pending_reports',(SELECT count(*) FROM public.investigation_orders WHERE hospital_id=p_hospital_id AND status IN('performed','processing','report_ready')),'admissions_today',(SELECT count(*) FROM public.hospital_admissions WHERE hospital_id=p_hospital_id AND admitted_at >= (public.hospital_today(p_hospital_id)::timestamp AT TIME ZONE (SELECT timezone FROM public.hospital_orgs WHERE id=p_hospital_id)))),
    'queues',public.get_today_sessions(p_hospital_id),
    'action_required',COALESCE((SELECT jsonb_agg(jsonb_build_object('key',a.key,'severity',a.severity,'count',a.count,'href',a.href)) FROM (VALUES
      ('reports_ready_for_review','warning',(SELECT count(*)::integer FROM public.investigation_orders WHERE hospital_id=p_hospital_id AND status='report_ready'),'/dashboard/hospital/investigations'),
      ('waiting_beyond_estimate','warning',(SELECT count(*)::integer FROM public.queue_entries WHERE hospital_id=p_hospital_id AND status='waiting' AND est_wait_high_min IS NOT NULL AND extract(epoch FROM (now()-joined_at))/60>est_wait_high_min),'/dashboard/hospital/opd'),
      ('pending_investigations','info',(SELECT count(*)::integer FROM public.investigation_orders WHERE hospital_id=p_hospital_id AND status IN('ordered','waitlisted','scheduled')),'/dashboard/hospital/investigations')
    ) a(key,severity,count,href) WHERE a.count>0),'[]'::jsonb),
    'checkins_by_hour',COALESCE((SELECT jsonb_agg(jsonb_build_object('hour',h.hour,'count',COALESCE(c.count,0)) ORDER BY h.hour) FROM generate_series(0,23) h(hour) LEFT JOIN (SELECT extract(hour FROM v.checked_in_at AT TIME ZONE (SELECT timezone FROM public.hospital_orgs WHERE id=p_hospital_id))::integer AS hour,count(*) AS count FROM public.hospital_visits v WHERE v.hospital_id=p_hospital_id AND v.visit_date=public.hospital_today(p_hospital_id) GROUP BY 1) c ON c.hour=h.hour),'[]'::jsonb),
    'opd_14_days',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',d.day,'count',COALESCE(c.count,0)) ORDER BY d.day) FROM (SELECT generated_day::date AS day FROM generate_series(public.hospital_today(p_hospital_id)-13,public.hospital_today(p_hospital_id),'1 day') generated_day) d LEFT JOIN (SELECT visit_date,count(*) AS count FROM public.hospital_visits WHERE hospital_id=p_hospital_id GROUP BY visit_date) c ON c.visit_date=d.day),'[]'::jsonb),
    'recent_events',COALESCE((SELECT jsonb_agg(jsonb_build_object('event_type',e.event_type,'patient',p.name,'created_at',e.created_at,'details',e.details) ORDER BY e.created_at DESC) FROM (SELECT * FROM public.patient_journey_events WHERE hospital_id=p_hospital_id ORDER BY created_at DESC LIMIT 20) e JOIN public.hospital_patients p ON p.id=e.patient_id),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.hospital_command_center(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
