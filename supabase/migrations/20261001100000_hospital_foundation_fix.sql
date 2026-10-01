CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP FUNCTION IF EXISTS public.create_hospital_org(text, text, text, text);
DROP FUNCTION IF EXISTS public.register_hospital_patient(uuid, text, text, text, date, integer, text);

DROP POLICY IF EXISTS "owners_manage_hospital_orgs" ON public.hospital_orgs;
DROP POLICY IF EXISTS "members_read_hospital_orgs" ON public.hospital_orgs;
DROP POLICY IF EXISTS "members_manage_hospital_members" ON public.hospital_members;
DROP POLICY IF EXISTS "members_read_hospital_departments" ON public.hospital_departments;
DROP POLICY IF EXISTS "members_read_hospital_doctors" ON public.hospital_doctors;
DROP POLICY IF EXISTS "members_read_hospital_patients" ON public.hospital_patients;
DROP POLICY IF EXISTS "members_manage_link_codes" ON public.patient_link_codes;
DROP POLICY IF EXISTS "audit_insert_for_authenticated" ON public.hospital_access_audit;
DROP POLICY IF EXISTS "audit_read_own_hospital" ON public.hospital_access_audit;

ALTER TABLE public.hospital_orgs
  ADD COLUMN IF NOT EXISTS verification_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS demo_data_loaded boolean NOT NULL DEFAULT false;

