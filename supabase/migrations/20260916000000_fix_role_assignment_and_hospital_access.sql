CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  requested_role text;
  selected_role_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  requested_role := NEW.raw_user_meta_data->>'role';
  SELECT id INTO selected_role_id
  FROM public.roles
  WHERE name = requested_role;

  IF selected_role_id IS NULL THEN
    SELECT id INTO selected_role_id FROM public.roles WHERE name = 'patient';
  END IF;

  INSERT INTO public.user_roles (user_id, role_id)
  VALUES (NEW.id, selected_role_id)
  ON CONFLICT (user_id, role_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "select_hospital_appointments" ON appointments;
CREATE POLICY "select_hospital_appointments" ON appointments FOR SELECT
  TO authenticated USING (
    auth.uid() = hospital_id
    AND EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'hospital'
    )
  );

DROP POLICY IF EXISTS "select_hospital_related_profiles" ON profiles;
CREATE POLICY "select_hospital_related_profiles" ON profiles FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM appointments a
      WHERE a.hospital_id = auth.uid()
        AND (a.user_id = profiles.id OR a.doctor_id = profiles.id)
    )
    AND EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'hospital'
    )
  );

CREATE INDEX IF NOT EXISTS idx_appointments_hospital ON appointments (hospital_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments (doctor_id);
