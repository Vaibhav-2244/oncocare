ALTER TABLE public.hospital_doctors
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS subspecialty text,
  ADD COLUMN IF NOT EXISTS qualifications text,
  ADD COLUMN IF NOT EXISTS years_experience smallint CHECK (years_experience BETWEEN 0 AND 80),
  ADD COLUMN IF NOT EXISTS employee_id text,
  ADD COLUMN IF NOT EXISTS joining_date date,
  ADD COLUMN IF NOT EXISTS employment_type text CHECK (employment_type IN ('full_time', 'part_time', 'consultant', 'visiting', 'contract')),
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active', 'on_leave', 'suspended', 'ended')),
  ADD COLUMN IF NOT EXISTS opd_room text,
  ADD COLUMN IF NOT EXISTS shift_schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS emergency_available boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS official_email text,
  ADD COLUMN IF NOT EXISTS official_phone text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'submitted', 'verified', 'rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS hospital_doctors_employee_id_unique
  ON public.hospital_doctors (hospital_id, lower(employee_id))
  WHERE employee_id IS NOT NULL;

ALTER TABLE public.hospital_doctors
  DROP CONSTRAINT IF EXISTS hospital_doctors_hospital_id_doctor_name_key;

ALTER TABLE public.hospital_doctors
  ADD CONSTRAINT hospital_doctors_hospital_id_id_unique UNIQUE (hospital_id, id);
ALTER TABLE public.hospital_departments
  ADD CONSTRAINT hospital_departments_hospital_id_id_unique UNIQUE (hospital_id, id);
ALTER TABLE public.hospital_members
  ADD CONSTRAINT hospital_members_hospital_user_role_unique UNIQUE (hospital_id, user_id, staff_role);

CREATE TABLE IF NOT EXISTS public.hospital_doctor_care_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL,
  staff_user_id uuid NOT NULL,
  staff_role text NOT NULL,
  department_id uuid,
  department_scope_id uuid GENERATED ALWAYS AS (
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hospital_doctor_care_team_doctor_fk
    FOREIGN KEY (hospital_id, doctor_id)
    REFERENCES public.hospital_doctors(hospital_id, id) ON DELETE CASCADE,
  CONSTRAINT hospital_doctor_care_team_staff_fk
    FOREIGN KEY (hospital_id, staff_user_id, staff_role)
    REFERENCES public.hospital_members(hospital_id, user_id, staff_role) ON DELETE CASCADE,
  CONSTRAINT hospital_doctor_care_team_department_fk
    FOREIGN KEY (hospital_id, department_id)
    REFERENCES public.hospital_departments(hospital_id, id) ON DELETE CASCADE,
  CONSTRAINT hospital_doctor_care_team_role_check
    CHECK (staff_role IN ('nurse', 'front_desk', 'lab_tech', 'radiology_tech', 'admissions_staff', 'care_coordinator')),
  UNIQUE (hospital_id, doctor_id, staff_user_id, department_scope_id)
);

CREATE INDEX IF NOT EXISTS idx_doctor_care_assignments_doctor
  ON public.hospital_doctor_care_team_assignments (hospital_id, doctor_id, staff_role);
CREATE INDEX IF NOT EXISTS idx_doctor_care_assignments_staff
  ON public.hospital_doctor_care_team_assignments (hospital_id, staff_user_id);

ALTER TABLE public.hospital_doctor_care_team_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hospital_doctor_care_team_read ON public.hospital_doctor_care_team_assignments;
CREATE POLICY hospital_doctor_care_team_read
  ON public.hospital_doctor_care_team_assignments
  FOR SELECT TO authenticated
  USING (
    public.hospital_has_cap(hospital_id, 'staff.manage')
    OR staff_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.hospital_doctors d
      JOIN public.hospital_members hm
        ON hm.hospital_id = d.hospital_id
       AND hm.user_id = d.user_id
       AND hm.staff_role = 'doctor'
       AND hm.is_active
      WHERE d.id = hospital_doctor_care_team_assignments.doctor_id
        AND d.hospital_id = hospital_doctor_care_team_assignments.hospital_id
        AND d.user_id = auth.uid()
        AND d.is_active
    )
  );
REVOKE ALL ON public.hospital_doctor_care_team_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hospital_doctor_care_team_assignments TO authenticated;

CREATE OR REPLACE FUNCTION public.doctor_hospital_can_read_record(p_hospital_id uuid, p_doctor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.hospital_doctors d
    JOIN public.hospital_members hm
      ON hm.hospital_id = d.hospital_id
     AND hm.user_id = d.user_id
     AND hm.staff_role = 'doctor'
     AND hm.is_active
    WHERE d.hospital_id = p_hospital_id
     AND d.id = p_doctor_id
      AND d.is_active
      AND (
       d.user_id = auth.uid()
       OR EXISTS (
         SELECT 1
         FROM public.hospital_doctor_care_team_assignments ca
         JOIN public.hospital_members staff
           ON staff.hospital_id = ca.hospital_id
          AND staff.user_id = ca.staff_user_id
          AND staff.staff_role = ca.staff_role
          AND staff.is_active
         WHERE ca.hospital_id = d.hospital_id
           AND ca.doctor_id = d.id
           AND ca.staff_user_id = auth.uid()
       )
     )
  );
$$;