ALTER TABLE public.hospital_doctors
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.hospital_members
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.hospital_patients
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS normalized_identifier text GENERATED ALWAYS AS (
    upper(regexp_replace(patient_identifier, '[[:space:]_-]+', '', 'g'))
  ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hospital_patients_normalized_identifier
  ON public.hospital_patients (hospital_id, normalized_identifier);
CREATE INDEX IF NOT EXISTS idx_hospital_patients_name_trgm
  ON public.hospital_patients USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hospital_patients_mobile
  ON public.hospital_patients (hospital_id, mobile);
CREATE INDEX IF NOT EXISTS idx_hospital_members_hospital_active_created
  ON public.hospital_members (hospital_id, is_active, created_at);
CREATE INDEX IF NOT EXISTS idx_hospital_invites_email_pending
  ON public.hospital_invites (lower(email), expires_at)
  WHERE accepted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.patient_journey_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.hospital_patients(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  visible_to_patient boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_journey_events
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_patient_journey_events_patient_created
  ON public.patient_journey_events (hospital_id, patient_id, created_at DESC);

ALTER TABLE public.hospital_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_link_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_access_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_journey_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_hospital_member(p_hospital_id uuid)
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
      AND hm.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_hospital_admin(p_hospital_id uuid)
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
      AND hm.staff_role = 'hospital_admin'
      AND hm.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.hospital_role_can(p_role text, p_cap text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_cap
    WHEN 'patients.read' THEN p_role = ANY (ARRAY['hospital_admin', 'front_desk', 'nurse', 'doctor', 'admissions_staff', 'lab_tech', 'radiology_tech'])
    WHEN 'patients.register' THEN p_role = ANY (ARRAY['hospital_admin', 'front_desk', 'nurse', 'admissions_staff'])
    WHEN 'queue.manage' THEN p_role = ANY (ARRAY['hospital_admin', 'front_desk', 'nurse', 'doctor'])
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
      AND hm.is_active = true
      AND public.hospital_role_can(hm.staff_role, p_cap)
  );
$$;

CREATE OR REPLACE FUNCTION public.hospital_is_verified(p_hospital_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_hospital_member(p_hospital_id) AND EXISTS (
    SELECT 1 FROM public.hospital_orgs h
    WHERE h.id = p_hospital_id AND h.verification_status = 'verified'
  );
$$;

REVOKE ALL ON FUNCTION public.is_hospital_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_hospital_member(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_hospital_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_hospital_admin(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.hospital_role_can(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hospital_role_can(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.hospital_has_cap(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hospital_has_cap(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.hospital_is_verified(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hospital_is_verified(uuid) TO authenticated;

DROP POLICY IF EXISTS "hospital_orgs_member_select" ON public.hospital_orgs;
DROP POLICY IF EXISTS "hospital_members_self_or_admin_select" ON public.hospital_members;
DROP POLICY IF EXISTS "hospital_invites_admin_select" ON public.hospital_invites;
DROP POLICY IF EXISTS "hospital_departments_member_select" ON public.hospital_departments;
DROP POLICY IF EXISTS "hospital_departments_admin_insert" ON public.hospital_departments;
DROP POLICY IF EXISTS "hospital_departments_admin_update" ON public.hospital_departments;
DROP POLICY IF EXISTS "hospital_departments_admin_delete" ON public.hospital_departments;
DROP POLICY IF EXISTS "hospital_doctors_member_select" ON public.hospital_doctors;
DROP POLICY IF EXISTS "hospital_doctors_admin_insert" ON public.hospital_doctors;
DROP POLICY IF EXISTS "hospital_doctors_admin_update" ON public.hospital_doctors;
DROP POLICY IF EXISTS "hospital_doctors_admin_delete" ON public.hospital_doctors;
DROP POLICY IF EXISTS "hospital_patients_capability_select" ON public.hospital_patients;
DROP POLICY IF EXISTS "hospital_access_audit_admin_select" ON public.hospital_access_audit;
DROP POLICY IF EXISTS "patient_journey_events_patient_read" ON public.patient_journey_events;

CREATE POLICY "hospital_orgs_member_select" ON public.hospital_orgs
  FOR SELECT TO authenticated USING (public.is_hospital_member(id));

CREATE POLICY "hospital_members_self_or_admin_select" ON public.hospital_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_hospital_admin(hospital_id));

CREATE POLICY "hospital_invites_admin_select" ON public.hospital_invites
  FOR SELECT TO authenticated USING (public.is_hospital_admin(hospital_id));

CREATE POLICY "hospital_departments_member_select" ON public.hospital_departments
  FOR SELECT TO authenticated USING (public.is_hospital_member(hospital_id));
CREATE POLICY "hospital_departments_admin_insert" ON public.hospital_departments
  FOR INSERT TO authenticated WITH CHECK (public.is_hospital_admin(hospital_id));
CREATE POLICY "hospital_departments_admin_update" ON public.hospital_departments
  FOR UPDATE TO authenticated
  USING (public.is_hospital_admin(hospital_id))
  WITH CHECK (public.is_hospital_admin(hospital_id));
CREATE POLICY "hospital_departments_admin_delete" ON public.hospital_departments
  FOR DELETE TO authenticated USING (public.is_hospital_admin(hospital_id));

CREATE POLICY "hospital_doctors_member_select" ON public.hospital_doctors
  FOR SELECT TO authenticated USING (public.is_hospital_member(hospital_id));
CREATE POLICY "hospital_doctors_admin_insert" ON public.hospital_doctors
  FOR INSERT TO authenticated WITH CHECK (public.is_hospital_admin(hospital_id));
CREATE POLICY "hospital_doctors_admin_update" ON public.hospital_doctors
  FOR UPDATE TO authenticated
  USING (public.is_hospital_admin(hospital_id))
  WITH CHECK (public.is_hospital_admin(hospital_id));
CREATE POLICY "hospital_doctors_admin_delete" ON public.hospital_doctors
  FOR DELETE TO authenticated USING (public.is_hospital_admin(hospital_id));

CREATE POLICY "hospital_patients_capability_select" ON public.hospital_patients
  FOR SELECT TO authenticated USING (public.hospital_has_cap(hospital_id, 'patients.read'));

CREATE POLICY "hospital_access_audit_admin_select" ON public.hospital_access_audit
  FOR SELECT TO authenticated USING (public.is_hospital_admin(hospital_id));

CREATE POLICY "patient_journey_events_patient_read" ON public.patient_journey_events
  FOR SELECT TO authenticated USING (public.hospital_has_cap(hospital_id, 'patients.read'));

REVOKE ALL ON TABLE public.patient_link_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.patient_journey_events TO authenticated;

CREATE OR REPLACE FUNCTION public.seed_hospital_defaults(p_hospital_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.hospital_departments (hospital_id, name, department_type)
  VALUES
    (p_hospital_id, 'Medical Oncology', 'clinical'),
    (p_hospital_id, 'Radiation Oncology', 'clinical'),
    (p_hospital_id, 'Surgical Oncology', 'clinical'),
    (p_hospital_id, 'Radiology', 'diagnostic'),
    (p_hospital_id, 'Pathology', 'diagnostic'),
    (p_hospital_id, 'Nuclear Medicine', 'diagnostic')
  ON CONFLICT (hospital_id, name) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_hospital_defaults(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_hospital_workspace()
RETURNS public.hospital_orgs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_org_name text;
  v_hospital_id uuid;
  v_staff_role text;
  v_org public.hospital_orgs;
  v_role_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id AND r.name = 'hospital'
  ) THEN
    RAISE EXCEPTION 'hospital role required' USING ERRCODE = '42501';
  END IF;

  SELECT hm.hospital_id INTO v_hospital_id
  FROM public.hospital_members hm
  WHERE hm.user_id = v_user_id AND hm.is_active = true
  ORDER BY hm.created_at, hm.hospital_id
  LIMIT 1;

  IF v_hospital_id IS NOT NULL THEN
    PERFORM public.seed_hospital_defaults(v_hospital_id);
    SELECT * INTO v_org FROM public.hospital_orgs WHERE id = v_hospital_id;
    RETURN v_org;
  END IF;

  SELECT u.email,
         COALESCE(NULLIF(btrim(p.full_name), ''), split_part(u.email, '@', 1)) || ' Hospital'
    INTO v_email, v_org_name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = v_user_id;

  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = v_user_id AND u.email_confirmed_at IS NOT NULL
  ) THEN
    SELECT hi.hospital_id, hi.staff_role INTO v_hospital_id, v_staff_role
    FROM public.hospital_invites hi
    WHERE lower(hi.email) = lower(v_email)
      AND hi.accepted_at IS NULL
      AND hi.expires_at > now()
    ORDER BY hi.created_at
    LIMIT 1
    FOR UPDATE;

    IF v_hospital_id IS NOT NULL THEN
      INSERT INTO public.hospital_members (hospital_id, user_id, staff_role)
      VALUES (v_hospital_id, v_user_id, v_staff_role)
      ON CONFLICT (hospital_id, user_id, staff_role)
      DO UPDATE SET is_active = true;

      UPDATE public.hospital_invites
      SET accepted_at = now()
      WHERE hospital_id = v_hospital_id
        AND lower(email) = lower(v_email)
        AND staff_role = v_staff_role
        AND accepted_at IS NULL;

      INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
      VALUES (v_hospital_id, v_user_id, 'staff.invite_accepted', jsonb_build_object('staff_role', v_staff_role));

      PERFORM public.seed_hospital_defaults(v_hospital_id);
      SELECT * INTO v_org FROM public.hospital_orgs WHERE id = v_hospital_id;
      RETURN v_org;
    END IF;
  END IF;

  -- Recover workspaces created by the previous RPC, which omitted membership rows.
  SELECT h.id INTO v_hospital_id
  FROM public.hospital_orgs h
  WHERE h.owner_user_id = v_user_id
  ORDER BY h.created_at
  LIMIT 1
  FOR UPDATE;

  IF v_hospital_id IS NOT NULL THEN
    INSERT INTO public.hospital_members (hospital_id, user_id, staff_role)
    VALUES (v_hospital_id, v_user_id, 'hospital_admin')
    ON CONFLICT (hospital_id, user_id, staff_role)
    DO UPDATE SET is_active = true;
    INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
    VALUES (v_hospital_id, v_user_id, 'workspace.membership_recovered', jsonb_build_object('staff_role', 'hospital_admin'));
    PERFORM public.seed_hospital_defaults(v_hospital_id);
    SELECT * INTO v_org FROM public.hospital_orgs WHERE id = v_hospital_id;
    RETURN v_org;
  END IF;

  INSERT INTO public.hospital_orgs (name, owner_user_id, timezone, patient_id_label, patient_id_prefix, verification_status)
  VALUES (
    COALESCE(NULLIF(btrim(v_org_name), ''), 'Hospital'),
    v_user_id,
    'Asia/Kolkata',
    'Patient ID',
    'PID-',
    'pending'
  )
  RETURNING * INTO v_org;

  INSERT INTO public.hospital_members (hospital_id, user_id, staff_role)
  VALUES (v_org.id, v_user_id, 'hospital_admin');

  PERFORM public.seed_hospital_defaults(v_org.id);

  INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
  VALUES (v_org.id, v_user_id, 'workspace.created', jsonb_build_object('source', 'ensure_hospital_workspace'));

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_hospital_workspace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_hospital_workspace() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_hospital_org(
  p_hospital_id uuid,
  p_name text,
  p_timezone text,
  p_patient_id_label text,
  p_patient_id_prefix text,
  p_settings jsonb
)
RETURNS public.hospital_orgs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.hospital_orgs;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN
    RAISE EXCEPTION 'Invalid timezone: %', p_timezone USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_name), '') IS NULL
     OR NULLIF(btrim(p_patient_id_label), '') IS NULL
     OR p_patient_id_prefix IS NULL THEN
    RAISE EXCEPTION 'Hospital name, patient ID label, and prefix are required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hospital_orgs
  SET name = btrim(p_name),
      timezone = p_timezone,
      patient_id_label = btrim(p_patient_id_label),
      patient_id_prefix = p_patient_id_prefix,
      settings = COALESCE(p_settings, '{}'::jsonb),
      updated_at = now()
  WHERE id = p_hospital_id
  RETURNING * INTO v_org;

  INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
  VALUES (p_hospital_id, auth.uid(), 'workspace.updated', jsonb_build_object('name', v_org.name));
  RETURN v_org;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_hospital_verification(p_hospital_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_at timestamptz;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.hospital_orgs
  SET verification_requested_at = COALESCE(verification_requested_at, now()), updated_at = now()
  WHERE id = p_hospital_id
  RETURNING verification_requested_at INTO v_requested_at;
  INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action)
  VALUES (p_hospital_id, auth.uid(), 'verification.requested');
  RETURN v_requested_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_hospital_verification(p_hospital_id uuid, p_status text)
RETURNS public.hospital_orgs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.hospital_orgs;
BEGIN
  IF p_status NOT IN ('pending', 'verified', 'suspended') THEN
    RAISE EXCEPTION 'Invalid verification status' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'system admin role required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.hospital_orgs
  SET verification_status = p_status, updated_at = now()
  WHERE id = p_hospital_id
  RETURNING * INTO v_org;
  IF v_org.id IS NULL THEN
    RAISE EXCEPTION 'Hospital workspace not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
  VALUES (p_hospital_id, auth.uid(), 'verification.changed', jsonb_build_object('status', p_status));
  RETURN v_org;
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
  IF p_staff_role NOT IN ('hospital_admin', 'front_desk', 'nurse', 'doctor', 'lab_tech', 'radiology_tech', 'admissions_staff') THEN
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

CREATE OR REPLACE FUNCTION public.revoke_hospital_invite(p_hospital_id uuid, p_invite_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted boolean;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'staff.manage') THEN
    RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.hospital_invites
  WHERE id = p_invite_id AND hospital_id = p_hospital_id AND accepted_at IS NULL;
  v_deleted := FOUND;
  IF v_deleted THEN
    INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
    VALUES (p_hospital_id, auth.uid(), 'staff.invite_revoked', jsonb_build_object('invite_id', p_invite_id));
  END IF;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_member_active(p_hospital_id uuid, p_user_id uuid, p_active boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed boolean;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'staff.manage') THEN
    RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_hospital_id::text));
  UPDATE public.hospital_members
  SET is_active = p_active
  WHERE hospital_id = p_hospital_id AND user_id = p_user_id;
  v_changed := FOUND;
  IF p_active = false AND NOT EXISTS (
    SELECT 1 FROM public.hospital_members
    WHERE hospital_id = p_hospital_id AND staff_role = 'hospital_admin' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'The hospital must keep at least one active administrator' USING ERRCODE = '23514';
  END IF;
  IF v_changed THEN
    INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
    VALUES (p_hospital_id, auth.uid(), 'staff.active_changed', jsonb_build_object('user_id', p_user_id, 'active', p_active));
  END IF;
  RETURN v_changed;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_member_roles(p_hospital_id uuid, p_user_id uuid, p_roles text[])
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_active boolean;
  v_role text;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'staff.manage') THEN
    RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF p_roles IS NULL OR cardinality(p_roles) = 0 OR EXISTS (
    SELECT 1 FROM unnest(p_roles) AS requested(role_name)
    WHERE requested.role_name NOT IN ('hospital_admin', 'front_desk', 'nurse', 'doctor', 'lab_tech', 'radiology_tech', 'admissions_staff')
  ) THEN
    RAISE EXCEPTION 'At least one valid staff role is required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_hospital_id::text));
  SELECT bool_or(is_active) INTO v_is_active
  FROM public.hospital_members
  WHERE hospital_id = p_hospital_id AND user_id = p_user_id;
  IF v_is_active IS NULL THEN
    RAISE EXCEPTION 'Hospital member not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.hospital_members
  WHERE hospital_id = p_hospital_id AND user_id = p_user_id;
  FOREACH v_role IN ARRAY p_roles LOOP
    INSERT INTO public.hospital_members (hospital_id, user_id, staff_role, is_active)
    VALUES (p_hospital_id, p_user_id, v_role, v_is_active);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.hospital_members
    WHERE hospital_id = p_hospital_id AND staff_role = 'hospital_admin' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'The hospital must keep at least one active administrator' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
  VALUES (p_hospital_id, auth.uid(), 'staff.roles_changed', jsonb_build_object('user_id', p_user_id, 'roles', p_roles));
  RETURN p_roles;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_patient_identifier(p_hospital_id uuid, p_input text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_input text;
  v_raw_prefix text;
  v_digits text;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.register') THEN
    RAISE EXCEPTION 'patients.register capability required' USING ERRCODE = '42501';
  END IF;
  IF p_input IS NULL OR NULLIF(btrim(p_input), '') IS NULL THEN
    RAISE EXCEPTION 'Patient identifier is required' USING ERRCODE = '22023';
  END IF;
      SELECT COALESCE(patient_id_prefix, '')
      INTO v_raw_prefix
  FROM public.hospital_orgs
  WHERE id = p_hospital_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hospital workspace not found' USING ERRCODE = 'P0002';
  END IF;

  v_input := upper(regexp_replace(btrim(p_input), '[[:space:]_-]+', '', 'g'));
  IF v_input ~ '^[0-9]+$' THEN
    RETURN v_raw_prefix || v_input;
  END IF;
  IF v_input ~ '^[A-Z]+[0-9]+$' THEN
    v_digits := substring(v_input FROM '([0-9]+)$');
    RETURN v_raw_prefix || v_digits;
  END IF;
  RETURN v_input;
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
  v_identifier text;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.register') THEN
    RAISE EXCEPTION 'patients.register capability required' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Patient name is required' USING ERRCODE = '22023';
  END IF;
  IF p_age IS NOT NULL AND p_age < 0 THEN
    RAISE EXCEPTION 'Patient age cannot be negative' USING ERRCODE = '22023';
  END IF;

  v_identifier := public.normalize_patient_identifier(p_hospital_id, p_identifier);
  BEGIN
    INSERT INTO public.hospital_patients (hospital_id, patient_identifier, name, mobile, dob, age, gender)
    VALUES (p_hospital_id, v_identifier, btrim(p_name), NULLIF(btrim(p_mobile), ''), p_dob, p_age, p_gender)
    RETURNING * INTO v_patient;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A patient with this identifier already exists in this hospital' USING ERRCODE = '23505';
  END;

  INSERT INTO public.patient_journey_events (hospital_id, patient_id, actor_user_id, event_type, details)
  VALUES (p_hospital_id, v_patient.id, auth.uid(), 'patient.registered', jsonb_build_object('identifier', v_patient.patient_identifier));
  INSERT INTO public.hospital_access_audit (hospital_id, patient_id, actor_user_id, action, details)
  VALUES (p_hospital_id, v_patient.id, auth.uid(), 'patient.registered', jsonb_build_object('identifier', v_patient.patient_identifier));
  RETURN v_patient;
END;
$$;

CREATE OR REPLACE FUNCTION public.load_demo_data(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_patient_count integer;
  v_doctor_count integer;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.seed_hospital_defaults(p_hospital_id);
  SELECT patient_id_prefix INTO v_prefix FROM public.hospital_orgs WHERE id = p_hospital_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hospital workspace not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.hospital_doctors (hospital_id, department_id, doctor_name, specialty, is_demo)
  SELECT p_hospital_id, d.id, demo.doctor_name, d.name, true
  FROM (VALUES
    ('Dr. Demo Asha Rao', 'Medical Oncology'),
    ('Dr. Demo Kiran Shah', 'Medical Oncology'),
    ('Dr. Demo Meera Das', 'Radiation Oncology'),
    ('Dr. Demo Arjun Sen', 'Radiation Oncology'),
    ('Dr. Demo Nisha Kapoor', 'Surgical Oncology'),
    ('Dr. Demo Dev Patel', 'Surgical Oncology')
  ) AS demo(doctor_name, department_name)
  JOIN public.hospital_departments d
    ON d.hospital_id = p_hospital_id AND d.name = demo.department_name
  ON CONFLICT (hospital_id, doctor_name) DO NOTHING;

  WITH inserted_patients AS (
    INSERT INTO public.hospital_patients (hospital_id, patient_identifier, name, is_demo)
    SELECT p_hospital_id,
      v_prefix || lpad((24600 + sequence.value)::text, 5, '0'),
      'Demo Patient ' || lpad(sequence.value::text, 2, '0'),
      true
    FROM generate_series(1, 30) AS sequence(value)
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  INSERT INTO public.patient_journey_events (hospital_id, patient_id, actor_user_id, event_type, details, is_demo)
  SELECT p_hospital_id, id, auth.uid(), 'patient.demo_registered', jsonb_build_object('demo', true), true
  FROM inserted_patients;

  SELECT count(*) INTO v_patient_count
  FROM public.hospital_patients WHERE hospital_id = p_hospital_id AND is_demo = true;

  INSERT INTO public.hospital_members (hospital_id, user_id, staff_role, is_demo)
  SELECT p_hospital_id, auth.uid(), roles.role_name, true
  FROM unnest(ARRAY['hospital_admin', 'front_desk', 'nurse', 'doctor', 'lab_tech', 'radiology_tech', 'admissions_staff']) AS roles(role_name)
  ON CONFLICT (hospital_id, user_id, staff_role) DO NOTHING;

  SELECT count(*) INTO v_doctor_count
  FROM public.hospital_doctors WHERE hospital_id = p_hospital_id AND is_demo = true;
  UPDATE public.hospital_orgs SET demo_data_loaded = true, updated_at = now() WHERE id = p_hospital_id;
  INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
  VALUES (p_hospital_id, auth.uid(), 'demo_data.loaded', jsonb_build_object('patients', v_patient_count));
  RETURN jsonb_build_object('patients', v_patient_count, 'doctors', v_doctor_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_demo_data(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patients integer;
  v_doctors integer;
  v_roles integer;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.patient_journey_events
  WHERE hospital_id = p_hospital_id AND is_demo = true;
  DELETE FROM public.hospital_patients WHERE hospital_id = p_hospital_id AND is_demo = true;
  GET DIAGNOSTICS v_patients = ROW_COUNT;
  DELETE FROM public.hospital_doctors WHERE hospital_id = p_hospital_id AND is_demo = true;
  GET DIAGNOSTICS v_doctors = ROW_COUNT;
  DELETE FROM public.hospital_members
  WHERE hospital_id = p_hospital_id AND user_id = auth.uid() AND is_demo = true;
  GET DIAGNOSTICS v_roles = ROW_COUNT;

  UPDATE public.hospital_orgs
  SET demo_data_loaded = EXISTS (
    SELECT 1 FROM public.hospital_patients WHERE hospital_id = p_hospital_id AND is_demo = true
  ) OR EXISTS (
    SELECT 1 FROM public.hospital_doctors WHERE hospital_id = p_hospital_id AND is_demo = true
  ), updated_at = now()
  WHERE id = p_hospital_id;
  INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
  VALUES (p_hospital_id, auth.uid(), 'demo_data.removed', jsonb_build_object('patients', v_patients, 'doctors', v_doctors, 'roles', v_roles));
  RETURN jsonb_build_object('patients', v_patients, 'doctors', v_doctors, 'roles', v_roles);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_initial_signup_role(p_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role_count integer;
  v_only_patient boolean;
  v_role_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('patient', 'family_caregiver', 'doctor', 'hospital', 'pharmacy', 'research_partner') THEN
    RAISE EXCEPTION 'Unsupported self-serve role' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = v_user_id AND created_at >= now() - interval '30 minutes'
  ) THEN
    RETURN 'unchanged';
  END IF;

  SELECT count(*), bool_and(r.name = 'patient')
  INTO v_role_count, v_only_patient
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_user_id;
  IF v_role_count <> 1 OR v_only_patient IS DISTINCT FROM true THEN
    RETURN 'unchanged';
  END IF;
  SELECT id INTO v_role_id FROM public.roles WHERE name = p_role;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Requested role is not configured' USING ERRCODE = '22023';
  END IF;
  UPDATE public.user_roles SET role_id = v_role_id WHERE user_id = v_user_id;
  RETURN p_role;
END;
$$;

REVOKE ALL ON FUNCTION public.update_hospital_org(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_hospital_org(uuid, text, text, text, text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.request_hospital_verification(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_hospital_verification(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_set_hospital_verification(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_hospital_verification(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.invite_hospital_staff(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_hospital_staff(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.revoke_hospital_invite(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_hospital_invite(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.set_member_active(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_active(uuid, uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.set_member_roles(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_roles(uuid, uuid, text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.normalize_patient_identifier(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_patient_identifier(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.register_hospital_patient(uuid, text, text, text, date, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_hospital_patient(uuid, text, text, text, date, integer, text) TO authenticated;
REVOKE ALL ON FUNCTION public.load_demo_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_demo_data(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.remove_demo_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_demo_data(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.set_initial_signup_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_initial_signup_role(text) TO authenticated;

NOTIFY pgrst, 'reload schema';