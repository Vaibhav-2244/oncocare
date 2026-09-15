-- Fix BPL RLS Policies to allow all authenticated users to create patients
-- This allows patients to register themselves or others to request support

-- Drop the restrictive policy
DROP POLICY IF EXISTS "admin_create_patients" ON bpl_patients;

-- Create new policy allowing authenticated users to create patient records
-- (Admin will verify later via verification workflow)
CREATE POLICY "auth_create_patients" ON bpl_patients
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Allow authenticated users to update their own patient records
DROP POLICY IF EXISTS "update_own_or_admin_patients" ON bpl_patients;

CREATE POLICY "auth_update_own_patients" ON bpl_patients
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Allow admins to update any patient record
CREATE POLICY "admin_update_all_patients" ON bpl_patients
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('admin', 'healthcare_provider', 'hospital_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('admin', 'healthcare_provider', 'hospital_manager')
    )
  );
