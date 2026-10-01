-- 1) Clients must never write roles directly.
DROP POLICY IF EXISTS "insert_own_user_role" ON public.user_roles;

-- 2) Hardened signup trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requested_role text;
  selected_role_id uuid;
  self_serve_roles constant text[] := ARRAY['patient','family_caregiver','doctor','hospital','pharmacy','research_partner'];
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''))
  ON CONFLICT (id) DO NOTHING;

  requested_role := NEW.raw_user_meta_data->>'role';
  IF requested_role IS NULL OR NOT (requested_role = ANY (self_serve_roles)) THEN
    requested_role := 'patient';
  END IF;

  SELECT id INTO selected_role_id FROM public.roles WHERE name = requested_role;
  IF selected_role_id IS NULL THEN
    SELECT id INTO selected_role_id FROM public.roles WHERE name = 'patient';
  END IF;

  INSERT INTO public.user_roles (user_id, role_id) VALUES (NEW.id, selected_role_id)
  ON CONFLICT (user_id, role_id) DO NOTHING;

  INSERT INTO public.notification_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END; $$;

-- 3) Backfill missing notification preferences
INSERT INTO public.notification_preferences (user_id)
SELECT u.id FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.notification_preferences np WHERE np.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;
