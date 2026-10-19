CREATE OR REPLACE FUNCTION public.admin_dashboard_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'system admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'registered_users', (SELECT count(*) FROM public.profiles),
    'patients', (
      SELECT count(DISTINCT ur.user_id)
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE r.name = 'patient'
    ),
    'doctors', (
      SELECT count(DISTINCT ur.user_id)
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE r.name = 'doctor'
    ),
    'hospitals', (
      SELECT count(*) FROM public.hospital_orgs
    ),
    'pharmacies', (
      SELECT count(*) FROM public.pharmacy_orgs
    ),
    'pending_verifications', (
      (SELECT count(*) FROM public.doctor_profiles WHERE verification_status IN ('pending', 'submitted'))
      + (SELECT count(*) FROM public.hospital_orgs WHERE verification_status = 'pending')
      + (SELECT count(*) FROM public.pharmacy_orgs WHERE verification_status = 'pending')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_search_users(
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  roles text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'system admin role required' USING ERRCODE = '42501';
  END IF;
  IF length(COALESCE(p_query, '')) > 120 THEN
    RAISE EXCEPTION 'Search query is too long' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_offset, 0) < 0 THEN
    RAISE EXCEPTION 'Offset cannot be negative' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    SELECT
      p.id,
      p.email,
      p.full_name,
      p.created_at,
      COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[])
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    LEFT JOIN public.roles r ON r.id = ur.role_id
    WHERE NULLIF(btrim(p_query), '') IS NULL
       OR COALESCE(p.full_name, '') ILIKE '%' || btrim(p_query) || '%'
       OR COALESCE(p.email, '') ILIKE '%' || btrim(p_query) || '%'
    GROUP BY p.id, p.email, p.full_name, p.created_at
    ORDER BY p.created_at DESC NULLS LAST, p.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 50)
    OFFSET COALESCE(p_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_verification_requests(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  kind text,
  entity_id uuid,
  display_name text,
  contact_email text,
  status text,
  submitted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'system admin role required' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_offset, 0) < 0 THEN
    RAISE EXCEPTION 'Offset cannot be negative' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    SELECT requests.kind, requests.entity_id, requests.display_name,
      requests.contact_email, requests.status, requests.submitted_at
    FROM (
      SELECT
        'doctor'::text AS kind,
        dp.user_id AS entity_id,
        dp.full_name AS display_name,
        p.email AS contact_email,
        dp.verification_status AS status,
        COALESCE(dp.updated_at, dp.created_at) AS submitted_at
      FROM public.doctor_profiles dp
      LEFT JOIN public.profiles p ON p.id = dp.user_id
      WHERE dp.verification_status IN ('pending', 'submitted')

      UNION ALL

      SELECT
        'hospital'::text,
        ho.id,
        ho.name,
        p.email,
        ho.verification_status,
        COALESCE(ho.verification_requested_at, ho.created_at)
      FROM public.hospital_orgs ho
      LEFT JOIN public.profiles p ON p.id = ho.owner_user_id
      WHERE ho.verification_status = 'pending'

      UNION ALL

      SELECT
        'pharmacy'::text,
        po.id,
        po.name,
        COALESCE(po.email, p.email),
        po.verification_status,
        COALESCE(po.verification_requested_at, po.created_at)
      FROM public.pharmacy_orgs po
      LEFT JOIN public.profiles p ON p.id = po.owner_user_id
      WHERE po.verification_status = 'pending'
    ) AS requests
    ORDER BY requests.submitted_at DESC NULLS LAST, requests.kind, requests.entity_id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
    OFFSET COALESCE(p_offset, 0);
END;
$$;

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('doctor', 'hospital', 'pharmacy', 'user')),
  target_id uuid NOT NULL,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created
  ON public.admin_audit_log (created_at DESC, id DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_audit_log TO authenticated;

DROP POLICY IF EXISTS admin_audit_log_admin_select ON public.admin_audit_log;
CREATE POLICY admin_audit_log_admin_select ON public.admin_audit_log
  FOR SELECT TO authenticated USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.admin_set_verification_request(
  p_kind text,
  p_entity_id uuid,
  p_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_status text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'system admin role required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL THEN
    RAISE EXCEPTION 'Verification status is required' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'doctor' THEN
    IF p_status NOT IN ('verified', 'rejected') THEN
      RAISE EXCEPTION 'Invalid doctor verification status' USING ERRCODE = '22023';
    END IF;
    SELECT verification_status INTO previous_status
    FROM public.doctor_profiles WHERE user_id = p_entity_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Doctor profile not found' USING ERRCODE = 'P0002';
    END IF;
    IF previous_status NOT IN ('pending', 'submitted') THEN
      RAISE EXCEPTION 'Doctor verification request is no longer pending' USING ERRCODE = '55000';
    END IF;
    PERFORM public.admin_set_doctor_verification(p_entity_id, p_status);
  ELSIF p_kind = 'hospital' THEN
    IF p_status <> 'verified' THEN
      RAISE EXCEPTION 'Only verification approval is supported for hospitals' USING ERRCODE = '22023';
    END IF;
    SELECT verification_status INTO previous_status
    FROM public.hospital_orgs WHERE id = p_entity_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Hospital workspace not found' USING ERRCODE = 'P0002';
    END IF;
    IF previous_status <> 'pending' THEN
      RAISE EXCEPTION 'Hospital verification request is no longer pending' USING ERRCODE = '55000';
    END IF;
    PERFORM public.admin_set_hospital_verification(p_entity_id, p_status);
  ELSIF p_kind = 'pharmacy' THEN
    IF p_status <> 'verified' THEN
      RAISE EXCEPTION 'Only verification approval is supported for pharmacies' USING ERRCODE = '22023';
    END IF;
    SELECT verification_status INTO previous_status
    FROM public.pharmacy_orgs WHERE id = p_entity_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pharmacy workspace not found' USING ERRCODE = 'P0002';
    END IF;
    IF previous_status <> 'pending' THEN
      RAISE EXCEPTION 'Pharmacy verification request is no longer pending' USING ERRCODE = '55000';
    END IF;
    PERFORM public.admin_set_pharmacy_verification(p_entity_id, p_status);
  ELSE
    RAISE EXCEPTION 'Invalid verification request kind' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_audit_log (
    actor_user_id, action, target_kind, target_id, previous_status, new_status
  )
  VALUES (
    auth.uid(), 'verification.updated', p_kind, p_entity_id, previous_status, p_status
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_audit_log(
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  actor_user_id uuid,
  action text,
  target_kind text,
  target_id uuid,
  previous_status text,
  new_status text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'system admin role required' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_offset, 0) < 0 THEN
    RAISE EXCEPTION 'Offset cannot be negative' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    SELECT log.id, log.actor_user_id, log.action, log.target_kind, log.target_id,
      log.previous_status, log.new_status, log.created_at
    FROM public.admin_audit_log AS log
    ORDER BY log.created_at DESC, log.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 50)
    OFFSET COALESCE(p_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_user_id uuid,
  p_role_name text,
  p_enabled boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  role_changed boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'super_admin role required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own roles' USING ERRCODE = '42501';
  END IF;
  IF p_role_name = 'super_admin' THEN
    RAISE EXCEPTION 'Super admin assignments must be managed through a separate recovery process' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL OR p_role_name IS NULL THEN
    RAISE EXCEPTION 'Role and enabled state are required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE name = p_role_name;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Unknown role' USING ERRCODE = '22023';
  END IF;

  IF p_enabled THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (p_user_id, v_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
    role_changed := FOUND;
  ELSE
    DELETE FROM public.user_roles
    WHERE user_id = p_user_id AND role_id = v_role_id;
    role_changed := FOUND;
  END IF;

  IF role_changed THEN
    INSERT INTO public.admin_audit_log (
      actor_user_id, action, target_kind, target_id, previous_status, new_status
    )
    VALUES (
      auth.uid(),
      CASE WHEN p_enabled THEN 'user.role_added' ELSE 'user.role_removed' END,
      'user',
      p_user_id,
      CASE WHEN p_enabled THEN 'role_absent' ELSE p_role_name END,
      CASE WHEN p_enabled THEN p_role_name ELSE 'role_absent' END
    );
  END IF;
  RETURN role_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_search_users(text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_verification_requests(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_verification_request(text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_audit_log(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_users(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_verification_requests(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_verification_request(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_log(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
