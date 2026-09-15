-- Unified medication access for patients and explicitly linked caregivers.

CREATE TABLE IF NOT EXISTS caregiver_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'Caregiver',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'revoked')),
  notification_enabled boolean NOT NULL DEFAULT true,
  notification_channels jsonb NOT NULL DEFAULT '["in_app"]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (caregiver_id, patient_id)
);

ALTER TABLE medication_logs ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE medication_logs ADD COLUMN IF NOT EXISTS patient_response text;
ALTER TABLE medication_logs ADD COLUMN IF NOT EXISTS reminder_active boolean NOT NULL DEFAULT true;
ALTER TABLE medication_logs ADD COLUMN IF NOT EXISTS patient_reminder_count integer NOT NULL DEFAULT 0;
ALTER TABLE medication_logs ADD COLUMN IF NOT EXISTS last_patient_reminder_at timestamptz;
ALTER TABLE medication_logs ADD COLUMN IF NOT EXISTS next_patient_reminder_at timestamptz;
ALTER TABLE medication_logs ADD COLUMN IF NOT EXISTS caregiver_notified_at timestamptz;

ALTER TABLE medication_logs DROP CONSTRAINT IF EXISTS medication_logs_status_check;
ALTER TABLE medication_logs ADD CONSTRAINT medication_logs_status_check
  CHECK (status IN ('pending', 'taken', 'skipped', 'late'));

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS caregiver_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS medication_id uuid REFERENCES medications(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS medication_log_id uuid REFERENCES medication_logs(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'in_app';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'created';

CREATE INDEX IF NOT EXISTS idx_caregiver_relationships_caregiver
  ON caregiver_relationships (caregiver_id, status);
CREATE INDEX IF NOT EXISTS idx_caregiver_relationships_patient
  ON caregiver_relationships (patient_id, status);
CREATE INDEX IF NOT EXISTS idx_medication_logs_scheduled
  ON medication_logs (scheduled_at, status);
CREATE INDEX IF NOT EXISTS idx_notifications_caregiver
  ON notifications (caregiver_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_medication_logs_medication_schedule
  ON medication_logs (medication_id, scheduled_at)
  WHERE scheduled_at IS NOT NULL;

ALTER TABLE caregiver_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caregiver_relationship_participants_read" ON caregiver_relationships;
CREATE POLICY "caregiver_relationship_participants_read" ON caregiver_relationships
  FOR SELECT TO authenticated
  USING (auth.uid() = caregiver_id OR auth.uid() = patient_id);

DROP POLICY IF EXISTS "patient_can_create_caregiver_relationship" ON caregiver_relationships;
CREATE POLICY "patient_can_create_caregiver_relationship" ON caregiver_relationships
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = patient_id);

DROP POLICY IF EXISTS "relationship_participants_update" ON caregiver_relationships;
CREATE POLICY "relationship_participants_update" ON caregiver_relationships
  FOR UPDATE TO authenticated
  USING (auth.uid() = patient_id)
  WITH CHECK (auth.uid() = patient_id);

DROP POLICY IF EXISTS "relationship_patient_delete" ON caregiver_relationships;
CREATE POLICY "relationship_patient_delete" ON caregiver_relationships
  FOR DELETE TO authenticated
  USING (auth.uid() = patient_id);

DROP POLICY IF EXISTS "caregiver_read_linked_medications" ON medications;
CREATE POLICY "caregiver_read_linked_medications" ON medications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM caregiver_relationships relationship
      WHERE relationship.caregiver_id = auth.uid()
        AND relationship.patient_id = medications.user_id
        AND relationship.status = 'active'
    )
  );

DROP POLICY IF EXISTS "caregiver_read_linked_medication_logs" ON medication_logs;
CREATE POLICY "caregiver_read_linked_medication_logs" ON medication_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM caregiver_relationships relationship
      WHERE relationship.caregiver_id = auth.uid()
        AND relationship.patient_id = medication_logs.user_id
        AND relationship.status = 'active'
    )
  );

