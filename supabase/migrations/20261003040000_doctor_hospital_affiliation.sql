-- Connect verified doctor accounts to the existing hospital membership and OPD system.

CREATE OR REPLACE FUNCTION public.ensure_doctor_hospital_workspace()
RETURNS public.hospital_orgs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_invite public.hospital_invites;
  v_org public.hospital_orgs;
  v_doctor public.doctor_profiles;
BEGIN
  IF v_user_id IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_doctor FROM public.doctor_profiles WHERE user_id = v_user_id;
  IF v_doctor.verification_status IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'Doctor verification is required for hospital affiliation' USING ERRCODE = '42501';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  SELECT hi.* INTO v_invite
  FROM public.hospital_invites hi
  WHERE lower(hi.email) = lower(v_email)
    AND hi.staff_role = 'doctor'
    AND hi.accepted_at IS NULL
    AND hi.expires_at > now()
  ORDER BY hi.created_at
  LIMIT 1
  FOR UPDATE;

  IF v_invite.id IS NOT NULL THEN
    INSERT INTO public.hospital_members (hospital_id, user_id, staff_role)
    VALUES (v_invite.hospital_id, v_user_id, 'doctor')
    ON CONFLICT (hospital_id, user_id, staff_role) DO UPDATE SET is_active = true;

    INSERT INTO public.hospital_doctors (hospital_id, user_id, doctor_name, specialty, is_active)
    VALUES (v_invite.hospital_id, v_user_id, v_doctor.full_name, v_doctor.specialization, true)
    ON CONFLICT (hospital_id, doctor_name)
    DO UPDATE SET user_id = EXCLUDED.user_id, is_active = true;

    UPDATE public.hospital_invites SET accepted_at = now() WHERE id = v_invite.id;
    INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
    VALUES (v_invite.hospital_id, v_user_id, 'doctor.invite_accepted', jsonb_build_object('invite_id', v_invite.id));
  END IF;

  SELECT h.* INTO v_org
  FROM public.hospital_orgs h
  JOIN public.hospital_members hm ON hm.hospital_id = h.id
  WHERE hm.user_id = v_user_id AND hm.is_active AND hm.staff_role = 'doctor'
  ORDER BY hm.created_at, h.created_at
  LIMIT 1;
  RETURN v_org;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_hospital_affiliations()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'hospital_id', h.id, 'name', h.name,
    'verification_status', h.verification_status,
    'staff_roles', roles.staff_roles
  ) ORDER BY h.name), '[]'::jsonb)
  FROM public.hospital_orgs h
  JOIN public.hospital_members hm ON hm.hospital_id = h.id AND hm.user_id = auth.uid() AND hm.is_active
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(DISTINCT hm2.staff_role ORDER BY hm2.staff_role) AS staff_roles
    FROM public.hospital_members hm2
    WHERE hm2.hospital_id = h.id AND hm2.user_id = auth.uid() AND hm2.is_active
  ) roles ON true
  WHERE public.doctor_has_role();
$$;

GRANT EXECUTE ON FUNCTION public.ensure_doctor_hospital_workspace() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_hospital_affiliations() TO authenticated;
