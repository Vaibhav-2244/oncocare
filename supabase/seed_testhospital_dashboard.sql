-- Populate the hospital workspace owned by 8pyr3ip6x4@olipii.com with
-- clearly marked synthetic records for dashboard testing.
-- Run after applying the Supabase migrations, using the SQL editor/service role.
BEGIN;

DO $seed$
DECLARE
  v_hospital_id uuid;
  v_user_id uuid;
  v_timezone text;
  v_medical_department_id uuid;
  v_radiology_department_id uuid;
  v_doctor_rao_id uuid;
  v_doctor_shah_id uuid;
  v_patient_001_id uuid;
  v_patient_002_id uuid;
  v_patient_003_id uuid;
  v_patient_004_id uuid;
  v_ward_id uuid;
  v_bed_001_id uuid;
  v_session_id uuid;
  v_lab_type_id uuid;
  v_imaging_type_id uuid;
BEGIN
  SELECT h.id, u.id, h.timezone
  INTO v_hospital_id, v_user_id, v_timezone
  FROM auth.users u
  JOIN public.hospital_members hm
    ON hm.user_id = u.id
   AND hm.is_active
   AND hm.staff_role = 'hospital_admin'
  JOIN public.hospital_orgs h ON h.id = hm.hospital_id
  WHERE lower(u.email) = lower('8pyr3ip6x4@olipii.com')
  ORDER BY (h.owner_user_id = u.id) DESC, h.created_at
  LIMIT 1;

  IF v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'No active hospital-admin workspace found for 8pyr3ip6x4@olipii.com';
  END IF;

  SELECT id INTO v_medical_department_id
  FROM public.hospital_departments
  WHERE hospital_id = v_hospital_id AND name = 'Medical Oncology';
  IF v_medical_department_id IS NULL THEN
    INSERT INTO public.hospital_departments (hospital_id, name, department_type)
    VALUES (v_hospital_id, 'Medical Oncology', 'clinical')
    ON CONFLICT (hospital_id, name) DO UPDATE SET is_active = true
    RETURNING id INTO v_medical_department_id;
  END IF;

  SELECT id INTO v_radiology_department_id
  FROM public.hospital_departments
  WHERE hospital_id = v_hospital_id AND name = 'Radiology';
  IF v_radiology_department_id IS NULL THEN
    INSERT INTO public.hospital_departments (hospital_id, name, department_type)
    VALUES (v_hospital_id, 'Radiology', 'diagnostic')
    ON CONFLICT (hospital_id, name) DO UPDATE SET is_active = true
    RETURNING id INTO v_radiology_department_id;
  END IF;

  INSERT INTO public.hospital_doctors (
    hospital_id, department_id, doctor_name, specialty, designation,
    qualifications, years_experience, opd_room, is_active, is_demo
  )
  SELECT v_hospital_id, v_medical_department_id, demo.doctor_name, 'Medical Oncology',
         'Consultant', 'MD, DM', demo.years_experience, demo.opd_room, true, true
  FROM (VALUES
    ('Dr. Demo Asha Rao', 12, 'OPD-1'),
    ('Dr. Demo Kiran Shah', 9, 'OPD-2')
  ) AS demo(doctor_name, years_experience, opd_room)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.hospital_doctors d
    WHERE d.hospital_id = v_hospital_id AND d.doctor_name = demo.doctor_name
  );

  SELECT id INTO v_doctor_rao_id
  FROM public.hospital_doctors
  WHERE hospital_id = v_hospital_id AND doctor_name = 'Dr. Demo Asha Rao';
  SELECT id INTO v_doctor_shah_id
  FROM public.hospital_doctors
  WHERE hospital_id = v_hospital_id AND doctor_name = 'Dr. Demo Kiran Shah';

  INSERT INTO public.hospital_patients (
    hospital_id, patient_identifier, name, mobile, age, gender, is_demo
  )
  VALUES
    (v_hospital_id, 'DEMO-ONCO-001', 'Demo Patient Aarav', '9000000101', 54, 'male', true),
    (v_hospital_id, 'DEMO-ONCO-002', 'Demo Patient Meera', '9000000102', 47, 'female', true),
    (v_hospital_id, 'DEMO-ONCO-003', 'Demo Patient Kabir', '9000000103', 63, 'male', true),
    (v_hospital_id, 'DEMO-ONCO-004', 'Demo Patient Isha', '9000000104', 38, 'female', true)
  ON CONFLICT (hospital_id, patient_identifier) DO UPDATE
    SET name = EXCLUDED.name,
        mobile = EXCLUDED.mobile,
        age = EXCLUDED.age,
        gender = EXCLUDED.gender,
        is_demo = true;

  SELECT id INTO v_patient_001_id FROM public.hospital_patients WHERE hospital_id = v_hospital_id AND patient_identifier = 'DEMO-ONCO-001';
  SELECT id INTO v_patient_002_id FROM public.hospital_patients WHERE hospital_id = v_hospital_id AND patient_identifier = 'DEMO-ONCO-002';
  SELECT id INTO v_patient_003_id FROM public.hospital_patients WHERE hospital_id = v_hospital_id AND patient_identifier = 'DEMO-ONCO-003';
  SELECT id INTO v_patient_004_id FROM public.hospital_patients WHERE hospital_id = v_hospital_id AND patient_identifier = 'DEMO-ONCO-004';

  INSERT INTO public.opd_sessions (
    hospital_id, doctor_id, department_id, session_date, start_time, end_time,
    room, status, last_token, is_demo
  )
  VALUES (
    v_hospital_id, v_doctor_rao_id, v_medical_department_id,
    public.hospital_today(v_hospital_id), time '09:00', time '13:00',
    'OPD-1', 'open', 3, true
  )
  ON CONFLICT (hospital_id, doctor_id, session_date, start_time) DO UPDATE
    SET room = EXCLUDED.room,
        status = 'open',
        closed_at = NULL,
        last_token = 3,
        is_demo = true;

  SELECT id INTO v_session_id
  FROM public.opd_sessions
  WHERE hospital_id = v_hospital_id
    AND doctor_id = v_doctor_rao_id
    AND session_date = public.hospital_today(v_hospital_id)
    AND start_time = time '09:00';

  DELETE FROM public.queue_entries
  WHERE hospital_id = v_hospital_id
    AND session_id = v_session_id
    AND is_demo;

  INSERT INTO public.hospital_visits (hospital_id, patient_id, visit_date, is_demo)
  SELECT v_hospital_id, demo.patient_id, public.hospital_today(v_hospital_id), true
  FROM (VALUES (v_patient_001_id), (v_patient_002_id), (v_patient_003_id)) AS demo(patient_id)
  ON CONFLICT (hospital_id, patient_id, visit_date) DO UPDATE SET is_demo = true;

  INSERT INTO public.queue_entries (
    hospital_id, session_id, patient_id, token_number, priority_rank,
    status, is_walk_in, is_demo
  )
  VALUES
    (v_hospital_id, v_session_id, v_patient_001_id, 1, 1, 'called', false, true),
    (v_hospital_id, v_session_id, v_patient_002_id, 2, 3, 'waiting', false, true),
    (v_hospital_id, v_session_id, v_patient_003_id, 3, 2, 'waiting', true, true)
  ON CONFLICT (session_id, token_number) DO UPDATE
    SET status = EXCLUDED.status,
        patient_id = EXCLUDED.patient_id,
        priority_rank = EXCLUDED.priority_rank,
        is_walk_in = EXCLUDED.is_walk_in,
        updated_at = now(),
        is_demo = true;

  INSERT INTO public.hospital_appointments (
    hospital_id, patient_id, doctor_id, department_id, scheduled_at,
    kind, status, reason, created_by, is_demo
  )
  SELECT v_hospital_id, demo.patient_id, demo.doctor_id, v_medical_department_id,
         (((now() AT TIME ZONE v_timezone)::date + demo.day_offset + demo.start_time) AT TIME ZONE v_timezone),
         'opd', 'scheduled', 'Synthetic dashboard test appointment', v_user_id, true
  FROM (VALUES
    (v_patient_002_id, v_doctor_rao_id, 1, time '10:30'),
    (v_patient_004_id, v_doctor_shah_id, 2, time '11:00')
  ) AS demo(patient_id, doctor_id, day_offset, start_time)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.hospital_appointments existing
    WHERE existing.hospital_id = v_hospital_id
      AND existing.patient_id = demo.patient_id
      AND existing.doctor_id = demo.doctor_id
      AND existing.is_demo
      AND existing.reason = 'Synthetic dashboard test appointment'
      AND existing.scheduled_at::date = (((now() AT TIME ZONE v_timezone)::date + demo.day_offset))
  );

  SELECT id INTO v_ward_id
  FROM public.hospital_wards
  WHERE hospital_id = v_hospital_id AND name = 'Demo Oncology Ward';
  IF v_ward_id IS NULL THEN
    INSERT INTO public.hospital_wards (hospital_id, name, is_active, is_demo)
    VALUES (v_hospital_id, 'Demo Oncology Ward', true, true)
    ON CONFLICT (hospital_id, name) DO UPDATE SET is_active = true, is_demo = true
    RETURNING id INTO v_ward_id;
  END IF;

  INSERT INTO public.hospital_beds (hospital_id, ward_id, bed_label, status, is_demo)
  VALUES
    (v_hospital_id, v_ward_id, 'DEMO-BED-01', 'occupied', true),
    (v_hospital_id, v_ward_id, 'DEMO-BED-02', 'available', true),
    (v_hospital_id, v_ward_id, 'DEMO-BED-03', 'cleaning', true),
    (v_hospital_id, v_ward_id, 'DEMO-BED-04', 'available', true)
  ON CONFLICT (ward_id, bed_label) DO UPDATE
    SET status = EXCLUDED.status,
        is_demo = true;

  SELECT id INTO v_bed_001_id FROM public.hospital_beds WHERE ward_id = v_ward_id AND bed_label = 'DEMO-BED-01';
  UPDATE public.hospital_beds SET status = 'occupied', is_demo = true
  WHERE id = v_bed_001_id AND hospital_id = v_hospital_id;

  INSERT INTO public.hospital_admissions (
    hospital_id, patient_id, ward_id, bed_id, admitting_doctor_id,
    reason, status, is_demo
  )
  SELECT v_hospital_id, v_patient_004_id, v_ward_id, v_bed_001_id, v_doctor_rao_id,
         'Synthetic test admission', 'admitted', true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.hospital_admissions
    WHERE hospital_id = v_hospital_id
      AND bed_id = v_bed_001_id
      AND status IN ('admitted', 'transferred')
  );

  INSERT INTO public.investigation_types (
    hospital_id, name, category, department_id, expected_report_min_days,
    expected_report_max_days, is_active, is_demo
  )
  VALUES
    (v_hospital_id, 'Demo CBC', 'lab', v_medical_department_id, 1, 1, true, true),
    (v_hospital_id, 'Demo CT Chest', 'imaging', v_radiology_department_id, 2, 3, true, true)
  ON CONFLICT (hospital_id, name) DO UPDATE
    SET department_id = EXCLUDED.department_id,
        is_active = true,
        is_demo = true;

  SELECT id INTO v_lab_type_id FROM public.investigation_types WHERE hospital_id = v_hospital_id AND name = 'Demo CBC';
  SELECT id INTO v_imaging_type_id FROM public.investigation_types WHERE hospital_id = v_hospital_id AND name = 'Demo CT Chest';

  INSERT INTO public.investigation_resources (hospital_id, type_id, name, slots_per_day, is_demo)
  VALUES
    (v_hospital_id, v_lab_type_id, 'Demo Lab Analyzer', 24, true),
    (v_hospital_id, v_imaging_type_id, 'Demo CT Scanner', 12, true)
  ON CONFLICT (hospital_id, type_id, name) DO UPDATE
    SET status = 'active',
        is_demo = true;

  INSERT INTO public.investigation_orders (
    hospital_id, patient_id, type_id, ordered_by_doctor_id, priority,
    status, scheduled_for, is_demo
  )
  SELECT v_hospital_id, demo.patient_id, demo.type_id, v_doctor_rao_id,
         demo.priority, demo.status, demo.scheduled_for, true
  FROM (VALUES
    (v_patient_001_id, v_lab_type_id, 'urgent', 'scheduled', now() + interval '1 day'),
    (v_patient_002_id, v_imaging_type_id, 'routine', 'processing', now() - interval '1 hour')
  ) AS demo(patient_id, type_id, priority, status, scheduled_for)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.investigation_orders existing
    WHERE existing.hospital_id = v_hospital_id
      AND existing.patient_id = demo.patient_id
      AND existing.type_id = demo.type_id
      AND existing.is_demo
  );

  INSERT INTO public.notifications (user_id, title, message, type, hospital_id, dedupe_key)
  VALUES
    (v_user_id, 'Demo dashboard data loaded', 'Synthetic patients, appointments, queue, beds, and investigations are available for testing.', 'general', v_hospital_id, 'testhospital-dashboard-demo-loaded'),
    (v_user_id, 'OPD queue test', 'The demo OPD session includes three synthetic queue entries.', 'general', v_hospital_id, 'testhospital-dashboard-opd-demo'),
    (v_user_id, 'Admissions test', 'The demo oncology ward contains an occupied bed and an active synthetic admission.', 'general', v_hospital_id, 'testhospital-dashboard-admissions-demo')
  ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  UPDATE public.hospital_orgs
  SET demo_data_loaded = true,
      updated_at = now()
  WHERE id = v_hospital_id;

END;
$seed$;

COMMIT;
