-- Patient-facing access to the consented doctor workspace.

CREATE OR REPLACE FUNCTION public.patient_list_doctor_appointments()
RETURNS SETOF public.doctor_appointments
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.*
  FROM public.doctor_appointments a
  JOIN public.doctor_patients dp ON dp.id = a.doctor_patient_id
  JOIN public.doctor_consents c ON c.doctor_patient_id = dp.id
    AND c.revoked_at IS NULL AND dp.doctor_id = a.doctor_id
  WHERE dp.patient_user_id = auth.uid()
  ORDER BY a.starts_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.patient_request_doctor_appointment(
  p_doctor_id uuid,
  p_starts_at timestamptz,
  p_visit_type text,
  p_reason text
)
RETURNS public.doctor_appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient public.doctor_patients;
  v_appointment public.doctor_appointments;
BEGIN
  SELECT dp.* INTO v_patient
  FROM public.doctor_patients dp
  JOIN public.doctor_consents c ON c.doctor_patient_id = dp.id
    AND c.revoked_at IS NULL AND dp.doctor_id = p_doctor_id
  WHERE dp.patient_user_id = auth.uid()
  ORDER BY c.granted_at DESC
  LIMIT 1;
  IF v_patient.id IS NULL THEN RAISE EXCEPTION 'Active doctor consent is required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.doctor_appointments (doctor_id, doctor_patient_id, starts_at, visit_type, status, reason)
  VALUES (p_doctor_id, v_patient.id, p_starts_at, p_visit_type, 'pending', NULLIF(btrim(p_reason), ''))
  RETURNING * INTO v_appointment;
  RETURN v_appointment;
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_list_doctor_messages(p_doctor_id uuid)
RETURNS TABLE(id uuid, sender_id uuid, recipient_id uuid, content text, is_read boolean, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.sender_id, m.recipient_id, m.content, m.is_read, m.created_at
  FROM public.messages m
  JOIN public.doctor_patients dp ON (m.sender_id = p_doctor_id AND m.recipient_id = dp.patient_user_id)
    OR (m.recipient_id = p_doctor_id AND m.sender_id = dp.patient_user_id)
  JOIN public.doctor_consents c ON c.doctor_patient_id = dp.id
    AND c.revoked_at IS NULL AND dp.doctor_id = p_doctor_id
  WHERE dp.patient_user_id = auth.uid()
  ORDER BY m.created_at;
$$;

CREATE OR REPLACE FUNCTION public.patient_send_doctor_message(p_doctor_id uuid, p_content text)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id uuid;
  v_message public.messages;
BEGIN
  SELECT dp.id INTO v_patient_id
  FROM public.doctor_patients dp
  JOIN public.doctor_consents c ON c.doctor_patient_id = dp.id
    AND c.revoked_at IS NULL AND dp.doctor_id = p_doctor_id
  WHERE dp.patient_user_id = auth.uid()
  LIMIT 1;
  IF v_patient_id IS NULL OR p_content IS NULL OR btrim(p_content) = '' THEN
    RAISE EXCEPTION 'Active doctor consent and message content are required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.messages (sender_id, recipient_id, content)
  VALUES (auth.uid(), p_doctor_id, btrim(p_content))
  RETURNING * INTO v_message;
  RETURN v_message;
END;
$$;

GRANT EXECUTE ON FUNCTION public.patient_list_doctor_appointments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_request_doctor_appointment(uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_list_doctor_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_send_doctor_message(uuid, text) TO authenticated;