CREATE OR REPLACE FUNCTION public.doctor_hospital_can_read_patient(p_hospital_id uuid, p_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hospital_appointments a
    WHERE a.hospital_id = p_hospital_id AND a.patient_id = p_patient_id
     AND public.doctor_hospital_can_read_record(a.hospital_id, a.doctor_id)
    UNION ALL
    SELECT 1 FROM public.consultations c
    WHERE c.hospital_id = p_hospital_id AND c.patient_id = p_patient_id
     AND public.doctor_hospital_can_read_record(c.hospital_id, c.doctor_id)
    UNION ALL
    SELECT 1 FROM public.investigation_orders io
    WHERE io.hospital_id = p_hospital_id AND io.patient_id = p_patient_id
     AND public.doctor_hospital_can_read_record(io.hospital_id, io.ordered_by_doctor_id)
    UNION ALL
    SELECT 1 FROM public.hospital_admissions ha
    WHERE ha.hospital_id = p_hospital_id AND ha.patient_id = p_patient_id
     AND public.doctor_hospital_can_read_record(ha.hospital_id, ha.admitting_doctor_id)
    UNION ALL
    SELECT 1
    FROM public.hospital_patients hp
    JOIN public.doctor_patients dp ON dp.patient_user_id = hp.patient_user_id
    JOIN public.hospital_doctors d ON d.hospital_id = hp.hospital_id AND d.user_id = auth.uid() AND d.is_active
    JOIN public.hospital_members hm ON hm.hospital_id = d.hospital_id AND hm.user_id = d.user_id
      AND hm.staff_role = 'doctor' AND hm.is_active
    WHERE hp.hospital_id = p_hospital_id
     AND hp.id = p_patient_id
     AND dp.doctor_id = auth.uid()
     AND dp.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.doctor_hospital_profile()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'hospital_id', h.id,
      'hospital_name', h.name,
      'doctor_row_id', d.id,
      'doctor_identifier', d.doctor_identifier,
      'employee_id', d.employee_id,
      'full_name', d.doctor_name,
      'designation', d.designation,
      'specialty', d.specialty,
      'subspecialty', d.subspecialty,
      'qualifications', d.qualifications,
      'registration_no', d.registration_no,
      'registration_council', d.registration_council,
      'years_experience', d.years_experience,
      'department', dep.name,
      'joining_date', d.joining_date,
      'employment_type', d.employment_type,
      'employment_status', d.employment_status,
      'opd_room', d.opd_room,
      'shift_schedule', d.shift_schedule,
      'emergency_available', d.emergency_available,
      'official_email', d.official_email,
      'official_phone', d.official_phone,
      'verification_status', COALESCE(d.verification_status, dp.verification_status),
      'is_active', d.is_active,
      'care_team', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'assignment_id', ca.id,
          'user_id', ca.staff_user_id,
          'name', COALESCE(NULLIF(p.full_name, ''), u.email),
          'email', u.email,
          'role', ca.staff_role,
          'department', cdep.name
        ) ORDER BY ca.staff_role, p.full_name)
        FROM public.hospital_doctor_care_team_assignments ca
        JOIN public.hospital_members hm ON hm.hospital_id = ca.hospital_id AND hm.user_id = ca.staff_user_id AND hm.staff_role = ca.staff_role AND hm.is_active
        JOIN auth.users u ON u.id = ca.staff_user_id
        LEFT JOIN public.profiles p ON p.id = u.id
        LEFT JOIN public.hospital_departments cdep ON cdep.id = ca.department_id
        WHERE ca.hospital_id = d.hospital_id AND ca.doctor_id = d.id
      ), '[]'::jsonb)
    ) ORDER BY h.name
  ), '[]'::jsonb)
  INTO v_result
  FROM public.hospital_doctors d
  JOIN public.hospital_orgs h ON h.id = d.hospital_id
  JOIN public.hospital_members hm ON hm.hospital_id = d.hospital_id AND hm.user_id = d.user_id AND hm.staff_role = 'doctor' AND hm.is_active
  LEFT JOIN public.hospital_departments dep ON dep.id = d.department_id
  LEFT JOIN public.doctor_profiles dp ON dp.user_id = d.user_id
  WHERE d.user_id = auth.uid() AND d.is_active;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_hospital_doctor_care_team_assignment(
  p_hospital_id uuid,
  p_doctor_id uuid,
  p_staff_user_id uuid,
  p_staff_role text,
  p_department_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.hospital_has_cap(p_hospital_id, 'staff.manage') THEN
    RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF p_staff_role NOT IN ('nurse', 'front_desk', 'lab_tech', 'radiology_tech', 'admissions_staff', 'care_coordinator') THEN
    RAISE EXCEPTION 'Unsupported care team role' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hospital_doctors d
    WHERE d.id = p_doctor_id AND d.hospital_id = p_hospital_id AND d.user_id IS NOT NULL AND d.is_active
  ) THEN
    RAISE EXCEPTION 'Active hospital doctor not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hospital_members m
    WHERE m.hospital_id = p_hospital_id AND m.user_id = p_staff_user_id
      AND m.staff_role = p_staff_role AND m.is_active
  ) THEN
    RAISE EXCEPTION 'Active staff membership not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hospital_departments dep
    WHERE dep.id = p_department_id AND dep.hospital_id = p_hospital_id AND dep.is_active
  ) THEN
    RAISE EXCEPTION 'Department does not belong to this hospital' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.hospital_doctor_care_team_assignments
    (hospital_id, doctor_id, staff_user_id, staff_role, department_id, assigned_by)
  VALUES (p_hospital_id, p_doctor_id, p_staff_user_id, p_staff_role, p_department_id, auth.uid())
  ON CONFLICT (hospital_id, doctor_id, staff_user_id, department_scope_id)
  DO UPDATE SET staff_role = EXCLUDED.staff_role, assigned_by = auth.uid()
  RETURNING id INTO v_id;

  INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
  VALUES (p_hospital_id, auth.uid(), 'doctor.care_team_assigned',
    jsonb_build_object('doctor_id', p_doctor_id, 'staff_user_id', p_staff_user_id, 'staff_role', p_staff_role, 'department_id', p_department_id));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_hospital_doctor_care_team_assignment(
  p_hospital_id uuid,
  p_assignment_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.hospital_doctor_care_team_assignments;
BEGIN
  IF auth.uid() IS NULL OR NOT public.hospital_has_cap(p_hospital_id, 'staff.manage') THEN
    RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.hospital_doctor_care_team_assignments
  WHERE id = p_assignment_id AND hospital_id = p_hospital_id
  RETURNING * INTO v_assignment;
  IF v_assignment.id IS NULL THEN RETURN false; END IF;
  INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
  VALUES (p_hospital_id, auth.uid(), 'doctor.care_team_unassigned',
    jsonb_build_object('doctor_id', v_assignment.doctor_id, 'staff_user_id', v_assignment.staff_user_id, 'assignment_id', v_assignment.id));
  RETURN true;
END;
$$;

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
AS $$
BEGIN
  RAISE EXCEPTION 'Use the hospital-managed doctor account workflow' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_hospital_doctor_active(
  p_hospital_id uuid,
  p_doctor_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Use the hospital-managed doctor account workflow' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_hospital_staff(p_hospital_id uuid, p_email text, p_staff_role text)
RETURNS public.hospital_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.hospital_invites;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'staff.manage') THEN
    RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF p_staff_role = 'doctor' THEN
    RAISE EXCEPTION 'Doctors must be created through the hospital-managed doctor account workflow' USING ERRCODE = '22023';
  END IF;
  IF p_staff_role NOT IN ('hospital_admin', 'front_desk', 'nurse', 'lab_tech', 'radiology_tech', 'admissions_staff', 'care_coordinator') THEN
    RAISE EXCEPTION 'Invalid hospital staff role' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_email), '') IS NULL OR position('@' IN p_email) < 2 THEN
    RAISE EXCEPTION 'A valid email is required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hospital_invites (hospital_id, email, staff_role, token, expires_at, accepted_at)
  VALUES (p_hospital_id, lower(btrim(p_email)), p_staff_role, gen_random_uuid()::text, now() + interval '7 days', NULL)
  ON CONFLICT (hospital_id, email, staff_role)
  DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, accepted_at = NULL
  RETURNING * INTO v_invite;
  INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
  VALUES (p_hospital_id, auth.uid(), 'staff.invited', jsonb_build_object('email', lower(btrim(p_email)), 'role', p_staff_role));
  RETURN v_invite;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_doctor_hospital_workspace()
