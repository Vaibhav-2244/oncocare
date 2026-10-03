-- Doctor-owned clinical records. Patient links and consent scopes are added separately.

CREATE TABLE IF NOT EXISTS public.doctor_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  duration_minutes smallint NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 240),
  visit_type text NOT NULL DEFAULT 'follow_up' CHECK (visit_type IN ('initial', 'follow_up', 'teleconsultation', 'treatment')),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE RESTRICT,
  appointment_id uuid REFERENCES public.doctor_appointments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  subjective text,
  objective text,
  assessment text,
  plan text,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE RESTRICT,
  consultation_id uuid REFERENCES public.doctor_consultations(id) ON DELETE SET NULL,
  prescription_no text NOT NULL,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'cancelled', 'expired')),
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, prescription_no)
);

CREATE TABLE IF NOT EXISTS public.doctor_treatment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE RESTRICT,
  name text NOT NULL,
  protocol text,
  cycles_total integer CHECK (cycles_total IS NULL OR cycles_total > 0),
  cycles_completed integer NOT NULL DEFAULT 0 CHECK (cycles_completed >= 0),
  progress_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'review_required', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE RESTRICT,
  report_type text NOT NULL,
  report_date date NOT NULL DEFAULT current_date,
  flag text NOT NULL DEFAULT 'normal' CHECK (flag IN ('normal', 'attention', 'critical')),
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctor_appointments_schedule ON public.doctor_appointments (doctor_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_doctor_consultations_patient ON public.doctor_consultations (doctor_id, doctor_patient_id, updated_at DESC);

ALTER TABLE public.doctor_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctor_appointments_owner ON public.doctor_appointments;
CREATE POLICY doctor_appointments_owner ON public.doctor_appointments FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_consultations_owner ON public.doctor_consultations;
CREATE POLICY doctor_consultations_owner ON public.doctor_consultations FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_prescriptions_owner ON public.doctor_prescriptions;
CREATE POLICY doctor_prescriptions_owner ON public.doctor_prescriptions FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_treatment_plans_owner ON public.doctor_treatment_plans;
CREATE POLICY doctor_treatment_plans_owner ON public.doctor_treatment_plans FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_reports_owner ON public.doctor_reports;
CREATE POLICY doctor_reports_owner ON public.doctor_reports FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.doctor_list_appointments(p_from timestamptz DEFAULT now(), p_to timestamptz DEFAULT now() + interval '30 days')
RETURNS SETOF public.doctor_appointments
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.* FROM public.doctor_appointments a
  WHERE a.doctor_id = auth.uid() AND a.starts_at >= p_from AND a.starts_at < p_to
  ORDER BY a.starts_at;
$$;

CREATE OR REPLACE FUNCTION public.doctor_create_appointment(p_patient_id uuid, p_at timestamptz, p_visit_type text DEFAULT 'follow_up', p_reason text DEFAULT NULL, p_duration smallint DEFAULT 30)
RETURNS public.doctor_appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created public.doctor_appointments;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doctor_patients WHERE id = p_patient_id AND doctor_id = auth.uid() AND status = 'active') THEN
    RAISE EXCEPTION 'Patient is not in your active roster' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.doctor_appointments WHERE doctor_id = auth.uid() AND status NOT IN ('cancelled', 'no_show') AND starts_at < p_at + make_interval(mins => p_duration) AND starts_at + make_interval(mins => duration_minutes) > p_at) THEN
    RAISE EXCEPTION 'Appointment overlaps an existing appointment' USING ERRCODE = '23P01';
  END IF;
  INSERT INTO public.doctor_appointments (doctor_id, doctor_patient_id, starts_at, visit_type, reason, duration_minutes)
  VALUES (auth.uid(), p_patient_id, p_at, p_visit_type, p_reason, p_duration)
  RETURNING * INTO created;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_list_consultations()
RETURNS SETOF public.doctor_consultations
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT c.* FROM public.doctor_consultations c WHERE c.doctor_id = auth.uid() ORDER BY c.updated_at DESC; $$;

CREATE OR REPLACE FUNCTION public.doctor_save_consultation(p_id uuid, p_patient_id uuid, p_fields jsonb)
RETURNS public.doctor_consultations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE saved public.doctor_consultations;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.doctor_consultations (doctor_id, doctor_patient_id, subjective, objective, assessment, plan)
    VALUES (auth.uid(), p_patient_id, p_fields->>'subjective', p_fields->>'objective', p_fields->>'assessment', p_fields->>'plan') RETURNING * INTO saved;
  ELSE
    UPDATE public.doctor_consultations SET subjective = p_fields->>'subjective', objective = p_fields->>'objective',
      assessment = p_fields->>'assessment', plan = p_fields->>'plan', updated_at = now()
      WHERE id = p_id AND doctor_id = auth.uid() AND status = 'draft' RETURNING * INTO saved;
  END IF;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'Draft consultation not found or is already signed'; END IF;
  RETURN saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_sign_consultation(p_id uuid)
RETURNS public.doctor_consultations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE signed public.doctor_consultations;
BEGIN
  UPDATE public.doctor_consultations SET status = 'signed', signed_at = now(), updated_at = now()
  WHERE id = p_id AND doctor_id = auth.uid() AND status = 'draft' RETURNING * INTO signed;
  IF signed.id IS NULL THEN RAISE EXCEPTION 'Only an existing draft can be signed'; END IF;
  RETURN signed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_list_appointments(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_create_appointment(uuid, timestamptz, text, text, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_list_consultations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_save_consultation(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_sign_consultation(uuid) TO authenticated;