DROP POLICY IF EXISTS "caregiver_notifications_read" ON notifications;
CREATE POLICY "caregiver_notifications_read" ON notifications
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      auth.uid() = caregiver_id
      AND EXISTS (
        SELECT 1 FROM caregiver_relationships relationship
        WHERE relationship.caregiver_id = auth.uid()
          AND relationship.patient_id = notifications.patient_id
          AND relationship.status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "caregiver_notifications_update" ON notifications;
CREATE POLICY "caregiver_notifications_update" ON notifications
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      auth.uid() = caregiver_id
      AND EXISTS (
        SELECT 1 FROM caregiver_relationships relationship
        WHERE relationship.caregiver_id = auth.uid()
          AND relationship.patient_id = notifications.patient_id
          AND relationship.status = 'active'
      )
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (
      auth.uid() = caregiver_id
      AND EXISTS (
        SELECT 1 FROM caregiver_relationships relationship
        WHERE relationship.caregiver_id = auth.uid()
          AND relationship.patient_id = notifications.patient_id
          AND relationship.status = 'active'
      )
    )
  );

CREATE OR REPLACE FUNCTION public.get_assigned_caregiver_patients()
RETURNS TABLE (
  relationship_id uuid,
  patient_id uuid,
  patient_name text,
  relationship text,
  status text,
  notification_enabled boolean,
  notification_channels jsonb,
  relationship_created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT relationship.id, relationship.patient_id,
    COALESCE(profile.full_name, profile.email, 'Patient'),
    relationship.relationship, relationship.status,
    relationship.notification_enabled, relationship.notification_channels,
    relationship.created_at
  FROM caregiver_relationships relationship
  LEFT JOIN profiles profile ON profile.id = relationship.patient_id
  WHERE relationship.caregiver_id = auth.uid()
    AND relationship.status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.get_caregiver_medications(target_patient_id uuid)
RETURNS SETOF medications
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT medication.*
  FROM medications medication
  WHERE medication.user_id = target_patient_id
    AND EXISTS (
      SELECT 1 FROM caregiver_relationships relationship
      WHERE relationship.caregiver_id = auth.uid()
        AND relationship.patient_id = target_patient_id
        AND relationship.status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.get_caregiver_medication_history(target_patient_id uuid)
RETURNS TABLE (
  id uuid, patient_id uuid, medication_id uuid, medication_name text,
  dosage text, scheduled_at timestamptz, taken_at timestamptz,
  status text, patient_response text, caregiver_notified_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT log.id, log.user_id, log.medication_id, medication.name,
    medication.dosage, log.scheduled_at, log.taken_at, log.status,
    log.patient_response, log.caregiver_notified_at
  FROM medication_logs log
  JOIN medications medication ON medication.id = log.medication_id
  WHERE log.user_id = target_patient_id
    AND EXISTS (
      SELECT 1 FROM caregiver_relationships relationship
      WHERE relationship.caregiver_id = auth.uid()
        AND relationship.patient_id = target_patient_id
        AND relationship.status = 'active'
    )
  ORDER BY COALESCE(log.scheduled_at, log.taken_at) DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_caregiver_notifications()
RETURNS SETOF notifications
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT notification.*
  FROM notifications notification
  WHERE notification.caregiver_id = auth.uid()
  ORDER BY notification.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.mark_caregiver_notification_read(target_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE notifications
  SET is_read = true
  WHERE id = target_notification_id
    AND caregiver_id = auth.uid();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_caregiver_notification_settings()
RETURNS SETOF caregiver_relationships
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT relationship.*
  FROM caregiver_relationships relationship
  WHERE relationship.caregiver_id = auth.uid()
    AND relationship.status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.update_caregiver_notification_preferences(
  target_relationship_id uuid,
  target_notification_enabled boolean,
  target_notification_channels jsonb
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE caregiver_relationships
  SET notification_enabled = target_notification_enabled,
      notification_channels = target_notification_channels
  WHERE id = target_relationship_id
    AND caregiver_id = auth.uid()
    AND status = 'active';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_today_medication_doses()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  inserted_count integer;
BEGIN
  INSERT INTO medication_logs (medication_id, user_id, scheduled_at, status, reminder_active, next_patient_reminder_at)
  SELECT medication.id, medication.user_id,
    (CURRENT_DATE + scheduled_time::time)::timestamptz,
    'pending', true, (CURRENT_DATE + scheduled_time::time)::timestamptz
  FROM medications medication
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(medication.times, '[]'::jsonb)) AS schedule(scheduled_time)
  WHERE medication.is_active = true
    AND (medication.start_date IS NULL OR medication.start_date <= CURRENT_DATE)
    AND (medication.end_date IS NULL OR medication.end_date >= CURRENT_DATE)
    AND (medication.frequency <> 'weekly' OR EXTRACT(ISODOW FROM CURRENT_DATE) = 1)
  ON CONFLICT (medication_id, scheduled_at) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;