RETURNS public.hospital_orgs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.hospital_orgs;
  v_profile public.doctor_profiles;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_profile FROM public.doctor_profiles WHERE user_id = auth.uid();
  IF v_profile.user_id IS NULL OR v_profile.verification_status = 'rejected' THEN
    RAISE EXCEPTION 'Doctor profile is not eligible for hospital workspace access' USING ERRCODE = '42501';
  END IF;
  SELECT h.* INTO v_org
  FROM public.hospital_orgs h
  JOIN public.hospital_members hm ON hm.hospital_id = h.id
  JOIN public.hospital_doctors d ON d.hospital_id = h.id AND d.user_id = hm.user_id
  WHERE hm.user_id = auth.uid()
    AND hm.staff_role = 'doctor'
    AND hm.is_active
    AND d.is_active
  ORDER BY hm.created_at, h.created_at
  LIMIT 1;
  RETURN v_org;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_hospital_doctor_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.hospital_doctors
  SET verification_status = NEW.verification_status
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_hospital_doctor_verification_status ON public.doctor_profiles;
CREATE TRIGGER trg_sync_hospital_doctor_verification_status
AFTER INSERT OR UPDATE OF verification_status ON public.doctor_profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_hospital_doctor_verification_status();

ALTER TABLE public.hospital_members
  DROP CONSTRAINT IF EXISTS hospital_members_staff_role_check;
ALTER TABLE public.hospital_members
  ADD CONSTRAINT hospital_members_staff_role_check
  CHECK (staff_role IN ('hospital_admin', 'front_desk', 'nurse', 'doctor', 'lab_tech', 'radiology_tech', 'admissions_staff', 'care_coordinator'));
ALTER TABLE public.hospital_invites
  DROP CONSTRAINT IF EXISTS hospital_invites_staff_role_check;
ALTER TABLE public.hospital_invites
  ADD CONSTRAINT hospital_invites_staff_role_check
  CHECK (staff_role IN ('hospital_admin', 'front_desk', 'nurse', 'doctor', 'lab_tech', 'radiology_tech', 'admissions_staff', 'care_coordinator'));

