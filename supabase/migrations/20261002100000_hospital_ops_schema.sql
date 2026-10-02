CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.hospital_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.hospital_patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.hospital_doctors(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN ('opd', 'follow_up', 'referral')),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'checked_in', 'in_consultation', 'completed', 'cancelled', 'no_show')),
  source text NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'patient_app', 'referral', 'follow_up')),
  reason text,
  cancel_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hospital_appointments_hospital_scheduled ON public.hospital_appointments (hospital_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_hospital_appointments_patient ON public.hospital_appointments (patient_id);

CREATE TABLE IF NOT EXISTS public.hospital_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.hospital_patients(id) ON DELETE CASCADE,
  visit_date date NOT NULL,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, patient_id, visit_date)
);
CREATE INDEX IF NOT EXISTS idx_hospital_visits_hospital_date ON public.hospital_visits (hospital_id, visit_date);

CREATE TABLE IF NOT EXISTS public.opd_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.hospital_doctors(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  session_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  room text,
  default_consult_minutes integer NOT NULL DEFAULT 10 CHECK (default_consult_minutes > 0),
  last_token integer NOT NULL DEFAULT 0 CHECK (last_token >= 0),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'open', 'paused', 'closed')),
  delay_note text,
  opened_at timestamptz,
  closed_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  UNIQUE (hospital_id, doctor_id, session_date, start_time)
);
CREATE INDEX IF NOT EXISTS idx_opd_sessions_hospital_date ON public.opd_sessions (hospital_id, session_date, status);

CREATE TABLE IF NOT EXISTS public.queue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.opd_sessions(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.hospital_patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.hospital_appointments(id) ON DELETE SET NULL,
  visit_id uuid REFERENCES public.hospital_visits(id) ON DELETE SET NULL,
  token_number integer NOT NULL CHECK (token_number > 0),
  priority_rank smallint NOT NULL DEFAULT 3 CHECK (priority_rank BETWEEN 0 AND 3),
  priority_reason text,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'called', 'in_consultation', 'completed', 'skipped', 'no_show', 'cancelled', 'referred')),
  is_walk_in boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  called_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  est_wait_low_min integer,
  est_wait_high_min integer,
  notified_thresholds integer[] NOT NULL DEFAULT '{}',
  notified_called boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, token_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_entries_active_patient
  ON public.queue_entries (session_id, patient_id)
  WHERE status IN ('waiting', 'called', 'in_consultation');
CREATE INDEX IF NOT EXISTS idx_queue_entries_session_status_priority
  ON public.queue_entries (session_id, status, priority_rank, token_number);
