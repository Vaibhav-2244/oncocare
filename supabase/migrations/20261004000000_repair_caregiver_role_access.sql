-- Repair role assignments for users created before the role-assignment trigger
-- was hardened, and allow caregivers to read profiles for linked patients.

INSERT INTO public.roles (name, display_name, description) VALUES
  ('family_caregiver', 'Family Caregiver', 'Family member managing care for a patient')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role text;
  selected_role_id uuid;
  self_serve_roles constant text[] := ARRAY[
    'patient',
    'family_caregiver',
    'doctor',
    'hospital',
    'pharmacy',
    'research_partner'
  ];
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  requested_role := NEW.raw_user_meta_data->>'role';
  IF requested_role IS NULL OR NOT (requested_role = ANY (self_serve_roles)) THEN
    requested_role := 'patient';
  END IF;

  SELECT id
  INTO selected_role_id
  FROM public.roles
  WHERE name = requested_role;

  INSERT INTO public.user_roles (user_id, role_id)
  VALUES (NEW.id, selected_role_id)
  ON CONFLICT (user_id, role_id) DO NOTHING;

  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Restore a role for legacy users. Explicit signup metadata wins only when
-- the account currently has no role or only the default patient role.
INSERT INTO public.user_roles (user_id, role_id)
SELECT
  u.id,
  r.id
FROM auth.users u
JOIN public.roles r
  ON r.name = CASE
    WHEN u.raw_user_meta_data->>'role' IN (
      'patient',
      'family_caregiver',
      'doctor',
      'hospital',
      'pharmacy',
      'research_partner'
    ) THEN u.raw_user_meta_data->>'role'
    ELSE 'patient'
  END
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_roles existing
  WHERE existing.user_id = u.id
)
ON CONFLICT (user_id, role_id) DO NOTHING;

WITH requested_roles AS (
  SELECT
    u.id AS user_id,
    r.id AS role_id
  FROM auth.users u
  JOIN public.roles r
    ON r.name = u.raw_user_meta_data->>'role'
  WHERE u.raw_user_meta_data->>'role' IN (
    'family_caregiver',
    'doctor',
    'hospital',
    'pharmacy',
    'research_partner'
  )
),
patient_only_users AS (
  SELECT ur.user_id
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  GROUP BY ur.user_id
  HAVING count(*) = 1 AND bool_and(r.name = 'patient')
)
UPDATE public.user_roles ur
SET role_id = requested.role_id
FROM requested_roles requested
JOIN patient_only_users patient_only
  ON patient_only.user_id = requested.user_id
WHERE ur.user_id = requested.user_id;

INSERT INTO public.notification_preferences (user_id)
SELECT u.id
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.notification_preferences preferences
  WHERE preferences.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

DROP POLICY IF EXISTS "caregiver_read_linked_patient_profiles" ON public.profiles;
CREATE POLICY "caregiver_read_linked_patient_profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.caregiver_relationships relationship
    WHERE relationship.caregiver_id = auth.uid()
      AND relationship.patient_id = profiles.id
      AND relationship.status IN ('active', 'pending')
  )
);