CREATE OR REPLACE FUNCTION public.hospital_role_can(p_role text, p_cap text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_cap
    WHEN 'patients.read' THEN p_role = ANY (ARRAY['hospital_admin', 'front_desk', 'nurse', 'doctor', 'admissions_staff', 'lab_tech', 'radiology_tech', 'care_coordinator'])
    WHEN 'patients.register' THEN p_role = ANY (ARRAY['hospital_admin', 'front_desk', 'nurse', 'admissions_staff', 'care_coordinator'])
    WHEN 'queue.manage' THEN p_role = ANY (ARRAY['hospital_admin', 'front_desk', 'nurse', 'doctor', 'care_coordinator'])
    WHEN 'clinical.read' THEN p_role = ANY (ARRAY['hospital_admin', 'nurse', 'doctor'])
    WHEN 'clinical.write' THEN p_role = 'doctor'
    WHEN 'orders.create' THEN p_role = 'doctor'
    WHEN 'orders.pipeline' THEN p_role = ANY (ARRAY['hospital_admin', 'lab_tech', 'radiology_tech'])
    WHEN 'config.manage' THEN p_role = 'hospital_admin'
    WHEN 'admissions.manage' THEN p_role = ANY (ARRAY['hospital_admin', 'admissions_staff'])
    WHEN 'admissions.read' THEN p_role = ANY (ARRAY['hospital_admin', 'admissions_staff', 'nurse', 'doctor'])
    WHEN 'staff.manage' THEN p_role = 'hospital_admin'
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.hospital_has_cap(p_hospital_id uuid, p_cap text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.hospital_members hm
    WHERE hm.hospital_id = p_hospital_id
      AND hm.user_id = auth.uid()
      AND hm.is_active
      AND public.hospital_role_can(hm.staff_role, p_cap)
      AND (p_cap NOT IN ('patients.read', 'clinical.read') OR hm.staff_role <> 'doctor')
  );
$$;

CREATE OR REPLACE FUNCTION public.guard_hospital_doctor_clinical_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_id uuid;
  v_related_doctor_id uuid;
  v_patient_id uuid;
  v_hospital_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.hospital_members
    WHERE hospital_id = NEW.hospital_id AND user_id = auth.uid()
      AND staff_role = 'doctor' AND is_active
  ) THEN
    RETURN NEW;
  END IF;
  SELECT d.id INTO v_doctor_id
  FROM public.hospital_doctors d
  WHERE d.hospital_id = NEW.hospital_id AND d.user_id = auth.uid() AND d.is_active;
  IF v_doctor_id IS NULL THEN
    RAISE EXCEPTION 'Active doctor profile required' USING ERRCODE = '42501';
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'hospital_appointments' THEN
      IF NEW.doctor_id IS DISTINCT FROM v_doctor_id OR NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Doctor appointments must belong to the authenticated doctor and their assigned patient' USING ERRCODE = '42501';
      END IF;
    WHEN 'hospital_visits' THEN
      IF NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Doctors may only check in their assigned patients' USING ERRCODE = '42501';
      END IF;
    WHEN 'opd_sessions' THEN
      IF NEW.doctor_id IS DISTINCT FROM v_doctor_id THEN
        RAISE EXCEPTION 'Doctors may only manage their own OPD sessions' USING ERRCODE = '42501';
      END IF;
    WHEN 'consultations' THEN
      IF NEW.doctor_id IS DISTINCT FROM v_doctor_id OR NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Consultations must belong to the authenticated doctor and their assigned patient' USING ERRCODE = '42501';
      END IF;
      IF NEW.session_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.opd_sessions s
        WHERE s.id = NEW.session_id AND s.hospital_id = NEW.hospital_id AND s.doctor_id = v_doctor_id
      ) THEN
        RAISE EXCEPTION 'Consultation session is not owned by the authenticated doctor' USING ERRCODE = '42501';
      END IF;
      IF NEW.queue_entry_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.queue_entries q
        JOIN public.opd_sessions s ON s.id = q.session_id AND s.doctor_id = v_doctor_id
        WHERE q.id = NEW.queue_entry_id AND q.hospital_id = NEW.hospital_id
          AND q.patient_id = NEW.patient_id AND (NEW.session_id IS NULL OR q.session_id = NEW.session_id)
      ) THEN
        RAISE EXCEPTION 'Consultation queue entry does not match its patient and session' USING ERRCODE = '42501';
      END IF;
    WHEN 'prescriptions' THEN
      SELECT c.doctor_id INTO v_related_doctor_id FROM public.consultations c
      WHERE c.id = NEW.consultation_id AND c.hospital_id = NEW.hospital_id AND c.patient_id = NEW.patient_id;
      IF NEW.doctor_id IS DISTINCT FROM v_doctor_id OR v_related_doctor_id IS DISTINCT FROM v_doctor_id
        OR NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Prescriptions must belong to the authenticated doctor''s consultation' USING ERRCODE = '42501';
      END IF;
    WHEN 'referrals' THEN
      IF NEW.from_doctor_id IS DISTINCT FROM v_doctor_id OR NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Referrals must originate from the authenticated doctor for an assigned patient' USING ERRCODE = '42501';
      END IF;
      IF NEW.from_consultation_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.consultations c WHERE c.id = NEW.from_consultation_id
          AND c.hospital_id = NEW.hospital_id AND c.patient_id = NEW.patient_id AND c.doctor_id = v_doctor_id
      ) THEN
        RAISE EXCEPTION 'Referral source is not the authenticated doctor''s consultation' USING ERRCODE = '42501';
      END IF;
      IF NEW.to_doctor_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.hospital_doctors d
        WHERE d.id = NEW.to_doctor_id AND d.hospital_id = NEW.hospital_id AND d.is_active
      ) THEN
        RAISE EXCEPTION 'Referral destination must be an active doctor in this hospital' USING ERRCODE = '42501';
      END IF;
    WHEN 'follow_ups' THEN
      SELECT c.doctor_id INTO v_related_doctor_id FROM public.consultations c
      WHERE c.id = NEW.consultation_id AND c.hospital_id = NEW.hospital_id AND c.patient_id = NEW.patient_id;
      IF v_related_doctor_id IS DISTINCT FROM v_doctor_id OR NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Follow-ups must belong to the authenticated doctor''s consultation' USING ERRCODE = '42501';
      END IF;
    WHEN 'queue_entries' THEN
      SELECT s.doctor_id INTO v_related_doctor_id FROM public.opd_sessions s
      WHERE s.id = NEW.session_id AND s.hospital_id = NEW.hospital_id;
      IF v_related_doctor_id IS DISTINCT FROM v_doctor_id OR NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Queue entries must belong to the authenticated doctor''s session and assigned patient' USING ERRCODE = '42501';
      END IF;
      IF NEW.appointment_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.hospital_appointments a
        WHERE a.id = NEW.appointment_id AND a.hospital_id = NEW.hospital_id
          AND a.patient_id = NEW.patient_id AND a.doctor_id = v_doctor_id
      ) THEN
        RAISE EXCEPTION 'Queue appointment must match the authenticated doctor and patient' USING ERRCODE = '42501';
      END IF;
      IF NEW.visit_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.hospital_visits v
        WHERE v.id = NEW.visit_id AND v.hospital_id = NEW.hospital_id AND v.patient_id = NEW.patient_id
      ) THEN
        RAISE EXCEPTION 'Queue visit must match the patient and hospital' USING ERRCODE = '42501';
      END IF;
    WHEN 'investigation_orders' THEN
      IF NEW.ordered_by_doctor_id IS DISTINCT FROM v_doctor_id OR NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Investigation orders must belong to the authenticated doctor and an assigned patient' USING ERRCODE = '42501';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.investigation_types t
        WHERE t.id = NEW.type_id AND t.hospital_id = NEW.hospital_id AND t.is_active
      ) THEN
        RAISE EXCEPTION 'Investigation type must be active in this hospital' USING ERRCODE = '42501';
      END IF;
      IF NEW.consultation_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.consultations c WHERE c.id = NEW.consultation_id
          AND c.hospital_id = NEW.hospital_id AND c.patient_id = NEW.patient_id AND c.doctor_id = v_doctor_id
      ) THEN
        RAISE EXCEPTION 'Investigation consultation is not owned by the authenticated doctor' USING ERRCODE = '42501';
      END IF;
    WHEN 'hospital_admissions' THEN
      IF NEW.admitting_doctor_id IS DISTINCT FROM v_doctor_id OR NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Admissions must belong to the authenticated doctor and an assigned patient' USING ERRCODE = '42501';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.hospital_wards w
        JOIN public.hospital_beds b ON b.ward_id = w.id AND b.hospital_id = w.hospital_id
        WHERE w.id = NEW.ward_id AND w.hospital_id = NEW.hospital_id
          AND b.id = NEW.bed_id AND b.status = 'available'
      ) THEN
        RAISE EXCEPTION 'Admission bed must be available in this hospital' USING ERRCODE = '42501';
      END IF;
    WHEN 'prescription_items' THEN
      SELECT p.doctor_id, p.hospital_id INTO v_related_doctor_id, v_hospital_id
      FROM public.prescriptions p WHERE p.id = NEW.prescription_id;
      IF v_related_doctor_id IS DISTINCT FROM v_doctor_id OR v_hospital_id IS DISTINCT FROM NEW.hospital_id THEN
        RAISE EXCEPTION 'Prescription items must belong to the authenticated doctor''s prescription' USING ERRCODE = '42501';
      END IF;
    ELSE
      RETURN NEW;
  END CASE;

  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'hospital_visits' AND NOT public.doctor_hospital_can_read_patient(OLD.hospital_id, OLD.patient_id)
      OR TG_TABLE_NAME = 'consultations' AND OLD.doctor_id IS DISTINCT FROM v_doctor_id
      OR TG_TABLE_NAME = 'prescriptions' AND OLD.doctor_id IS DISTINCT FROM v_doctor_id
      OR TG_TABLE_NAME = 'hospital_appointments' AND OLD.doctor_id IS DISTINCT FROM v_doctor_id
      OR TG_TABLE_NAME = 'opd_sessions' AND OLD.doctor_id IS DISTINCT FROM v_doctor_id
      OR TG_TABLE_NAME = 'referrals' AND OLD.from_doctor_id IS DISTINCT FROM v_doctor_id
      OR TG_TABLE_NAME = 'investigation_orders' AND OLD.ordered_by_doctor_id IS DISTINCT FROM v_doctor_id
      OR TG_TABLE_NAME = 'hospital_admissions' AND OLD.admitting_doctor_id IS DISTINCT FROM v_doctor_id
      THEN
      RAISE EXCEPTION 'Doctors may only update their own clinical records' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_doctor_hospital_appointments ON public.hospital_appointments;
