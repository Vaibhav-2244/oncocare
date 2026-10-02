CREATE OR REPLACE FUNCTION public.start_consultation_record(p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries; v_session public.opd_sessions; v_row public.consultations;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR NOT public.hospital_has_cap(v_entry.hospital_id,'clinical.write') THEN RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_session FROM public.opd_sessions WHERE id=v_entry.session_id;
  IF v_session.id IS NULL OR v_session.hospital_id<>v_entry.hospital_id THEN RAISE EXCEPTION 'Queue session does not belong to this hospital' USING ERRCODE='23514'; END IF;
  IF v_entry.status NOT IN ('called','in_consultation') THEN RAISE EXCEPTION 'Patient must be called before consultation starts' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_row FROM public.consultations WHERE hospital_id=v_entry.hospital_id AND queue_entry_id=v_entry.id AND status='draft' ORDER BY version DESC LIMIT 1;
  IF v_row.id IS NULL THEN
    INSERT INTO public.consultations(hospital_id,patient_id,queue_entry_id,session_id,doctor_id,created_by)
    VALUES(v_entry.hospital_id,v_entry.patient_id,v_entry.id,v_session.id,v_session.doctor_id,auth.uid()) RETURNING * INTO v_row;
    PERFORM public.hospital_log_event(v_entry.hospital_id,v_entry.patient_id,'Consultation Started',jsonb_build_object('consultation_id',v_row.id),false);
  END IF;
  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.save_consultation_draft(p_id uuid,p_fields jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_row public.consultations;
BEGIN
  SELECT * INTO v_row FROM public.consultations WHERE id=p_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT public.hospital_has_cap(v_row.hospital_id,'clinical.write') THEN RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE='42501'; END IF;
  IF v_row.status<>'draft' THEN RAISE EXCEPTION 'Final consultation is immutable' USING ERRCODE='55000'; END IF;
  UPDATE public.consultations SET complaint=NULLIF(btrim(p_fields->>'complaint'),''),assessment=NULLIF(btrim(p_fields->>'assessment'),''),plan=NULLIF(btrim(p_fields->>'plan'),''),advice=NULLIF(btrim(p_fields->>'advice'),''),updated_at=now()
  WHERE id=p_id RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.finalize_consultation(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_row public.consultations; v_entry public.queue_entries;
BEGIN
  SELECT * INTO v_row FROM public.consultations WHERE id=p_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT public.hospital_has_cap(v_row.hospital_id,'clinical.write') THEN RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE='42501'; END IF;
  IF v_row.status='final' THEN RAISE EXCEPTION 'Consultation is already final' USING ERRCODE='55000'; END IF;
  IF NULLIF(btrim(v_row.assessment),'') IS NULL AND NULLIF(btrim(v_row.plan),'') IS NULL THEN RAISE EXCEPTION 'Assessment or plan is required before finalizing' USING ERRCODE='22023'; END IF;
  UPDATE public.consultations SET status='final',finalised_at=now(),updated_at=now() WHERE id=p_id RETURNING * INTO v_row;
  IF v_row.queue_entry_id IS NOT NULL THEN
    SELECT * INTO v_entry FROM public.queue_entries WHERE id=v_row.queue_entry_id;
    IF v_entry.status='in_consultation' THEN PERFORM public.queue_complete(v_entry.id); END IF;
  END IF;
  PERFORM public.hospital_log_event(v_row.hospital_id,v_row.patient_id,'Consultation Finalized',jsonb_build_object('consultation_id',v_row.id,'version',v_row.version),true);
  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.amend_consultation(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_parent public.consultations; v_row public.consultations;
BEGIN
  SELECT * INTO v_parent FROM public.consultations WHERE id=p_id;
  IF v_parent.id IS NULL OR NOT public.hospital_has_cap(v_parent.hospital_id,'clinical.write') THEN RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE='42501'; END IF;
  IF v_parent.status<>'final' THEN RAISE EXCEPTION 'Only finalized consultations can be amended' USING ERRCODE='23514'; END IF;
  INSERT INTO public.consultations(hospital_id,patient_id,queue_entry_id,session_id,doctor_id,complaint,assessment,plan,advice,status,version,parent_id,created_by)
  VALUES(v_parent.hospital_id,v_parent.patient_id,v_parent.queue_entry_id,v_parent.session_id,v_parent.doctor_id,v_parent.complaint,v_parent.assessment,v_parent.plan,v_parent.advice,'draft',v_parent.version+1,v_parent.id,auth.uid()) RETURNING * INTO v_row;
  PERFORM public.hospital_log_event(v_row.hospital_id,v_row.patient_id,'Consultation Amendment Started',jsonb_build_object('consultation_id',v_row.id,'parent_id',v_parent.id,'version',v_row.version),false);
  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_prescription(p_consultation_id uuid,p_items jsonb,p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_consult public.consultations; v_prescription public.prescriptions; v_item jsonb; v_count integer:=0;
BEGIN
  SELECT * INTO v_consult FROM public.consultations WHERE id=p_consultation_id;
  IF v_consult.id IS NULL OR NOT public.hospital_has_cap(v_consult.hospital_id,'clinical.write') THEN RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE='42501'; END IF;
  IF v_consult.status<>'draft' THEN RAISE EXCEPTION 'Prescription must be written before consultation finalization' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'At least one medicine is required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.prescriptions(hospital_id,patient_id,consultation_id,doctor_id,notes)
  VALUES(v_consult.hospital_id,v_consult.patient_id,v_consult.id,v_consult.doctor_id,NULLIF(btrim(p_notes),'')) RETURNING * INTO v_prescription;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF NULLIF(btrim(v_item->>'medicine_name'),'') IS NULL THEN RAISE EXCEPTION 'Medicine name is required' USING ERRCODE='22023'; END IF;
    INSERT INTO public.prescription_items(hospital_id,prescription_id,medicine_name,dose,frequency,duration,instructions)
    VALUES(v_consult.hospital_id,v_prescription.id,btrim(v_item->>'medicine_name'),NULLIF(btrim(v_item->>'dose'),''),NULLIF(btrim(v_item->>'frequency'),''),NULLIF(btrim(v_item->>'duration'),''),NULLIF(btrim(v_item->>'instructions'),''));
    v_count:=v_count+1;
  END LOOP;
  PERFORM public.hospital_log_event(v_consult.hospital_id,v_consult.patient_id,'Prescription Created',jsonb_build_object('prescription_id',v_prescription.id,'items',v_count),true);
  RETURN jsonb_build_object('prescription',to_jsonb(v_prescription),'item_count',v_count);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_referral(p_consultation_id uuid,p_to_department_id uuid,p_to_doctor_id uuid,p_priority text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_consult public.consultations; v_referral public.referrals;
BEGIN
  SELECT * INTO v_consult FROM public.consultations WHERE id=p_consultation_id;
  IF v_consult.id IS NULL OR NOT public.hospital_has_cap(v_consult.hospital_id,'clinical.write') THEN RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE='42501'; END IF;
  IF v_consult.status<>'draft' THEN RAISE EXCEPTION 'Create referral from a draft consultation' USING ERRCODE='23514'; END IF;
  IF p_priority NOT IN ('routine','urgent','clinically_priority','emergency') OR NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Referral priority and reason are required' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hospital_departments WHERE id=p_to_department_id AND hospital_id=v_consult.hospital_id AND is_active) THEN RAISE EXCEPTION 'Referral department is not in this hospital' USING ERRCODE='23514'; END IF;
  IF p_to_doctor_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hospital_doctors WHERE id=p_to_doctor_id AND hospital_id=v_consult.hospital_id AND department_id=p_to_department_id AND is_active) THEN RAISE EXCEPTION 'Referral doctor does not match this hospital and department' USING ERRCODE='23514'; END IF;
  INSERT INTO public.referrals(hospital_id,patient_id,from_consultation_id,from_doctor_id,to_department_id,to_doctor_id,priority,reason)
  VALUES(v_consult.hospital_id,v_consult.patient_id,v_consult.id,v_consult.doctor_id,p_to_department_id,p_to_doctor_id,p_priority,btrim(p_reason)) RETURNING * INTO v_referral;
  PERFORM public.hospital_log_event(v_consult.hospital_id,v_consult.patient_id,'Referral Created',jsonb_build_object('referral_id',v_referral.id,'priority',p_priority),true);
  RETURN to_jsonb(v_referral);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.accept_referral(p_referral_id uuid,p_session_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_referral public.referrals; v_session public.opd_sessions; v_queue jsonb; v_appointment public.hospital_appointments; v_rank smallint;
BEGIN
  SELECT * INTO v_referral FROM public.referrals WHERE id=p_referral_id FOR UPDATE;
  IF v_referral.id IS NULL OR NOT public.hospital_has_cap(v_referral.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF v_referral.status NOT IN ('pending','accepted') THEN RAISE EXCEPTION 'Referral is not available to accept' USING ERRCODE='23514'; END IF;
  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public.opd_sessions WHERE id=p_session_id AND hospital_id=v_referral.hospital_id AND session_date=public.hospital_today(v_referral.hospital_id) AND status IN ('open','scheduled')
      AND (v_referral.to_doctor_id IS NULL OR doctor_id=v_referral.to_doctor_id) AND (v_referral.to_doctor_id IS NOT NULL OR department_id=v_referral.to_department_id);
  ELSE
    SELECT * INTO v_session FROM public.opd_sessions WHERE hospital_id=v_referral.hospital_id AND session_date=public.hospital_today(v_referral.hospital_id) AND status IN ('open','scheduled')
      AND (v_referral.to_doctor_id IS NULL OR doctor_id=v_referral.to_doctor_id) AND (v_referral.to_doctor_id IS NOT NULL OR department_id=v_referral.to_department_id)
    ORDER BY start_time LIMIT 1;
  END IF;
  v_rank:=CASE v_referral.priority WHEN 'emergency' THEN 0 WHEN 'clinically_priority' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END;
  IF v_session.id IS NOT NULL THEN
    v_queue:=public.join_queue(v_session.id,v_referral.patient_id,NULL,v_rank,v_referral.reason);
    UPDATE public.referrals SET status='queued',queue_entry_id=(v_queue->'entry'->>'id')::uuid,updated_at=now() WHERE id=p_referral_id RETURNING * INTO v_referral;
    RETURN jsonb_build_object('referral',to_jsonb(v_referral),'queue',v_queue);
  END IF;
  INSERT INTO public.hospital_appointments(hospital_id,patient_id,doctor_id,department_id,scheduled_at,kind,status,source,reason,created_by)
  SELECT v_referral.hospital_id,v_referral.patient_id,d.id,v_referral.to_department_id,(public.hospital_today(v_referral.hospital_id)+time '09:00') AT TIME ZONE h.timezone,'referral','scheduled','referral',v_referral.reason,auth.uid()
  FROM public.hospital_doctors d JOIN public.hospital_orgs h ON h.id=v_referral.hospital_id
  WHERE d.hospital_id=v_referral.hospital_id AND d.is_active AND (d.id=v_referral.to_doctor_id OR (v_referral.to_doctor_id IS NULL AND d.department_id=v_referral.to_department_id)) ORDER BY d.doctor_name LIMIT 1
  RETURNING * INTO v_appointment;
  IF v_appointment.id IS NULL THEN RAISE EXCEPTION 'No active doctor is available for the referral' USING ERRCODE='P0002'; END IF;
  UPDATE public.referrals SET status='accepted',updated_at=now() WHERE id=p_referral_id RETURNING * INTO v_referral;
  PERFORM public.hospital_log_event(v_referral.hospital_id,v_referral.patient_id,'Referral Accepted',jsonb_build_object('referral_id',v_referral.id,'appointment_id',v_appointment.id),true);
  RETURN jsonb_build_object('referral',to_jsonb(v_referral),'appointment',to_jsonb(v_appointment));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.schedule_follow_up(p_consultation_id uuid,p_due_date date,p_advice text,p_depends_on_order_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_consult public.consultations; v_follow public.follow_ups;
BEGIN
  SELECT * INTO v_consult FROM public.consultations WHERE id=p_consultation_id;
  IF v_consult.id IS NULL OR NOT public.hospital_has_cap(v_consult.hospital_id,'clinical.write') THEN RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE='42501'; END IF;
  IF p_due_date IS NULL OR NULLIF(btrim(p_advice),'') IS NULL THEN RAISE EXCEPTION 'Follow-up date and advice are required' USING ERRCODE='22023'; END IF;
  IF p_depends_on_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.investigation_orders WHERE id=p_depends_on_order_id AND hospital_id=v_consult.hospital_id AND patient_id=v_consult.patient_id) THEN RAISE EXCEPTION 'Investigation order does not belong to this patient and hospital' USING ERRCODE='23514'; END IF;
  INSERT INTO public.follow_ups(hospital_id,patient_id,consultation_id,due_date,advice,depends_on_order_id)
  VALUES(v_consult.hospital_id,v_consult.patient_id,v_consult.id,p_due_date,btrim(p_advice),p_depends_on_order_id) RETURNING * INTO v_follow;
  PERFORM public.hospital_log_event(v_consult.hospital_id,v_consult.patient_id,'Follow-up Scheduled',jsonb_build_object('follow_up_id',v_follow.id,'due_date',v_follow.due_date),true);
  RETURN to_jsonb(v_follow);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_consultation_context(p_hospital_id uuid,p_patient_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'clinical.read') THEN RAISE EXCEPTION 'clinical.read capability required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hospital_patients WHERE id=p_patient_id AND hospital_id=p_hospital_id) THEN RAISE EXCEPTION 'Patient does not belong to this hospital' USING ERRCODE='23514'; END IF;
  INSERT INTO public.hospital_access_audit(hospital_id,patient_id,actor_user_id,action) VALUES(p_hospital_id,p_patient_id,auth.uid(),'consultation.context_read');
  RETURN jsonb_build_object(
    'previous_visits',COALESCE((SELECT jsonb_agg(jsonb_build_object('visit_date',v.visit_date,'checked_in_at',v.checked_in_at) ORDER BY v.visit_date DESC) FROM (SELECT * FROM public.hospital_visits WHERE hospital_id=p_hospital_id AND patient_id=p_patient_id ORDER BY visit_date DESC LIMIT 20) v),'[]'::jsonb),
    'current_treatment',(SELECT jsonb_build_object('plan',c.plan,'advice',c.advice,'finalised_at',c.finalised_at) FROM public.consultations c WHERE c.hospital_id=p_hospital_id AND c.patient_id=p_patient_id AND c.status='final' ORDER BY c.finalised_at DESC LIMIT 1),
    'pending_investigations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'type',t.name,'status',o.status,'expected_from',o.expected_report_from,'expected_to',o.expected_report_to) ORDER BY o.ordered_at DESC) FROM public.investigation_orders o JOIN public.investigation_types t ON t.id=o.type_id WHERE o.hospital_id=p_hospital_id AND o.patient_id=p_patient_id AND o.status NOT IN ('doctor_reviewed','cancelled')),'[]'::jsonb),
    'prior_prescriptions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',pr.id,'notes',pr.notes,'created_at',pr.created_at,'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('medicine_name',pi.medicine_name,'dose',pi.dose,'frequency',pi.frequency,'duration',pi.duration,'instructions',pi.instructions) ORDER BY pi.created_at) FROM public.prescription_items pi WHERE pi.prescription_id=pr.id),'[]'::jsonb)) ORDER BY pr.created_at DESC) FROM public.prescriptions pr WHERE pr.hospital_id=p_hospital_id AND pr.patient_id=p_patient_id),'[]'::jsonb),
    'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('complaint',c.complaint,'assessment',c.assessment,'plan',c.plan,'version',c.version,'finalised_at',c.finalised_at) ORDER BY c.finalised_at DESC) FROM public.consultations c WHERE c.hospital_id=p_hospital_id AND c.patient_id=p_patient_id AND c.status='final'),'[]'::jsonb)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.demo_seed_clinical(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_rows integer; v_med uuid; v_doctor uuid; v_department uuid; v_consult public.consultations; v_patient uuid; v_queue uuid; v_index integer:=0; v_prescription public.prescriptions;
BEGIN
  SELECT id INTO v_med FROM public.hospital_departments WHERE hospital_id=p_hospital_id AND name='Medical Oncology' LIMIT 1;
  SELECT id INTO v_doctor FROM public.hospital_doctors WHERE hospital_id=p_hospital_id AND doctor_name='Dr. Raj Sharma' LIMIT 1;
  IF v_med IS NULL OR v_doctor IS NULL THEN RAISE EXCEPTION 'Seed departments and doctors before clinical sample data' USING ERRCODE='23514'; END IF;
  FOR v_patient,v_queue IN SELECT q.patient_id,q.id FROM public.queue_entries q JOIN public.opd_sessions s ON s.id=q.session_id WHERE q.hospital_id=p_hospital_id AND q.is_demo ORDER BY q.token_number LIMIT 40 LOOP
    v_index:=v_index+1;
    INSERT INTO public.consultations(hospital_id,patient_id,queue_entry_id,session_id,doctor_id,complaint,assessment,plan,advice,status,version,finalised_at,created_by,is_demo)
    SELECT p_hospital_id,v_patient,v_queue,s.id,v_doctor,
      CASE WHEN v_index%3=0 THEN 'Fatigue and reduced appetite' WHEN v_index%3=1 THEN 'Follow-up after treatment cycle' ELSE 'Review of treatment tolerance' END,
      CASE WHEN v_index%4=0 THEN 'Symptoms stable; no acute concerns reported' ELSE 'Clinical review completed; continue planned monitoring' END,
      'Continue oncology care plan and monitor reported symptoms','Seek clinical review if symptoms worsen','final',1,now()-((40-v_index)*interval '1 hour'),auth.uid(),true
    FROM public.queue_entries q JOIN public.opd_sessions s ON s.id=q.session_id WHERE q.id=v_queue RETURNING * INTO v_consult;
    INSERT INTO public.prescriptions(hospital_id,patient_id,consultation_id,doctor_id,notes,is_demo)
    VALUES(p_hospital_id,v_patient,v_consult.id,v_doctor,'Use only as prescribed by the treating clinician',true) RETURNING * INTO v_prescription;
    INSERT INTO public.prescription_items(hospital_id,prescription_id,medicine_name,dose,frequency,duration,instructions,is_demo)
    VALUES(p_hospital_id,v_prescription.id,CASE WHEN v_index%2=0 THEN 'Ondansetron' ELSE 'Dexamethasone' END,CASE WHEN v_index%2=0 THEN '8 mg' ELSE '4 mg' END,'As directed','As prescribed','Follow the treating clinician instructions',true);
    PERFORM public.hospital_log_event(p_hospital_id,v_patient,'Consultation Completed',jsonb_build_object('consultation_id',v_consult.id,'demo',true),true);
  END LOOP;
  FOR v_index IN 1..8 LOOP
    SELECT id INTO v_patient FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo ORDER BY patient_identifier OFFSET (v_index+5) LIMIT 1;
    INSERT INTO public.referrals(hospital_id,patient_id,from_doctor_id,to_department_id,priority,reason,status,is_demo)
    VALUES(p_hospital_id,v_patient,v_doctor,(SELECT id FROM public.hospital_departments WHERE hospital_id=p_hospital_id AND name=CASE WHEN v_index%2=0 THEN 'Radiation Oncology' ELSE 'Surgical Oncology' END LIMIT 1),CASE WHEN v_index=1 THEN 'urgent' ELSE 'routine' END,'Specialist assessment requested',CASE WHEN v_index<=2 THEN 'queued' WHEN v_index<=5 THEN 'accepted' ELSE 'pending' END,true);
  END LOOP;
  FOR v_index IN 1..10 LOOP
    SELECT id INTO v_patient FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo ORDER BY patient_identifier OFFSET (v_index+20) LIMIT 1;
    INSERT INTO public.follow_ups(hospital_id,patient_id,due_date,advice,status,is_demo)
    VALUES(p_hospital_id,v_patient,public.hospital_today(p_hospital_id)+((v_index%4)+7),'Routine oncology follow-up',CASE WHEN v_index<4 THEN 'booked' ELSE 'pending' END,true);
  END LOOP;
  SELECT count(*) INTO v_rows FROM public.consultations WHERE hospital_id=p_hospital_id AND is_demo;
  RETURN jsonb_build_object('consultations',v_rows,'prescriptions',(SELECT count(*) FROM public.prescriptions WHERE hospital_id=p_hospital_id AND is_demo),'referrals',(SELECT count(*) FROM public.referrals WHERE hospital_id=p_hospital_id AND is_demo),'follow_ups',(SELECT count(*) FROM public.follow_ups WHERE hospital_id=p_hospital_id AND is_demo));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.load_demo_data(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_opd jsonb; v_clinical jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'config.manage') THEN RAISE EXCEPTION 'config.manage capability required' USING ERRCODE='42501'; END IF;
  PERFORM public.demo_remove(p_hospital_id);
  PERFORM public.seed_hospital_defaults(p_hospital_id);
  v_opd:=public.demo_seed_opd(p_hospital_id);
  v_clinical:=public.demo_seed_clinical(p_hospital_id);
  INSERT INTO public.hospital_members(hospital_id,user_id,staff_role,is_demo)
  SELECT p_hospital_id,auth.uid(),r.role_name,true FROM unnest(ARRAY['hospital_admin','front_desk','nurse','doctor','lab_tech','radiology_tech','admissions_staff']) r(role_name)
  ON CONFLICT(hospital_id,user_id,staff_role) DO NOTHING;
  UPDATE public.hospital_orgs SET demo_data_loaded=true,updated_at=now() WHERE id=p_hospital_id;
  INSERT INTO public.hospital_access_audit(hospital_id,actor_user_id,action,details) VALUES(p_hospital_id,auth.uid(),'demo_data.loaded',v_opd||v_clinical);
  RETURN v_opd||v_clinical;
END;
$fn$;

DO $grants$
DECLARE v_name text; v_sig text;
BEGIN
  FOR v_name,v_sig IN SELECT * FROM (VALUES
    ('start_consultation_record','uuid'),('save_consultation_draft','uuid, jsonb'),('finalize_consultation','uuid'),('amend_consultation','uuid'),
    ('create_prescription','uuid, jsonb, text'),('create_referral','uuid, uuid, uuid, text, text'),('accept_referral','uuid, uuid'),
    ('schedule_follow_up','uuid, date, text, uuid'),('get_consultation_context','uuid, uuid'),('demo_seed_clinical','uuid'),('load_demo_data','uuid')
  ) AS functions(function_name,arg_types) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',v_name,v_sig);
    IF v_name='demo_seed_clinical' THEN EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM authenticated',v_name,v_sig);
    ELSE EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',v_name,v_sig); END IF;
  END LOOP;
END;
$grants$;

NOTIFY pgrst, 'reload schema';
