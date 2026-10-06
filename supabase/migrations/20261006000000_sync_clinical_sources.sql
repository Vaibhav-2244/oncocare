-- Connect doctor and hospital clinical records to the patient-owned clinical views.

ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS source_key text,
  ADD COLUMN IF NOT EXISTS source_doctor_prescription_id uuid
    REFERENCES public.doctor_prescriptions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS medications_source_key_unique
  ON public.medications (source_key)
  WHERE source_key IS NOT NULL;

ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS source_key text,
  ADD COLUMN IF NOT EXISTS source_doctor_treatment_plan_id uuid
    REFERENCES public.doctor_treatment_plans(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS treatments_source_key_unique
  ON public.treatments (source_key)
  WHERE source_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_doctor_prescription_to_patient(
  p_prescription_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prescription_row public.doctor_prescriptions;
  patient_user_id uuid;
  item jsonb;
  item_index integer := 0;
  medicine_name text;
  medicine_dose text;
BEGIN
  SELECT dp.*
  INTO prescription_row
  FROM public.doctor_prescriptions dp
  JOIN public.doctor_patients roster ON roster.id = dp.doctor_patient_id
  WHERE dp.id = p_prescription_id;

  SELECT roster.patient_user_id
  INTO patient_user_id
  FROM public.doctor_patients roster
  WHERE roster.id = prescription_row.doctor_patient_id;

  IF prescription_row.id IS NULL OR patient_user_id IS NULL THEN
    RETURN;
  END IF;

  IF prescription_row.status IN ('cancelled', 'expired') THEN
    UPDATE public.medications
    SET is_active = false
    WHERE source_doctor_prescription_id = prescription_row.id;
  ELSE
    FOR item IN SELECT value FROM jsonb_array_elements(prescription_row.items)
    LOOP
      medicine_name := NULLIF(btrim(COALESCE(item->>'medicine', item->>'name', '')), '');
      medicine_dose := NULLIF(btrim(COALESCE(item->>'dose', item->>'dosage', '')), '');
      IF medicine_name IS NOT NULL THEN
        INSERT INTO public.medications (
          user_id, name, dosage, frequency, times, notes, is_active,
          source_key, source_doctor_prescription_id
        )
        VALUES (
          patient_user_id, medicine_name, COALESCE(medicine_dose, 'As directed'),
          COALESCE(NULLIF(item->>'frequency', ''), 'as directed'),
          COALESCE(item->'times', '[]'::jsonb),
          prescription_row.notes, true,
          prescription_row.id::text || ':' || item_index::text, prescription_row.id
        )
        ON CONFLICT (source_key) DO UPDATE SET
          name = EXCLUDED.name,
          dosage = EXCLUDED.dosage,
          frequency = EXCLUDED.frequency,
          times = EXCLUDED.times,
          notes = EXCLUDED.notes,
          is_active = true,
          source_doctor_prescription_id = EXCLUDED.source_doctor_prescription_id;
      END IF;
      item_index := item_index + 1;
    END LOOP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = patient_user_id
      AND type = 'prescription'
      AND message = 'Prescription ' || prescription_row.prescription_no || ' is now available.'
      AND created_at > now() - interval '5 minutes'
  ) THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      patient_user_id,
      'Prescription updated',
      'Prescription ' || prescription_row.prescription_no || ' is now available.',
      'prescription'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_create_prescription(
  p_patient_id uuid,
  p_items jsonb,
  p_valid_until date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.doctor_prescriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created public.doctor_prescriptions;
  next_no integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'At least one prescription item is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.doctor_patients
    WHERE id = p_patient_id AND doctor_id = auth.uid() AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Patient is not in your roster' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) + 1 INTO next_no
  FROM public.doctor_prescriptions WHERE doctor_id = auth.uid();

  INSERT INTO public.doctor_prescriptions (
    doctor_id, doctor_patient_id, prescription_no, items, valid_until, notes
  )
  VALUES (
    auth.uid(), p_patient_id,
    'RX-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(next_no::text, 4, '0'),
    p_items, p_valid_until, p_notes
  )
  RETURNING * INTO created;

  PERFORM public.sync_doctor_prescription_to_patient(created.id);
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_doctor_treatment_plan_to_patient(
  p_plan_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan_row public.doctor_treatment_plans;
  patient_user_id uuid;
BEGIN
  SELECT plan.*
  INTO plan_row
  FROM public.doctor_treatment_plans plan
  JOIN public.doctor_patients roster ON roster.id = plan.doctor_patient_id
  WHERE plan.id = p_plan_id;
  SELECT roster.patient_user_id
  INTO patient_user_id
  FROM public.doctor_patients roster
  WHERE roster.id = plan_row.doctor_patient_id;

  IF plan_row.id IS NULL OR patient_user_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.treatments (
    user_id, type, name, status, notes, progress,
    source_key, source_doctor_treatment_plan_id
  )
  VALUES (
    patient_user_id, 'other', plan_row.name,
    CASE plan_row.status
      WHEN 'active' THEN 'active'
      WHEN 'completed' THEN 'completed'
      WHEN 'cancelled' THEN 'cancelled'
      ELSE 'planned'
    END,
    plan_row.protocol, round(plan_row.progress_percent)::integer,
    plan_row.id::text, plan_row.id
  )
  ON CONFLICT (source_key) DO UPDATE SET
    name = EXCLUDED.name,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    progress = EXCLUDED.progress,
    source_doctor_treatment_plan_id = EXCLUDED.source_doctor_treatment_plan_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = patient_user_id
      AND type = 'treatment'
      AND message = 'Treatment plan "' || plan_row.name || '" was updated.'
      AND created_at > now() - interval '5 minutes'
  ) THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      patient_user_id, 'Treatment plan updated',
      'Treatment plan "' || plan_row.name || '" was updated.', 'treatment'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_doctor_treatment_plan_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_doctor_treatment_plan_to_patient(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_doctor_treatment_plan ON public.doctor_treatment_plans;
CREATE TRIGGER sync_doctor_treatment_plan
AFTER INSERT OR UPDATE OF name, protocol, progress_percent, status
ON public.doctor_treatment_plans
FOR EACH ROW EXECUTE FUNCTION public.sync_doctor_treatment_plan_trigger();

CREATE OR REPLACE FUNCTION public.doctor_get_patient_live_data(p_doctor_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  patient_user uuid;
  granted text[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  SELECT p.patient_user_id, c.scopes INTO patient_user, granted
  FROM public.doctor_patients p
  JOIN public.doctor_consents c
    ON c.doctor_patient_id = p.id AND c.revoked_at IS NULL
  WHERE p.id = p_doctor_patient_id AND p.doctor_id = auth.uid();
  IF patient_user IS NULL THEN
    RAISE EXCEPTION 'Patient has not granted active consent' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'symptoms', CASE WHEN 'symptoms' = ANY(granted) THEN
      COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.recorded_at DESC)
        FROM public.symptoms s WHERE s.user_id = patient_user), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'medications', CASE WHEN 'medications' = ANY(granted) THEN
      COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC)
        FROM public.medications m WHERE m.user_id = patient_user), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'treatments', CASE WHEN 'treatments' = ANY(granted) THEN
      COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC)
        FROM public.treatments t WHERE t.user_id = patient_user), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'timeline', CASE WHEN 'timeline' = ANY(granted) THEN
      COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.event_date DESC)
        FROM public.health_timeline t WHERE t.user_id = patient_user), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'doctor_prescriptions', CASE WHEN 'prescriptions' = ANY(granted) THEN
      COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC)
        FROM public.doctor_prescriptions p
        JOIN public.doctor_patients dp ON dp.id = p.doctor_patient_id
        WHERE dp.id = p_doctor_patient_id), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'doctor_treatment_plans', CASE WHEN 'treatments' = ANY(granted) THEN
      COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC)
        FROM public.doctor_treatment_plans p
        WHERE p.doctor_patient_id = p_doctor_patient_id), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'doctor_consultations', CASE WHEN 'consultations' = ANY(granted) THEN
      COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.updated_at DESC)
        FROM public.doctor_consultations c
        WHERE c.doctor_patient_id = p_doctor_patient_id), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'consent_scopes', to_jsonb(granted)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_patient_message_contacts()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  member_name text,
  role text,
  specialty text,
  phone text,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dp.id, dp.doctor_id, COALESCE(profile.full_name, 'Doctor'),
    'doctor', doctor_profile.specialization, profile.phone, profile.email
  FROM public.doctor_patients dp
  JOIN public.doctor_consents c
    ON c.doctor_patient_id = dp.id
    AND c.patient_user_id = auth.uid()
    AND c.revoked_at IS NULL
  LEFT JOIN public.profiles profile ON profile.id = dp.doctor_id
  LEFT JOIN public.doctor_profiles doctor_profile ON doctor_profile.user_id = dp.doctor_id
  WHERE dp.patient_user_id = auth.uid()
  ORDER BY profile.full_name;