CREATE TRIGGER guard_doctor_hospital_appointments BEFORE INSERT OR UPDATE ON public.hospital_appointments
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_hospital_visits ON public.hospital_visits;
CREATE TRIGGER guard_doctor_hospital_visits BEFORE INSERT OR UPDATE ON public.hospital_visits
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_opd_sessions ON public.opd_sessions;
CREATE TRIGGER guard_doctor_opd_sessions BEFORE INSERT OR UPDATE ON public.opd_sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_consultations ON public.consultations;
CREATE TRIGGER guard_doctor_consultations BEFORE INSERT OR UPDATE ON public.consultations
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_prescriptions ON public.prescriptions;
CREATE TRIGGER guard_doctor_prescriptions BEFORE INSERT OR UPDATE ON public.prescriptions
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_prescription_items ON public.prescription_items;
CREATE TRIGGER guard_doctor_prescription_items BEFORE INSERT OR UPDATE ON public.prescription_items
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_referrals ON public.referrals;
CREATE TRIGGER guard_doctor_referrals BEFORE INSERT OR UPDATE ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_follow_ups ON public.follow_ups;
CREATE TRIGGER guard_doctor_follow_ups BEFORE INSERT OR UPDATE ON public.follow_ups
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_queue_entries ON public.queue_entries;
CREATE TRIGGER guard_doctor_queue_entries BEFORE INSERT OR UPDATE ON public.queue_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_investigation_orders ON public.investigation_orders;
CREATE TRIGGER guard_doctor_investigation_orders BEFORE INSERT OR UPDATE ON public.investigation_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_admissions ON public.hospital_admissions;
CREATE TRIGGER guard_doctor_admissions BEFORE INSERT OR UPDATE ON public.hospital_admissions
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
REVOKE ALL ON FUNCTION public.guard_hospital_doctor_clinical_write() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_consultation_context(p_hospital_id uuid, p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient public.hospital_patients;
  v_consultations jsonb;
  v_prescriptions jsonb;
  v_followups jsonb;
  v_hospital_wide boolean;
BEGIN
  v_hospital_wide := public.hospital_has_cap(p_hospital_id, 'clinical.read');
  IF NOT v_hospital_wide AND NOT public.doctor_hospital_can_read_patient(p_hospital_id, p_patient_id) THEN
    RAISE EXCEPTION 'Clinical access to this patient is not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_patient
  FROM public.hospital_patients
  WHERE id = p_patient_id AND hospital_id = p_hospital_id;
  IF v_patient.id IS NULL THEN
    RAISE EXCEPTION 'Patient not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
  INTO v_consultations
  FROM public.consultations c
  WHERE c.hospital_id = p_hospital_id AND c.patient_id = p_patient_id
    AND (v_hospital_wide OR public.doctor_hospital_can_read_record(c.hospital_id, c.doctor_id));

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC), '[]'::jsonb)
  INTO v_prescriptions
  FROM public.prescriptions p
  WHERE p.hospital_id = p_hospital_id AND p.patient_id = p_patient_id
    AND (v_hospital_wide OR public.doctor_hospital_can_read_record(p.hospital_id, p.doctor_id));

  SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.due_date ASC), '[]'::jsonb)
  INTO v_followups
  FROM public.follow_ups f
  JOIN public.consultations c ON c.id = f.consultation_id
  WHERE f.hospital_id = p_hospital_id AND f.patient_id = p_patient_id
    AND (v_hospital_wide OR public.doctor_hospital_can_read_record(c.hospital_id, c.doctor_id));

  RETURN jsonb_build_object(
    'patient', to_jsonb(v_patient),
    'consultations', v_consultations,
    'prescriptions', v_prescriptions,
    'follow_ups', v_followups
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_today_sessions(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_id uuid;
BEGIN
  SELECT d.id INTO v_doctor_id
  FROM public.hospital_doctors d
  JOIN public.hospital_members hm ON hm.hospital_id = d.hospital_id
    AND hm.user_id = d.user_id AND hm.staff_role = 'doctor' AND hm.is_active
  WHERE d.hospital_id = p_hospital_id AND d.user_id = auth.uid() AND d.is_active;

  IF v_doctor_id IS NULL AND NOT public.hospital_has_cap(p_hospital_id, 'patients.read') THEN
    RAISE EXCEPTION 'patients.read capability required' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'session_id', s.id,
      'doctor', d.doctor_name,
      'department', dep.name,
      'room', s.room,
      'status', s.status,
      'serving_token', (SELECT q.token_number FROM public.queue_entries q WHERE q.session_id = s.id AND q.status = 'in_consultation' ORDER BY q.token_number LIMIT 1),
      'next_token', (SELECT q.token_number FROM public.queue_entries q WHERE q.session_id = s.id AND q.status = 'waiting' ORDER BY q.priority_rank, q.token_number LIMIT 1),
      'waiting', (SELECT count(*) FROM public.queue_entries q WHERE q.session_id = s.id AND q.status = 'waiting'),
      'completed', (SELECT count(*) FROM public.queue_entries q WHERE q.session_id = s.id AND q.status = 'completed'),
      'delay_flag', s.delay_note IS NOT NULL
    ) ORDER BY s.start_time)
    FROM public.opd_sessions s
    JOIN public.hospital_doctors d ON d.id = s.doctor_id
    LEFT JOIN public.hospital_departments dep ON dep.id = s.department_id
    WHERE s.hospital_id = p_hospital_id
      AND s.session_date = public.hospital_today(p_hospital_id)
      AND (v_doctor_id IS NULL OR s.doctor_id = v_doctor_id)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_queue_state(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.opd_sessions;
  v_result jsonb;
  v_doctor_id uuid;
BEGIN
  SELECT * INTO v_session FROM public.opd_sessions WHERE id = p_session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'OPD session not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT d.id INTO v_doctor_id
  FROM public.hospital_doctors d
  JOIN public.hospital_members hm ON hm.hospital_id = d.hospital_id
    AND hm.user_id = d.user_id AND hm.staff_role = 'doctor' AND hm.is_active
  WHERE d.hospital_id = v_session.hospital_id AND d.user_id = auth.uid() AND d.is_active;
  IF (v_doctor_id IS NULL AND NOT public.hospital_has_cap(v_session.hospital_id, 'patients.read'))
    OR (v_doctor_id IS NOT NULL AND v_session.doctor_id IS DISTINCT FROM v_doctor_id) THEN
    RAISE EXCEPTION 'Access to this OPD session is not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'session', jsonb_build_object('id', v_session.id, 'doctor', d.doctor_name, 'department', dep.name,
      'room', v_session.room, 'status', v_session.status, 'delay_note', v_session.delay_note, 'last_token', v_session.last_token),
    'serving', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', q.id, 'token', q.token_number, 'patient', p.name, 'status', q.status) ORDER BY q.token_number)
      FROM public.queue_entries q JOIN public.hospital_patients p ON p.id = q.patient_id
      WHERE q.session_id = p_session_id AND q.status IN ('called', 'in_consultation')), '[]'::jsonb),
    'next_token', (SELECT q.token_number FROM public.queue_entries q WHERE q.session_id = p_session_id AND q.status = 'waiting' ORDER BY q.priority_rank, q.token_number LIMIT 1),
    'waiting_count', (SELECT count(*) FROM public.queue_entries q WHERE q.session_id = p_session_id AND q.status = 'waiting'),
    'completed_today', (SELECT count(*) FROM public.queue_entries q WHERE q.session_id = p_session_id AND q.status = 'completed'),
    'avg_consult_min', (SELECT avg(extract(epoch FROM (completed_at - started_at)) / 60) FROM public.queue_entries q
      WHERE q.session_id = p_session_id AND q.status = 'completed' AND started_at IS NOT NULL),
    'entries', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', q.id, 'token', q.token_number, 'patient', p.name, 'identifier', p.patient_identifier,
      'priority', q.priority_rank, 'priority_reason', q.priority_reason, 'status', q.status,
      'joined_at', q.joined_at, 'called_at', q.called_at,
      'patients_ahead', (SELECT count(*) FROM public.queue_entries a WHERE a.session_id = q.session_id
        AND a.status IN ('waiting', 'called', 'in_consultation') AND (a.priority_rank, a.token_number) < (q.priority_rank, q.token_number)),
      'est_low', q.est_wait_low_min, 'est_high', q.est_wait_high_min, 'is_walk_in', q.is_walk_in
    ) ORDER BY CASE WHEN q.status = 'completed' THEN 1 ELSE 0 END, q.priority_rank, q.token_number)
      FROM (
        SELECT * FROM public.queue_entries WHERE session_id = p_session_id AND status IN ('waiting', 'called', 'in_consultation')
        UNION ALL
        SELECT recent.* FROM (SELECT * FROM public.queue_entries WHERE session_id = p_session_id AND status = 'completed' ORDER BY completed_at DESC LIMIT 10) recent
      ) q JOIN public.hospital_patients p ON p.id = q.patient_id), '[]'::jsonb)
  ) INTO v_result
  FROM public.hospital_doctors d
  LEFT JOIN public.hospital_departments dep ON dep.id = d.department_id
  WHERE d.id = v_session.doctor_id;

  INSERT INTO public.hospital_access_audit(hospital_id, actor_user_id, action, details)
  VALUES (v_session.hospital_id, auth.uid(), 'queue.state_read', jsonb_build_object('session_id', p_session_id));
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_hospital_patients(
  p_hospital_id uuid,
  p_query text,
  p_limit integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_norm text;
  v_digits text;
  v_result jsonb;
  v_doctor_id uuid;
BEGIN
  SELECT d.id INTO v_doctor_id
  FROM public.hospital_doctors d
  JOIN public.hospital_members hm ON hm.hospital_id = d.hospital_id
    AND hm.user_id = d.user_id AND hm.staff_role = 'doctor' AND hm.is_active
  WHERE d.hospital_id = p_hospital_id AND d.user_id = auth.uid() AND d.is_active;
  IF v_doctor_id IS NULL AND NOT public.hospital_has_cap(p_hospital_id, 'patients.read') THEN
    RAISE EXCEPTION 'patients.read capability required' USING ERRCODE = '42501';
  END IF;

  v_norm := public.hospital_normalize_id(p_hospital_id, v_query);
  v_digits := regexp_replace(COALESCE(v_query, ''), '[^0-9]', '', 'g');
  SELECT jsonb_build_object(
    'patients', COALESCE((
      SELECT jsonb_agg(patient_json ORDER BY result_rank, name_similarity DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', p.id, 'identifier', p.patient_identifier, 'name', p.name, 'age', p.age, 'gender', p.gender,
          'mobile_masked', CASE WHEN p.mobile IS NULL THEN NULL ELSE repeat('X', greatest(length(p.mobile) - 4, 0)) || right(p.mobile, 4) END,
          'today_status', qe.status, 'token', qe.token_number
        ) AS patient_json,
        CASE WHEN p.normalized_identifier = v_norm THEN 0
          WHEN v_digits <> '' AND regexp_replace(COALESCE(p.mobile, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%' THEN 1
          ELSE 2 END AS result_rank,
        similarity(p.name, COALESCE(v_query, '')) AS name_similarity,
        p.name
        FROM public.hospital_patients p
        LEFT JOIN LATERAL (
          SELECT q.status, q.token_number FROM public.queue_entries q
          JOIN public.opd_sessions s ON s.id = q.session_id
          WHERE q.hospital_id = p_hospital_id AND q.patient_id = p.id
            AND s.session_date = public.hospital_today(p_hospital_id)
            AND (v_doctor_id IS NULL OR s.doctor_id = v_doctor_id)
          ORDER BY q.created_at DESC LIMIT 1
        ) qe ON true
        WHERE p.hospital_id = p_hospital_id
          AND (v_doctor_id IS NULL OR public.doctor_hospital_can_read_patient(p_hospital_id, p.id))
          AND (v_query IS NULL OR p.normalized_identifier = v_norm
            OR (v_digits <> '' AND regexp_replace(COALESCE(p.mobile, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%')
            OR p.name % v_query OR p.name ILIKE '%' || v_query || '%')
        ORDER BY result_rank, name_similarity DESC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 50))
      ) result_rows
    ), '[]'::jsonb),
    'doctors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.doctor_name, 'department', dep.name))
      FROM public.hospital_doctors d
      LEFT JOIN public.hospital_departments dep ON dep.id = d.department_id
      WHERE d.hospital_id = p_hospital_id AND d.is_active
        AND (v_doctor_id IS NULL OR d.id = v_doctor_id)
        AND (v_query IS NULL OR d.doctor_name ILIKE '%' || v_query || '%' OR dep.name ILIKE '%' || v_query || '%')
    ), '[]'::jsonb),
    'departments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name))
      FROM public.hospital_departments d
      WHERE d.hospital_id = p_hospital_id AND d.is_active
        AND (v_query IS NULL OR d.name ILIKE '%' || v_query || '%')
    ), '[]'::jsonb),
    'appointments_today', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'patient_id', a.patient_id, 'patient', p.name,
        'doctor', d.doctor_name, 'scheduled_at', a.scheduled_at, 'status', a.status))
      FROM public.hospital_appointments a
      JOIN public.hospital_patients p ON p.id = a.patient_id
      JOIN public.hospital_doctors d ON d.id = a.doctor_id
      WHERE a.hospital_id = p_hospital_id
        AND (v_doctor_id IS NULL OR a.doctor_id = v_doctor_id)
        AND (a.scheduled_at AT TIME ZONE (SELECT h.timezone FROM public.hospital_orgs h WHERE h.id = p_hospital_id))::date = public.hospital_today(p_hospital_id)
        AND a.status IN ('scheduled', 'confirmed')
        AND (v_query IS NULL OR p.name ILIKE '%' || v_query || '%' OR d.doctor_name ILIKE '%' || v_query || '%')
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

