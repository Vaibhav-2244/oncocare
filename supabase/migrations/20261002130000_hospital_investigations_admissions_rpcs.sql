CREATE OR REPLACE FUNCTION public.generate_investigation_slots(
  p_hospital_id uuid,
  p_type_id uuid,
  p_resource_id uuid,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.create') THEN
    RAISE EXCEPTION 'orders.create capability required' USING ERRCODE = '42501';
  END IF;

  WITH days AS (
    SELECT generate_series(current_date, current_date + p_days, interval '1 day')::date AS d
  )
  INSERT INTO public.investigation_slots (hospital_id, type_id, resource_id, slot_start, slot_end, kind, status)
  SELECT p_hospital_id, p_type_id, p_resource_id,
         (d::timestamp + time '09:00')::timestamptz,
         (d::timestamp + time '09:30')::timestamptz,
         'normal', 'open'
  FROM days
  ON CONFLICT (resource_id, slot_start) DO NOTHING;

  RETURN jsonb_build_object('type_id', p_type_id, 'resource_id', p_resource_id, 'days', p_days);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.regenerate_investigation_slots(
  p_hospital_id uuid,
  p_type_id uuid,
  p_resource_id uuid,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  DELETE FROM public.investigation_slots WHERE hospital_id = p_hospital_id AND type_id = p_type_id AND resource_id = p_resource_id;
  RETURN public.generate_investigation_slots(p_hospital_id, p_type_id, p_resource_id, p_days);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.preview_slot_regeneration(
  p_hospital_id uuid,
  p_type_id uuid,
  p_resource_id uuid,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.create') THEN
    RAISE EXCEPTION 'orders.create capability required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('days', p_days, 'type_id', p_type_id, 'resource_id', p_resource_id, 'preview_count', p_days * 10);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.add_resource_closure(
  p_hospital_id uuid,
  p_resource_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text DEFAULT 'maintenance',
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.resource_closures;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.resource_closures (hospital_id, resource_id, start_date, end_date, reason, note)
  VALUES (p_hospital_id, p_resource_id, p_start_date, p_end_date, p_reason, NULLIF(btrim(p_note), ''))
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.add_hospital_holiday(
  p_hospital_id uuid,
  p_holiday_date date,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hospital_holidays;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.hospital_holidays (hospital_id, holiday_date, name)
  VALUES (p_hospital_id, p_holiday_date, COALESCE(NULLIF(btrim(p_name), ''), 'Hospital Holiday'))
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_investigation_availability(
  p_hospital_id uuid,
  p_type_id uuid,
  p_from_date date DEFAULT current_date,
  p_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.create') THEN
    RAISE EXCEPTION 'orders.create capability required' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object(
        'slot_start', s.slot_start,
        'slot_end', s.slot_end,
        'status', s.status,
        'kind', s.kind,
        'resource_id', s.resource_id
      ) ORDER BY s.slot_start)
      FROM public.investigation_slots s
      WHERE s.hospital_id = p_hospital_id
        AND s.type_id = p_type_id
        AND s.slot_start >= p_from_date::timestamptz
        AND s.slot_start < (p_from_date + p_days)::timestamptz
    ),
    '[]'::jsonb
  );
END;
$fn$;

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
AS $fn$
DECLARE
  v_order public.investigation_orders;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.create') THEN
    RAISE EXCEPTION 'orders.create capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.investigation_orders (
    hospital_id, patient_id, type_id, ordered_by_doctor_id, consultation_id, priority, status
  ) VALUES (
    p_hospital_id, p_patient_id, p_type_id, p_doctor_id, p_consultation_id, p_priority, 'ordered'
  ) RETURNING * INTO v_order;

  RETURN to_jsonb(v_order);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.book_investigation_slot(
  p_hospital_id uuid,
  p_order_id uuid,
  p_slot_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_order public.investigation_orders;
  v_slot public.investigation_slots;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.create') THEN
    RAISE EXCEPTION 'orders.create capability required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM public.investigation_orders WHERE id = p_order_id AND hospital_id = p_hospital_id FOR UPDATE;
  SELECT * INTO v_slot FROM public.investigation_slots WHERE id = p_slot_id AND hospital_id = p_hospital_id FOR UPDATE;

  IF v_order.id IS NULL OR v_slot.id IS NULL THEN
    RAISE EXCEPTION 'Order or slot not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_slot.status = 'booked' THEN
    RAISE EXCEPTION 'Slot already booked' USING ERRCODE = '23505';
  END IF;

  UPDATE public.investigation_slots
  SET status = 'booked', booked_order_id = p_order_id, updated_at = now()
  WHERE id = p_slot_id;

  UPDATE public.investigation_orders
  SET slot_id = p_slot_id, scheduled_for = v_slot.slot_start, status = 'scheduled', updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'slot_id', p_slot_id, 'scheduled_for', v_slot.slot_start);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.waitlist_investigation_order(
  p_hospital_id uuid,
  p_order_id uuid,
  p_type_id uuid,
  p_priority_rank smallint DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.investigation_waitlist;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.create') THEN
    RAISE EXCEPTION 'orders.create capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.investigation_waitlist (hospital_id, order_id, type_id, priority_rank, status)
  VALUES (p_hospital_id, p_order_id, p_type_id, p_priority_rank, 'waiting')
  ON CONFLICT (order_id) DO UPDATE SET priority_rank = EXCLUDED.priority_rank, status = 'waiting'
  RETURNING * INTO v_row;

  UPDATE public.investigation_orders
  SET status = 'waitlisted', updated_at = now()
  WHERE id = p_order_id AND hospital_id = p_hospital_id;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.staff_assign_slot(
  p_hospital_id uuid,
  p_order_id uuid,
  p_slot_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.pipeline') THEN
    RAISE EXCEPTION 'orders.pipeline capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.investigation_orders
  SET slot_id = p_slot_id, scheduled_for = (SELECT slot_start FROM public.investigation_slots WHERE id = p_slot_id), status = 'scheduled', updated_at = now()
  WHERE id = p_order_id AND hospital_id = p_hospital_id;

  UPDATE public.investigation_slots
  SET status = 'booked', booked_order_id = p_order_id
  WHERE id = p_slot_id AND hospital_id = p_hospital_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'slot_id', p_slot_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cancel_investigation_booking(
  p_hospital_id uuid,
  p_order_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.pipeline') THEN
    RAISE EXCEPTION 'orders.pipeline capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.investigation_orders
  SET status = 'cancelled', cancel_reason = NULLIF(btrim(p_reason), ''), cancelled_at = now(), updated_at = now()
  WHERE id = p_order_id AND hospital_id = p_hospital_id;

  UPDATE public.investigation_slots
  SET status = 'open', booked_order_id = NULL
  WHERE booked_order_id = p_order_id AND hospital_id = p_hospital_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'cancel_reason', NULLIF(btrim(p_reason), ''));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.offer_released_slot(
  p_hospital_id uuid,
  p_slot_id uuid,
  p_waitlist_order_id uuid,
  p_expires_hours integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.pipeline') THEN
    RAISE EXCEPTION 'orders.pipeline capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.investigation_waitlist
  SET status = 'offered', offered_slot_id = p_slot_id, offer_expires_at = now() + make_interval(hours => p_expires_hours)
  WHERE order_id = p_waitlist_order_id AND hospital_id = p_hospital_id;

  RETURN jsonb_build_object('slot_id', p_slot_id, 'waitlist_order_id', p_waitlist_order_id, 'expires_at', now() + make_interval(hours => p_expires_hours));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.accept_slot_offer(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.investigation_orders
  SET status = 'scheduled', updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.investigation_waitlist
  SET status = 'accepted'
  WHERE order_id = p_order_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'accepted', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.decline_slot_offer(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.investigation_waitlist
  SET status = 'cancelled'
  WHERE order_id = p_order_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'declined', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.investigation_advance(
  p_hospital_id uuid,
  p_order_id uuid,
  p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.pipeline') THEN
    RAISE EXCEPTION 'orders.pipeline capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.investigation_orders
  SET status = p_new_status,
      updated_at = now(),
      performed_at = CASE WHEN p_new_status = 'performed' THEN now() ELSE performed_at END,
      processing_at = CASE WHEN p_new_status = 'processing' THEN now() ELSE processing_at END,
      report_ready_at = CASE WHEN p_new_status = 'report_ready' THEN now() ELSE report_ready_at END,
      reviewed_at = CASE WHEN p_new_status = 'doctor_reviewed' THEN now() ELSE reviewed_at END
  WHERE id = p_order_id AND hospital_id = p_hospital_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'status', p_new_status);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_capacity_overview(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.read') THEN
    RAISE EXCEPTION 'orders.read capability required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'total_beds', (SELECT count(*) FROM public.hospital_beds WHERE hospital_id = p_hospital_id),
    'occupied_beds', (SELECT count(*) FROM public.hospital_beds WHERE hospital_id = p_hospital_id AND status = 'occupied'),
    'available_beds', (SELECT count(*) FROM public.hospital_beds WHERE hospital_id = p_hospital_id AND status = 'available'),
    'investigation_orders', (SELECT count(*) FROM public.investigation_orders WHERE hospital_id = p_hospital_id)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_turnaround_overview(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN jsonb_build_object(
    'orders', (SELECT count(*) FROM public.investigation_orders WHERE hospital_id = p_hospital_id),
    'report_ready', (SELECT count(*) FROM public.investigation_orders WHERE hospital_id = p_hospital_id AND status = 'report_ready'),
    'doctor_reviewed', (SELECT count(*) FROM public.investigation_orders WHERE hospital_id = p_hospital_id AND status = 'doctor_reviewed')
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_bottlenecks(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object('type', type_id, 'count', count))
      FROM (
        SELECT type_id, count(*) AS count
        FROM public.investigation_orders
        WHERE hospital_id = p_hospital_id AND status IN ('ordered', 'waitlisted', 'scheduled')
        GROUP BY type_id
      ) s
    ),
    '[]'::jsonb
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.run_hospital_maintenance(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.investigation_orders
  SET status = 'processing', updated_at = now()
  WHERE hospital_id = p_hospital_id AND status = 'performed';

  RETURN jsonb_build_object('hospital_id', p_hospital_id, 'updated', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.run_hospital_maintenance_all()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.investigation_orders
  SET status = 'processing', updated_at = now()
  WHERE status = 'performed';

  RETURN jsonb_build_object('updated', true);
END;
$fn$;

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
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'admissions.manage') THEN
    RAISE EXCEPTION 'admissions.manage capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.hospital_admissions
  SET ward_id = p_new_ward_id, bed_id = p_new_bed_id, status = 'transferred', updated_at = now()
  WHERE id = p_admission_id AND hospital_id = p_hospital_id
  RETURNING * INTO v_row;

  UPDATE public.hospital_beds
  SET status = 'available', updated_at = now()
  WHERE id = v_row.bed_id AND hospital_id = p_hospital_id;

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
  WHERE id = p_admission_id AND hospital_id = p_hospital_id
  RETURNING * INTO v_row;

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

  UPDATE public.hospital_beds
  SET status = p_status, updated_at = now()
  WHERE id = p_bed_id AND hospital_id = p_hospital_id;

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
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.hospital_wards (hospital_id, name, is_active)
  VALUES (p_hospital_id, p_name, true)
  RETURNING id INTO v_ward_id;

  FOR v_i IN 1..p_bed_count LOOP
    INSERT INTO public.hospital_beds (hospital_id, ward_id, bed_label, status)
    VALUES (p_hospital_id, v_ward_id, p_name || '-BED-' || v_i, 'available');
  END LOOP;

  RETURN jsonb_build_object('ward_id', v_ward_id, 'bed_count', p_bed_count);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.generate_patient_link_code(p_hospital_id uuid, p_patient_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code text;
BEGIN
  v_code := upper(substr(md5(random()::text), 1, 8));
  INSERT INTO public.patient_link_codes (hospital_id, patient_id, code_hash, expires_at)
  VALUES (p_hospital_id, p_patient_id, md5(v_code), now() + interval '7 days');
  RETURN v_code;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.link_patient_account(p_hospital_id uuid, p_code text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.patient_link_codes;
BEGIN
  SELECT * INTO v_row
  FROM public.patient_link_codes
  WHERE hospital_id = p_hospital_id
    AND code_hash = md5(p_code)
    AND consumed_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link code' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.hospital_patients
  SET patient_user_id = p_user_id, updated_at = now()
  WHERE id = v_row.patient_id AND hospital_id = p_hospital_id;

  UPDATE public.patient_link_codes
  SET consumed_at = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object('patient_id', v_row.patient_id, 'linked', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_hospital_visits(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object(
        'hospital_id', hp.hospital_id,
        'patient_id', hp.id,
        'patient_identifier', hp.patient_identifier,
        'name', hp.name,
        'visit_date', hv.visit_date,
        'checked_in_at', hv.checked_in_at
      ) ORDER BY hv.visit_date DESC)
      FROM public.hospital_patients hp
      JOIN public.hospital_visits hv ON hv.patient_id = hp.id
      WHERE hp.patient_user_id = p_user_id
    ),
    '[]'::jsonb
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.respond_slot_offer(p_order_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_accept THEN
    UPDATE public.investigation_waitlist
    SET status = 'accepted', offer_expires_at = NULL
    WHERE order_id = p_order_id;
    UPDATE public.investigation_orders
    SET status = 'scheduled', updated_at = now()
    WHERE id = p_order_id;
  ELSE
    UPDATE public.investigation_waitlist
    SET status = 'cancelled', offer_expires_at = NULL
    WHERE order_id = p_order_id;
  END IF;

  RETURN jsonb_build_object('order_id', p_order_id, 'accepted', p_accept);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.demo_seed_investigations(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.investigation_types (hospital_id, name, category, expected_report_min_days, expected_report_max_days, is_active, is_demo)
  VALUES
    (p_hospital_id, 'Mammography', 'imaging', 2, 5, true, true),
    (p_hospital_id, 'CT Scan', 'imaging', 1, 3, true, true),
    (p_hospital_id, 'Blood Tests', 'lab', 1, 2, true, true)
  ON CONFLICT (hospital_id, name) DO NOTHING;

  RETURN jsonb_build_object('seeded', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.demo_seed_admissions(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ward_id uuid;
  v_bed_id uuid;
BEGIN
  INSERT INTO public.hospital_wards (hospital_id, name, is_active, is_demo)
  VALUES (p_hospital_id, 'Ward A', true, true)
  ON CONFLICT (hospital_id, name) DO NOTHING;

  SELECT id INTO v_ward_id FROM public.hospital_wards WHERE hospital_id = p_hospital_id AND name = 'Ward A';
  SELECT id INTO v_bed_id FROM public.hospital_beds WHERE hospital_id = p_hospital_id AND ward_id = v_ward_id LIMIT 1;

  IF v_bed_id IS NULL THEN
    INSERT INTO public.hospital_beds (hospital_id, ward_id, bed_label, status, is_demo)
    VALUES (p_hospital_id, v_ward_id, 'A-01', 'available', true)
    RETURNING id INTO v_bed_id;
  END IF;

  RETURN jsonb_build_object('ward_id', v_ward_id, 'bed_id', v_bed_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hospital_command_center(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN jsonb_build_object(
    'kpis', jsonb_build_object(
      'waiting', (SELECT count(*) FROM public.queue_entries WHERE hospital_id = p_hospital_id AND status = 'waiting'),
      'in_consultation', (SELECT count(*) FROM public.queue_entries WHERE hospital_id = p_hospital_id AND status = 'in_consultation'),
      'pending_reports', (SELECT count(*) FROM public.investigation_orders WHERE hospital_id = p_hospital_id AND status IN ('processing', 'report_ready')), 
      'admissions', (SELECT count(*) FROM public.hospital_admissions WHERE hospital_id = p_hospital_id AND status = 'admitted')
    ),
    'queues', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.start_time) FROM public.opd_sessions s WHERE s.hospital_id = p_hospital_id), '[]'::jsonb),
    'beds', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.bed_label) FROM public.hospital_beds b WHERE b.hospital_id = p_hospital_id), '[]'::jsonb),
    'recent_orders', COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.ordered_at DESC) FROM public.investigation_orders o WHERE o.hospital_id = p_hospital_id LIMIT 20), '[]'::jsonb)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_hospital_department(
  p_hospital_id uuid,
  p_name text,
  p_department_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hospital_departments;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF p_department_type NOT IN ('clinical', 'diagnostic') THEN
    RAISE EXCEPTION 'Invalid department type' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hospital_departments (hospital_id, name, department_type)
  VALUES (p_hospital_id, NULLIF(btrim(p_name), ''), p_department_type)
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.set_hospital_department_active(
  p_hospital_id uuid,
  p_department_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hospital_departments;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.hospital_departments
  SET is_active = p_is_active
  WHERE id = p_department_id AND hospital_id = p_hospital_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Department not found' USING ERRCODE = 'P0002'; END IF;
  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_hospital_doctor(
  p_hospital_id uuid,
  p_doctor_name text,
  p_specialty text DEFAULT NULL,
  p_department_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hospital_doctors;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF p_department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hospital_departments
    WHERE id = p_department_id AND hospital_id = p_hospital_id
  ) THEN
    RAISE EXCEPTION 'Department not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.hospital_doctors (hospital_id, doctor_name, specialty, department_id)
  VALUES (p_hospital_id, NULLIF(btrim(p_doctor_name), ''), NULLIF(btrim(p_specialty), ''), p_department_id)
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.set_hospital_doctor_active(
  p_hospital_id uuid,
  p_doctor_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hospital_doctors;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.hospital_doctors
  SET is_active = p_is_active
  WHERE id = p_doctor_id AND hospital_id = p_hospital_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'P0002'; END IF;
  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_hospital_priority_rule(
  p_hospital_id uuid,
  p_rule_id uuid,
  p_target_max_wait_days integer,
  p_allowed_slot_kinds text[],
  p_staff_approval_required boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.priority_rules;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.priority_rules
  SET target_max_wait_days = p_target_max_wait_days,
      allowed_slot_kinds = p_allowed_slot_kinds,
      staff_approval_required = p_staff_approval_required,
      updated_at = now()
  WHERE id = p_rule_id AND hospital_id = p_hospital_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Priority rule not found' USING ERRCODE = 'P0002'; END IF;
  RETURN to_jsonb(v_row);
END;
$fn$;

DO $grants$
DECLARE v_sig text; v_name text;
BEGIN
  FOR v_name, v_sig IN SELECT * FROM (VALUES
    ('create_hospital_department', 'uuid, text, text'),
    ('set_hospital_department_active', 'uuid, uuid, boolean'),
    ('create_hospital_doctor', 'uuid, text, text, uuid'),
    ('set_hospital_doctor_active', 'uuid, uuid, boolean'),
    ('update_hospital_priority_rule', 'uuid, uuid, integer, text[], boolean'),
    ('add_hospital_holiday', 'uuid, date, text')
  ) AS signatures(function_name, arg_types) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', v_name, v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', v_name, v_sig);
  END LOOP;
END;
$grants$;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS hospital_id uuid,
  ADD COLUMN IF NOT EXISTS ref_table text,
  ADD COLUMN IF NOT EXISTS ref_id uuid,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedupe
  ON public.notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
