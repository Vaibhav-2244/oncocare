-- Consent-first patient links and the remaining doctor record RPCs.

CREATE TABLE IF NOT EXISTS public.doctor_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_consents (
  doctor_patient_id uuid PRIMARY KEY REFERENCES public.doctor_patients(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scopes text[] NOT NULL DEFAULT '{}',
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE OR REPLACE FUNCTION public.redeem_doctor_link_code(p_code text, p_scopes text[] DEFAULT ARRAY['appointments']::text[])
RETURNS public.doctor_consents
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE link_row public.doctor_link_codes; consent_row public.doctor_consents;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name = 'patient'
  ) THEN RAISE EXCEPTION 'Patient role is required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO link_row FROM public.doctor_link_codes
  WHERE code_hash = encode(digest(upper(trim(p_code)), 'sha256'), 'hex')
    AND redeemed_at IS NULL AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;
  IF link_row.id IS NULL THEN RAISE EXCEPTION 'Invalid or expired link code' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.doctor_consents (doctor_patient_id, patient_user_id, scopes)
  VALUES (link_row.doctor_patient_id, auth.uid(), COALESCE(p_scopes, ARRAY['appointments']::text[]))
  ON CONFLICT (doctor_patient_id) DO UPDATE SET patient_user_id = EXCLUDED.patient_user_id, scopes = EXCLUDED.scopes, granted_at = now(), revoked_at = NULL
  RETURNING * INTO consent_row;
  UPDATE public.doctor_link_codes SET redeemed_at = now() WHERE id = link_row.id;
  UPDATE public.doctor_patients SET patient_user_id = auth.uid(), updated_at = now() WHERE id = link_row.doctor_patient_id;
  RETURN consent_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_doctor_verifications()
RETURNS SETOF public.doctor_profiles
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT dp.* FROM public.doctor_profiles dp
  WHERE EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'super_admin')
  ) ORDER BY dp.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_doctor_verification(p_doctor_user_id uuid, p_status text)
RETURNS public.doctor_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE updated public.doctor_profiles;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'super_admin')
  ) THEN RAISE EXCEPTION 'Administrator role is required' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('pending', 'submitted', 'verified', 'rejected') THEN RAISE EXCEPTION 'Invalid verification status' USING ERRCODE = '22023'; END IF;
  UPDATE public.doctor_profiles SET verification_status = p_status, updated_at = now()
  WHERE user_id = p_doctor_user_id RETURNING * INTO updated;
  RETURN updated;
END;
$$;

ALTER TABLE public.doctor_link_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doctor_link_codes_owner ON public.doctor_link_codes;
CREATE POLICY doctor_link_codes_owner ON public.doctor_link_codes FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_consents_doctor_owner ON public.doctor_consents;
CREATE POLICY doctor_consents_doctor_owner ON public.doctor_consents FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.doctor_patients p WHERE p.id = doctor_patient_id AND p.doctor_id = auth.uid())
);
DROP POLICY IF EXISTS doctor_consents_patient_owner ON public.doctor_consents;
CREATE POLICY doctor_consents_patient_owner ON public.doctor_consents FOR SELECT TO authenticated USING (patient_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.doctor_create_link_code(p_doctor_patient_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE raw_code text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doctor_profiles WHERE user_id = auth.uid() AND verification_status = 'verified') THEN
    RAISE EXCEPTION 'Doctor verification is required before inviting a patient' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doctor_patients WHERE id = p_doctor_patient_id AND doctor_id = auth.uid() AND status = 'active') THEN
    RAISE EXCEPTION 'Patient is not in your active roster' USING ERRCODE = '42501';
  END IF;
  raw_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.doctor_link_codes (doctor_id, doctor_patient_id, code_hash, expires_at)
  VALUES (auth.uid(), p_doctor_patient_id, encode(digest(raw_code, 'sha256'), 'hex'), now() + interval '7 days');
  RETURN raw_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_list_link_codes()
RETURNS TABLE(id uuid, doctor_patient_id uuid, expires_at timestamptz, redeemed_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT id, doctor_patient_id, expires_at, redeemed_at FROM public.doctor_link_codes WHERE doctor_id = auth.uid() ORDER BY created_at DESC; $$;

CREATE OR REPLACE FUNCTION public.doctor_create_prescription(p_patient_id uuid, p_items jsonb, p_valid_until date DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS public.doctor_prescriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE created public.doctor_prescriptions; next_no integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN RAISE EXCEPTION 'At least one prescription item is required' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doctor_patients WHERE id = p_patient_id AND doctor_id = auth.uid()) THEN RAISE EXCEPTION 'Patient is not in your roster' USING ERRCODE = '42501'; END IF;
  SELECT count(*) + 1 INTO next_no FROM public.doctor_prescriptions WHERE doctor_id = auth.uid();
  INSERT INTO public.doctor_prescriptions (doctor_id, doctor_patient_id, prescription_no, items, valid_until, notes)
  VALUES (auth.uid(), p_patient_id, 'RX-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(next_no::text, 4, '0'), p_items, p_valid_until, p_notes)
  RETURNING * INTO created;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_list_reports()
RETURNS SETOF public.doctor_reports
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT r.* FROM public.doctor_reports r WHERE r.doctor_id = auth.uid() ORDER BY r.report_date DESC, r.created_at DESC; $$;

CREATE OR REPLACE FUNCTION public.doctor_add_manual_report(p_patient_id uuid, p_type text, p_date date, p_flag text, p_summary text)
RETURNS public.doctor_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE created public.doctor_reports;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.doctor_reports (doctor_id, doctor_patient_id, report_type, report_date, flag, summary)
  SELECT auth.uid(), p.id, p_type, COALESCE(p_date, current_date), COALESCE(p_flag, 'normal'), p_summary
  FROM public.doctor_patients p WHERE p.id = p_patient_id AND p.doctor_id = auth.uid()
  RETURNING * INTO created;
  IF created.id IS NULL THEN RAISE EXCEPTION 'Patient is not in your roster' USING ERRCODE = '42501'; END IF;
  RETURN created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_create_link_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_doctor_link_code(text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_list_link_codes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_create_prescription(uuid, jsonb, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_list_reports() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_add_manual_report(uuid, text, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_doctor_verifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_doctor_verification(uuid, text) TO authenticated;