DROP POLICY IF EXISTS hospital_doctors_member_select ON public.hospital_doctors;
CREATE POLICY hospital_doctors_member_select ON public.hospital_doctors
  FOR SELECT TO authenticated
  USING (public.hospital_has_cap(hospital_id, 'staff.manage') OR user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.hospital_doctors FROM authenticated;
GRANT SELECT ON public.hospital_doctors TO authenticated;

DROP POLICY IF EXISTS hospital_appointments_hospital_select ON public.hospital_appointments;
CREATE POLICY hospital_appointments_hospital_select ON public.hospital_appointments
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'patients.read')
      AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = hospital_appointments.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_record(hospital_id, doctor_id)
  );
DROP POLICY IF EXISTS opd_sessions_hospital_select ON public.opd_sessions;
CREATE POLICY opd_sessions_hospital_select ON public.opd_sessions
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'patients.read')
      AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = opd_sessions.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_record(hospital_id, doctor_id)
  );
DROP POLICY IF EXISTS hospital_visits_hospital_select ON public.hospital_visits;
CREATE POLICY hospital_visits_hospital_select ON public.hospital_visits
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'patients.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = hospital_visits.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_patient(hospital_id, patient_id)
  );
DROP POLICY IF EXISTS queue_entries_hospital_select ON public.queue_entries;
CREATE POLICY queue_entries_hospital_select ON public.queue_entries
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'patients.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = queue_entries.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR EXISTS (
      SELECT 1 FROM public.opd_sessions s
      JOIN public.hospital_doctors d ON d.id = s.doctor_id
      WHERE s.id = queue_entries.session_id AND public.doctor_hospital_can_read_record(queue_entries.hospital_id, d.id)
    )
  );
