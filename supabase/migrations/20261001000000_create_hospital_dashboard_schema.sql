CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.hospital_orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  patient_id_label text NOT NULL DEFAULT 'NCI Number',
  patient_id_prefix text NOT NULL DEFAULT 'NCI-',
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'suspended')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id)
);

CREATE TABLE IF NOT EXISTS public.hospital_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_role text NOT NULL CHECK (staff_role IN ('hospital_admin', 'front_desk', 'nurse', 'doctor', 'lab_tech', 'radiology_tech', 'admissions_staff')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, user_id, staff_role)
);

CREATE TABLE IF NOT EXISTS public.hospital_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  email text NOT NULL,
  staff_role text NOT NULL CHECK (staff_role IN ('hospital_admin', 'front_desk', 'nurse', 'doctor', 'lab_tech', 'radiology_tech', 'admissions_staff')),
  token text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, email, staff_role)
);

CREATE TABLE IF NOT EXISTS public.hospital_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  department_type text NOT NULL CHECK (department_type IN ('clinical', 'diagnostic')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, name)
);

CREATE TABLE IF NOT EXISTS public.hospital_doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  doctor_name text NOT NULL,
  specialty text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, doctor_name)
);

CREATE TABLE IF NOT EXISTS public.hospital_patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  patient_identifier text NOT NULL,
  name text NOT NULL,
  mobile text,
  dob date,
  age integer,
  gender text,
  patient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, patient_identifier)
);

CREATE TABLE IF NOT EXISTS public.patient_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.hospital_patients(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hospital_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid REFERENCES public.hospital_orgs(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.hospital_patients(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.create_hospital_org(
  p_name text,
  p_timezone text DEFAULT 'Asia/Kolkata',
  p_patient_id_label text DEFAULT 'NCI Number',
  p_patient_id_prefix text DEFAULT 'NCI-'
)
RETURNS public.hospital_orgs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.hospital_orgs;
BEGIN
  INSERT INTO public.hospital_orgs (name, owner_user_id, timezone, patient_id_label, patient_id_prefix, verification_status)
  VALUES (p_name, auth.uid(), p_timezone, p_patient_id_label, p_patient_id_prefix, 'pending')
  ON CONFLICT (owner_user_id) DO NOTHING
  RETURNING * INTO v_org;

  IF v_org.id IS NULL THEN
    SELECT * INTO v_org
    FROM public.hospital_orgs
    WHERE owner_user_id = auth.uid();
  END IF;

  RETURN v_org;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_hospital_patient(
  p_hospital_id uuid,
  p_identifier text,
  p_name text,
  p_mobile text DEFAULT NULL,
  p_dob date DEFAULT NULL,
  p_age integer DEFAULT NULL,
  p_gender text DEFAULT NULL
)
RETURNS public.hospital_patients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient public.hospital_patients;
BEGIN
  INSERT INTO public.hospital_patients (hospital_id, patient_identifier, name, mobile, dob, age, gender)
  VALUES (p_hospital_id, p_identifier, p_name, p_mobile, p_dob, p_age, p_gender)
  ON CONFLICT (hospital_id, patient_identifier) DO NOTHING
  RETURNING * INTO v_patient;

  IF v_patient.id IS NULL THEN
    SELECT * INTO v_patient
    FROM public.hospital_patients
    WHERE hospital_id = p_hospital_id AND patient_identifier = p_identifier;
  END IF;

  RETURN v_patient;
END;
$$;

ALTER TABLE public.hospital_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_link_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_access_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners_manage_hospital_orgs" ON public.hospital_orgs
  FOR ALL TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "members_read_hospital_orgs" ON public.hospital_orgs
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.hospital_members hm
      WHERE hm.hospital_id = public.hospital_orgs.id AND hm.user_id = auth.uid() AND hm.is_active = true
    )
  );

CREATE POLICY "members_manage_hospital_members" ON public.hospital_members
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.hospital_members owner_members
      WHERE owner_members.hospital_id = public.hospital_members.hospital_id
        AND owner_members.user_id = auth.uid()
        AND owner_members.staff_role = 'hospital_admin'
        AND owner_members.is_active = true
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hospital_members owner_members
      WHERE owner_members.hospital_id = public.hospital_members.hospital_id
        AND owner_members.user_id = auth.uid()
        AND owner_members.staff_role = 'hospital_admin'
        AND owner_members.is_active = true
    )
  );

CREATE POLICY "members_read_hospital_departments" ON public.hospital_departments
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.hospital_members hm
      WHERE hm.hospital_id = public.hospital_departments.hospital_id AND hm.user_id = auth.uid() AND hm.is_active = true
    )
  );

CREATE POLICY "members_read_hospital_doctors" ON public.hospital_doctors
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.hospital_members hm
      WHERE hm.hospital_id = public.hospital_doctors.hospital_id AND hm.user_id = auth.uid() AND hm.is_active = true
    )
  );

CREATE POLICY "members_read_hospital_patients" ON public.hospital_patients
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.hospital_members hm
      WHERE hm.hospital_id = public.hospital_patients.hospital_id AND hm.user_id = auth.uid() AND hm.is_active = true
    )
  );

CREATE POLICY "members_manage_link_codes" ON public.patient_link_codes
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.hospital_members hm
      WHERE hm.hospital_id = public.patient_link_codes.hospital_id AND hm.user_id = auth.uid() AND hm.is_active = true
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hospital_members hm
      WHERE hm.hospital_id = public.patient_link_codes.hospital_id AND hm.user_id = auth.uid() AND hm.is_active = true
    )
  );

CREATE POLICY "audit_insert_for_authenticated" ON public.hospital_access_audit
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "audit_read_own_hospital" ON public.hospital_access_audit
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.hospital_members hm
      WHERE hm.hospital_id = public.hospital_access_audit.hospital_id AND hm.user_id = auth.uid() AND hm.is_active = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_hospital_orgs_owner ON public.hospital_orgs (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_hospital_members_user ON public.hospital_members (user_id);
CREATE INDEX IF NOT EXISTS idx_hospital_patients_identifier ON public.hospital_patients (hospital_id, patient_identifier);
CREATE INDEX IF NOT EXISTS idx_hospital_patients_mobile ON public.hospital_patients (hospital_id, mobile);
CREATE INDEX IF NOT EXISTS idx_hospital_access_audit_created ON public.hospital_access_audit (created_at DESC);
