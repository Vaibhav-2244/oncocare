DROP INDEX IF EXISTS public.medications_source_key_unique;
CREATE UNIQUE INDEX medications_source_key_unique
  ON public.medications (source_key);

DROP INDEX IF EXISTS public.treatments_source_key_unique;
CREATE UNIQUE INDEX treatments_source_key_unique
  ON public.treatments (source_key);

CREATE OR REPLACE FUNCTION public.doctor_hospital_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'patients', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', hp.id,
          'hospital_id', h.id,
          'hospital_name', h.name,
          'identifier', hp.patient_identifier,
          'name', hp.name,
          'age', hp.age,
          'gender', hp.gender,
          'linked', hp.patient_user_id IS NOT NULL
        )
        ORDER BY hp.updated_at DESC
      )
      FROM public.hospital_doctors d
      JOIN public.hospital_members hm
        ON hm.hospital_id = d.hospital_id
       AND hm.user_id = d.user_id
       AND hm.staff_role = 'doctor'
       AND hm.is_active
      JOIN public.hospital_orgs h ON h.id = d.hospital_id
      JOIN public.hospital_patients hp ON hp.hospital_id = d.hospital_id
      WHERE d.user_id = auth.uid()
        AND d.is_active
        AND public.doctor_hospital_can_read_patient(hp.hospital_id, hp.id)
    ), '[]'::jsonb),
    'appointments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'hospital_id', a.hospital_id,
          'hospital_name', h.name,
          'patient_id', p.id,
          'patient_identifier', p.patient_identifier,
          'patient_name', p.name,
          'scheduled_at', a.scheduled_at,
          'kind', a.kind,
          'status', a.status,
          'reason', a.reason
        )
        ORDER BY a.scheduled_at
      )
      FROM public.hospital_appointments a
      JOIN public.hospital_doctors d ON d.id = a.doctor_id
      JOIN public.hospital_members hm
        ON hm.hospital_id = d.hospital_id
       AND hm.user_id = d.user_id
       AND hm.staff_role = 'doctor'
       AND hm.is_active
      JOIN public.hospital_orgs h ON h.id = a.hospital_id
      JOIN public.hospital_patients p ON p.id = a.patient_id
      WHERE d.user_id = auth.uid()
        AND d.is_active
        AND a.status IN ('scheduled', 'confirmed', 'checked_in', 'in_consultation')
        AND a.scheduled_at >= now() - interval '1 day'
        AND a.scheduled_at < now() + interval '30 days'
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_hospital_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'appointment_count', (
      SELECT count(*)
      FROM public.hospital_patients p
      JOIN public.hospital_appointments a ON a.patient_id = p.id
      WHERE p.patient_user_id = auth.uid()
    ),
    'appointments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'hospital_name', h.name,
          'patient_identifier', p.patient_identifier,
          'doctor_name', d.doctor_name,
          'scheduled_at', a.scheduled_at,
          'kind', a.kind,
          'status', a.status,
          'reason', a.reason
        )
        ORDER BY a.scheduled_at
      )
      FROM public.hospital_patients p
      JOIN public.hospital_appointments a ON a.patient_id = p.id
      JOIN public.hospital_orgs h ON h.id = a.hospital_id
      JOIN public.hospital_doctors d ON d.id = a.doctor_id
      WHERE p.patient_user_id = auth.uid()
        AND a.status IN ('scheduled', 'confirmed', 'checked_in', 'in_consultation')
        AND a.scheduled_at >= now() - interval '1 day'
        AND a.scheduled_at < now() + interval '30 days'
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_hospital_appointment_patient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
  appointment_hospital text;
  notification_message text;
BEGIN
  SELECT hp.patient_user_id, h.name
  INTO recipient, appointment_hospital
  FROM public.hospital_patients hp
  JOIN public.hospital_orgs h ON h.id = hp.hospital_id
  WHERE hp.id = NEW.patient_id AND hp.hospital_id = NEW.hospital_id;

  IF recipient IS NULL THEN
    RETURN NEW;
  END IF;

  notification_message := CASE
    WHEN NEW.status = 'cancelled' THEN 'Your appointment at ' || appointment_hospital || ' was cancelled.'
    ELSE 'Your appointment at ' || appointment_hospital || ' was updated.'
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE user_id = recipient
      AND type = 'appointment'
      AND message = notification_message
      AND created_at > now() - interval '5 minutes'
  ) THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      recipient,
      CASE WHEN NEW.status = 'cancelled' THEN 'Appointment cancelled' ELSE 'Hospital appointment updated' END,
      notification_message,
      'appointment'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_hospital_appointment_patient ON public.hospital_appointments;
CREATE TRIGGER notify_hospital_appointment_patient
AFTER INSERT OR UPDATE OF scheduled_at, status ON public.hospital_appointments
FOR EACH ROW
EXECUTE FUNCTION public.notify_hospital_appointment_patient();

REVOKE ALL ON FUNCTION public.doctor_hospital_dashboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.patient_hospital_dashboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_hospital_appointment_patient() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_hospital_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_hospital_dashboard() TO authenticated;