DROP POLICY IF EXISTS consultations_clinical_select ON public.consultations;
CREATE POLICY consultations_clinical_select ON public.consultations
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'clinical.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = consultations.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_record(hospital_id, doctor_id)
  );
DROP POLICY IF EXISTS prescriptions_clinical_select ON public.prescriptions;
CREATE POLICY prescriptions_clinical_select ON public.prescriptions
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'clinical.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = prescriptions.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_record(hospital_id, doctor_id)
  );
DROP POLICY IF EXISTS referrals_clinical_select ON public.referrals;
CREATE POLICY referrals_clinical_select ON public.referrals
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'clinical.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = referrals.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_record(hospital_id, from_doctor_id)
    OR public.doctor_hospital_can_read_record(hospital_id, to_doctor_id)
  );
DROP POLICY IF EXISTS follow_ups_clinical_select ON public.follow_ups;
CREATE POLICY follow_ups_clinical_select ON public.follow_ups
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'clinical.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = follow_ups.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR EXISTS (
      SELECT 1 FROM public.consultations c
      WHERE c.id = follow_ups.consultation_id AND public.doctor_hospital_can_read_record(c.hospital_id, c.doctor_id)
    )
  );
DROP POLICY IF EXISTS investigation_orders_hospital_select ON public.investigation_orders;
CREATE POLICY investigation_orders_hospital_select ON public.investigation_orders
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'patients.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = investigation_orders.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_record(hospital_id, ordered_by_doctor_id)
  );