CREATE INDEX IF NOT EXISTS idx_queue_entries_hospital_patient ON public.queue_entries (hospital_id, patient_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS public.consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.hospital_patients(id) ON DELETE CASCADE,
  queue_entry_id uuid REFERENCES public.queue_entries(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.opd_sessions(id) ON DELETE SET NULL,
  doctor_id uuid REFERENCES public.hospital_doctors(id) ON DELETE SET NULL,
  complaint text,
  assessment text,
  plan text,
  advice text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  parent_id uuid REFERENCES public.consultations(id) ON DELETE SET NULL,
  finalised_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consultations_hospital_patient ON public.consultations (hospital_id, patient_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_final_consultation_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $trigger$
BEGIN
  IF OLD.status = 'final' THEN
    RAISE EXCEPTION 'Final consultations are immutable; create an amendment' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$trigger$;
DROP TRIGGER IF EXISTS trg_prevent_final_consultation_update ON public.consultations;
CREATE TRIGGER trg_prevent_final_consultation_update
BEFORE UPDATE ON public.consultations
FOR EACH ROW EXECUTE FUNCTION public.prevent_final_consultation_update();
REVOKE ALL ON FUNCTION public.prevent_final_consultation_update() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.hospital_patients(id) ON DELETE CASCADE,
  consultation_id uuid NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES public.hospital_doctors(id) ON DELETE SET NULL,
  notes text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prescriptions_hospital_patient ON public.prescriptions (hospital_id, patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.prescription_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  medicine_name text NOT NULL,
  dose text,
  frequency text,
  duration text,
  instructions text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.hospital_patients(id) ON DELETE CASCADE,
  from_consultation_id uuid REFERENCES public.consultations(id) ON DELETE CASCADE,
  from_doctor_id uuid REFERENCES public.hospital_doctors(id) ON DELETE SET NULL,
  to_department_id uuid REFERENCES public.hospital_departments(id) ON DELETE CASCADE,
  to_doctor_id uuid REFERENCES public.hospital_doctors(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'clinically_priority', 'emergency')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'queued', 'completed', 'cancelled')),
  queue_entry_id uuid REFERENCES public.queue_entries(id) ON DELETE SET NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.hospital_patients(id) ON DELETE CASCADE,
  consultation_id uuid REFERENCES public.consultations(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  advice text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'booked', 'done', 'cancelled')),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.investigation_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('imaging', 'lab', 'pathology', 'nuclear', 'procedure', 'other')),
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  expected_report_min_days integer NOT NULL DEFAULT 1 CHECK (expected_report_min_days >= 0),
  expected_report_max_days integer NOT NULL DEFAULT 1 CHECK (expected_report_max_days >= expected_report_min_days),
  prep_instructions text,
  emergency_slots_per_day integer NOT NULL DEFAULT 0 CHECK (emergency_slots_per_day >= 0),
  reserved_slots_per_day integer NOT NULL DEFAULT 0 CHECK (reserved_slots_per_day >= 0),
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, name)
);

CREATE TABLE IF NOT EXISTS public.investigation_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  type_id uuid NOT NULL REFERENCES public.investigation_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired')),
  slot_minutes integer NOT NULL DEFAULT 30 CHECK (slot_minutes > 0),
  slots_per_day integer NOT NULL CHECK (slots_per_day >= 0),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, type_id, name)
);

CREATE TABLE IF NOT EXISTS public.resource_working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.investigation_resources(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  UNIQUE (resource_id, weekday)
);

CREATE TABLE IF NOT EXISTS public.hospital_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name text NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, holiday_date)
);

CREATE TABLE IF NOT EXISTS public.resource_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES public.investigation_resources(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL CHECK (reason IN ('holiday', 'maintenance', 'staff_unavailable')),
  note text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.investigation_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  type_id uuid NOT NULL REFERENCES public.investigation_types(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.investigation_resources(id) ON DELETE CASCADE,
  slot_start timestamptz NOT NULL,
  slot_end timestamptz NOT NULL,
  kind text NOT NULL DEFAULT 'normal' CHECK (kind IN ('normal', 'reserved', 'emergency')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'booked', 'blocked', 'held')),
  booked_order_id uuid,
  held_for_order_id uuid,
  held_until timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (slot_end > slot_start),
  UNIQUE (resource_id, slot_start)
);
CREATE INDEX IF NOT EXISTS idx_investigation_slots_type_status_start ON public.investigation_slots (hospital_id, type_id, status, slot_start);

CREATE TABLE IF NOT EXISTS public.investigation_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.hospital_patients(id) ON DELETE CASCADE,
  type_id uuid NOT NULL REFERENCES public.investigation_types(id) ON DELETE CASCADE,
  ordered_by_doctor_id uuid REFERENCES public.hospital_doctors(id) ON DELETE SET NULL,
  consultation_id uuid REFERENCES public.consultations(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'clinically_priority', 'emergency')),
  status text NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'waitlisted', 'offered', 'scheduled', 'checked_in', 'performed', 'processing', 'report_ready', 'doctor_reviewed', 'cancelled')),
  slot_id uuid REFERENCES public.investigation_slots(id) ON DELETE SET NULL,
  scheduled_for timestamptz,
  ordered_at timestamptz NOT NULL DEFAULT now(),
  checked_in_at timestamptz,
  performed_at timestamptz,
  processing_at timestamptz,
  report_ready_at timestamptz,
  reviewed_at timestamptz,
  expected_report_from date,
  expected_report_to date,
  needs_reschedule boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  cancel_reason text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_investigation_orders_hospital_status ON public.investigation_orders (hospital_id, status, ordered_at DESC);