$$;

CREATE OR REPLACE FUNCTION public.link_patient_account(
  p_hospital_id uuid,
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link_row public.patient_link_codes;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO link_row
  FROM public.patient_link_codes
  WHERE hospital_id = p_hospital_id
    AND code_hash = md5(upper(btrim(p_code)))
    AND consumed_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF link_row.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link code' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.hospital_patients
  SET patient_user_id = auth.uid(), updated_at = now()
  WHERE id = link_row.patient_id
    AND hospital_id = p_hospital_id
    AND (patient_user_id IS NULL OR patient_user_id = auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient account is already linked' USING ERRCODE = '42501';
  END IF;
  UPDATE public.patient_link_codes SET consumed_at = now()
  WHERE id = link_row.id AND consumed_at IS NULL;
  RETURN jsonb_build_object('patient_id', link_row.patient_id, 'linked', true);
END;
$$;

REVOKE ALL ON FUNCTION public.link_patient_account(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_patient_account(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_message_contacts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_get_patient_live_data(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_hospital_patient_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
  event_type text;
  title text;
  body text;
  item_row record;
BEGIN
  IF TG_TABLE_NAME = 'hospital_admissions' THEN
    SELECT patient_user_id INTO recipient FROM public.hospital_patients WHERE id = NEW.patient_id;
    event_type := 'admission';
    title := CASE WHEN NEW.status = 'discharged' THEN 'Hospital discharge updated' ELSE 'Hospital admission updated' END;
    body := 'Your hospital admission status is now ' || NEW.status || '.';
  ELSIF TG_TABLE_NAME = 'investigation_reports' THEN
    SELECT hp.patient_user_id INTO recipient
    FROM public.investigation_orders o
    JOIN public.hospital_patients hp ON hp.id = o.patient_id
    WHERE o.id = NEW.order_id;
    event_type := 'investigation';
    title := 'Investigation report available';
    body := 'A new investigation report is available in your clinical records.';
  ELSIF TG_TABLE_NAME = 'prescriptions' THEN
    SELECT hp.patient_user_id INTO recipient
    FROM public.hospital_patients hp WHERE hp.id = NEW.patient_id;
    event_type := 'prescription';
    title := 'Hospital prescription updated';
    body := 'A hospital prescription was added to your clinical records.';
    IF recipient IS NOT NULL THEN
      FOR item_row IN
        SELECT * FROM public.prescription_items WHERE prescription_id = NEW.id
      LOOP
        INSERT INTO public.medications (
          user_id, name, dosage, frequency, notes, is_active, source_key
        )
        VALUES (
          recipient,
          item_row.medicine_name,
          COALESCE(item_row.dose, 'As directed'),
          COALESCE(item_row.frequency, 'As directed'),
          concat_ws(' ', item_row.duration, item_row.instructions),
          true,
          'hospital-prescription:' || NEW.id::text || ':' || item_row.id::text
        )
        ON CONFLICT (source_key) DO UPDATE SET
          name = EXCLUDED.name,
          dosage = EXCLUDED.dosage,
          frequency = EXCLUDED.frequency,
          notes = EXCLUDED.notes,
          is_active = true;
      END LOOP;
    END IF;
  ELSIF TG_TABLE_NAME = 'consultations' THEN
    SELECT hp.patient_user_id INTO recipient
    FROM public.hospital_patients hp WHERE hp.id = NEW.patient_id;
    event_type := 'consultation';
    title := 'Hospital consultation updated';
    body := 'A hospital consultation was updated in your clinical records.';
  ELSE
    RETURN NEW;
  END IF;

  IF recipient IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = recipient AND type = event_type
      AND message = body AND created_at > now() - interval '5 minutes'
  ) THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (recipient, title, body, event_type);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_hospital_admission ON public.hospital_admissions;
CREATE TRIGGER notify_hospital_admission
AFTER INSERT OR UPDATE OF status ON public.hospital_admissions
FOR EACH ROW EXECUTE FUNCTION public.notify_hospital_patient_event();

DROP TRIGGER IF EXISTS notify_hospital_report ON public.investigation_reports;
CREATE TRIGGER notify_hospital_report
AFTER INSERT ON public.investigation_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_hospital_patient_event();

DROP TRIGGER IF EXISTS notify_hospital_prescription ON public.prescriptions;
CREATE TRIGGER notify_hospital_prescription
AFTER INSERT ON public.prescriptions
FOR EACH ROW EXECUTE FUNCTION public.notify_hospital_patient_event();

CREATE OR REPLACE FUNCTION public.sync_hospital_prescription_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
BEGIN
  SELECT hp.patient_user_id INTO recipient
  FROM public.prescriptions p
  JOIN public.hospital_patients hp ON hp.id = p.patient_id
  WHERE p.id = NEW.prescription_id;

  IF recipient IS NOT NULL THEN
    INSERT INTO public.medications (
      user_id, name, dosage, frequency, notes, is_active, source_key
    )
    VALUES (
      recipient,
      NEW.medicine_name,
      COALESCE(NEW.dose, 'As directed'),
      COALESCE(NEW.frequency, 'As directed'),
      concat_ws(' ', NEW.duration, NEW.instructions),
      true,
      'hospital-prescription:' || NEW.prescription_id::text || ':' || NEW.id::text
    )
    ON CONFLICT (source_key) DO UPDATE SET
      name = EXCLUDED.name,
      dosage = EXCLUDED.dosage,
      frequency = EXCLUDED.frequency,
      notes = EXCLUDED.notes,
      is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_hospital_prescription_item ON public.prescription_items;
CREATE TRIGGER sync_hospital_prescription_item
AFTER INSERT OR UPDATE ON public.prescription_items
FOR EACH ROW EXECUTE FUNCTION public.sync_hospital_prescription_item();

DROP TRIGGER IF EXISTS notify_hospital_consultation ON public.consultations;
CREATE TRIGGER notify_hospital_consultation
AFTER INSERT OR UPDATE OF status ON public.consultations
FOR EACH ROW WHEN (NEW.status = 'final')
EXECUTE FUNCTION public.notify_hospital_patient_event();
