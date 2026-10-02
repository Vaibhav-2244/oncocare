CREATE OR REPLACE FUNCTION public.search_hospital_patients(p_hospital_id uuid, p_query text, p_limit integer DEFAULT 8)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_norm text;
  v_digits text;
  v_result jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.read') THEN RAISE EXCEPTION 'patients.read capability required' USING ERRCODE = '42501'; END IF;
  v_norm := public.hospital_normalize_id(p_hospital_id, v_query);
  v_digits := regexp_replace(COALESCE(v_query, ''), '[^0-9]', '', 'g');
  SELECT jsonb_build_object(
    'patients', COALESCE((SELECT jsonb_agg(patient_json ORDER BY result_rank, name_similarity DESC)
    FROM (SELECT jsonb_build_object(
      'id', p.id, 'identifier', p.patient_identifier, 'name', p.name, 'age', p.age, 'gender', p.gender,
      'mobile_masked', CASE WHEN p.mobile IS NULL THEN NULL ELSE repeat('X', greatest(length(p.mobile) - 4, 0)) || right(p.mobile, 4) END,
      'today_status', qe.status, 'token', qe.token_number
    ) AS patient_json,
      CASE WHEN p.normalized_identifier = v_norm THEN 0 WHEN v_digits <> '' AND regexp_replace(COALESCE(p.mobile,''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%' THEN 1 ELSE 2 END AS result_rank,
      similarity(p.name, COALESCE(v_query,'')) AS name_similarity, p.name
    FROM public.hospital_patients p
    LEFT JOIN LATERAL (
      SELECT q.status, q.token_number FROM public.queue_entries q JOIN public.opd_sessions s ON s.id = q.session_id
      WHERE q.hospital_id = p_hospital_id AND q.patient_id = p.id AND s.session_date = public.hospital_today(p_hospital_id)
      ORDER BY q.created_at DESC LIMIT 1
    ) qe ON true
    WHERE p.hospital_id = p_hospital_id AND (v_query IS NULL OR p.normalized_identifier = v_norm
      OR (v_digits <> '' AND regexp_replace(COALESCE(p.mobile,''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%')
      OR p.name % v_query OR p.name ILIKE '%' || v_query || '%')
    ORDER BY result_rank, name_similarity DESC LIMIT GREATEST(1, LEAST(COALESCE(p_limit,8),50))) result_rows), '[]'::jsonb),
    'doctors', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.doctor_name, 'department', dep.name))
      FROM public.hospital_doctors d LEFT JOIN public.hospital_departments dep ON dep.id = d.department_id
      WHERE d.hospital_id = p_hospital_id AND d.is_active AND (v_query IS NULL OR d.doctor_name ILIKE '%' || v_query || '%' OR dep.name ILIKE '%' || v_query || '%')), '[]'::jsonb),
    'departments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name)) FROM public.hospital_departments d
      WHERE d.hospital_id = p_hospital_id AND d.is_active AND (v_query IS NULL OR d.name ILIKE '%' || v_query || '%')), '[]'::jsonb),
    'appointments_today', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'patient_id', a.patient_id, 'patient', p.name, 'doctor', d.doctor_name, 'scheduled_at', a.scheduled_at, 'status', a.status))
      FROM public.hospital_appointments a JOIN public.hospital_patients p ON p.id = a.patient_id JOIN public.hospital_doctors d ON d.id = a.doctor_id
      WHERE a.hospital_id = p_hospital_id AND (a.scheduled_at AT TIME ZONE (SELECT h.timezone FROM public.hospital_orgs h WHERE h.id = p_hospital_id))::date = public.hospital_today(p_hospital_id)
        AND a.status IN ('scheduled','confirmed') AND (v_query IS NULL OR p.name ILIKE '%' || v_query || '%' OR d.doctor_name ILIKE '%' || v_query || '%')), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.find_possible_duplicates(p_hospital_id uuid, p_name text, p_mobile text, p_dob date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.register') THEN RAISE EXCEPTION 'patients.register capability required' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'identifier', p.patient_identifier, 'name', p.name, 'mobile_masked', CASE WHEN p.mobile IS NULL THEN NULL ELSE repeat('X', greatest(length(p.mobile)-4,0)) || right(p.mobile,4) END, 'dob', p.dob)), '[]'::jsonb)
  INTO v_result FROM public.hospital_patients p WHERE p.hospital_id = p_hospital_id AND (
    (p_mobile IS NOT NULL AND regexp_replace(COALESCE(p.mobile,''),'[^0-9]','','g') = regexp_replace(p_mobile,'[^0-9]','','g'))
    OR (p_dob IS NOT NULL AND p.dob = p_dob AND similarity(p.name, COALESCE(p_name,'')) > 0.35));
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.import_hospital_patients(p_hospital_id uuid, p_rows jsonb, p_dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_row jsonb; v_status text; v_message text; v_identifier text; v_patient_id uuid; v_output jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.register') THEN RAISE EXCEPTION 'patients.register capability required' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Rows must be a JSON array' USING ERRCODE = '22023'; END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_identifier := public.hospital_normalize_id(p_hospital_id, v_row ->> 'identifier');
    IF NULLIF(v_identifier,'') IS NULL OR NULLIF(btrim(v_row ->> 'name'),'') IS NULL THEN
      v_status := 'error'; v_message := 'Identifier and name are required';
    ELSIF EXISTS (SELECT 1 FROM public.hospital_patients WHERE hospital_id = p_hospital_id AND normalized_identifier = upper(regexp_replace(v_identifier,'[[:space:]_-]+','','g'))) THEN
      v_status := 'duplicate'; v_message := 'Patient identifier already exists';
    ELSIF p_dry_run THEN
      v_status := 'new'; v_message := 'Ready to import';
    ELSE
      INSERT INTO public.hospital_patients (hospital_id, patient_identifier, name, mobile, dob, age, gender)
      VALUES (p_hospital_id, v_identifier, btrim(v_row ->> 'name'), NULLIF(btrim(v_row ->> 'mobile'),''), NULLIF(v_row ->> 'dob','')::date, NULLIF(v_row ->> 'age','')::integer, NULLIF(v_row ->> 'gender',''))
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

CREATE OR REPLACE FUNCTION public.get_hospital_patient_record(p_hospital_id uuid, p_identifier text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_patient public.hospital_patients; v_result jsonb; v_clinical boolean;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.read') THEN RAISE EXCEPTION 'patients.read capability required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_patient FROM public.hospital_patients WHERE hospital_id = p_hospital_id AND normalized_identifier = upper(regexp_replace(public.hospital_normalize_id(p_hospital_id,p_identifier),'[[:space:]_-]+','','g'));
  IF v_patient.id IS NULL THEN RAISE EXCEPTION 'Patient not found' USING ERRCODE = 'P0002'; END IF;
  v_clinical := public.hospital_has_cap(p_hospital_id,'clinical.read');
  INSERT INTO public.hospital_access_audit (hospital_id, patient_id, actor_user_id, action) VALUES (p_hospital_id,v_patient.id,auth.uid(),'patient.record_opened');
  SELECT jsonb_build_object(
    'patient',jsonb_build_object('id',v_patient.id,'identifier',v_patient.patient_identifier,'name',v_patient.name,'age',v_patient.age,'gender',v_patient.gender,'mobile',v_patient.mobile,'dob',v_patient.dob,'linked',v_patient.patient_user_id IS NOT NULL),
    'today',jsonb_build_object('visit',(SELECT to_jsonb(v) FROM public.hospital_visits v WHERE v.hospital_id=p_hospital_id AND v.patient_id=v_patient.id AND v.visit_date=public.hospital_today(p_hospital_id) LIMIT 1),
      'queue_entry',(SELECT to_jsonb(q) FROM public.queue_entries q JOIN public.opd_sessions s ON s.id=q.session_id WHERE q.hospital_id=p_hospital_id AND q.patient_id=v_patient.id AND s.session_date=public.hospital_today(p_hospital_id) ORDER BY q.created_at DESC LIMIT 1)),
    'appointments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'scheduled_at',a.scheduled_at,'status',a.status,'kind',a.kind,'doctor',d.doctor_name,'department',dep.name) ORDER BY a.scheduled_at DESC) FROM public.hospital_appointments a LEFT JOIN public.hospital_doctors d ON d.id=a.doctor_id LEFT JOIN public.hospital_departments dep ON dep.id=a.department_id WHERE a.hospital_id=p_hospital_id AND a.patient_id=v_patient.id),'[]'::jsonb),
    'orders',COALESCE((SELECT jsonb_agg(CASE WHEN v_clinical THEN jsonb_build_object('id',o.id,'type',t.name,'status',o.status,'priority',o.priority,'scheduled_for',o.scheduled_for,'expected_report_from',o.expected_report_from,'expected_report_to',o.expected_report_to) ELSE jsonb_build_object('status',o.status) END ORDER BY o.ordered_at DESC) FROM public.investigation_orders o JOIN public.investigation_types t ON t.id=o.type_id WHERE o.hospital_id=p_hospital_id AND o.patient_id=v_patient.id),'[]'::jsonb),
    'consultations',CASE WHEN v_clinical THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'status',c.status,'complaint',c.complaint,'assessment',c.assessment,'plan',c.plan,'advice',c.advice,'version',c.version,'created_at',c.created_at) ORDER BY c.created_at DESC) FROM public.consultations c WHERE c.hospital_id=p_hospital_id AND c.patient_id=v_patient.id),'[]'::jsonb) ELSE '[]'::jsonb END,
    'prescriptions',CASE WHEN v_clinical THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',pr.id,'notes',pr.notes,'created_at',pr.created_at,'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('medicine_name',pi.medicine_name,'dose',pi.dose,'frequency',pi.frequency,'duration',pi.duration,'instructions',pi.instructions) ORDER BY pi.created_at) FROM public.prescription_items pi WHERE pi.prescription_id=pr.id),'[]'::jsonb)) ORDER BY pr.created_at DESC) FROM public.prescriptions pr WHERE pr.hospital_id=p_hospital_id AND pr.patient_id=v_patient.id),'[]'::jsonb) ELSE '[]'::jsonb END,
    'admissions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'ward',w.name,'bed',b.bed_label,'status',a.status,'admitted_at',a.admitted_at) ORDER BY a.admitted_at DESC) FROM public.hospital_admissions a JOIN public.hospital_wards w ON w.id=a.ward_id JOIN public.hospital_beds b ON b.id=a.bed_id WHERE a.hospital_id=p_hospital_id AND a.patient_id=v_patient.id),'[]'::jsonb),
    'timeline',COALESCE((SELECT jsonb_agg(jsonb_build_object('event_type',e.event_type,'details',e.details,'created_at',e.created_at,'visible_to_patient',e.visible_to_patient) ORDER BY e.created_at DESC) FROM (SELECT * FROM public.patient_journey_events WHERE hospital_id=p_hospital_id AND patient_id=v_patient.id ORDER BY created_at DESC LIMIT 100) e),'[]'::jsonb),
    'clinical_restricted',NOT v_clinical
  ) INTO v_result;
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.export_hospital_patients(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_rows jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'patients.read') THEN RAISE EXCEPTION 'patients.read capability required' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('identifier',patient_identifier,'name',name,'mobile',mobile,'dob',dob,'age',age,'gender',gender,'is_demo',is_demo) ORDER BY patient_identifier),'[]'::jsonb)
  INTO v_rows FROM public.hospital_patients WHERE hospital_id=p_hospital_id;
  INSERT INTO public.hospital_access_audit(hospital_id,actor_user_id,action,details)
  VALUES(p_hospital_id,auth.uid(),'patient.exported',jsonb_build_object('count',jsonb_array_length(v_rows)));
  RETURN v_rows;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_opd_session(p_hospital_id uuid,p_doctor_id uuid,p_date date,p_start time,p_end time,p_room text,p_minutes integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_session public.opd_sessions;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hospital_doctors WHERE id=p_doctor_id AND hospital_id=p_hospital_id AND is_active) THEN RAISE EXCEPTION 'Doctor not found in this hospital' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.opd_sessions(hospital_id,doctor_id,department_id,session_date,start_time,end_time,room,default_consult_minutes)
  SELECT p_hospital_id,d.id,d.department_id,p_date,p_start,p_end,NULLIF(btrim(p_room),''),GREATEST(COALESCE(p_minutes,10),1) FROM public.hospital_doctors d WHERE d.id=p_doctor_id RETURNING * INTO v_session;
  RETURN to_jsonb(v_session);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.set_session_status(p_session_id uuid,p_status text,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_session public.opd_sessions;
BEGIN
  IF p_status NOT IN ('open','paused','closed','scheduled') THEN RAISE EXCEPTION 'Invalid session status' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_session FROM public.opd_sessions WHERE id=p_session_id FOR UPDATE;
  IF v_session.id IS NULL OR NOT public.hospital_has_cap(v_session.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  UPDATE public.opd_sessions SET status=p_status,delay_note=NULLIF(btrim(p_note),''),opened_at=CASE WHEN p_status='open' THEN COALESCE(opened_at,now()) ELSE opened_at END,closed_at=CASE WHEN p_status='closed' THEN now() ELSE NULL END,updated_at=now() WHERE id=p_session_id RETURNING * INTO v_session;
  RETURN to_jsonb(v_session);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.generate_default_sessions(p_hospital_id uuid,p_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_count integer;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.opd_sessions(hospital_id,doctor_id,department_id,session_date,start_time,end_time,room,default_consult_minutes)
  SELECT p_hospital_id,d.id,d.department_id,p_date,time '09:00',time '13:00','OPD-' || row_number() OVER(ORDER BY d.doctor_name),COALESCE((public.hospital_setting(p_hospital_id,'default_consult_minutes','10'::jsonb))::text::integer,10)
  FROM public.hospital_doctors d JOIN public.hospital_departments dep ON dep.id=d.department_id AND dep.department_type='clinical'
  WHERE d.hospital_id=p_hospital_id AND d.is_active AND NOT EXISTS(SELECT 1 FROM public.opd_sessions s WHERE s.hospital_id=p_hospital_id AND s.doctor_id=d.id AND s.session_date=p_date)
  ON CONFLICT (hospital_id,doctor_id,session_date,start_time) DO NOTHING;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('created',v_count);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_hospital_appointment(p_hospital_id uuid,p_patient_id uuid,p_doctor_id uuid,p_scheduled_at timestamptz,p_kind text,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_appointment public.hospital_appointments;
BEGIN
  IF NOT (public.hospital_has_cap(p_hospital_id,'patients.register') OR public.hospital_has_cap(p_hospital_id,'queue.manage')) THEN RAISE EXCEPTION 'Appointment capability required' USING ERRCODE='42501'; END IF;
  IF p_kind NOT IN ('opd','follow_up','referral') THEN RAISE EXCEPTION 'Invalid appointment kind' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hospital_patients WHERE id=p_patient_id AND hospital_id=p_hospital_id) OR NOT EXISTS(SELECT 1 FROM public.hospital_doctors WHERE id=p_doctor_id AND hospital_id=p_hospital_id AND is_active) THEN RAISE EXCEPTION 'Patient or doctor not found in this hospital' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.hospital_appointments(hospital_id,patient_id,doctor_id,department_id,scheduled_at,kind,reason,created_by)
  SELECT p_hospital_id,p_patient_id,d.id,d.department_id,p_scheduled_at,p_kind,NULLIF(btrim(p_reason),''),auth.uid() FROM public.hospital_doctors d WHERE d.id=p_doctor_id RETURNING * INTO v_appointment;
  PERFORM public.hospital_log_event(p_hospital_id,p_patient_id,'appointment.booked',jsonb_build_object('appointment_id',v_appointment.id,'scheduled_at',p_scheduled_at),true);
  RETURN to_jsonb(v_appointment);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.cancel_hospital_appointment(p_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_row public.hospital_appointments;
BEGIN
  SELECT * INTO v_row FROM public.hospital_appointments WHERE id=p_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT (public.hospital_has_cap(v_row.hospital_id,'patients.register') OR public.hospital_has_cap(v_row.hospital_id,'queue.manage')) THEN RAISE EXCEPTION 'Appointment capability required' USING ERRCODE='42501'; END IF;
  UPDATE public.hospital_appointments SET status='cancelled',cancel_reason=NULLIF(btrim(p_reason),''),updated_at=now() WHERE id=p_id RETURNING * INTO v_row;
  PERFORM public.hospital_log_event(v_row.hospital_id,v_row.patient_id,'appointment.cancelled',jsonb_build_object('appointment_id',p_id),true);
  RETURN to_jsonb(v_row);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.reschedule_hospital_appointment(p_id uuid,p_new_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_row public.hospital_appointments; v_old timestamptz;
BEGIN
  SELECT * INTO v_row FROM public.hospital_appointments WHERE id=p_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT (public.hospital_has_cap(v_row.hospital_id,'patients.register') OR public.hospital_has_cap(v_row.hospital_id,'queue.manage')) THEN RAISE EXCEPTION 'Appointment capability required' USING ERRCODE='42501'; END IF;
  v_old:=v_row.scheduled_at;
  UPDATE public.hospital_appointments SET scheduled_at=p_new_at,status='scheduled',updated_at=now() WHERE id=p_id RETURNING * INTO v_row;
  PERFORM public.hospital_log_event(v_row.hospital_id,v_row.patient_id,'appointment.rescheduled',jsonb_build_object('appointment_id',p_id,'previous_at',v_old,'scheduled_at',p_new_at),true);
  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hospital_check_in(p_hospital_id uuid,p_patient_id uuid,p_appointment_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_visit public.hospital_visits; v_date date;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hospital_patients WHERE id=p_patient_id AND hospital_id=p_hospital_id) THEN RAISE EXCEPTION 'Patient not found in this hospital' USING ERRCODE='P0002'; END IF;
  IF p_appointment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hospital_appointments WHERE id=p_appointment_id AND hospital_id=p_hospital_id AND patient_id=p_patient_id) THEN RAISE EXCEPTION 'Appointment does not belong to this patient and hospital' USING ERRCODE='23514'; END IF;
  v_date:=public.hospital_today(p_hospital_id);
  INSERT INTO public.hospital_visits(hospital_id,patient_id,visit_date,checked_in_by) VALUES(p_hospital_id,p_patient_id,v_date,auth.uid()) ON CONFLICT(hospital_id,patient_id,visit_date) DO NOTHING;
  SELECT * INTO v_visit FROM public.hospital_visits WHERE hospital_id=p_hospital_id AND patient_id=p_patient_id AND visit_date=v_date;
  IF p_appointment_id IS NOT NULL THEN UPDATE public.hospital_appointments SET status='checked_in',updated_at=now() WHERE id=p_appointment_id AND status IN ('scheduled','confirmed'); END IF;
  PERFORM public.hospital_log_event(p_hospital_id,p_patient_id,'Hospital Check-in',jsonb_build_object('visit_id',v_visit.id),true);
  RETURN to_jsonb(v_visit);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.queue_wait_estimate(p_session_id uuid,p_ahead integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_hospital_id uuid; v_default numeric; v_avg numeric; v_low numeric; v_high numeric;
BEGIN
  SELECT hospital_id,default_consult_minutes INTO v_hospital_id,v_default FROM public.opd_sessions WHERE id=p_session_id;
  SELECT COALESCE(avg(extract(epoch FROM (completed_at-started_at))/60.0),v_default) INTO v_avg FROM (
    SELECT completed_at,started_at FROM public.queue_entries WHERE session_id=p_session_id AND status='completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 10
  ) recent;
  v_avg:=COALESCE(v_avg,v_default,10);
  v_low:=ceil(GREATEST(p_ahead,0)*v_avg*COALESCE((public.hospital_setting(v_hospital_id,'wait_factor_low','0.75'::jsonb))::text::numeric,0.75));
  v_high:=ceil(GREATEST(p_ahead,0)*v_avg*COALESCE((public.hospital_setting(v_hospital_id,'wait_factor_high','1.4'::jsonb))::text::numeric,1.4));
  RETURN jsonb_build_object('low',v_low::integer,'high',GREATEST(v_high,v_low)::integer);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hospital_queue_after_change(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry record; v_threshold integer; v_thresholds integer[]; v_hospital_id uuid; v_wait jsonb;
BEGIN
  SELECT hospital_id INTO v_hospital_id FROM public.opd_sessions WHERE id=p_session_id;
  SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(h.settings->'notify_thresholds','[10,5]'::jsonb))::integer) INTO v_thresholds FROM public.hospital_orgs h WHERE h.id=v_hospital_id;
  FOR v_entry IN SELECT q.*,(SELECT count(*)::integer FROM public.queue_entries a WHERE a.session_id=q.session_id AND a.status IN ('waiting','called','in_consultation') AND (a.priority_rank,a.token_number)<(q.priority_rank,q.token_number)) AS ahead
    FROM public.queue_entries q WHERE q.session_id=p_session_id AND q.status='waiting' ORDER BY q.priority_rank,q.token_number
  LOOP
    v_wait:=public.queue_wait_estimate(p_session_id,v_entry.ahead);
    UPDATE public.queue_entries SET est_wait_low_min=(v_wait->>'low')::integer,est_wait_high_min=(v_wait->>'high')::integer,updated_at=now() WHERE id=v_entry.id;
    FOR v_threshold IN SELECT unnest(COALESCE(v_thresholds,ARRAY[10,5])) LOOP
      IF v_entry.ahead<=v_threshold AND NOT v_threshold=ANY(v_entry.notified_thresholds) THEN
        PERFORM public.hospital_notify_patient(v_hospital_id,v_entry.patient_id,'queue_threshold',jsonb_build_object('message','Your turn is approaching','token',v_entry.token_number),'queue:'||v_entry.id||':t'||v_threshold);
        UPDATE public.queue_entries SET notified_thresholds=array_append(notified_thresholds,v_threshold) WHERE id=v_entry.id;
      END IF;
    END LOOP;
  END LOOP;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.join_queue(p_session_id uuid,p_patient_id uuid,p_appointment_id uuid DEFAULT NULL,p_priority smallint DEFAULT 3,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_session public.opd_sessions; v_visit public.hospital_visits; v_entry public.queue_entries; v_token integer; v_wait jsonb; v_ahead integer;
BEGIN
  SELECT * INTO v_session FROM public.opd_sessions WHERE id=p_session_id FOR UPDATE;
  IF v_session.id IS NULL OR NOT public.hospital_has_cap(v_session.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF v_session.status IN ('closed','paused') THEN RAISE EXCEPTION 'Session is not accepting queue entries' USING ERRCODE='23514'; END IF;
  IF p_priority NOT BETWEEN 0 AND 3 OR (p_priority<3 AND NULLIF(btrim(p_reason),'') IS NULL) THEN RAISE EXCEPTION 'Priority requires a valid rank and reason' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hospital_patients WHERE id=p_patient_id AND hospital_id=v_session.hospital_id) THEN RAISE EXCEPTION 'Patient does not belong to this hospital' USING ERRCODE='23514'; END IF;
  IF p_appointment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hospital_appointments WHERE id=p_appointment_id AND hospital_id=v_session.hospital_id AND patient_id=p_patient_id) THEN RAISE EXCEPTION 'Appointment does not belong to this patient and hospital' USING ERRCODE='23514'; END IF;
  UPDATE public.opd_sessions SET last_token=last_token+1,updated_at=now() WHERE id=p_session_id RETURNING last_token INTO v_token;
  INSERT INTO public.hospital_visits(hospital_id,patient_id,visit_date,checked_in_by) VALUES(v_session.hospital_id,p_patient_id,public.hospital_today(v_session.hospital_id),auth.uid()) ON CONFLICT(hospital_id,patient_id,visit_date) DO NOTHING;
  SELECT * INTO v_visit FROM public.hospital_visits WHERE hospital_id=v_session.hospital_id AND patient_id=p_patient_id AND visit_date=public.hospital_today(v_session.hospital_id);
  INSERT INTO public.queue_entries(hospital_id,session_id,patient_id,appointment_id,visit_id,token_number,priority_rank,priority_reason,is_walk_in)
  VALUES(v_session.hospital_id,p_session_id,p_patient_id,p_appointment_id,v_visit.id,v_token,p_priority,NULLIF(btrim(p_reason),''),p_appointment_id IS NULL) RETURNING * INTO v_entry;
  SELECT count(*) INTO v_ahead FROM public.queue_entries q WHERE q.session_id=p_session_id AND q.status IN ('waiting','called','in_consultation') AND (q.priority_rank,q.token_number)<(v_entry.priority_rank,v_entry.token_number);
  v_wait:=public.queue_wait_estimate(p_session_id,v_ahead);
  UPDATE public.queue_entries SET est_wait_low_min=(v_wait->>'low')::integer,est_wait_high_min=(v_wait->>'high')::integer WHERE id=v_entry.id RETURNING * INTO v_entry;
  PERFORM public.hospital_log_event(v_session.hospital_id,p_patient_id,'Queue Joined',jsonb_build_object('session_id',p_session_id,'token',v_token),true);
  PERFORM public.hospital_log_event(v_session.hospital_id,p_patient_id,'Token Assigned',jsonb_build_object('token',v_token),true);
  PERFORM public.hospital_notify_patient(v_session.hospital_id,p_patient_id,'token_assigned',jsonb_build_object('message','Your queue token is '||v_token),'token:'||v_entry.id);
  PERFORM public.hospital_queue_after_change(p_session_id);
  RETURN jsonb_build_object('entry',to_jsonb(v_entry),'position',v_ahead+1,'wait',v_wait);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.check_in_and_queue(p_hospital_id uuid,p_patient_id uuid,p_session_id uuid,p_appointment_id uuid DEFAULT NULL,p_priority smallint DEFAULT 3,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_checkin jsonb; v_queue jsonb;
BEGIN
  v_checkin:=public.hospital_check_in(p_hospital_id,p_patient_id,p_appointment_id);
  v_queue:=public.join_queue(p_session_id,p_patient_id,p_appointment_id,p_priority,p_reason);
  RETURN jsonb_build_object('check_in',v_checkin,'queue',v_queue);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.call_next(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_session public.opd_sessions; v_entry public.queue_entries;
BEGIN
  SELECT * INTO v_session FROM public.opd_sessions WHERE id=p_session_id FOR UPDATE;
  IF v_session.id IS NULL OR NOT public.hospital_has_cap(v_session.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF v_session.status<>'open' THEN RAISE EXCEPTION 'Session must be open' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_entry FROM public.queue_entries WHERE session_id=p_session_id AND status='waiting' ORDER BY priority_rank,token_number LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_entry.id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.queue_entries SET status='called',called_at=now(),notified_called=true,updated_at=now() WHERE id=v_entry.id RETURNING * INTO v_entry;
  PERFORM public.hospital_notify_patient(v_session.hospital_id,v_entry.patient_id,'token_called',jsonb_build_object('message','Please see the doctor','token',v_entry.token_number),'called:'||v_entry.id);
  PERFORM public.hospital_log_event(v_session.hospital_id,v_entry.patient_id,'Token Called',jsonb_build_object('token',v_entry.token_number),true);
  PERFORM public.hospital_queue_after_change(p_session_id);
  RETURN to_jsonb(v_entry);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.call_token(p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR NOT public.hospital_has_cap(v_entry.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF v_entry.status<>'waiting' THEN RAISE EXCEPTION 'Queue entry is not waiting' USING ERRCODE='23514'; END IF;
  UPDATE public.queue_entries SET status='called',called_at=now(),notified_called=true,updated_at=now() WHERE id=p_entry_id RETURNING * INTO v_entry;
  PERFORM public.hospital_notify_patient(v_entry.hospital_id,v_entry.patient_id,'token_called',jsonb_build_object('message','Please see the doctor','token',v_entry.token_number),'called:'||v_entry.id);
  PERFORM public.hospital_queue_after_change(v_entry.session_id);
  RETURN to_jsonb(v_entry);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.queue_start(p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR NOT public.hospital_has_cap(v_entry.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF v_entry.status<>'called' THEN RAISE EXCEPTION 'Only called entries can start' USING ERRCODE='23514'; END IF;
  UPDATE public.queue_entries SET status='in_consultation',started_at=now(),updated_at=now() WHERE id=p_entry_id RETURNING * INTO v_entry;
  UPDATE public.hospital_appointments SET status='in_consultation',updated_at=now() WHERE id=v_entry.appointment_id;
  PERFORM public.hospital_log_event(v_entry.hospital_id,v_entry.patient_id,'Consultation Started',jsonb_build_object('token',v_entry.token_number),false);
  PERFORM public.hospital_queue_after_change(v_entry.session_id);
  RETURN to_jsonb(v_entry);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.queue_complete(p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR NOT public.hospital_has_cap(v_entry.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF v_entry.status<>'in_consultation' THEN RAISE EXCEPTION 'Queue entry is not in consultation' USING ERRCODE='23514'; END IF;
  UPDATE public.queue_entries SET status='completed',completed_at=now(),updated_at=now() WHERE id=p_entry_id RETURNING * INTO v_entry;
  UPDATE public.hospital_appointments SET status='completed',updated_at=now() WHERE id=v_entry.appointment_id;
  PERFORM public.hospital_log_event(v_entry.hospital_id,v_entry.patient_id,'Consultation Completed',jsonb_build_object('token',v_entry.token_number),true);
  PERFORM public.hospital_queue_after_change(v_entry.session_id);
  RETURN to_jsonb(v_entry);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.queue_skip(p_entry_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR NOT public.hospital_has_cap(v_entry.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  UPDATE public.queue_entries SET status='skipped',priority_reason=NULLIF(btrim(p_reason),''),updated_at=now() WHERE id=p_entry_id RETURNING * INTO v_entry;
  PERFORM public.hospital_queue_after_change(v_entry.session_id);
  RETURN to_jsonb(v_entry);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.queue_requeue(p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR NOT public.hospital_has_cap(v_entry.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  UPDATE public.queue_entries SET status='waiting',called_at=NULL,started_at=NULL,completed_at=NULL,updated_at=now() WHERE id=p_entry_id RETURNING * INTO v_entry;
  PERFORM public.hospital_log_event(v_entry.hospital_id,v_entry.patient_id,'Queue Rejoined',jsonb_build_object('token',v_entry.token_number),true);
  PERFORM public.hospital_queue_after_change(v_entry.session_id);
  RETURN to_jsonb(v_entry);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.queue_no_show(p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR NOT public.hospital_has_cap(v_entry.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  UPDATE public.queue_entries SET status='no_show',updated_at=now() WHERE id=p_entry_id RETURNING * INTO v_entry;
  UPDATE public.hospital_appointments SET status='no_show',updated_at=now() WHERE id=v_entry.appointment_id;
  PERFORM public.hospital_queue_after_change(v_entry.session_id);
  RETURN to_jsonb(v_entry);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.queue_set_priority(p_entry_id uuid,p_priority smallint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries; v_old smallint;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR NOT public.hospital_has_cap(v_entry.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF p_priority NOT BETWEEN 0 AND 3 OR NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'A valid priority and reason are required' USING ERRCODE='22023'; END IF;
  v_old:=v_entry.priority_rank;
  UPDATE public.queue_entries SET priority_rank=p_priority,priority_reason=btrim(p_reason),updated_at=now() WHERE id=p_entry_id RETURNING * INTO v_entry;
  INSERT INTO public.hospital_access_audit(hospital_id,patient_id,actor_user_id,action,details) VALUES(v_entry.hospital_id,v_entry.patient_id,auth.uid(),'queue.priority_changed',jsonb_build_object('from',v_old,'to',p_priority,'reason',p_reason));
  PERFORM public.hospital_log_event(v_entry.hospital_id,v_entry.patient_id,'Queue Priority Changed',jsonb_build_object('priority',p_priority,'reason',p_reason),false);
  PERFORM public.hospital_queue_after_change(v_entry.session_id);
  RETURN to_jsonb(v_entry);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_queue_state(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_session public.opd_sessions; v_result jsonb;
BEGIN
  SELECT * INTO v_session FROM public.opd_sessions WHERE id=p_session_id;
  IF v_session.id IS NULL OR NOT public.hospital_has_cap(v_session.hospital_id,'patients.read') THEN RAISE EXCEPTION 'patients.read capability required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('session',jsonb_build_object('id',v_session.id,'doctor',d.doctor_name,'department',dep.name,'room',v_session.room,'status',v_session.status,'delay_note',v_session.delay_note,'last_token',v_session.last_token),
    'serving',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'token',q.token_number,'patient',p.name,'status',q.status) ORDER BY q.token_number) FROM public.queue_entries q JOIN public.hospital_patients p ON p.id=q.patient_id WHERE q.session_id=p_session_id AND q.status IN ('called','in_consultation')),'[]'::jsonb),
    'next_token',(SELECT q.token_number FROM public.queue_entries q WHERE q.session_id=p_session_id AND q.status='waiting' ORDER BY q.priority_rank,q.token_number LIMIT 1),
    'waiting_count',(SELECT count(*) FROM public.queue_entries q WHERE q.session_id=p_session_id AND q.status='waiting'),
    'completed_today',(SELECT count(*) FROM public.queue_entries q WHERE q.session_id=p_session_id AND q.status='completed'),
    'avg_consult_min',(SELECT avg(extract(epoch FROM (completed_at-started_at))/60) FROM public.queue_entries q WHERE q.session_id=p_session_id AND q.status='completed' AND started_at IS NOT NULL),
    'entries',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'token',q.token_number,'patient',p.name,'identifier',p.patient_identifier,'priority',q.priority_rank,'priority_reason',q.priority_reason,'status',q.status,'joined_at',q.joined_at,'called_at',q.called_at,'patients_ahead',(SELECT count(*) FROM public.queue_entries a WHERE a.session_id=q.session_id AND a.status IN ('waiting','called','in_consultation') AND (a.priority_rank,a.token_number)<(q.priority_rank,q.token_number)),'est_low',q.est_wait_low_min,'est_high',q.est_wait_high_min,'is_walk_in',q.is_walk_in) ORDER BY CASE WHEN q.status='completed' THEN 1 ELSE 0 END,q.priority_rank,q.token_number)
      FROM (SELECT * FROM public.queue_entries WHERE session_id=p_session_id AND status IN ('waiting','called','in_consultation') UNION ALL SELECT recent.* FROM (SELECT * FROM public.queue_entries WHERE session_id=p_session_id AND status='completed' ORDER BY completed_at DESC LIMIT 10) recent) q JOIN public.hospital_patients p ON p.id=q.patient_id),'[]'::jsonb)
  ) INTO v_result FROM public.hospital_doctors d LEFT JOIN public.hospital_departments dep ON dep.id=d.department_id WHERE d.id=v_session.doctor_id;
  INSERT INTO public.hospital_access_audit(hospital_id,actor_user_id,action,details) VALUES(v_session.hospital_id,auth.uid(),'queue.state_read',jsonb_build_object('session_id',p_session_id));
  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.get_today_sessions(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'patients.read') THEN RAISE EXCEPTION 'patients.read capability required' USING ERRCODE='42501'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('session_id',s.id,'doctor',d.doctor_name,'department',dep.name,'room',s.room,'status',s.status,'serving_token',(SELECT q.token_number FROM public.queue_entries q WHERE q.session_id=s.id AND q.status='in_consultation' ORDER BY q.token_number LIMIT 1),'next_token',(SELECT q.token_number FROM public.queue_entries q WHERE q.session_id=s.id AND q.status='waiting' ORDER BY q.priority_rank,q.token_number LIMIT 1),'waiting',(SELECT count(*) FROM public.queue_entries q WHERE q.session_id=s.id AND q.status='waiting'),'completed',(SELECT count(*) FROM public.queue_entries q WHERE q.session_id=s.id AND q.status='completed'),'delay_flag',s.delay_note IS NOT NULL) ORDER BY s.start_time)
    FROM public.opd_sessions s JOIN public.hospital_doctors d ON d.id=s.doctor_id LEFT JOIN public.hospital_departments dep ON dep.id=s.department_id WHERE s.hospital_id=p_hospital_id AND s.session_date=public.hospital_today(p_hospital_id)),'[]'::jsonb);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.get_patient_queue_position(p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries; v_ahead integer; v_wait jsonb;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id;
  IF v_entry.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.hospital_patients p WHERE p.id=v_entry.patient_id AND p.patient_user_id=auth.uid()) THEN RAISE EXCEPTION 'Linked patient record required' USING ERRCODE='42501'; END IF;
  SELECT count(*) INTO v_ahead FROM public.queue_entries q WHERE q.session_id=v_entry.session_id AND q.status IN ('waiting','called','in_consultation') AND (q.priority_rank,q.token_number)<(v_entry.priority_rank,v_entry.token_number);
  v_wait:=public.queue_wait_estimate(v_entry.session_id,v_ahead);
  RETURN jsonb_build_object('token',v_entry.token_number,'patients_ahead',v_ahead,'est_low',v_wait->'low','est_high',v_wait->'high','status',v_entry.status);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.list_hospital_staff(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'staff.manage') THEN RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE='42501'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',COALESCE(p.full_name,u.email),'email',u.email,'role',m.staff_role,'is_active',m.is_active,'is_demo',m.is_demo) ORDER BY p.full_name,m.staff_role)
    FROM public.hospital_members m JOIN auth.users u ON u.id=m.user_id LEFT JOIN public.profiles p ON p.id=u.id WHERE m.hospital_id=p_hospital_id),'[]'::jsonb);
END;
$fn$;

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

CREATE OR REPLACE FUNCTION public.demo_seed_opd(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_prefix text; v_today date; v_med uuid; v_rad uuid; v_surg uuid; v_raj uuid; v_suresh uuid; v_imran uuid; v_anjali uuid; v_kavita uuid; v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid; v_s5 uuid; v_inserted integer;
BEGIN
  SELECT patient_id_prefix INTO v_prefix FROM public.hospital_orgs WHERE id=p_hospital_id;
  IF v_prefix IS NULL THEN RAISE EXCEPTION 'Hospital not found' USING ERRCODE='P0002'; END IF;
  v_today:=public.hospital_today(p_hospital_id);
  PERFORM public.seed_hospital_defaults(p_hospital_id);
  SELECT id INTO v_med FROM public.hospital_departments WHERE hospital_id=p_hospital_id AND name='Medical Oncology';
  SELECT id INTO v_rad FROM public.hospital_departments WHERE hospital_id=p_hospital_id AND name='Radiation Oncology';
  SELECT id INTO v_surg FROM public.hospital_departments WHERE hospital_id=p_hospital_id AND name='Surgical Oncology';
  INSERT INTO public.hospital_patients(hospital_id,patient_identifier,name,mobile,age,gender,is_demo)
  SELECT p_hospital_id,v_prefix||lpad((24600+n)::text,5,'0'),(ARRAY['Aarav Sharma','Ananya Patel','Vihaan Mehta','Isha Nair','Arjun Rao','Diya Gupta','Kabir Iyer','Meera Das','Rohan Shah','Sana Khan'])[(n%10)+1],('90000000'||lpad((n%100)::text,2,'0')),28+(n%55),CASE WHEN n%2=0 THEN 'female' ELSE 'male' END,true
  FROM generate_series(1,80) n ON CONFLICT DO NOTHING;
  INSERT INTO public.hospital_doctors(hospital_id,department_id,doctor_name,specialty,is_demo)
  VALUES(p_hospital_id,v_med,'Dr. Raj Sharma','Medical Oncology',true),(p_hospital_id,v_med,'Dr. Anjali Mehta','Medical Oncology',true),(p_hospital_id,v_rad,'Dr. Suresh Iyer','Radiation Oncology',true),(p_hospital_id,v_rad,'Dr. Kavita Rao','Radiation Oncology',true),(p_hospital_id,v_surg,'Dr. Imran Khan','Surgical Oncology',true),(p_hospital_id,v_surg,'Dr. Neha Gupta','Surgical Oncology',true)
  ON CONFLICT(hospital_id,doctor_name) DO NOTHING;
  SELECT id INTO v_raj FROM public.hospital_doctors WHERE hospital_id=p_hospital_id AND doctor_name='Dr. Raj Sharma';
  SELECT id INTO v_anjali FROM public.hospital_doctors WHERE hospital_id=p_hospital_id AND doctor_name='Dr. Anjali Mehta';
  SELECT id INTO v_suresh FROM public.hospital_doctors WHERE hospital_id=p_hospital_id AND doctor_name='Dr. Suresh Iyer';
  SELECT id INTO v_kavita FROM public.hospital_doctors WHERE hospital_id=p_hospital_id AND doctor_name='Dr. Kavita Rao';
  SELECT id INTO v_imran FROM public.hospital_doctors WHERE hospital_id=p_hospital_id AND doctor_name='Dr. Imran Khan';
  INSERT INTO public.opd_sessions(hospital_id,doctor_id,department_id,session_date,start_time,end_time,room,status,last_token,is_demo)
  VALUES(p_hospital_id,v_raj,v_med,v_today,time '08:00',time '14:00','4A','open',123,true),(p_hospital_id,v_suresh,v_rad,v_today,time '08:00',time '14:00','2B','open',8,true),(p_hospital_id,v_imran,v_surg,v_today,time '08:00',time '14:00','3C','paused',5,true),(p_hospital_id,v_anjali,v_med,v_today,time '14:00',time '18:00','4B','scheduled',0,true),(p_hospital_id,v_kavita,v_rad,v_today,time '08:00',time '12:00','2A','closed',15,true)
  ON CONFLICT(hospital_id,doctor_id,session_date,start_time) DO NOTHING;
  SELECT id INTO v_s1 FROM public.opd_sessions WHERE hospital_id=p_hospital_id AND doctor_id=v_raj AND session_date=v_today AND start_time=time '08:00';
  SELECT id INTO v_s2 FROM public.opd_sessions WHERE hospital_id=p_hospital_id AND doctor_id=v_suresh AND session_date=v_today AND start_time=time '08:00';
  SELECT id INTO v_s3 FROM public.opd_sessions WHERE hospital_id=p_hospital_id AND doctor_id=v_imran AND session_date=v_today AND start_time=time '08:00';
  SELECT id INTO v_s4 FROM public.opd_sessions WHERE hospital_id=p_hospital_id AND doctor_id=v_anjali AND session_date=v_today AND start_time=time '14:00';
  SELECT id INTO v_s5 FROM public.opd_sessions WHERE hospital_id=p_hospital_id AND doctor_id=v_kavita AND session_date=v_today AND start_time=time '08:00';
  INSERT INTO public.hospital_visits(hospital_id,patient_id,visit_date,checked_in_at,is_demo)
  SELECT p_hospital_id,p.id,v_today-days.day,((v_today-days.day)::timestamp+time '08:00'+(p.rn*interval '4 minutes')) AT TIME ZONE (SELECT timezone FROM public.hospital_orgs WHERE id=p_hospital_id),true
  FROM generate_series(1,13) days(day)
  CROSS JOIN LATERAL (SELECT id,row_number() OVER(ORDER BY patient_identifier) rn FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo ORDER BY patient_identifier LIMIT (40+days.day*3)) p
  ON CONFLICT(hospital_id,patient_id,visit_date) DO UPDATE SET is_demo=true;
  INSERT INTO public.hospital_visits(hospital_id,patient_id,visit_date,checked_in_at,is_demo)
  SELECT p_hospital_id,p.id,v_today,(v_today::timestamp + time '07:30' + (n*interval '5 minutes')) AT TIME ZONE (SELECT timezone FROM public.hospital_orgs WHERE id=p_hospital_id),true
  FROM (SELECT id,row_number() OVER(ORDER BY patient_identifier) n FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo LIMIT 80) p
  WHERE p.n<=56 ON CONFLICT(hospital_id,patient_id,visit_date) DO UPDATE SET is_demo=true;
  INSERT INTO public.queue_entries(hospital_id,session_id,patient_id,token_number,priority_rank,priority_reason,status,is_walk_in,joined_at,called_at,started_at,completed_at,est_wait_low_min,est_wait_high_min,is_demo)
  SELECT p_hospital_id,v_s1,p.id,80+n,CASE WHEN n=23 THEN 0 WHEN n IN (24,25) THEN 1 WHEN n=26 THEN 2 ELSE 3 END,CASE WHEN n=23 THEN 'Emergency assessment' WHEN n IN(24,25) THEN 'Clinically urgent review' WHEN n=26 THEN 'Priority review' END,
    CASE WHEN n<=21 THEN 'completed' WHEN n=22 THEN 'in_consultation' ELSE 'waiting' END,(n IN (24,30,35)),now()-((124-n)*interval '6 minutes'),CASE WHEN n<=22 THEN now()-((124-n)*interval '6 minutes') END,CASE WHEN n<=22 THEN now()-((124-n)*interval '6 minutes')+interval '2 minutes' END,CASE WHEN n<=21 THEN now()-((124-n)*interval '6 minutes')+interval '11 minutes' END,GREATEST(0,(123-n)*7),GREATEST(0,(123-n)*13),true
  FROM (SELECT id,row_number() OVER(ORDER BY patient_identifier) n FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo ORDER BY patient_identifier LIMIT 43) p
  WHERE n<=43 ON CONFLICT(session_id,token_number) DO NOTHING;
  UPDATE public.queue_entries SET token_number=80+token_number-80 WHERE session_id=v_s1 AND is_demo;
  INSERT INTO public.queue_entries(hospital_id,session_id,patient_id,token_number,priority_rank,status,is_demo,est_wait_low_min,est_wait_high_min)
  SELECT p_hospital_id,v_s2,p.id,n,3,'waiting',true,20,40 FROM (SELECT id,row_number() OVER(ORDER BY patient_identifier) n FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo ORDER BY patient_identifier OFFSET 43 LIMIT 8) p
  ON CONFLICT(session_id,token_number) DO NOTHING;
  INSERT INTO public.queue_entries(hospital_id,session_id,patient_id,token_number,priority_rank,status,is_demo,est_wait_low_min,est_wait_high_min)
  SELECT p_hospital_id,v_s3,p.id,n,3,'waiting',true,15,30 FROM (SELECT id,row_number() OVER(ORDER BY patient_identifier) n FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo ORDER BY patient_identifier OFFSET 51 LIMIT 5) p
  ON CONFLICT(session_id,token_number) DO NOTHING;
  INSERT INTO public.hospital_appointments(hospital_id,patient_id,doctor_id,department_id,scheduled_at,kind,status,source,is_demo)
  SELECT p_hospital_id,p.id,v_anjali,v_med,(v_today::timestamp + time '09:00' + (n%6)*interval '30 minutes') AT TIME ZONE (SELECT timezone FROM public.hospital_orgs WHERE id=p_hospital_id),'opd',CASE WHEN n<=3 THEN 'confirmed' ELSE 'scheduled' END,'staff',true
  FROM (SELECT id,row_number() OVER(ORDER BY patient_identifier) n FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo ORDER BY patient_identifier LIMIT 6) p;
  INSERT INTO public.hospital_appointments(hospital_id,patient_id,doctor_id,department_id,scheduled_at,kind,status,source,is_demo)
  SELECT p_hospital_id,p.id,v_raj,v_med,((v_today+n)::timestamp+time '10:00') AT TIME ZONE (SELECT timezone FROM public.hospital_orgs WHERE id=p_hospital_id),'opd','scheduled','staff',true
  FROM generate_series(1,7) n CROSS JOIN LATERAL (SELECT id FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo ORDER BY patient_identifier OFFSET (n*5) LIMIT 5) p;
  INSERT INTO public.patient_journey_events(hospital_id,patient_id,actor_user_id,event_type,details,visible_to_patient,is_demo)
  SELECT p_hospital_id,p.patient_id,auth.uid(),'Hospital Check-in',jsonb_build_object('demo',true),true,true FROM public.hospital_visits p WHERE p.hospital_id=p_hospital_id AND p.is_demo AND p.visit_date=v_today
  ON CONFLICT DO NOTHING;
  INSERT INTO public.patient_journey_events(hospital_id,patient_id,actor_user_id,event_type,details,visible_to_patient,is_demo)
  SELECT p_hospital_id,q.patient_id,auth.uid(),'Queue Joined',jsonb_build_object('token',q.token_number,'session_id',q.session_id),true,true
  FROM public.queue_entries q WHERE q.hospital_id=p_hospital_id AND q.is_demo;
  INSERT INTO public.patient_journey_events(hospital_id,patient_id,actor_user_id,event_type,details,visible_to_patient,is_demo)
  SELECT p_hospital_id,q.patient_id,auth.uid(),'Token Assigned',jsonb_build_object('token',q.token_number),true,true
  FROM public.queue_entries q WHERE q.hospital_id=p_hospital_id AND q.is_demo;
  SELECT count(*) INTO v_inserted FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo;
  RETURN jsonb_build_object('patients',v_inserted,'sessions',5,'main_session',v_s1);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.demo_remove(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_count integer;
BEGIN
  UPDATE public.investigation_slots s SET status='open',booked_order_id=NULL,held_for_order_id=NULL,held_until=NULL
  WHERE s.hospital_id=p_hospital_id AND (s.booked_order_id IN(SELECT id FROM public.investigation_orders WHERE hospital_id=p_hospital_id AND is_demo) OR s.held_for_order_id IN(SELECT id FROM public.investigation_orders WHERE hospital_id=p_hospital_id AND is_demo));
  DELETE FROM public.patient_journey_events WHERE hospital_id=p_hospital_id AND is_demo;
  DELETE FROM public.hospital_appointments WHERE hospital_id=p_hospital_id AND is_demo;
  DELETE FROM public.queue_entries WHERE hospital_id=p_hospital_id AND is_demo;
  DELETE FROM public.hospital_visits WHERE hospital_id=p_hospital_id AND is_demo;
  DELETE FROM public.notifications WHERE hospital_id=p_hospital_id AND dedupe_key LIKE 'hospital-demo:%';
  DELETE FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo;
  DELETE FROM public.opd_sessions s WHERE s.hospital_id=p_hospital_id AND s.is_demo
    AND NOT EXISTS(SELECT 1 FROM public.queue_entries q WHERE q.session_id=s.id);
  DELETE FROM public.hospital_doctors d WHERE d.hospital_id=p_hospital_id AND d.is_demo
    AND NOT EXISTS(SELECT 1 FROM public.opd_sessions s WHERE s.doctor_id=d.id)
    AND NOT EXISTS(SELECT 1 FROM public.hospital_appointments a WHERE a.doctor_id=d.id AND NOT a.is_demo);
  DELETE FROM public.hospital_beds b WHERE b.hospital_id=p_hospital_id AND b.is_demo
    AND NOT EXISTS(SELECT 1 FROM public.hospital_admissions a WHERE a.bed_id=b.id AND NOT a.is_demo);
  DELETE FROM public.hospital_wards w WHERE w.hospital_id=p_hospital_id AND w.is_demo
    AND NOT EXISTS(SELECT 1 FROM public.hospital_beds b WHERE b.ward_id=w.id);
  DELETE FROM public.hospital_members WHERE hospital_id=p_hospital_id AND user_id=auth.uid() AND is_demo;
  UPDATE public.hospital_orgs SET demo_data_loaded=false,updated_at=now() WHERE id=p_hospital_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('removed',true,'org_updated',v_count);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.load_demo_data(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'config.manage') THEN RAISE EXCEPTION 'config.manage capability required' USING ERRCODE='42501'; END IF;
  PERFORM public.demo_remove(p_hospital_id);
  PERFORM public.seed_hospital_defaults(p_hospital_id);
  v_result:=public.demo_seed_opd(p_hospital_id);
  INSERT INTO public.hospital_members(hospital_id,user_id,staff_role,is_demo)
  SELECT p_hospital_id,auth.uid(),r.role_name,true FROM unnest(ARRAY['hospital_admin','front_desk','nurse','doctor','lab_tech','radiology_tech','admissions_staff']) r(role_name)
  ON CONFLICT(hospital_id,user_id,staff_role) DO NOTHING;
  UPDATE public.hospital_orgs SET demo_data_loaded=true,updated_at=now() WHERE id=p_hospital_id;
  INSERT INTO public.hospital_access_audit(hospital_id,actor_user_id,action,details) VALUES(p_hospital_id,auth.uid(),'demo_data.loaded',v_result);
  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.remove_demo_data(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'config.manage') THEN RAISE EXCEPTION 'config.manage capability required' USING ERRCODE='42501'; END IF;
  RETURN public.demo_remove(p_hospital_id);
END;
$fn$;

DO $grants$
DECLARE v_sig text; v_name text;
BEGIN
  FOR v_name,v_sig IN SELECT * FROM (VALUES
    ('search_hospital_patients','uuid, text, integer'),('find_possible_duplicates','uuid, text, text, date'),('import_hospital_patients','uuid, jsonb, boolean'),('get_hospital_patient_record','uuid, text'),('export_hospital_patients','uuid'),
    ('create_opd_session','uuid, uuid, date, time, time, text, integer'),('set_session_status','uuid, text, text'),('generate_default_sessions','uuid, date'),
    ('create_hospital_appointment','uuid, uuid, uuid, timestamptz, text, text'),('cancel_hospital_appointment','uuid, text'),('reschedule_hospital_appointment','uuid, timestamptz'),('hospital_check_in','uuid, uuid, uuid'),
    ('queue_wait_estimate','uuid, integer'),('hospital_queue_after_change','uuid'),('join_queue','uuid, uuid, uuid, smallint, text'),('check_in_and_queue','uuid, uuid, uuid, uuid, smallint, text'),
    ('call_next','uuid'),('call_token','uuid'),('queue_start','uuid'),('queue_complete','uuid'),('queue_skip','uuid, text'),('queue_requeue','uuid'),('queue_no_show','uuid'),('queue_set_priority','uuid, smallint, text'),
    ('get_queue_state','uuid'),('get_today_sessions','uuid'),('get_patient_queue_position','uuid'),('list_hospital_staff','uuid'),('hospital_command_center','uuid'),('demo_seed_opd','uuid'),('demo_remove','uuid'),('load_demo_data','uuid'),('remove_demo_data','uuid')
  ) AS signatures(function_name, arg_types) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',v_name,v_sig);
    IF v_name NOT IN ('hospital_queue_after_change','demo_seed_opd','demo_remove','queue_wait_estimate') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',v_name,v_sig);
    ELSE
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM authenticated',v_name,v_sig);
    END IF;
  END LOOP;
END;
$grants$;

NOTIFY pgrst, 'reload schema';