CREATE INDEX IF NOT EXISTS idx_investigation_orders_patient ON public.investigation_orders (hospital_id, patient_id, ordered_at DESC);

ALTER TABLE public.investigation_slots
  DROP CONSTRAINT IF EXISTS investigation_slots_booked_order_id_fkey;
ALTER TABLE public.investigation_slots
  ADD CONSTRAINT investigation_slots_booked_order_id_fkey
  FOREIGN KEY (booked_order_id) REFERENCES public.investigation_orders(id) ON DELETE SET NULL;
ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS depends_on_order_id uuid REFERENCES public.investigation_orders(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.investigation_order_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.investigation_orders(id) ON DELETE CASCADE,
  notes text NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.investigation_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.investigation_orders(id) ON DELETE CASCADE,
  type_id uuid NOT NULL REFERENCES public.investigation_types(id) ON DELETE CASCADE,
  priority_rank smallint NOT NULL CHECK (priority_rank BETWEEN 0 AND 3),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'offered', 'accepted', 'expired', 'cancelled')),
  offered_slot_id uuid REFERENCES public.investigation_slots(id) ON DELETE SET NULL,
  offer_expires_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_investigation_waitlist_type_status_priority ON public.investigation_waitlist (hospital_id, type_id, status, priority_rank, joined_at);

CREATE TABLE IF NOT EXISTS public.investigation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.investigation_orders(id) ON DELETE CASCADE,
  storage_path text,
  summary text,
  abnormal_flag boolean NOT NULL DEFAULT false,
  issued_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_investigation_reports_hospital_issued ON public.investigation_reports (hospital_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS public.investigation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.investigation_orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.priority_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  priority text NOT NULL CHECK (priority IN ('routine', 'urgent', 'clinically_priority', 'emergency')),
  target_max_wait_days integer NOT NULL CHECK (target_max_wait_days >= 0),
  allowed_slot_kinds text[] NOT NULL,
  staff_approval_required boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, priority)
);

