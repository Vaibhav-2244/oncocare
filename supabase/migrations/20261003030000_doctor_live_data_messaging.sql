-- Consent-scoped access to existing patient data and doctor messaging.

CREATE OR REPLACE FUNCTION public.doctor_get_patient_live_data(p_doctor_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE patient_user uuid; granted text[]; result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  SELECT p.patient_user_id, c.scopes INTO patient_user, granted
  FROM public.doctor_patients p
  LEFT JOIN public.doctor_consents c ON c.doctor_patient_id = p.id AND c.revoked_at IS NULL
  WHERE p.id = p_doctor_patient_id AND p.doctor_id = auth.uid();
  IF patient_user IS NULL OR granted IS NULL THEN RAISE EXCEPTION 'Patient has not granted active consent' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object(
    'symptoms', CASE WHEN 'symptoms' = ANY(granted) THEN COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.recorded_at DESC) FROM public.symptoms s WHERE s.user_id = patient_user AND s.recorded_at > now() - interval '30 days'), '[]'::jsonb) ELSE '[]'::jsonb END,
    'side_effects', CASE WHEN 'side_effects' = ANY(granted) THEN COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.recorded_at DESC) FROM public.side_effect_entries s WHERE s.user_id = patient_user AND s.recorded_at > now() - interval '30 days'), '[]'::jsonb) ELSE '[]'::jsonb END,
    'medications', CASE WHEN 'medications' = ANY(granted) THEN COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC) FROM public.medications m WHERE m.user_id = patient_user AND m.is_active), '[]'::jsonb) ELSE '[]'::jsonb END,
    'timeline', CASE WHEN 'timeline' = ANY(granted) THEN COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.event_date DESC) FROM public.health_timeline t WHERE t.user_id = patient_user), '[]'::jsonb) ELSE '[]'::jsonb END,
    'consent_scopes', to_jsonb(granted)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_list_messages(p_doctor_patient_id uuid)
RETURNS SETOF public.messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE patient_user uuid; granted text[];
BEGIN
  SELECT p.patient_user_id, c.scopes INTO patient_user, granted
  FROM public.doctor_patients p JOIN public.doctor_consents c ON c.doctor_patient_id = p.id AND c.revoked_at IS NULL
  WHERE p.id = p_doctor_patient_id AND p.doctor_id = auth.uid();
  IF NOT ('messages' = ANY(COALESCE(granted, '{}'::text[]))) THEN RAISE EXCEPTION 'Messaging consent is not active' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT m.* FROM public.messages m
  WHERE (m.sender_id = auth.uid() AND m.recipient_id = patient_user)
     OR (m.sender_id = patient_user AND m.recipient_id = auth.uid())
  ORDER BY m.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_send_message(p_doctor_patient_id uuid, p_content text)
RETURNS public.messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE patient_user uuid; granted text[]; created public.messages;
BEGIN
  SELECT p.patient_user_id, c.scopes INTO patient_user, granted
  FROM public.doctor_patients p JOIN public.doctor_consents c ON c.doctor_patient_id = p.id AND c.revoked_at IS NULL
  WHERE p.id = p_doctor_patient_id AND p.doctor_id = auth.uid();
  IF patient_user IS NULL OR NOT ('messages' = ANY(COALESCE(granted, '{}'::text[]))) THEN RAISE EXCEPTION 'Messaging consent is not active' USING ERRCODE = '42501'; END IF;
  IF NULLIF(trim(p_content), '') IS NULL THEN RAISE EXCEPTION 'Message cannot be empty' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.messages (sender_id, recipient_id, content) VALUES (auth.uid(), patient_user, trim(p_content)) RETURNING * INTO created;
  INSERT INTO public.notifications (user_id, title, message, type) VALUES (patient_user, 'New message from your doctor', trim(p_content), 'message');
  RETURN created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_get_patient_live_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_list_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_send_message(uuid, text) TO authenticated;
