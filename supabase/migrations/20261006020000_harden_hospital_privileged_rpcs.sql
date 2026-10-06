-- Close remaining unauthenticated and cross-patient hospital RPC paths.

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
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.hospital_has_cap(p_hospital_id, 'patients.register')
     OR NOT EXISTS (
       SELECT 1 FROM public.hospital_patients
       WHERE id = p_patient_id AND hospital_id = p_hospital_id
     ) THEN
    RAISE EXCEPTION 'Hospital patient-link permission is required'
      USING ERRCODE = '42501';
  END IF;

  raw_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  INSERT INTO public.patient_link_codes (
    hospital_id, patient_id, code_hash, expires_at
  )
  VALUES (
    p_hospital_id, p_patient_id,
    encode(digest(raw_code, 'sha256'), 'hex'),
    now() + interval '7 days'
  );
  RETURN raw_code;
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
  IF auth.uid() IS NULL OR NULLIF(btrim(p_code), '') IS NULL THEN
    RAISE EXCEPTION 'Authentication and link code are required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO link_row
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
  WHERE id = link_row.id AND consumed_at IS NULL;

  RETURN jsonb_build_object('patient_id', link_row.patient_id, 'linked', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_hospital_visits()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'hospital_id', hp.hospital_id,
      'patient_id', hp.id,
      'patient_identifier', hp.patient_identifier,
      'name', hp.name,
      'visit_date', hv.visit_date,
      'checked_in_at', hv.checked_in_at
    ) ORDER BY hv.visit_date DESC),
    '[]'::jsonb
  )
  FROM public.hospital_patients hp
  JOIN public.hospital_visits hv ON hv.patient_id = hp.id
  WHERE hp.patient_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.respond_slot_offer(
  p_order_id uuid,
  p_accept boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.investigation_orders;
BEGIN
  SELECT o.*
  INTO order_row
  FROM public.investigation_orders o
  JOIN public.investigation_waitlist w ON w.order_id = o.id
  JOIN public.hospital_patients hp ON hp.id = o.patient_id
  WHERE o.id = p_order_id
    AND hp.patient_user_id = auth.uid()
    AND w.status = 'offered'
    AND w.offer_expires_at > now()
  FOR UPDATE;

  IF order_row.id IS NULL THEN
    RAISE EXCEPTION 'Active investigation offer not found'
      USING ERRCODE = '42501';
  END IF;

  IF p_accept THEN
    UPDATE public.investigation_waitlist
    SET status = 'accepted', offer_expires_at = NULL
    WHERE order_id = p_order_id AND status = 'offered';
    UPDATE public.investigation_orders
    SET status = 'scheduled', updated_at = now()
    WHERE id = p_order_id AND status IN ('offered', 'waitlisted');
  ELSE
    UPDATE public.investigation_waitlist
    SET status = 'cancelled', offer_expires_at = NULL
    WHERE order_id = p_order_id AND status = 'offered';
    UPDATE public.investigation_orders
    SET status = 'cancelled', cancelled_at = now(), updated_at = now()
    WHERE id = p_order_id AND status IN ('offered', 'waitlisted');
  END IF;

  RETURN jsonb_build_object('order_id', p_order_id, 'accepted', p_accept);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_patient_link_code(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_patient_account(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_hospital_visits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_slot_offer(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.demo_seed_investigations(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_seed_admissions(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.generate_patient_link_code(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_patient_account(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_hospital_visits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_slot_offer(uuid, boolean) TO authenticated;