CREATE TABLE IF NOT EXISTS public.hospital_wards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, name)
);
CREATE TABLE IF NOT EXISTS public.hospital_beds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  ward_id uuid NOT NULL REFERENCES public.hospital_wards(id) ON DELETE CASCADE,
  bed_label text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'cleaning', 'blocked')),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ward_id, bed_label)
);
CREATE INDEX IF NOT EXISTS idx_hospital_beds_hospital_status ON public.hospital_beds (hospital_id, status);
CREATE TABLE IF NOT EXISTS public.hospital_admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.hospital_patients(id) ON DELETE CASCADE,
  ward_id uuid NOT NULL REFERENCES public.hospital_wards(id) ON DELETE CASCADE,
  bed_id uuid NOT NULL REFERENCES public.hospital_beds(id) ON DELETE CASCADE,
  admitting_doctor_id uuid REFERENCES public.hospital_doctors(id) ON DELETE SET NULL,
  reason text,
  status text NOT NULL DEFAULT 'admitted' CHECK (status IN ('admitted', 'transferred', 'discharged')),
  admitted_at timestamptz NOT NULL DEFAULT now(),
  discharged_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hospital_admissions_hospital_status ON public.hospital_admissions (hospital_id, status, admitted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hospital_admissions_active_bed ON public.hospital_admissions (bed_id) WHERE status IN ('admitted', 'transferred');

CREATE TABLE IF NOT EXISTS public.link_code_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_link_code_attempts_user_time ON public.link_code_attempts (user_id, attempted_at DESC);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS hospital_id uuid,
  ADD COLUMN IF NOT EXISTS ref_table text,
  ADD COLUMN IF NOT EXISTS ref_id uuid,
  ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedupe
  ON public.notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

ALTER TABLE public.hospital_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opd_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigation_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigation_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigation_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigation_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigation_order_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigation_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.priority_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_code_attempts ENABLE ROW LEVEL SECURITY;

DO $policies$
DECLARE
  v_table text;
  v_config_table text;
  v_patient_tables text[] := ARRAY['hospital_appointments','hospital_visits','opd_sessions','queue_entries','investigation_orders','investigation_waitlist','investigation_slots','investigation_events','hospital_admissions','hospital_wards','hospital_beds'];
  v_clinical_tables text[] := ARRAY['consultations','prescriptions','prescription_items','referrals','follow_ups'];
  v_pipeline_tables text[] := ARRAY['investigation_reports','investigation_order_notes'];
  v_member_tables text[] := ARRAY['investigation_types','investigation_resources','resource_working_hours','hospital_holidays','resource_closures','priority_rules'];
  v_admin_tables text[] := ARRAY['investigation_types','investigation_resources','resource_working_hours','hospital_holidays','resource_closures','priority_rules','hospital_wards','hospital_beds'];
BEGIN
  FOREACH v_table IN ARRAY v_patient_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_hospital_select', v_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.hospital_has_cap(hospital_id, ''patients.read''))', v_table || '_hospital_select', v_table);
  END LOOP;
  FOREACH v_table IN ARRAY v_clinical_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_clinical_select', v_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.hospital_has_cap(hospital_id, ''clinical.read''))', v_table || '_clinical_select', v_table);
  END LOOP;
  FOREACH v_table IN ARRAY v_pipeline_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_pipeline_select', v_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.hospital_has_cap(hospital_id, ''clinical.read'') OR public.hospital_has_cap(hospital_id, ''orders.pipeline''))', v_table || '_pipeline_select', v_table);
  END LOOP;
  FOREACH v_table IN ARRAY v_member_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_member_select', v_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_hospital_member(hospital_id))', v_table || '_member_select', v_table);
  END LOOP;
  FOREACH v_config_table IN ARRAY v_admin_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_config_table || '_admin_insert', v_config_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_config_table || '_admin_update', v_config_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_config_table || '_admin_delete', v_config_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_hospital_admin(hospital_id))', v_config_table || '_admin_insert', v_config_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_hospital_admin(hospital_id)) WITH CHECK (public.is_hospital_admin(hospital_id))', v_config_table || '_admin_update', v_config_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_hospital_admin(hospital_id))', v_config_table || '_admin_delete', v_config_table);
  END LOOP;
END;
$policies$;

REVOKE ALL ON public.link_code_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.hospital_appointments, public.hospital_visits, public.opd_sessions, public.queue_entries,
  public.consultations, public.prescriptions, public.prescription_items, public.referrals, public.follow_ups,
  public.investigation_slots, public.investigation_orders, public.investigation_order_notes,
  public.investigation_waitlist, public.investigation_reports, public.investigation_events,
  public.hospital_admissions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hospital_appointments, public.hospital_visits, public.opd_sessions, public.queue_entries,
  public.consultations, public.prescriptions, public.prescription_items, public.referrals, public.follow_ups,
  public.investigation_types, public.investigation_resources, public.resource_working_hours,
  public.hospital_holidays, public.resource_closures, public.investigation_slots, public.investigation_orders,
  public.investigation_order_notes, public.investigation_waitlist, public.investigation_reports,
  public.investigation_events, public.priority_rules, public.hospital_wards, public.hospital_beds,
  public.hospital_admissions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.investigation_types, public.investigation_resources, public.resource_working_hours,
  public.hospital_holidays, public.resource_closures, public.priority_rules, public.hospital_wards, public.hospital_beds TO authenticated;

