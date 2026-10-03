-- Immutable prescription history and security audit trail.

CREATE TABLE IF NOT EXISTS public.doctor_prescription_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES public.doctor_prescriptions(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
  notes text,
  status text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prescription_id, version)
);

CREATE TABLE IF NOT EXISTS public.doctor_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  doctor_patient_id uuid REFERENCES public.doctor_patients(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doctor_prescription_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY doctor_prescription_versions_owner ON public.doctor_prescription_versions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.doctor_prescriptions p
    WHERE p.id = prescription_id AND p.doctor_id = auth.uid()
  ));
CREATE POLICY doctor_audit_log_owner ON public.doctor_audit_log
  FOR SELECT TO authenticated USING (actor_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.doctor_amend_prescription(
  p_prescription_id uuid, p_items jsonb, p_notes text
)
RETURNS public.doctor_prescription_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prescription public.doctor_prescriptions;
  v_version public.doctor_prescription_versions;
  v_next integer;
BEGIN
  SELECT * INTO v_prescription FROM public.doctor_prescriptions
  WHERE id = p_prescription_id AND doctor_id = auth.uid() FOR UPDATE;
  IF v_prescription.id IS NULL OR v_prescription.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active prescription owned by the doctor can be amended' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Prescription items are required' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(max(version), 0) + 1 INTO v_next
  FROM public.doctor_prescription_versions WHERE prescription_id = p_prescription_id;
  INSERT INTO public.doctor_prescription_versions (prescription_id, version, items, notes, status, created_by)
  VALUES (p_prescription_id, v_next, p_items, p_notes, 'active', auth.uid())
  RETURNING * INTO v_version;
  UPDATE public.doctor_prescriptions SET items = p_items, notes = p_notes WHERE id = p_prescription_id;
  INSERT INTO public.doctor_audit_log (actor_user_id, doctor_patient_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), v_prescription.doctor_patient_id, 'prescription.amended', 'doctor_prescription', p_prescription_id, jsonb_build_object('version', v_next));
  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_record_audit(
  p_action text, p_entity_type text, p_entity_id uuid, p_doctor_patient_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.doctor_audit_log (actor_user_id, doctor_patient_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_doctor_patient_id, p_action, p_entity_type, p_entity_id, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_amend_prescription(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_record_audit(text, text, uuid, uuid, jsonb) TO authenticated;
