CREATE OR REPLACE FUNCTION public.set_initial_signup_role(p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_role_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF p_role IS NULL OR btrim(p_role) = '' THEN
    RETURN;
  END IF;

  SELECT id INTO selected_role_id
  FROM public.roles
  WHERE lower(name) = lower(btrim(p_role))
  LIMIT 1;

  IF selected_role_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role_id)
  VALUES (auth.uid(), selected_role_id)
  ON CONFLICT (user_id, role_id) DO NOTHING;
END;
$$;

DROP POLICY IF EXISTS "update_own_user_role" ON user_roles;
CREATE POLICY "update_own_user_role" ON user_roles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