CREATE OR REPLACE FUNCTION public.hospital_today(p_hospital_id uuid)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$ SELECT (now() AT TIME ZONE COALESCE((SELECT h.timezone FROM public.hospital_orgs h WHERE h.id = p_hospital_id), 'Asia/Kolkata'))::date $fn$;
CREATE OR REPLACE FUNCTION public.hospital_local_now(p_hospital_id uuid)
RETURNS timestamp LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$ SELECT now() AT TIME ZONE COALESCE((SELECT h.timezone FROM public.hospital_orgs h WHERE h.id = p_hospital_id), 'Asia/Kolkata') $fn$;
CREATE OR REPLACE FUNCTION public.hospital_setting(p_hospital_id uuid, p_key text, p_default jsonb DEFAULT 'null'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$ SELECT COALESCE((SELECT h.settings -> p_key FROM public.hospital_orgs h WHERE h.id = p_hospital_id), p_default) $fn$;
CREATE OR REPLACE FUNCTION public.hospital_normalize_id(p_hospital_id uuid, p_input text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_input text;
  v_prefix text;
BEGIN
  IF p_input IS NULL OR NULLIF(btrim(p_input), '') IS NULL THEN RETURN NULL; END IF;
  v_input := upper(regexp_replace(btrim(p_input), '[[:space:]_-]+', '', 'g'));
  SELECT COALESCE(h.patient_id_prefix, '') INTO v_prefix FROM public.hospital_orgs h WHERE h.id = p_hospital_id;
  IF v_input ~ '^[0-9]+$' THEN RETURN upper(regexp_replace(COALESCE(v_prefix, ''), '[[:space:]_-]+', '', 'g')) || v_input; END IF;
  IF v_input ~ '^[A-Z]+[0-9]+$' THEN RETURN upper(regexp_replace(COALESCE(v_prefix, ''), '[[:space:]_-]+', '', 'g')) || substring(v_input FROM '([0-9]+)$'); END IF;
  RETURN v_input;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.hospital_log_event(p_hospital_id uuid, p_patient_id uuid, p_event_type text, p_details jsonb DEFAULT '{}'::jsonb, p_visible boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.patient_journey_events (hospital_id, patient_id, actor_user_id, event_type, details, visible_to_patient)
  VALUES (p_hospital_id, p_patient_id, auth.uid(), p_event_type, COALESCE(p_details, '{}'::jsonb), p_visible);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.hospital_notification_text(p_type text, p_lang text, p_params jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'title', CASE p_type WHEN 'token_assigned' THEN CASE WHEN p_lang = 'hi' THEN 'टोकन आवंटित' ELSE 'Token assigned' END
      WHEN 'queue_threshold' THEN CASE WHEN p_lang = 'hi' THEN 'आपकी बारी करीब है' ELSE 'Your turn is approaching' END
      WHEN 'token_called' THEN CASE WHEN p_lang = 'hi' THEN 'कृपया डॉक्टर के पास आएं' ELSE 'Please see the doctor' END
      WHEN 'slot_offer' THEN CASE WHEN p_lang = 'hi' THEN 'जांच का समय उपलब्ध' ELSE 'Investigation slot available' END
      WHEN 'booking_confirmed' THEN CASE WHEN p_lang = 'hi' THEN 'जांच बुक हुई' ELSE 'Investigation booked' END
      WHEN 'booking_changed' THEN CASE WHEN p_lang = 'hi' THEN 'जांच बुकिंग बदली' ELSE 'Investigation booking changed' END
      WHEN 'report_ready' THEN CASE WHEN p_lang = 'hi' THEN 'रिपोर्ट तैयार है' ELSE 'Report ready' END ELSE p_type END,
    'message', COALESCE(p_params ->> 'message', p_type)
  )
$fn$;
CREATE OR REPLACE FUNCTION public.hospital_notify_patient(p_hospital_id uuid, p_patient_id uuid, p_type text, p_params jsonb DEFAULT '{}'::jsonb, p_dedupe text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_user_id uuid;
  v_lang text;
  v_text jsonb;
BEGIN
  SELECT hp.patient_user_id, COALESCE(p.preferred_language, 'en') INTO v_user_id, v_lang
  FROM public.hospital_patients hp LEFT JOIN public.profiles p ON p.id = hp.patient_user_id
  WHERE hp.id = p_patient_id AND hp.hospital_id = p_hospital_id;
  IF v_user_id IS NULL THEN RETURN; END IF;
  v_text := public.hospital_notification_text(p_type, v_lang, p_params);
  INSERT INTO public.notifications (user_id, type, title, message, hospital_id, ref_table, ref_id, dedupe_key)
  VALUES (v_user_id, p_type, v_text ->> 'title', v_text ->> 'message', p_hospital_id, 'hospital_patients', p_patient_id, p_dedupe)
  ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.add_working_days(p_hospital_id uuid, p_start date, p_days integer)
RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_date date := p_start;
  v_count integer := 0;
  v_weekdays integer[];
BEGIN
  SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(h.settings -> 'working_weekdays', '[1,2,3,4,5,6]'::jsonb))::integer)
    INTO v_weekdays FROM public.hospital_orgs h WHERE h.id = p_hospital_id;
  IF v_weekdays IS NULL THEN v_weekdays := ARRAY[1,2,3,4,5,6]; END IF;
  WHILE v_count < GREATEST(p_days, 0) LOOP
    v_date := v_date + 1;
    IF extract(dow FROM v_date)::integer = ANY(v_weekdays)
       AND NOT EXISTS (SELECT 1 FROM public.hospital_holidays hh WHERE hh.hospital_id = p_hospital_id AND hh.holiday_date = v_date) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_date;
END;
$fn$;

REVOKE ALL ON FUNCTION public.hospital_today(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hospital_local_now(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hospital_setting(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hospital_normalize_id(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hospital_log_event(uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hospital_notification_text(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hospital_notify_patient(uuid, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_working_days(uuid, date, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hospital_today(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.hospital_local_now(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.hospital_setting(uuid, text, jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.add_working_days(uuid, date, integer) FROM authenticated;

CREATE OR REPLACE FUNCTION public.seed_hospital_defaults(p_hospital_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_type record;
  v_department_id uuid;
  v_resource_id uuid;
BEGIN
  IF NOT public.is_hospital_admin(p_hospital_id) THEN
    RAISE EXCEPTION 'hospital administrator required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.hospital_departments (hospital_id, name, department_type)
  VALUES (p_hospital_id, 'Medical Oncology', 'clinical'), (p_hospital_id, 'Radiation Oncology', 'clinical'),
    (p_hospital_id, 'Surgical Oncology', 'clinical'), (p_hospital_id, 'Radiology', 'diagnostic'),
    (p_hospital_id, 'Pathology', 'diagnostic'), (p_hospital_id, 'Nuclear Medicine', 'diagnostic')
  ON CONFLICT (hospital_id, name) DO NOTHING;
  SELECT id INTO v_department_id FROM public.hospital_departments WHERE hospital_id = p_hospital_id AND name = 'Radiology';
  FOR v_type IN SELECT * FROM (VALUES
    ('Mammography','imaging',2,5,4,1,1), ('CT Scan','imaging',1,3,12,1,1), ('MRI','imaging',2,5,6,1,1),
    ('PET-CT','nuclear',3,7,5,1,1), ('X-Ray','imaging',0,1,30,0,0), ('Ultrasound','imaging',0,1,20,0,0),
    ('Blood Tests','lab',1,2,100,0,0), ('Pathology','pathology',3,7,40,0,0), ('Biopsy','procedure',5,10,6,1,1),
    ('Nuclear Medicine','nuclear',2,5,5,1,1)
  ) AS t(type_name, type_category, min_days, max_days, daily_slots, emergency_slots, reserved_slots)
  LOOP
    INSERT INTO public.investigation_types (hospital_id, name, category, department_id, expected_report_min_days, expected_report_max_days, emergency_slots_per_day, reserved_slots_per_day)
    VALUES (p_hospital_id, v_type.type_name, v_type.type_category, v_department_id, v_type.min_days, v_type.max_days, v_type.emergency_slots, v_type.reserved_slots)
    ON CONFLICT (hospital_id, name) DO NOTHING;
    SELECT id INTO v_resource_id FROM public.investigation_resources
    WHERE hospital_id = p_hospital_id AND type_id = (SELECT id FROM public.investigation_types WHERE hospital_id = p_hospital_id AND name = v_type.type_name)
    ORDER BY created_at LIMIT 1;
    IF v_resource_id IS NULL THEN
      INSERT INTO public.investigation_resources (hospital_id, type_id, name, slots_per_day)
      SELECT p_hospital_id, id, v_type.type_name || ' 1', v_type.daily_slots FROM public.investigation_types
      WHERE hospital_id = p_hospital_id AND name = v_type.type_name RETURNING id INTO v_resource_id;
    END IF;
    INSERT INTO public.resource_working_hours (hospital_id, resource_id, weekday, start_time, end_time)
    SELECT p_hospital_id, v_resource_id, days.weekday,
      CASE WHEN v_type.type_name IN ('X-Ray','Blood Tests') THEN time '08:00' ELSE time '09:00' END,
      CASE WHEN v_type.type_name IN ('X-Ray','Blood Tests') THEN time '18:00' ELSE time '17:00' END
    FROM generate_series(1, 6) AS days(weekday)
    ON CONFLICT (resource_id, weekday) DO NOTHING;
    v_resource_id := NULL;
  END LOOP;
  INSERT INTO public.priority_rules (hospital_id, priority, target_max_wait_days, allowed_slot_kinds, staff_approval_required)
  VALUES (p_hospital_id, 'routine', 30, ARRAY['normal'], false),
    (p_hospital_id, 'urgent', 14, ARRAY['normal','reserved'], true),
    (p_hospital_id, 'clinically_priority', 7, ARRAY['normal','reserved'], true),
    (p_hospital_id, 'emergency', 1, ARRAY['emergency','reserved','normal'], false)
  ON CONFLICT (hospital_id, priority) DO NOTHING;
  UPDATE public.hospital_orgs
  SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
    'default_consult_minutes', COALESCE(settings -> 'default_consult_minutes', '10'::jsonb),
    'wait_factor_low', COALESCE(settings -> 'wait_factor_low', '0.75'::jsonb),
    'wait_factor_high', COALESCE(settings -> 'wait_factor_high', '1.4'::jsonb),
    'notify_thresholds', COALESCE(settings -> 'notify_thresholds', '[10,5]'::jsonb),
    'session_delay_minutes', COALESCE(settings -> 'session_delay_minutes', '15'::jsonb),
    'offer_hold_hours', COALESCE(settings -> 'offer_hold_hours', '24'::jsonb),
    'slot_horizon_days', COALESCE(settings -> 'slot_horizon_days', '120'::jsonb),
    'working_weekdays', COALESCE(settings -> 'working_weekdays', '[1,2,3,4,5,6]'::jsonb)
  )
  WHERE id = p_hospital_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.seed_hospital_defaults(uuid) FROM PUBLIC, anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('hospital-reports', 'hospital-reports', false, 10485760, ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS hospital_reports_member_read ON storage.objects;
DROP POLICY IF EXISTS hospital_reports_pipeline_insert ON storage.objects;
CREATE POLICY hospital_reports_member_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'hospital-reports' AND public.is_hospital_member((split_part(name, '/', 1))::uuid)
  AND (public.hospital_has_cap((split_part(name, '/', 1))::uuid, 'clinical.read') OR public.hospital_has_cap((split_part(name, '/', 1))::uuid, 'orders.pipeline')));
CREATE POLICY hospital_reports_pipeline_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'hospital-reports' AND public.hospital_has_cap((split_part(name, '/', 1))::uuid, 'orders.pipeline'));

DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'queue_entries') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_entries; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'opd_sessions') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.opd_sessions; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'hospital_appointments') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.hospital_appointments; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'investigation_orders') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.investigation_orders; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'investigation_slots') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.investigation_slots; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'hospital_admissions') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.hospital_admissions; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; END IF;
  END IF;
END;
$realtime$;

NOTIFY pgrst, 'reload schema';
