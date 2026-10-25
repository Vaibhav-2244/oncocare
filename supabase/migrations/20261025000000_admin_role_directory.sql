CREATE OR REPLACE FUNCTION public.admin_search_users_by_role(
  p_role_name text,
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
  IF p_role_name IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.roles WHERE name = p_role_name
  ) THEN
    RAISE EXCEPTION 'Unknown role' USING ERRCODE = '22023';
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
      COALESCE(array_agg(DISTINCT r.name ORDER BY r.name), ARRAY[]::text[])
    FROM public.profiles p
    JOIN public.user_roles matched_role ON matched_role.user_id = p.id
    JOIN public.roles filter_role
      ON filter_role.id = matched_role.role_id AND filter_role.name = p_role_name
    LEFT JOIN public.user_roles all_roles ON all_roles.user_id = p.id
    LEFT JOIN public.roles r ON r.id = all_roles.role_id
    WHERE NULLIF(btrim(p_query), '') IS NULL
       OR COALESCE(p.full_name, '') ILIKE '%' || btrim(p_query) || '%'
       OR COALESCE(p.email, '') ILIKE '%' || btrim(p_query) || '%'
    GROUP BY p.id, p.email, p.full_name, p.created_at
    ORDER BY p.created_at DESC NULLS LAST, p.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 50)
    OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_users_by_role(text, text, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_users_by_role(text, text, integer, integer)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
