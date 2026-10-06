-- Keep patient-to-doctor messaging and in-app notifications in one transaction.

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
    AND c.revoked_at IS NULL
    AND dp.doctor_id = p_doctor_id
  WHERE dp.patient_user_id = auth.uid()
  LIMIT 1;

  IF v_patient_id IS NULL OR p_content IS NULL OR btrim(p_content) = '' THEN
    RAISE EXCEPTION 'Active doctor consent and message content are required'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.messages (sender_id, recipient_id, content)
  VALUES (auth.uid(), p_doctor_id, btrim(p_content))
  RETURNING * INTO v_message;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (p_doctor_id, 'New message from your patient', btrim(p_content), 'message');

  RETURN v_message;
END;
$$;

GRANT EXECUTE ON FUNCTION public.patient_send_doctor_message(uuid, text) TO authenticated;