DROP POLICY IF EXISTS hospital_admissions_hospital_select ON public.hospital_admissions;
CREATE POLICY hospital_admissions_hospital_select ON public.hospital_admissions
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'admissions.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = hospital_admissions.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_record(hospital_id, admitting_doctor_id)
  );
DROP POLICY IF EXISTS hospital_patients_capability_select ON public.hospital_patients;
CREATE POLICY hospital_patients_capability_select ON public.hospital_patients
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'patients.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = hospital_patients.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_patient(hospital_id, id)
  );

DROP POLICY IF EXISTS prescription_items_clinical_select ON public.prescription_items;
CREATE POLICY prescription_items_clinical_select ON public.prescription_items
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'clinical.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = prescription_items.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_items.prescription_id AND public.doctor_hospital_can_read_record(p.hospital_id, p.doctor_id)
    )
  );
DROP POLICY IF EXISTS investigation_reports_pipeline_select ON public.investigation_reports;
CREATE POLICY investigation_reports_pipeline_select ON public.investigation_reports
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'orders.pipeline')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = investigation_reports.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR EXISTS (
      SELECT 1 FROM public.investigation_orders io
      WHERE io.id = investigation_reports.order_id AND public.doctor_hospital_can_read_record(io.hospital_id, io.ordered_by_doctor_id)
    )
  );
DROP POLICY IF EXISTS investigation_order_notes_pipeline_select ON public.investigation_order_notes;
CREATE POLICY investigation_order_notes_pipeline_select ON public.investigation_order_notes
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'orders.pipeline')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = investigation_order_notes.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR EXISTS (
      SELECT 1 FROM public.investigation_orders io
      WHERE io.id = investigation_order_notes.order_id AND public.doctor_hospital_can_read_record(io.hospital_id, io.ordered_by_doctor_id)
    )
  );
DROP POLICY IF EXISTS investigation_waitlist_hospital_select ON public.investigation_waitlist;
CREATE POLICY investigation_waitlist_hospital_select ON public.investigation_waitlist
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'patients.read')
      AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = investigation_waitlist.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR EXISTS (
      SELECT 1 FROM public.investigation_orders io
      WHERE io.id = investigation_waitlist.order_id AND public.doctor_hospital_can_read_record(io.hospital_id, io.ordered_by_doctor_id)
    )
  );
DROP POLICY IF EXISTS investigation_events_hospital_select ON public.investigation_events;
CREATE POLICY investigation_events_hospital_select ON public.investigation_events
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'orders.pipeline')
      AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = investigation_events.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR EXISTS (
      SELECT 1 FROM public.investigation_orders io
      WHERE io.id = investigation_events.order_id AND public.doctor_hospital_can_read_record(io.hospital_id, io.ordered_by_doctor_id)
    )
  );
DROP POLICY IF EXISTS investigation_slots_hospital_select ON public.investigation_slots;
CREATE POLICY investigation_slots_hospital_select ON public.investigation_slots
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'orders.pipeline')
      AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = investigation_slots.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR EXISTS (
      SELECT 1 FROM public.investigation_orders io
      WHERE io.slot_id = investigation_slots.id
        AND public.doctor_hospital_can_read_record(io.hospital_id, io.ordered_by_doctor_id)
    )
  );

REVOKE ALL ON FUNCTION public.doctor_hospital_can_read_patient(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_hospital_can_read_patient(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.doctor_hospital_can_read_record(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_hospital_can_read_record(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.doctor_hospital_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_hospital_profile() TO authenticated;
REVOKE ALL ON FUNCTION public.ensure_doctor_hospital_workspace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_doctor_hospital_workspace() TO authenticated;
REVOKE ALL ON FUNCTION public.set_hospital_doctor_care_team_assignment(uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_hospital_doctor_care_team_assignment(uuid, uuid, uuid, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.remove_hospital_doctor_care_team_assignment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_hospital_doctor_care_team_assignment(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.sync_hospital_doctor_verification_status() FROM PUBLIC, anon, authenticated;

DO $publication$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'hospital_doctor_care_team_assignments'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hospital_doctor_care_team_assignments;
  END IF;
END;
$publication$;
REVOKE ALL ON FUNCTION public.create_hospital_doctor(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_hospital_doctor_active(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invite_hospital_staff(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_hospital_staff(uuid, text, text) TO authenticated;
