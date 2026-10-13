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

  SELECT * INTO v_doctor
  FROM public.doctor_profiles
  WHERE user_id = v_user_id;
  IF v_doctor.user_id IS NULL OR v_doctor.verification_status IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'Doctor verification is required for hospital affiliation' USING ERRCODE = '42501';
  END IF;

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  SELECT * INTO v_invite
  FROM public.hospital_invites
  WHERE lower(email) = lower(v_email)
    AND staff_role = 'doctor'
    AND accepted_at IS NULL
    AND expires_at > now()
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF v_invite.id IS NOT NULL THEN
    INSERT INTO public.hospital_members (hospital_id, user_id, staff_role)
    VALUES (v_invite.hospital_id, v_user_id, 'doctor')
    ON CONFLICT (hospital_id, user_id, staff_role)
    DO UPDATE SET is_active = true;

    INSERT INTO public.hospital_doctors (hospital_id, user_id, doctor_name, specialty, is_active)
    VALUES (v_invite.hospital_id, v_user_id, v_doctor.full_name, v_doctor.specialization, true)
    ON CONFLICT (hospital_id, doctor_name)
    DO UPDATE SET user_id = EXCLUDED.user_id, is_active = true;

    UPDATE public.hospital_invites
    SET accepted_at = now()
    WHERE id = v_invite.id;

    INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
    VALUES (v_invite.hospital_id, v_user_id, 'doctor.invite_accepted',
      jsonb_build_object('invite_id', v_invite.id));
  END IF;

  SELECT h.* INTO v_org
  FROM public.hospital_orgs h
  JOIN public.hospital_members hm
    ON hm.hospital_id = h.id
   AND hm.user_id = v_user_id
   AND hm.staff_role = 'doctor'
   AND hm.is_active
  JOIN public.hospital_doctors hd
    ON hd.hospital_id = h.id
   AND hd.user_id = v_user_id
   AND hd.is_active
  ORDER BY hm.created_at, h.created_at
  LIMIT 1;

  IF v_org.id IS NULL THEN
    RAISE EXCEPTION 'Doctor is not assigned to an active hospital workspace' USING ERRCODE = '42501';
  END IF;

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_doctor_hospital_workspace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_doctor_hospital_workspace() TO authenticated;
