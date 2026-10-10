-- 20261002100000_hospital_ops_schema.sql
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

-- 20261002110000_hospital_opd_rpcs.sql
CREATE OR REPLACE FUNCTION public.search_hospital_patients(p_hospital_id uuid, p_query text, p_limit integer DEFAULT 8)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_norm text;
  v_digits text;
  v_result jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.read') THEN RAISE EXCEPTION 'patients.read capability required' USING ERRCODE = '42501'; END IF;
  v_norm := public.hospital_normalize_id(p_hospital_id, v_query);
  v_digits := regexp_replace(COALESCE(v_query, ''), '[^0-9]', '', 'g');
  SELECT jsonb_build_object(
    'patients', COALESCE((SELECT jsonb_agg(patient_json ORDER BY result_rank, name_similarity DESC)
    FROM (SELECT jsonb_build_object(
      'id', p.id, 'identifier', p.patient_identifier, 'name', p.name, 'age', p.age, 'gender', p.gender,
      'mobile_masked', CASE WHEN p.mobile IS NULL THEN NULL ELSE repeat('X', greatest(length(p.mobile) - 4, 0)) || right(p.mobile, 4) END,
      'today_status', qe.status, 'token', qe.token_number
    ) AS patient_json,
      CASE WHEN p.normalized_identifier = v_norm THEN 0 WHEN v_digits <> '' AND regexp_replace(COALESCE(p.mobile,''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%' THEN 1 ELSE 2 END AS result_rank,
      similarity(p.name, COALESCE(v_query,'')) AS name_similarity, p.name
    FROM public.hospital_patients p
    LEFT JOIN LATERAL (
      SELECT q.status, q.token_number FROM public.queue_entries q JOIN public.opd_sessions s ON s.id = q.session_id
      WHERE q.hospital_id = p_hospital_id AND q.patient_id = p.id AND s.session_date = public.hospital_today(p_hospital_id)
      ORDER BY q.created_at DESC LIMIT 1
    ) qe ON true
    WHERE p.hospital_id = p_hospital_id AND (v_query IS NULL OR p.normalized_identifier = v_norm
      OR (v_digits <> '' AND regexp_replace(COALESCE(p.mobile,''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%')
      OR p.name % v_query OR p.name ILIKE '%' || v_query || '%')
    ORDER BY result_rank, name_similarity DESC LIMIT GREATEST(1, LEAST(COALESCE(p_limit,8),50))) result_rows), '[]'::jsonb),
    'doctors', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.doctor_name, 'department', dep.name))
      FROM public.hospital_doctors d LEFT JOIN public.hospital_departments dep ON dep.id = d.department_id
      WHERE d.hospital_id = p_hospital_id AND d.is_active AND (v_query IS NULL OR d.doctor_name ILIKE '%' || v_query || '%' OR dep.name ILIKE '%' || v_query || '%')), '[]'::jsonb),
    'departments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name)) FROM public.hospital_departments d
      WHERE d.hospital_id = p_hospital_id AND d.is_active AND (v_query IS NULL OR d.name ILIKE '%' || v_query || '%')), '[]'::jsonb),
    'appointments_today', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'patient_id', a.patient_id, 'patient', p.name, 'doctor', d.doctor_name, 'scheduled_at', a.scheduled_at, 'status', a.status))
      FROM public.hospital_appointments a JOIN public.hospital_patients p ON p.id = a.patient_id JOIN public.hospital_doctors d ON d.id = a.doctor_id
      WHERE a.hospital_id = p_hospital_id AND (a.scheduled_at AT TIME ZONE (SELECT h.timezone FROM public.hospital_orgs h WHERE h.id = p_hospital_id))::date = public.hospital_today(p_hospital_id)
        AND a.status IN ('scheduled','confirmed') AND (v_query IS NULL OR p.name ILIKE '%' || v_query || '%' OR d.doctor_name ILIKE '%' || v_query || '%')), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.find_possible_duplicates(p_hospital_id uuid, p_name text, p_mobile text, p_dob date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.register') THEN RAISE EXCEPTION 'patients.register capability required' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'identifier', p.patient_identifier, 'name', p.name, 'mobile_masked', CASE WHEN p.mobile IS NULL THEN NULL ELSE repeat('X', greatest(length(p.mobile)-4,0)) || right(p.mobile,4) END, 'dob', p.dob)), '[]'::jsonb)
  INTO v_result FROM public.hospital_patients p WHERE p.hospital_id = p_hospital_id AND (
    (p_mobile IS NOT NULL AND regexp_replace(COALESCE(p.mobile,''),'[^0-9]','','g') = regexp_replace(p_mobile,'[^0-9]','','g'))
    OR (p_dob IS NOT NULL AND p.dob = p_dob AND similarity(p.name, COALESCE(p_name,'')) > 0.35));
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.import_hospital_patients(p_hospital_id uuid, p_rows jsonb, p_dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_row jsonb; v_status text; v_message text; v_identifier text; v_patient_id uuid; v_output jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.register') THEN RAISE EXCEPTION 'patients.register capability required' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Rows must be a JSON array' USING ERRCODE = '22023'; END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_identifier := public.hospital_normalize_id(p_hospital_id, v_row ->> 'identifier');
    IF NULLIF(v_identifier,'') IS NULL OR NULLIF(btrim(v_row ->> 'name'),'') IS NULL THEN
      v_status := 'error'; v_message := 'Identifier and name are required';
    ELSIF EXISTS (SELECT 1 FROM public.hospital_patients WHERE hospital_id = p_hospital_id AND normalized_identifier = upper(regexp_replace(v_identifier,'[[:space:]_-]+','','g'))) THEN
      v_status := 'duplicate'; v_message := 'Patient identifier already exists';
    ELSIF p_dry_run THEN
      v_status := 'new'; v_message := 'Ready to import';
    ELSE
      INSERT INTO public.hospital_patients (hospital_id, patient_identifier, name, mobile, dob, age, gender)
      VALUES (p_hospital_id, v_identifier, btrim(v_row ->> 'name'), NULLIF(btrim(v_row ->> 'mobile'),''), NULLIF(v_row ->> 'dob','')::date, NULLIF(v_row ->> 'age','')::integer, NULLIF(v_row ->> 'gender',''))
      ON CONFLICT (hospital_id, patient_identifier) DO NOTHING RETURNING id INTO v_patient_id;
      IF v_patient_id IS NULL THEN v_status := 'duplicate'; v_message := 'Patient identifier already exists';
      ELSE v_status := 'new'; v_message := 'Imported';
        INSERT INTO public.hospital_access_audit (hospital_id, patient_id, actor_user_id, action, details) VALUES (p_hospital_id, v_patient_id, auth.uid(), 'patient.imported', jsonb_build_object('identifier',v_identifier));
      END IF;
    END IF;
    v_output := v_output || jsonb_build_array(jsonb_build_object('row',v_row,'status',v_status,'message',v_message));
  END LOOP;
  RETURN jsonb_build_object('rows',v_output,'dry_run',p_dry_run);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_hospital_patient_record(p_hospital_id uuid, p_identifier text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_patient public.hospital_patients; v_result jsonb; v_clinical boolean;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.read') THEN RAISE EXCEPTION 'patients.read capability required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_patient FROM public.hospital_patients WHERE hospital_id = p_hospital_id AND normalized_identifier = upper(regexp_replace(public.hospital_normalize_id(p_hospital_id,p_identifier),'[[:space:]_-]+','','g'));
  IF v_patient.id IS NULL THEN RAISE EXCEPTION 'Patient not found' USING ERRCODE = 'P0002'; END IF;
  v_clinical := public.hospital_has_cap(p_hospital_id,'clinical.read');
  INSERT INTO public.hospital_access_audit (hospital_id, patient_id, actor_user_id, action) VALUES (p_hospital_id,v_patient.id,auth.uid(),'patient.record_opened');
  SELECT jsonb_build_object(
    'patient',jsonb_build_object('id',v_patient.id,'identifier',v_patient.patient_identifier,'name',v_patient.name,'age',v_patient.age,'gender',v_patient.gender,'mobile',v_patient.mobile,'dob',v_patient.dob,'linked',v_patient.patient_user_id IS NOT NULL),
    'today',jsonb_build_object('visit',(SELECT to_jsonb(v) FROM public.hospital_visits v WHERE v.hospital_id=p_hospital_id AND v.patient_id=v_patient.id AND v.visit_date=public.hospital_today(p_hospital_id) LIMIT 1),
      'queue_entry',(SELECT to_jsonb(q) FROM public.queue_entries q JOIN public.opd_sessions s ON s.id=q.session_id WHERE q.hospital_id=p_hospital_id AND q.patient_id=v_patient.id AND s.session_date=public.hospital_today(p_hospital_id) ORDER BY q.created_at DESC LIMIT 1)),
    'appointments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'scheduled_at',a.scheduled_at,'status',a.status,'kind',a.kind,'doctor',d.doctor_name,'department',dep.name) ORDER BY a.scheduled_at DESC) FROM public.hospital_appointments a LEFT JOIN public.hospital_doctors d ON d.id=a.doctor_id LEFT JOIN public.hospital_departments dep ON dep.id=a.department_id WHERE a.hospital_id=p_hospital_id AND a.patient_id=v_patient.id),'[]'::jsonb),
    'orders',COALESCE((SELECT jsonb_agg(CASE WHEN v_clinical THEN jsonb_build_object('id',o.id,'type',t.name,'status',o.status,'priority',o.priority,'scheduled_for',o.scheduled_for,'expected_report_from',o.expected_report_from,'expected_report_to',o.expected_report_to) ELSE jsonb_build_object('status',o.status) END ORDER BY o.ordered_at DESC) FROM public.investigation_orders o JOIN public.investigation_types t ON t.id=o.type_id WHERE o.hospital_id=p_hospital_id AND o.patient_id=v_patient.id),'[]'::jsonb),
    'consultations',CASE WHEN v_clinical THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'status',c.status,'complaint',c.complaint,'assessment',c.assessment,'plan',c.plan,'advice',c.advice,'version',c.version,'created_at',c.created_at) ORDER BY c.created_at DESC) FROM public.consultations c WHERE c.hospital_id=p_hospital_id AND c.patient_id=v_patient.id),'[]'::jsonb) ELSE '[]'::jsonb END,
    'prescriptions',CASE WHEN v_clinical THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',pr.id,'notes',pr.notes,'created_at',pr.created_at,'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('medicine_name',pi.medicine_name,'dose',pi.dose,'frequency',pi.frequency,'duration',pi.duration,'instructions',pi.instructions) ORDER BY pi.created_at) FROM public.prescription_items pi WHERE pi.prescription_id=pr.id),'[]'::jsonb)) ORDER BY pr.created_at DESC) FROM public.prescriptions pr WHERE pr.hospital_id=p_hospital_id AND pr.patient_id=v_patient.id),'[]'::jsonb) ELSE '[]'::jsonb END,
    'admissions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'ward',w.name,'bed',b.bed_label,'status',a.status,'admitted_at',a.admitted_at) ORDER BY a.admitted_at DESC) FROM public.hospital_admissions a JOIN public.hospital_wards w ON w.id=a.ward_id JOIN public.hospital_beds b ON b.id=a.bed_id WHERE a.hospital_id=p_hospital_id AND a.patient_id=v_patient.id),'[]'::jsonb),
    'timeline',COALESCE((SELECT jsonb_agg(jsonb_build_object('event_type',e.event_type,'details',e.details,'created_at',e.created_at,'visible_to_patient',e.visible_to_patient) ORDER BY e.created_at DESC) FROM (SELECT * FROM public.patient_journey_events WHERE hospital_id=p_hospital_id AND patient_id=v_patient.id ORDER BY created_at DESC LIMIT 100) e),'[]'::jsonb),
    'clinical_restricted',NOT v_clinical
  ) INTO v_result;
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.export_hospital_patients(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_rows jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'patients.read') THEN RAISE EXCEPTION 'patients.read capability required' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('identifier',patient_identifier,'name',name,'mobile',mobile,'dob',dob,'age',age,'gender',gender,'is_demo',is_demo) ORDER BY patient_identifier),'[]'::jsonb)
  INTO v_rows FROM public.hospital_patients WHERE hospital_id=p_hospital_id;
  INSERT INTO public.hospital_access_audit(hospital_id,actor_user_id,action,details)
  VALUES(p_hospital_id,auth.uid(),'patient.exported',jsonb_build_object('count',jsonb_array_length(v_rows)));
  RETURN v_rows;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_opd_session(p_hospital_id uuid,p_doctor_id uuid,p_date date,p_start time,p_end time,p_room text,p_minutes integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_session public.opd_sessions;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hospital_doctors WHERE id=p_doctor_id AND hospital_id=p_hospital_id AND is_active) THEN RAISE EXCEPTION 'Doctor not found in this hospital' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.opd_sessions(hospital_id,doctor_id,department_id,session_date,start_time,end_time,room,default_consult_minutes)
  SELECT p_hospital_id,d.id,d.department_id,p_date,p_start,p_end,NULLIF(btrim(p_room),''),GREATEST(COALESCE(p_minutes,10),1) FROM public.hospital_doctors d WHERE d.id=p_doctor_id RETURNING * INTO v_session;
  RETURN to_jsonb(v_session);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.set_session_status(p_session_id uuid,p_status text,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_session public.opd_sessions;
BEGIN
  IF p_status NOT IN ('open','paused','closed','scheduled') THEN RAISE EXCEPTION 'Invalid session status' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_session FROM public.opd_sessions WHERE id=p_session_id FOR UPDATE;
  IF v_session.id IS NULL OR NOT public.hospital_has_cap(v_session.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  UPDATE public.opd_sessions SET status=p_status,delay_note=NULLIF(btrim(p_note),''),opened_at=CASE WHEN p_status='open' THEN COALESCE(opened_at,now()) ELSE opened_at END,closed_at=CASE WHEN p_status='closed' THEN now() ELSE NULL END,updated_at=now() WHERE id=p_session_id RETURNING * INTO v_session;
  RETURN to_jsonb(v_session);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.generate_default_sessions(p_hospital_id uuid,p_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_count integer;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.opd_sessions(hospital_id,doctor_id,department_id,session_date,start_time,end_time,room,default_consult_minutes)
  SELECT p_hospital_id,d.id,d.department_id,p_date,time '09:00',time '13:00','OPD-' || row_number() OVER(ORDER BY d.doctor_name),COALESCE((public.hospital_setting(p_hospital_id,'default_consult_minutes','10'::jsonb))::text::integer,10)
  FROM public.hospital_doctors d JOIN public.hospital_departments dep ON dep.id=d.department_id AND dep.department_type='clinical'
  WHERE d.hospital_id=p_hospital_id AND d.is_active AND NOT EXISTS(SELECT 1 FROM public.opd_sessions s WHERE s.hospital_id=p_hospital_id AND s.doctor_id=d.id AND s.session_date=p_date)
  ON CONFLICT (hospital_id,doctor_id,session_date,start_time) DO NOTHING;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('created',v_count);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_hospital_appointment(p_hospital_id uuid,p_patient_id uuid,p_doctor_id uuid,p_scheduled_at timestamptz,p_kind text,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_appointment public.hospital_appointments;
BEGIN
  IF NOT (public.hospital_has_cap(p_hospital_id,'patients.register') OR public.hospital_has_cap(p_hospital_id,'queue.manage')) THEN RAISE EXCEPTION 'Appointment capability required' USING ERRCODE='42501'; END IF;
  IF p_kind NOT IN ('opd','follow_up','referral') THEN RAISE EXCEPTION 'Invalid appointment kind' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hospital_patients WHERE id=p_patient_id AND hospital_id=p_hospital_id) OR NOT EXISTS(SELECT 1 FROM public.hospital_doctors WHERE id=p_doctor_id AND hospital_id=p_hospital_id AND is_active) THEN RAISE EXCEPTION 'Patient or doctor not found in this hospital' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.hospital_appointments(hospital_id,patient_id,doctor_id,department_id,scheduled_at,kind,reason,created_by)
  SELECT p_hospital_id,p_patient_id,d.id,d.department_id,p_scheduled_at,p_kind,NULLIF(btrim(p_reason),''),auth.uid() FROM public.hospital_doctors d WHERE d.id=p_doctor_id RETURNING * INTO v_appointment;
  PERFORM public.hospital_log_event(p_hospital_id,p_patient_id,'appointment.booked',jsonb_build_object('appointment_id',v_appointment.id,'scheduled_at',p_scheduled_at),true);
  RETURN to_jsonb(v_appointment);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.cancel_hospital_appointment(p_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_row public.hospital_appointments;
BEGIN
  SELECT * INTO v_row FROM public.hospital_appointments WHERE id=p_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT (public.hospital_has_cap(v_row.hospital_id,'patients.register') OR public.hospital_has_cap(v_row.hospital_id,'queue.manage')) THEN RAISE EXCEPTION 'Appointment capability required' USING ERRCODE='42501'; END IF;
  UPDATE public.hospital_appointments SET status='cancelled',cancel_reason=NULLIF(btrim(p_reason),''),updated_at=now() WHERE id=p_id RETURNING * INTO v_row;
  PERFORM public.hospital_log_event(v_row.hospital_id,v_row.patient_id,'appointment.cancelled',jsonb_build_object('appointment_id',p_id),true);
  RETURN to_jsonb(v_row);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.reschedule_hospital_appointment(p_id uuid,p_new_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_row public.hospital_appointments; v_old timestamptz;
BEGIN
  SELECT * INTO v_row FROM public.hospital_appointments WHERE id=p_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT (public.hospital_has_cap(v_row.hospital_id,'patients.register') OR public.hospital_has_cap(v_row.hospital_id,'queue.manage')) THEN RAISE EXCEPTION 'Appointment capability required' USING ERRCODE='42501'; END IF;
  v_old:=v_row.scheduled_at;
  UPDATE public.hospital_appointments SET scheduled_at=p_new_at,status='scheduled',updated_at=now() WHERE id=p_id RETURNING * INTO v_row;
  PERFORM public.hospital_log_event(v_row.hospital_id,v_row.patient_id,'appointment.rescheduled',jsonb_build_object('appointment_id',p_id,'previous_at',v_old,'scheduled_at',p_new_at),true);
  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hospital_check_in(p_hospital_id uuid,p_patient_id uuid,p_appointment_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_visit public.hospital_visits; v_date date;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hospital_patients WHERE id=p_patient_id AND hospital_id=p_hospital_id) THEN RAISE EXCEPTION 'Patient not found in this hospital' USING ERRCODE='P0002'; END IF;
  IF p_appointment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hospital_appointments WHERE id=p_appointment_id AND hospital_id=p_hospital_id AND patient_id=p_patient_id) THEN RAISE EXCEPTION 'Appointment does not belong to this patient and hospital' USING ERRCODE='23514'; END IF;
  v_date:=public.hospital_today(p_hospital_id);
  INSERT INTO public.hospital_visits(hospital_id,patient_id,visit_date,checked_in_by) VALUES(p_hospital_id,p_patient_id,v_date,auth.uid()) ON CONFLICT(hospital_id,patient_id,visit_date) DO NOTHING;
  SELECT * INTO v_visit FROM public.hospital_visits WHERE hospital_id=p_hospital_id AND patient_id=p_patient_id AND visit_date=v_date;
  IF p_appointment_id IS NOT NULL THEN UPDATE public.hospital_appointments SET status='checked_in',updated_at=now() WHERE id=p_appointment_id AND status IN ('scheduled','confirmed'); END IF;
  PERFORM public.hospital_log_event(p_hospital_id,p_patient_id,'Hospital Check-in',jsonb_build_object('visit_id',v_visit.id),true);
  RETURN to_jsonb(v_visit);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.queue_wait_estimate(p_session_id uuid,p_ahead integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_hospital_id uuid; v_default numeric; v_avg numeric; v_low numeric; v_high numeric;
BEGIN
  SELECT hospital_id,default_consult_minutes INTO v_hospital_id,v_default FROM public.opd_sessions WHERE id=p_session_id;
  SELECT COALESCE(avg(extract(epoch FROM (completed_at-started_at))/60.0),v_default) INTO v_avg FROM (
    SELECT completed_at,started_at FROM public.queue_entries WHERE session_id=p_session_id AND status='completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 10
  ) recent;
  v_avg:=COALESCE(v_avg,v_default,10);
  v_low:=ceil(GREATEST(p_ahead,0)*v_avg*COALESCE((public.hospital_setting(v_hospital_id,'wait_factor_low','0.75'::jsonb))::text::numeric,0.75));
  v_high:=ceil(GREATEST(p_ahead,0)*v_avg*COALESCE((public.hospital_setting(v_hospital_id,'wait_factor_high','1.4'::jsonb))::text::numeric,1.4));
  RETURN jsonb_build_object('low',v_low::integer,'high',GREATEST(v_high,v_low)::integer);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hospital_queue_after_change(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry record; v_threshold integer; v_thresholds integer[]; v_hospital_id uuid; v_wait jsonb;
BEGIN
  SELECT hospital_id INTO v_hospital_id FROM public.opd_sessions WHERE id=p_session_id;
  SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(h.settings->'notify_thresholds','[10,5]'::jsonb))::integer) INTO v_thresholds FROM public.hospital_orgs h WHERE h.id=v_hospital_id;
  FOR v_entry IN SELECT q.*,(SELECT count(*)::integer FROM public.queue_entries a WHERE a.session_id=q.session_id AND a.status IN ('waiting','called','in_consultation') AND (a.priority_rank,a.token_number)<(q.priority_rank,q.token_number)) AS ahead
    FROM public.queue_entries q WHERE q.session_id=p_session_id AND q.status='waiting' ORDER BY q.priority_rank,q.token_number
  LOOP
    v_wait:=public.queue_wait_estimate(p_session_id,v_entry.ahead);
    UPDATE public.queue_entries SET est_wait_low_min=(v_wait->>'low')::integer,est_wait_high_min=(v_wait->>'high')::integer,updated_at=now() WHERE id=v_entry.id;
    FOR v_threshold IN SELECT unnest(COALESCE(v_thresholds,ARRAY[10,5])) LOOP
      IF v_entry.ahead<=v_threshold AND NOT v_threshold=ANY(v_entry.notified_thresholds) THEN
        PERFORM public.hospital_notify_patient(v_hospital_id,v_entry.patient_id,'queue_threshold',jsonb_build_object('message','Your turn is approaching','token',v_entry.token_number),'queue:'||v_entry.id||':t'||v_threshold);
        UPDATE public.queue_entries SET notified_thresholds=array_append(notified_thresholds,v_threshold) WHERE id=v_entry.id;
      END IF;
    END LOOP;
  END LOOP;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.join_queue(p_session_id uuid,p_patient_id uuid,p_appointment_id uuid DEFAULT NULL,p_priority smallint DEFAULT 3,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_session public.opd_sessions; v_visit public.hospital_visits; v_entry public.queue_entries; v_token integer; v_wait jsonb; v_ahead integer;
BEGIN
  SELECT * INTO v_session FROM public.opd_sessions WHERE id=p_session_id FOR UPDATE;
  IF v_session.id IS NULL OR NOT public.hospital_has_cap(v_session.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF v_session.status IN ('closed','paused') THEN RAISE EXCEPTION 'Session is not accepting queue entries' USING ERRCODE='23514'; END IF;
  IF p_priority NOT BETWEEN 0 AND 3 OR (p_priority<3 AND NULLIF(btrim(p_reason),'') IS NULL) THEN RAISE EXCEPTION 'Priority requires a valid rank and reason' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hospital_patients WHERE id=p_patient_id AND hospital_id=v_session.hospital_id) THEN RAISE EXCEPTION 'Patient does not belong to this hospital' USING ERRCODE='23514'; END IF;
  IF p_appointment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hospital_appointments WHERE id=p_appointment_id AND hospital_id=v_session.hospital_id AND patient_id=p_patient_id) THEN RAISE EXCEPTION 'Appointment does not belong to this patient and hospital' USING ERRCODE='23514'; END IF;
  UPDATE public.opd_sessions SET last_token=last_token+1,updated_at=now() WHERE id=p_session_id RETURNING last_token INTO v_token;
  INSERT INTO public.hospital_visits(hospital_id,patient_id,visit_date,checked_in_by) VALUES(v_session.hospital_id,p_patient_id,public.hospital_today(v_session.hospital_id),auth.uid()) ON CONFLICT(hospital_id,patient_id,visit_date) DO NOTHING;
  SELECT * INTO v_visit FROM public.hospital_visits WHERE hospital_id=v_session.hospital_id AND patient_id=p_patient_id AND visit_date=public.hospital_today(v_session.hospital_id);
  INSERT INTO public.queue_entries(hospital_id,session_id,patient_id,appointment_id,visit_id,token_number,priority_rank,priority_reason,is_walk_in)
  VALUES(v_session.hospital_id,p_session_id,p_patient_id,p_appointment_id,v_visit.id,v_token,p_priority,NULLIF(btrim(p_reason),''),p_appointment_id IS NULL) RETURNING * INTO v_entry;
  SELECT count(*) INTO v_ahead FROM public.queue_entries q WHERE q.session_id=p_session_id AND q.status IN ('waiting','called','in_consultation') AND (q.priority_rank,q.token_number)<(v_entry.priority_rank,v_entry.token_number);
  v_wait:=public.queue_wait_estimate(p_session_id,v_ahead);
  UPDATE public.queue_entries SET est_wait_low_min=(v_wait->>'low')::integer,est_wait_high_min=(v_wait->>'high')::integer WHERE id=v_entry.id RETURNING * INTO v_entry;
  PERFORM public.hospital_log_event(v_session.hospital_id,p_patient_id,'Queue Joined',jsonb_build_object('session_id',p_session_id,'token',v_token),true);
  PERFORM public.hospital_log_event(v_session.hospital_id,p_patient_id,'Token Assigned',jsonb_build_object('token',v_token),true);
  PERFORM public.hospital_notify_patient(v_session.hospital_id,p_patient_id,'token_assigned',jsonb_build_object('message','Your queue token is '||v_token),'token:'||v_entry.id);
  PERFORM public.hospital_queue_after_change(p_session_id);
  RETURN jsonb_build_object('entry',to_jsonb(v_entry),'position',v_ahead+1,'wait',v_wait);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.check_in_and_queue(p_hospital_id uuid,p_patient_id uuid,p_session_id uuid,p_appointment_id uuid DEFAULT NULL,p_priority smallint DEFAULT 3,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_checkin jsonb; v_queue jsonb;
BEGIN
  v_checkin:=public.hospital_check_in(p_hospital_id,p_patient_id,p_appointment_id);
  v_queue:=public.join_queue(p_session_id,p_patient_id,p_appointment_id,p_priority,p_reason);
  RETURN jsonb_build_object('check_in',v_checkin,'queue',v_queue);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.call_next(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_session public.opd_sessions; v_entry public.queue_entries;
BEGIN
  SELECT * INTO v_session FROM public.opd_sessions WHERE id=p_session_id FOR UPDATE;
  IF v_session.id IS NULL OR NOT public.hospital_has_cap(v_session.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF v_session.status<>'open' THEN RAISE EXCEPTION 'Session must be open' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_entry FROM public.queue_entries WHERE session_id=p_session_id AND status='waiting' ORDER BY priority_rank,token_number LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_entry.id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.queue_entries SET status='called',called_at=now(),notified_called=true,updated_at=now() WHERE id=v_entry.id RETURNING * INTO v_entry;
  PERFORM public.hospital_notify_patient(v_session.hospital_id,v_entry.patient_id,'token_called',jsonb_build_object('message','Please see the doctor','token',v_entry.token_number),'called:'||v_entry.id);
  PERFORM public.hospital_log_event(v_session.hospital_id,v_entry.patient_id,'Token Called',jsonb_build_object('token',v_entry.token_number),true);
  PERFORM public.hospital_queue_after_change(p_session_id);
  RETURN to_jsonb(v_entry);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.call_token(p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR NOT public.hospital_has_cap(v_entry.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF v_entry.status<>'waiting' THEN RAISE EXCEPTION 'Queue entry is not waiting' USING ERRCODE='23514'; END IF;
  UPDATE public.queue_entries SET status='called',called_at=now(),notified_called=true,updated_at=now() WHERE id=p_entry_id RETURNING * INTO v_entry;
  PERFORM public.hospital_notify_patient(v_entry.hospital_id,v_entry.patient_id,'token_called',jsonb_build_object('message','Please see the doctor','token',v_entry.token_number),'called:'||v_entry.id);
  PERFORM public.hospital_queue_after_change(v_entry.session_id);
  RETURN to_jsonb(v_entry);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.queue_start(p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR NOT public.hospital_has_cap(v_entry.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF v_entry.status<>'called' THEN RAISE EXCEPTION 'Only called entries can start' USING ERRCODE='23514'; END IF;
  UPDATE public.queue_entries SET status='in_consultation',started_at=now(),updated_at=now() WHERE id=p_entry_id RETURNING * INTO v_entry;
  UPDATE public.hospital_appointments SET status='in_consultation',updated_at=now() WHERE id=v_entry.appointment_id;
  PERFORM public.hospital_log_event(v_entry.hospital_id,v_entry.patient_id,'Consultation Started',jsonb_build_object('token',v_entry.token_number),false);
  PERFORM public.hospital_queue_after_change(v_entry.session_id);
  RETURN to_jsonb(v_entry);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.queue_complete(p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR NOT public.hospital_has_cap(v_entry.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF v_entry.status<>'in_consultation' THEN RAISE EXCEPTION 'Queue entry is not in consultation' USING ERRCODE='23514'; END IF;
  UPDATE public.queue_entries SET status='completed',completed_at=now(),updated_at=now() WHERE id=p_entry_id RETURNING * INTO v_entry;
  UPDATE public.hospital_appointments SET status='completed',updated_at=now() WHERE id=v_entry.appointment_id;
  PERFORM public.hospital_log_event(v_entry.hospital_id,v_entry.patient_id,'Consultation Completed',jsonb_build_object('token',v_entry.token_number),true);
  PERFORM public.hospital_queue_after_change(v_entry.session_id);
  RETURN to_jsonb(v_entry);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.queue_skip(p_entry_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR NOT public.hospital_has_cap(v_entry.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  UPDATE public.queue_entries SET status='skipped',priority_reason=NULLIF(btrim(p_reason),''),updated_at=now() WHERE id=p_entry_id RETURNING * INTO v_entry;
  PERFORM public.hospital_queue_after_change(v_entry.session_id);
  RETURN to_jsonb(v_entry);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.queue_requeue(p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR NOT public.hospital_has_cap(v_entry.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  UPDATE public.queue_entries SET status='waiting',called_at=NULL,started_at=NULL,completed_at=NULL,updated_at=now() WHERE id=p_entry_id RETURNING * INTO v_entry;
  PERFORM public.hospital_log_event(v_entry.hospital_id,v_entry.patient_id,'Queue Rejoined',jsonb_build_object('token',v_entry.token_number),true);
  PERFORM public.hospital_queue_after_change(v_entry.session_id);
  RETURN to_jsonb(v_entry);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.queue_no_show(p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR NOT public.hospital_has_cap(v_entry.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  UPDATE public.queue_entries SET status='no_show',updated_at=now() WHERE id=p_entry_id RETURNING * INTO v_entry;
  UPDATE public.hospital_appointments SET status='no_show',updated_at=now() WHERE id=v_entry.appointment_id;
  PERFORM public.hospital_queue_after_change(v_entry.session_id);
  RETURN to_jsonb(v_entry);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.queue_set_priority(p_entry_id uuid,p_priority smallint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries; v_old smallint;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id FOR UPDATE;
  IF v_entry.id IS NULL OR NOT public.hospital_has_cap(v_entry.hospital_id,'queue.manage') THEN RAISE EXCEPTION 'queue.manage capability required' USING ERRCODE='42501'; END IF;
  IF p_priority NOT BETWEEN 0 AND 3 OR NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'A valid priority and reason are required' USING ERRCODE='22023'; END IF;
  v_old:=v_entry.priority_rank;
  UPDATE public.queue_entries SET priority_rank=p_priority,priority_reason=btrim(p_reason),updated_at=now() WHERE id=p_entry_id RETURNING * INTO v_entry;
  INSERT INTO public.hospital_access_audit(hospital_id,patient_id,actor_user_id,action,details) VALUES(v_entry.hospital_id,v_entry.patient_id,auth.uid(),'queue.priority_changed',jsonb_build_object('from',v_old,'to',p_priority,'reason',p_reason));
  PERFORM public.hospital_log_event(v_entry.hospital_id,v_entry.patient_id,'Queue Priority Changed',jsonb_build_object('priority',p_priority,'reason',p_reason),false);
  PERFORM public.hospital_queue_after_change(v_entry.session_id);
  RETURN to_jsonb(v_entry);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_queue_state(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_session public.opd_sessions; v_result jsonb;
BEGIN
  SELECT * INTO v_session FROM public.opd_sessions WHERE id=p_session_id;
  IF v_session.id IS NULL OR NOT public.hospital_has_cap(v_session.hospital_id,'patients.read') THEN RAISE EXCEPTION 'patients.read capability required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('session',jsonb_build_object('id',v_session.id,'doctor',d.doctor_name,'department',dep.name,'room',v_session.room,'status',v_session.status,'delay_note',v_session.delay_note,'last_token',v_session.last_token),
    'serving',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'token',q.token_number,'patient',p.name,'status',q.status) ORDER BY q.token_number) FROM public.queue_entries q JOIN public.hospital_patients p ON p.id=q.patient_id WHERE q.session_id=p_session_id AND q.status IN ('called','in_consultation')),'[]'::jsonb),
    'next_token',(SELECT q.token_number FROM public.queue_entries q WHERE q.session_id=p_session_id AND q.status='waiting' ORDER BY q.priority_rank,q.token_number LIMIT 1),
    'waiting_count',(SELECT count(*) FROM public.queue_entries q WHERE q.session_id=p_session_id AND q.status='waiting'),
    'completed_today',(SELECT count(*) FROM public.queue_entries q WHERE q.session_id=p_session_id AND q.status='completed'),
    'avg_consult_min',(SELECT avg(extract(epoch FROM (completed_at-started_at))/60) FROM public.queue_entries q WHERE q.session_id=p_session_id AND q.status='completed' AND started_at IS NOT NULL),
    'entries',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'token',q.token_number,'patient',p.name,'identifier',p.patient_identifier,'priority',q.priority_rank,'priority_reason',q.priority_reason,'status',q.status,'joined_at',q.joined_at,'called_at',q.called_at,'patients_ahead',(SELECT count(*) FROM public.queue_entries a WHERE a.session_id=q.session_id AND a.status IN ('waiting','called','in_consultation') AND (a.priority_rank,a.token_number)<(q.priority_rank,q.token_number)),'est_low',q.est_wait_low_min,'est_high',q.est_wait_high_min,'is_walk_in',q.is_walk_in) ORDER BY CASE WHEN q.status='completed' THEN 1 ELSE 0 END,q.priority_rank,q.token_number)
      FROM (SELECT * FROM public.queue_entries WHERE session_id=p_session_id AND status IN ('waiting','called','in_consultation') UNION ALL SELECT recent.* FROM (SELECT * FROM public.queue_entries WHERE session_id=p_session_id AND status='completed' ORDER BY completed_at DESC LIMIT 10) recent) q JOIN public.hospital_patients p ON p.id=q.patient_id),'[]'::jsonb)
  ) INTO v_result FROM public.hospital_doctors d LEFT JOIN public.hospital_departments dep ON dep.id=d.department_id WHERE d.id=v_session.doctor_id;
  INSERT INTO public.hospital_access_audit(hospital_id,actor_user_id,action,details) VALUES(v_session.hospital_id,auth.uid(),'queue.state_read',jsonb_build_object('session_id',p_session_id));
  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.get_today_sessions(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'patients.read') THEN RAISE EXCEPTION 'patients.read capability required' USING ERRCODE='42501'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('session_id',s.id,'doctor',d.doctor_name,'department',dep.name,'room',s.room,'status',s.status,'serving_token',(SELECT q.token_number FROM public.queue_entries q WHERE q.session_id=s.id AND q.status='in_consultation' ORDER BY q.token_number LIMIT 1),'next_token',(SELECT q.token_number FROM public.queue_entries q WHERE q.session_id=s.id AND q.status='waiting' ORDER BY q.priority_rank,q.token_number LIMIT 1),'waiting',(SELECT count(*) FROM public.queue_entries q WHERE q.session_id=s.id AND q.status='waiting'),'completed',(SELECT count(*) FROM public.queue_entries q WHERE q.session_id=s.id AND q.status='completed'),'delay_flag',s.delay_note IS NOT NULL) ORDER BY s.start_time)
    FROM public.opd_sessions s JOIN public.hospital_doctors d ON d.id=s.doctor_id LEFT JOIN public.hospital_departments dep ON dep.id=s.department_id WHERE s.hospital_id=p_hospital_id AND s.session_date=public.hospital_today(p_hospital_id)),'[]'::jsonb);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.get_patient_queue_position(p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_entry public.queue_entries; v_ahead integer; v_wait jsonb;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id=p_entry_id;
  IF v_entry.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.hospital_patients p WHERE p.id=v_entry.patient_id AND p.patient_user_id=auth.uid()) THEN RAISE EXCEPTION 'Linked patient record required' USING ERRCODE='42501'; END IF;
  SELECT count(*) INTO v_ahead FROM public.queue_entries q WHERE q.session_id=v_entry.session_id AND q.status IN ('waiting','called','in_consultation') AND (q.priority_rank,q.token_number)<(v_entry.priority_rank,v_entry.token_number);
  v_wait:=public.queue_wait_estimate(v_entry.session_id,v_ahead);
  RETURN jsonb_build_object('token',v_entry.token_number,'patients_ahead',v_ahead,'est_low',v_wait->'low','est_high',v_wait->'high','status',v_entry.status);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.list_hospital_staff(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'staff.manage') THEN RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE='42501'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',COALESCE(p.full_name,u.email),'email',u.email,'role',m.staff_role,'is_active',m.is_active,'is_demo',m.is_demo) ORDER BY p.full_name,m.staff_role)
    FROM public.hospital_members m JOIN auth.users u ON u.id=m.user_id LEFT JOIN public.profiles p ON p.id=u.id WHERE m.hospital_id=p_hospital_id),'[]'::jsonb);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hospital_command_center(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'patients.read') THEN RAISE EXCEPTION 'patients.read capability required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'kpis',jsonb_build_object('opd_patients_today',(SELECT count(*) FROM public.hospital_visits WHERE hospital_id=p_hospital_id AND visit_date=public.hospital_today(p_hospital_id)),'checked_in',(SELECT count(*) FROM public.hospital_visits WHERE hospital_id=p_hospital_id AND visit_date=public.hospital_today(p_hospital_id)),'waiting',(SELECT count(*) FROM public.queue_entries WHERE hospital_id=p_hospital_id AND status='waiting' AND session_id IN(SELECT id FROM public.opd_sessions WHERE hospital_id=p_hospital_id AND session_date=public.hospital_today(p_hospital_id))),'in_consultation',(SELECT count(*) FROM public.queue_entries WHERE hospital_id=p_hospital_id AND status='in_consultation' AND session_id IN(SELECT id FROM public.opd_sessions WHERE hospital_id=p_hospital_id AND session_date=public.hospital_today(p_hospital_id))),'pending_reports',(SELECT count(*) FROM public.investigation_orders WHERE hospital_id=p_hospital_id AND status IN('performed','processing','report_ready')),'admissions_today',(SELECT count(*) FROM public.hospital_admissions WHERE hospital_id=p_hospital_id AND admitted_at >= (public.hospital_today(p_hospital_id)::timestamp AT TIME ZONE (SELECT timezone FROM public.hospital_orgs WHERE id=p_hospital_id)))),
    'queues',public.get_today_sessions(p_hospital_id),
    'action_required',COALESCE((SELECT jsonb_agg(jsonb_build_object('key',a.key,'severity',a.severity,'count',a.count,'href',a.href)) FROM (VALUES
      ('reports_ready_for_review','warning',(SELECT count(*)::integer FROM public.investigation_orders WHERE hospital_id=p_hospital_id AND status='report_ready'),'/dashboard/hospital/investigations'),
      ('waiting_beyond_estimate','warning',(SELECT count(*)::integer FROM public.queue_entries WHERE hospital_id=p_hospital_id AND status='waiting' AND est_wait_high_min IS NOT NULL AND extract(epoch FROM (now()-joined_at))/60>est_wait_high_min),'/dashboard/hospital/opd'),
      ('pending_investigations','info',(SELECT count(*)::integer FROM public.investigation_orders WHERE hospital_id=p_hospital_id AND status IN('ordered','waitlisted','scheduled')),'/dashboard/hospital/investigations')
    ) a(key,severity,count,href) WHERE a.count>0),'[]'::jsonb),
    'checkins_by_hour',COALESCE((SELECT jsonb_agg(jsonb_build_object('hour',h.hour,'count',COALESCE(c.count,0)) ORDER BY h.hour) FROM generate_series(0,23) h(hour) LEFT JOIN (SELECT extract(hour FROM v.checked_in_at AT TIME ZONE (SELECT timezone FROM public.hospital_orgs WHERE id=p_hospital_id))::integer AS hour,count(*) AS count FROM public.hospital_visits v WHERE v.hospital_id=p_hospital_id AND v.visit_date=public.hospital_today(p_hospital_id) GROUP BY 1) c ON c.hour=h.hour),'[]'::jsonb),
    'opd_14_days',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',d.day,'count',COALESCE(c.count,0)) ORDER BY d.day) FROM (SELECT generated_day::date AS day FROM generate_series(public.hospital_today(p_hospital_id)-13,public.hospital_today(p_hospital_id),'1 day') generated_day) d LEFT JOIN (SELECT visit_date,count(*) AS count FROM public.hospital_visits WHERE hospital_id=p_hospital_id GROUP BY visit_date) c ON c.visit_date=d.day),'[]'::jsonb),
    'recent_events',COALESCE((SELECT jsonb_agg(jsonb_build_object('event_type',e.event_type,'patient',p.name,'created_at',e.created_at,'details',e.details) ORDER BY e.created_at DESC) FROM (SELECT * FROM public.patient_journey_events WHERE hospital_id=p_hospital_id ORDER BY created_at DESC LIMIT 20) e JOIN public.hospital_patients p ON p.id=e.patient_id),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.demo_seed_opd(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_prefix text; v_today date; v_med uuid; v_rad uuid; v_surg uuid; v_raj uuid; v_suresh uuid; v_imran uuid; v_anjali uuid; v_kavita uuid; v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid; v_s5 uuid; v_inserted integer;
BEGIN
  SELECT patient_id_prefix INTO v_prefix FROM public.hospital_orgs WHERE id=p_hospital_id;
  IF v_prefix IS NULL THEN RAISE EXCEPTION 'Hospital not found' USING ERRCODE='P0002'; END IF;
  v_today:=public.hospital_today(p_hospital_id);
  PERFORM public.seed_hospital_defaults(p_hospital_id);
  SELECT id INTO v_med FROM public.hospital_departments WHERE hospital_id=p_hospital_id AND name='Medical Oncology';
  SELECT id INTO v_rad FROM public.hospital_departments WHERE hospital_id=p_hospital_id AND name='Radiation Oncology';
  SELECT id INTO v_surg FROM public.hospital_departments WHERE hospital_id=p_hospital_id AND name='Surgical Oncology';
  INSERT INTO public.hospital_patients(hospital_id,patient_identifier,name,mobile,age,gender,is_demo)
  SELECT p_hospital_id,v_prefix||lpad((24600+n)::text,5,'0'),(ARRAY['Aarav Sharma','Ananya Patel','Vihaan Mehta','Isha Nair','Arjun Rao','Diya Gupta','Kabir Iyer','Meera Das','Rohan Shah','Sana Khan'])[(n%10)+1],('90000000'||lpad((n%100)::text,2,'0')),28+(n%55),CASE WHEN n%2=0 THEN 'female' ELSE 'male' END,true
  FROM generate_series(1,80) n ON CONFLICT DO NOTHING;
  INSERT INTO public.hospital_doctors(hospital_id,department_id,doctor_name,specialty,is_demo)
  VALUES(p_hospital_id,v_med,'Dr. Raj Sharma','Medical Oncology',true),(p_hospital_id,v_med,'Dr. Anjali Mehta','Medical Oncology',true),(p_hospital_id,v_rad,'Dr. Suresh Iyer','Radiation Oncology',true),(p_hospital_id,v_rad,'Dr. Kavita Rao','Radiation Oncology',true),(p_hospital_id,v_surg,'Dr. Imran Khan','Surgical Oncology',true),(p_hospital_id,v_surg,'Dr. Neha Gupta','Surgical Oncology',true)
  ON CONFLICT(hospital_id,doctor_name) DO NOTHING;
  SELECT id INTO v_raj FROM public.hospital_doctors WHERE hospital_id=p_hospital_id AND doctor_name='Dr. Raj Sharma';
  SELECT id INTO v_anjali FROM public.hospital_doctors WHERE hospital_id=p_hospital_id AND doctor_name='Dr. Anjali Mehta';
  SELECT id INTO v_suresh FROM public.hospital_doctors WHERE hospital_id=p_hospital_id AND doctor_name='Dr. Suresh Iyer';
  SELECT id INTO v_kavita FROM public.hospital_doctors WHERE hospital_id=p_hospital_id AND doctor_name='Dr. Kavita Rao';
  SELECT id INTO v_imran FROM public.hospital_doctors WHERE hospital_id=p_hospital_id AND doctor_name='Dr. Imran Khan';
  INSERT INTO public.opd_sessions(hospital_id,doctor_id,department_id,session_date,start_time,end_time,room,status,last_token,is_demo)
  VALUES(p_hospital_id,v_raj,v_med,v_today,time '08:00',time '14:00','4A','open',123,true),(p_hospital_id,v_suresh,v_rad,v_today,time '08:00',time '14:00','2B','open',8,true),(p_hospital_id,v_imran,v_surg,v_today,time '08:00',time '14:00','3C','paused',5,true),(p_hospital_id,v_anjali,v_med,v_today,time '14:00',time '18:00','4B','scheduled',0,true),(p_hospital_id,v_kavita,v_rad,v_today,time '08:00',time '12:00','2A','closed',15,true)
  ON CONFLICT(hospital_id,doctor_id,session_date,start_time) DO NOTHING;
  SELECT id INTO v_s1 FROM public.opd_sessions WHERE hospital_id=p_hospital_id AND doctor_id=v_raj AND session_date=v_today AND start_time=time '08:00';
  SELECT id INTO v_s2 FROM public.opd_sessions WHERE hospital_id=p_hospital_id AND doctor_id=v_suresh AND session_date=v_today AND start_time=time '08:00';
  SELECT id INTO v_s3 FROM public.opd_sessions WHERE hospital_id=p_hospital_id AND doctor_id=v_imran AND session_date=v_today AND start_time=time '08:00';
  SELECT id INTO v_s4 FROM public.opd_sessions WHERE hospital_id=p_hospital_id AND doctor_id=v_anjali AND session_date=v_today AND start_time=time '14:00';
  SELECT id INTO v_s5 FROM public.opd_sessions WHERE hospital_id=p_hospital_id AND doctor_id=v_kavita AND session_date=v_today AND start_time=time '08:00';
  INSERT INTO public.hospital_visits(hospital_id,patient_id,visit_date,checked_in_at,is_demo)
  SELECT p_hospital_id,p.id,v_today-days.day,((v_today-days.day)::timestamp+time '08:00'+(p.rn*interval '4 minutes')) AT TIME ZONE (SELECT timezone FROM public.hospital_orgs WHERE id=p_hospital_id),true
  FROM generate_series(1,13) days(day)
  CROSS JOIN LATERAL (SELECT id,row_number() OVER(ORDER BY patient_identifier) rn FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo ORDER BY patient_identifier LIMIT (40+days.day*3)) p
  ON CONFLICT(hospital_id,patient_id,visit_date) DO UPDATE SET is_demo=true;
  INSERT INTO public.hospital_visits(hospital_id,patient_id,visit_date,checked_in_at,is_demo)
  SELECT p_hospital_id,p.id,v_today,(v_today::timestamp + time '07:30' + (n*interval '5 minutes')) AT TIME ZONE (SELECT timezone FROM public.hospital_orgs WHERE id=p_hospital_id),true
  FROM (SELECT id,row_number() OVER(ORDER BY patient_identifier) n FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo LIMIT 80) p
  WHERE p.n<=56 ON CONFLICT(hospital_id,patient_id,visit_date) DO UPDATE SET is_demo=true;
  INSERT INTO public.queue_entries(hospital_id,session_id,patient_id,token_number,priority_rank,priority_reason,status,is_walk_in,joined_at,called_at,started_at,completed_at,est_wait_low_min,est_wait_high_min,is_demo)
  SELECT p_hospital_id,v_s1,p.id,80+n,CASE WHEN n=23 THEN 0 WHEN n IN (24,25) THEN 1 WHEN n=26 THEN 2 ELSE 3 END,CASE WHEN n=23 THEN 'Emergency assessment' WHEN n IN(24,25) THEN 'Clinically urgent review' WHEN n=26 THEN 'Priority review' END,
    CASE WHEN n<=21 THEN 'completed' WHEN n=22 THEN 'in_consultation' ELSE 'waiting' END,(n IN (24,30,35)),now()-((124-n)*interval '6 minutes'),CASE WHEN n<=22 THEN now()-((124-n)*interval '6 minutes') END,CASE WHEN n<=22 THEN now()-((124-n)*interval '6 minutes')+interval '2 minutes' END,CASE WHEN n<=21 THEN now()-((124-n)*interval '6 minutes')+interval '11 minutes' END,GREATEST(0,(123-n)*7),GREATEST(0,(123-n)*13),true
  FROM (SELECT id,row_number() OVER(ORDER BY patient_identifier) n FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo ORDER BY patient_identifier LIMIT 43) p
  WHERE n<=43 ON CONFLICT(session_id,token_number) DO NOTHING;
  UPDATE public.queue_entries SET token_number=80+token_number-80 WHERE session_id=v_s1 AND is_demo;
  INSERT INTO public.queue_entries(hospital_id,session_id,patient_id,token_number,priority_rank,status,is_demo,est_wait_low_min,est_wait_high_min)
  SELECT p_hospital_id,v_s2,p.id,n,3,'waiting',true,20,40 FROM (SELECT id,row_number() OVER(ORDER BY patient_identifier) n FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo ORDER BY patient_identifier OFFSET 43 LIMIT 8) p
  ON CONFLICT(session_id,token_number) DO NOTHING;
  INSERT INTO public.queue_entries(hospital_id,session_id,patient_id,token_number,priority_rank,status,is_demo,est_wait_low_min,est_wait_high_min)
  SELECT p_hospital_id,v_s3,p.id,n,3,'waiting',true,15,30 FROM (SELECT id,row_number() OVER(ORDER BY patient_identifier) n FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo ORDER BY patient_identifier OFFSET 51 LIMIT 5) p
  ON CONFLICT(session_id,token_number) DO NOTHING;
  INSERT INTO public.hospital_appointments(hospital_id,patient_id,doctor_id,department_id,scheduled_at,kind,status,source,is_demo)
  SELECT p_hospital_id,p.id,v_anjali,v_med,(v_today::timestamp + time '09:00' + (n%6)*interval '30 minutes') AT TIME ZONE (SELECT timezone FROM public.hospital_orgs WHERE id=p_hospital_id),'opd',CASE WHEN n<=3 THEN 'confirmed' ELSE 'scheduled' END,'staff',true
  FROM (SELECT id,row_number() OVER(ORDER BY patient_identifier) n FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo ORDER BY patient_identifier LIMIT 6) p;
  INSERT INTO public.hospital_appointments(hospital_id,patient_id,doctor_id,department_id,scheduled_at,kind,status,source,is_demo)
  SELECT p_hospital_id,p.id,v_raj,v_med,((v_today+n)::timestamp+time '10:00') AT TIME ZONE (SELECT timezone FROM public.hospital_orgs WHERE id=p_hospital_id),'opd','scheduled','staff',true
  FROM generate_series(1,7) n CROSS JOIN LATERAL (SELECT id FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo ORDER BY patient_identifier OFFSET (n*5) LIMIT 5) p;
  INSERT INTO public.patient_journey_events(hospital_id,patient_id,actor_user_id,event_type,details,visible_to_patient,is_demo)
  SELECT p_hospital_id,p.patient_id,auth.uid(),'Hospital Check-in',jsonb_build_object('demo',true),true,true FROM public.hospital_visits p WHERE p.hospital_id=p_hospital_id AND p.is_demo AND p.visit_date=v_today
  ON CONFLICT DO NOTHING;
  INSERT INTO public.patient_journey_events(hospital_id,patient_id,actor_user_id,event_type,details,visible_to_patient,is_demo)
  SELECT p_hospital_id,q.patient_id,auth.uid(),'Queue Joined',jsonb_build_object('token',q.token_number,'session_id',q.session_id),true,true
  FROM public.queue_entries q WHERE q.hospital_id=p_hospital_id AND q.is_demo;
  INSERT INTO public.patient_journey_events(hospital_id,patient_id,actor_user_id,event_type,details,visible_to_patient,is_demo)
  SELECT p_hospital_id,q.patient_id,auth.uid(),'Token Assigned',jsonb_build_object('token',q.token_number),true,true
  FROM public.queue_entries q WHERE q.hospital_id=p_hospital_id AND q.is_demo;
  SELECT count(*) INTO v_inserted FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo;
  RETURN jsonb_build_object('patients',v_inserted,'sessions',5,'main_session',v_s1);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.demo_remove(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_count integer;
BEGIN
  UPDATE public.investigation_slots s SET status='open',booked_order_id=NULL,held_for_order_id=NULL,held_until=NULL
  WHERE s.hospital_id=p_hospital_id AND (s.booked_order_id IN(SELECT id FROM public.investigation_orders WHERE hospital_id=p_hospital_id AND is_demo) OR s.held_for_order_id IN(SELECT id FROM public.investigation_orders WHERE hospital_id=p_hospital_id AND is_demo));
  DELETE FROM public.patient_journey_events WHERE hospital_id=p_hospital_id AND is_demo;
  DELETE FROM public.hospital_appointments WHERE hospital_id=p_hospital_id AND is_demo;
  DELETE FROM public.queue_entries WHERE hospital_id=p_hospital_id AND is_demo;
  DELETE FROM public.hospital_visits WHERE hospital_id=p_hospital_id AND is_demo;
  DELETE FROM public.notifications WHERE hospital_id=p_hospital_id AND dedupe_key LIKE 'hospital-demo:%';
  DELETE FROM public.hospital_patients WHERE hospital_id=p_hospital_id AND is_demo;
  DELETE FROM public.opd_sessions s WHERE s.hospital_id=p_hospital_id AND s.is_demo
    AND NOT EXISTS(SELECT 1 FROM public.queue_entries q WHERE q.session_id=s.id);
  DELETE FROM public.hospital_doctors d WHERE d.hospital_id=p_hospital_id AND d.is_demo
    AND NOT EXISTS(SELECT 1 FROM public.opd_sessions s WHERE s.doctor_id=d.id)
    AND NOT EXISTS(SELECT 1 FROM public.hospital_appointments a WHERE a.doctor_id=d.id AND NOT a.is_demo);
  DELETE FROM public.hospital_beds b WHERE b.hospital_id=p_hospital_id AND b.is_demo
    AND NOT EXISTS(SELECT 1 FROM public.hospital_admissions a WHERE a.bed_id=b.id AND NOT a.is_demo);
  DELETE FROM public.hospital_wards w WHERE w.hospital_id=p_hospital_id AND w.is_demo
    AND NOT EXISTS(SELECT 1 FROM public.hospital_beds b WHERE b.ward_id=w.id);
  DELETE FROM public.hospital_members WHERE hospital_id=p_hospital_id AND user_id=auth.uid() AND is_demo;
  UPDATE public.hospital_orgs SET demo_data_loaded=false,updated_at=now() WHERE id=p_hospital_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('removed',true,'org_updated',v_count);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.load_demo_data(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'config.manage') THEN RAISE EXCEPTION 'config.manage capability required' USING ERRCODE='42501'; END IF;
  PERFORM public.demo_remove(p_hospital_id);
  PERFORM public.seed_hospital_defaults(p_hospital_id);
  v_result:=public.demo_seed_opd(p_hospital_id);
  INSERT INTO public.hospital_members(hospital_id,user_id,staff_role,is_demo)
  SELECT p_hospital_id,auth.uid(),r.role_name,true FROM unnest(ARRAY['hospital_admin','front_desk','nurse','doctor','lab_tech','radiology_tech','admissions_staff']) r(role_name)
  ON CONFLICT(hospital_id,user_id,staff_role) DO NOTHING;
  UPDATE public.hospital_orgs SET demo_data_loaded=true,updated_at=now() WHERE id=p_hospital_id;
  INSERT INTO public.hospital_access_audit(hospital_id,actor_user_id,action,details) VALUES(p_hospital_id,auth.uid(),'demo_data.loaded',v_result);
  RETURN v_result;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.remove_demo_data(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'config.manage') THEN RAISE EXCEPTION 'config.manage capability required' USING ERRCODE='42501'; END IF;
  RETURN public.demo_remove(p_hospital_id);
END;
$fn$;

DO $grants$
DECLARE v_sig text; v_name text;
BEGIN
  FOR v_name,v_sig IN SELECT * FROM (VALUES
    ('search_hospital_patients','uuid, text, integer'),('find_possible_duplicates','uuid, text, text, date'),('import_hospital_patients','uuid, jsonb, boolean'),('get_hospital_patient_record','uuid, text'),('export_hospital_patients','uuid'),
    ('create_opd_session','uuid, uuid, date, time, time, text, integer'),('set_session_status','uuid, text, text'),('generate_default_sessions','uuid, date'),
    ('create_hospital_appointment','uuid, uuid, uuid, timestamptz, text, text'),('cancel_hospital_appointment','uuid, text'),('reschedule_hospital_appointment','uuid, timestamptz'),('hospital_check_in','uuid, uuid, uuid'),
    ('queue_wait_estimate','uuid, integer'),('hospital_queue_after_change','uuid'),('join_queue','uuid, uuid, uuid, smallint, text'),('check_in_and_queue','uuid, uuid, uuid, uuid, smallint, text'),
    ('call_next','uuid'),('call_token','uuid'),('queue_start','uuid'),('queue_complete','uuid'),('queue_skip','uuid, text'),('queue_requeue','uuid'),('queue_no_show','uuid'),('queue_set_priority','uuid, smallint, text'),
    ('get_queue_state','uuid'),('get_today_sessions','uuid'),('get_patient_queue_position','uuid'),('list_hospital_staff','uuid'),('hospital_command_center','uuid'),('demo_seed_opd','uuid'),('demo_remove','uuid'),('load_demo_data','uuid'),('remove_demo_data','uuid')
  ) AS signatures(function_name, arg_types) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',v_name,v_sig);
    IF v_name NOT IN ('hospital_queue_after_change','demo_seed_opd','demo_remove','queue_wait_estimate') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',v_name,v_sig);
    ELSE
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM authenticated',v_name,v_sig);
    END IF;
  END LOOP;
END;
$grants$;

NOTIFY pgrst, 'reload schema';

-- 20261002120000_hospital_clinical_rpcs.sql
CREATE OR REPLACE FUNCTION public.start_consultation_record(
  p_hospital_id uuid,
  p_patient_id uuid,
  p_queue_entry_id uuid DEFAULT NULL,
  p_doctor_id uuid DEFAULT NULL,
  p_session_id uuid DEFAULT NULL,
  p_complaint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.consultations;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.consultations (
    hospital_id, patient_id, queue_entry_id, session_id, doctor_id, complaint, status, version
  ) VALUES (
    p_hospital_id, p_patient_id, p_queue_entry_id, p_session_id, p_doctor_id, NULLIF(btrim(p_complaint), ''), 'draft', 1
  ) RETURNING * INTO v_row;

  IF p_queue_entry_id IS NOT NULL THEN
    UPDATE public.queue_entries
      SET status = 'in_consultation', started_at = COALESCE(started_at, now()), updated_at = now()
      WHERE id = p_queue_entry_id AND hospital_id = p_hospital_id;
  END IF;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.save_consultation_draft(
  p_consultation_id uuid,
  p_complaint text DEFAULT NULL,
  p_assessment text DEFAULT NULL,
  p_plan text DEFAULT NULL,
  p_advice text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.consultations;
BEGIN
  SELECT * INTO v_row
  FROM public.consultations
  WHERE id = p_consultation_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Consultation not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.hospital_has_cap(v_row.hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.consultations
  SET complaint = COALESCE(NULLIF(btrim(p_complaint), ''), complaint),
      assessment = COALESCE(NULLIF(btrim(p_assessment), ''), assessment),
      plan = COALESCE(NULLIF(btrim(p_plan), ''), plan),
      advice = COALESCE(NULLIF(btrim(p_advice), ''), advice),
      updated_at = now()
  WHERE id = p_consultation_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.finalize_consultation(
  p_consultation_id uuid,
  p_assessment text DEFAULT NULL,
  p_plan text DEFAULT NULL,
  p_advice text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.consultations;
BEGIN
  SELECT * INTO v_row
  FROM public.consultations
  WHERE id = p_consultation_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Consultation not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.hospital_has_cap(v_row.hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.consultations
  SET assessment = COALESCE(NULLIF(btrim(p_assessment), ''), assessment),
      plan = COALESCE(NULLIF(btrim(p_plan), ''), plan),
      advice = COALESCE(NULLIF(btrim(p_advice), ''), advice),
      status = 'final',
      finalised_at = now(),
      updated_at = now()
  WHERE id = p_consultation_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.amend_consultation(
  p_consultation_id uuid,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_old public.consultations;
  v_new public.consultations;
BEGIN
  SELECT * INTO v_old FROM public.consultations WHERE id = p_consultation_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Consultation not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.hospital_has_cap(v_old.hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.consultations (
    hospital_id, patient_id, queue_entry_id, session_id, doctor_id,
    complaint, assessment, plan, advice, status, version, parent_id, created_by, is_demo
  )
  VALUES (
    v_old.hospital_id, v_old.patient_id, v_old.queue_entry_id, v_old.session_id, v_old.doctor_id,
    NULLIF(btrim(p_message), '') || COALESCE(' | ' || v_old.complaint, ''),
    v_old.assessment, v_old.plan, v_old.advice, 'draft', v_old.version + 1, v_old.id, auth.uid(), false
  ) RETURNING * INTO v_new;

  RETURN to_jsonb(v_new);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_prescription(
  p_hospital_id uuid,
  p_consultation_id uuid,
  p_patient_id uuid,
  p_doctor_id uuid,
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_prescription public.prescriptions;
  v_item jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.prescriptions (hospital_id, patient_id, consultation_id, doctor_id, notes)
  VALUES (p_hospital_id, p_patient_id, p_consultation_id, p_doctor_id, NULLIF(btrim(p_notes), ''))
  RETURNING * INTO v_prescription;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    INSERT INTO public.prescription_items (
      hospital_id, prescription_id, medicine_name, dose, frequency, duration, instructions
    ) VALUES (
      p_hospital_id,
      v_prescription.id,
      COALESCE(v_item->>'medicine_name', 'Medication'),
      v_item->>'dose',
      v_item->>'frequency',
      v_item->>'duration',
      v_item->>'instructions'
    );
  END LOOP;

  RETURN to_jsonb(v_prescription);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_referral(
  p_hospital_id uuid,
  p_patient_id uuid,
  p_from_consultation_id uuid,
  p_from_doctor_id uuid,
  p_to_department_id uuid,
  p_to_doctor_id uuid DEFAULT NULL,
  p_priority text DEFAULT 'routine',
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.referrals;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.referrals (
    hospital_id, patient_id, from_consultation_id, from_doctor_id,
    to_department_id, to_doctor_id, priority, reason, status
  ) VALUES (
    p_hospital_id, p_patient_id, p_from_consultation_id, p_from_doctor_id,
    p_to_department_id, p_to_doctor_id, p_priority, NULLIF(btrim(p_reason), ''), 'pending'
  ) RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.accept_referral(p_referral_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.referrals;
BEGIN
  SELECT * INTO v_row FROM public.referrals WHERE id = p_referral_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Referral not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.hospital_has_cap(v_row.hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.referrals
  SET status = 'accepted', updated_at = now()
  WHERE id = p_referral_id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.schedule_follow_up(
  p_hospital_id uuid,
  p_patient_id uuid,
  p_consultation_id uuid,
  p_due_date date,
  p_advice text DEFAULT NULL,
  p_depends_on_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.follow_ups;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.follow_ups (
    hospital_id, patient_id, consultation_id, due_date, advice, depends_on_order_id, status
  ) VALUES (
    p_hospital_id, p_patient_id, p_consultation_id, p_due_date, NULLIF(btrim(p_advice), ''), p_depends_on_order_id, 'pending'
  ) RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_consultation_context(p_hospital_id uuid, p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_patient public.hospital_patients;
  v_consultations jsonb;
  v_prescriptions jsonb;
  v_followups jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'clinical.read') THEN
    RAISE EXCEPTION 'clinical.read capability required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_patient
  FROM public.hospital_patients
  WHERE id = p_patient_id AND hospital_id = p_hospital_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
  INTO v_consultations
  FROM public.consultations c
  WHERE c.hospital_id = p_hospital_id AND c.patient_id = p_patient_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC), '[]'::jsonb)
  INTO v_prescriptions
  FROM public.prescriptions p
  WHERE p.hospital_id = p_hospital_id AND p.patient_id = p_patient_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.due_date ASC), '[]'::jsonb)
  INTO v_followups
  FROM public.follow_ups f
  WHERE f.hospital_id = p_hospital_id AND f.patient_id = p_patient_id;

  RETURN jsonb_build_object(
    'patient', to_jsonb(v_patient),
    'consultations', v_consultations,
    'prescriptions', v_prescriptions,
    'follow_ups', v_followups
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.demo_seed_clinical(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_patient uuid;
  v_doctor uuid;
  v_session uuid;
  v_queue uuid;
  v_consultation uuid;
  v_count integer := 0;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'clinical.write') THEN
    RAISE EXCEPTION 'clinical.write capability required' USING ERRCODE = '42501';
  END IF;

  FOR v_patient IN
    SELECT id FROM public.hospital_patients WHERE hospital_id = p_hospital_id AND is_demo ORDER BY patient_identifier LIMIT 40
  LOOP
    SELECT id INTO v_doctor FROM public.hospital_doctors WHERE hospital_id = p_hospital_id AND is_demo ORDER BY doctor_name LIMIT 1;
    SELECT id INTO v_session FROM public.opd_sessions WHERE hospital_id = p_hospital_id AND is_demo ORDER BY session_date, start_time LIMIT 1;

    INSERT INTO public.consultations (hospital_id, patient_id, doctor_id, session_id, complaint, assessment, plan, advice, status, version, is_demo)
    VALUES (p_hospital_id, v_patient, v_doctor, v_session, 'Follow-up review', 'Stable condition', 'Continue surveillance', 'Hydration and review', 'final', 1, true)
    RETURNING id INTO v_consultation;

    INSERT INTO public.prescriptions (hospital_id, patient_id, consultation_id, doctor_id, notes, is_demo)
    VALUES (p_hospital_id, v_patient, v_consultation, v_doctor, 'Daily continuation plan', true);

    INSERT INTO public.referrals (hospital_id, patient_id, from_doctor_id, to_department_id, priority, reason, status, is_demo)
    SELECT p_hospital_id, v_patient, v_doctor, d.id, 'routine', 'Clinical follow-up', 'accepted', true
    FROM public.hospital_departments d
    WHERE d.hospital_id = p_hospital_id AND d.department_type = 'diagnostic'
    LIMIT 1;

    INSERT INTO public.follow_ups (hospital_id, patient_id, consultation_id, due_date, advice, status, is_demo)
    VALUES (p_hospital_id, v_patient, v_consultation, current_date + (v_count % 10) + 7, 'Return in 2 weeks', 'pending', true);

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('consultations_created', v_count);
END;
$fn$;

-- 20261002130000_hospital_investigations_admissions_rpcs.sql
CREATE OR REPLACE FUNCTION public.generate_investigation_slots(
  p_hospital_id uuid,
  p_type_id uuid,
  p_resource_id uuid,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.create') THEN
    RAISE EXCEPTION 'orders.create capability required' USING ERRCODE = '42501';
  END IF;

  WITH days AS (
    SELECT generate_series(current_date, current_date + p_days, interval '1 day')::date AS d
  )
  INSERT INTO public.investigation_slots (hospital_id, type_id, resource_id, slot_start, slot_end, kind, status)
  SELECT p_hospital_id, p_type_id, p_resource_id,
         (d::timestamp + time '09:00')::timestamptz,
         (d::timestamp + time '09:30')::timestamptz,
         'normal', 'open'
  FROM days
  ON CONFLICT (resource_id, slot_start) DO NOTHING;

  RETURN jsonb_build_object('type_id', p_type_id, 'resource_id', p_resource_id, 'days', p_days);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.regenerate_investigation_slots(
  p_hospital_id uuid,
  p_type_id uuid,
  p_resource_id uuid,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  DELETE FROM public.investigation_slots WHERE hospital_id = p_hospital_id AND type_id = p_type_id AND resource_id = p_resource_id;
  RETURN public.generate_investigation_slots(p_hospital_id, p_type_id, p_resource_id, p_days);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.preview_slot_regeneration(
  p_hospital_id uuid,
  p_type_id uuid,
  p_resource_id uuid,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.create') THEN
    RAISE EXCEPTION 'orders.create capability required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('days', p_days, 'type_id', p_type_id, 'resource_id', p_resource_id, 'preview_count', p_days * 10);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.add_resource_closure(
  p_hospital_id uuid,
  p_resource_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text DEFAULT 'maintenance',
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.resource_closures;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.resource_closures (hospital_id, resource_id, start_date, end_date, reason, note)
  VALUES (p_hospital_id, p_resource_id, p_start_date, p_end_date, p_reason, NULLIF(btrim(p_note), ''))
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.add_hospital_holiday(
  p_hospital_id uuid,
  p_holiday_date date,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hospital_holidays;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.hospital_holidays (hospital_id, holiday_date, name)
  VALUES (p_hospital_id, p_holiday_date, COALESCE(NULLIF(btrim(p_name), ''), 'Hospital Holiday'))
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_investigation_availability(
  p_hospital_id uuid,
  p_type_id uuid,
  p_from_date date DEFAULT current_date,
  p_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.create') THEN
    RAISE EXCEPTION 'orders.create capability required' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object(
        'slot_start', s.slot_start,
        'slot_end', s.slot_end,
        'status', s.status,
        'kind', s.kind,
        'resource_id', s.resource_id
      ) ORDER BY s.slot_start)
      FROM public.investigation_slots s
      WHERE s.hospital_id = p_hospital_id
        AND s.type_id = p_type_id
        AND s.slot_start >= p_from_date::timestamptz
        AND s.slot_start < (p_from_date + p_days)::timestamptz
    ),
    '[]'::jsonb
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.order_investigation(
  p_hospital_id uuid,
  p_patient_id uuid,
  p_type_id uuid,
  p_doctor_id uuid DEFAULT NULL,
  p_priority text DEFAULT 'routine',
  p_consultation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_order public.investigation_orders;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.create') THEN
    RAISE EXCEPTION 'orders.create capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.investigation_orders (
    hospital_id, patient_id, type_id, ordered_by_doctor_id, consultation_id, priority, status
  ) VALUES (
    p_hospital_id, p_patient_id, p_type_id, p_doctor_id, p_consultation_id, p_priority, 'ordered'
  ) RETURNING * INTO v_order;

  RETURN to_jsonb(v_order);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.book_investigation_slot(
  p_hospital_id uuid,
  p_order_id uuid,
  p_slot_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_order public.investigation_orders;
  v_slot public.investigation_slots;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.create') THEN
    RAISE EXCEPTION 'orders.create capability required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM public.investigation_orders WHERE id = p_order_id AND hospital_id = p_hospital_id FOR UPDATE;
  SELECT * INTO v_slot FROM public.investigation_slots WHERE id = p_slot_id AND hospital_id = p_hospital_id FOR UPDATE;

  IF v_order.id IS NULL OR v_slot.id IS NULL THEN
    RAISE EXCEPTION 'Order or slot not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_slot.status = 'booked' THEN
    RAISE EXCEPTION 'Slot already booked' USING ERRCODE = '23505';
  END IF;

  UPDATE public.investigation_slots
  SET status = 'booked', booked_order_id = p_order_id, updated_at = now()
  WHERE id = p_slot_id;

  UPDATE public.investigation_orders
  SET slot_id = p_slot_id, scheduled_for = v_slot.slot_start, status = 'scheduled', updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'slot_id', p_slot_id, 'scheduled_for', v_slot.slot_start);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.waitlist_investigation_order(
  p_hospital_id uuid,
  p_order_id uuid,
  p_type_id uuid,
  p_priority_rank smallint DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.investigation_waitlist;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.create') THEN
    RAISE EXCEPTION 'orders.create capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.investigation_waitlist (hospital_id, order_id, type_id, priority_rank, status)
  VALUES (p_hospital_id, p_order_id, p_type_id, p_priority_rank, 'waiting')
  ON CONFLICT (order_id) DO UPDATE SET priority_rank = EXCLUDED.priority_rank, status = 'waiting'
  RETURNING * INTO v_row;

  UPDATE public.investigation_orders
  SET status = 'waitlisted', updated_at = now()
  WHERE id = p_order_id AND hospital_id = p_hospital_id;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.staff_assign_slot(
  p_hospital_id uuid,
  p_order_id uuid,
  p_slot_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.pipeline') THEN
    RAISE EXCEPTION 'orders.pipeline capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.investigation_orders
  SET slot_id = p_slot_id, scheduled_for = (SELECT slot_start FROM public.investigation_slots WHERE id = p_slot_id), status = 'scheduled', updated_at = now()
  WHERE id = p_order_id AND hospital_id = p_hospital_id;

  UPDATE public.investigation_slots
  SET status = 'booked', booked_order_id = p_order_id
  WHERE id = p_slot_id AND hospital_id = p_hospital_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'slot_id', p_slot_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cancel_investigation_booking(
  p_hospital_id uuid,
  p_order_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.pipeline') THEN
    RAISE EXCEPTION 'orders.pipeline capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.investigation_orders
  SET status = 'cancelled', cancel_reason = NULLIF(btrim(p_reason), ''), cancelled_at = now(), updated_at = now()
  WHERE id = p_order_id AND hospital_id = p_hospital_id;

  UPDATE public.investigation_slots
  SET status = 'open', booked_order_id = NULL
  WHERE booked_order_id = p_order_id AND hospital_id = p_hospital_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'cancel_reason', NULLIF(btrim(p_reason), ''));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.offer_released_slot(
  p_hospital_id uuid,
  p_slot_id uuid,
  p_waitlist_order_id uuid,
  p_expires_hours integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.pipeline') THEN
    RAISE EXCEPTION 'orders.pipeline capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.investigation_waitlist
  SET status = 'offered', offered_slot_id = p_slot_id, offer_expires_at = now() + make_interval(hours => p_expires_hours)
  WHERE order_id = p_waitlist_order_id AND hospital_id = p_hospital_id;

  RETURN jsonb_build_object('slot_id', p_slot_id, 'waitlist_order_id', p_waitlist_order_id, 'expires_at', now() + make_interval(hours => p_expires_hours));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.accept_slot_offer(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.investigation_orders
  SET status = 'scheduled', updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.investigation_waitlist
  SET status = 'accepted'
  WHERE order_id = p_order_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'accepted', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.decline_slot_offer(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.investigation_waitlist
  SET status = 'cancelled'
  WHERE order_id = p_order_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'declined', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.investigation_advance(
  p_hospital_id uuid,
  p_order_id uuid,
  p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.pipeline') THEN
    RAISE EXCEPTION 'orders.pipeline capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.investigation_orders
  SET status = p_new_status,
      updated_at = now(),
      performed_at = CASE WHEN p_new_status = 'performed' THEN now() ELSE performed_at END,
      processing_at = CASE WHEN p_new_status = 'processing' THEN now() ELSE processing_at END,
      report_ready_at = CASE WHEN p_new_status = 'report_ready' THEN now() ELSE report_ready_at END,
      reviewed_at = CASE WHEN p_new_status = 'doctor_reviewed' THEN now() ELSE reviewed_at END
  WHERE id = p_order_id AND hospital_id = p_hospital_id;

  RETURN jsonb_build_object('order_id', p_order_id, 'status', p_new_status);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_capacity_overview(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'orders.read') THEN
    RAISE EXCEPTION 'orders.read capability required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'total_beds', (SELECT count(*) FROM public.hospital_beds WHERE hospital_id = p_hospital_id),
    'occupied_beds', (SELECT count(*) FROM public.hospital_beds WHERE hospital_id = p_hospital_id AND status = 'occupied'),
    'available_beds', (SELECT count(*) FROM public.hospital_beds WHERE hospital_id = p_hospital_id AND status = 'available'),
    'investigation_orders', (SELECT count(*) FROM public.investigation_orders WHERE hospital_id = p_hospital_id)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_turnaround_overview(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN jsonb_build_object(
    'orders', (SELECT count(*) FROM public.investigation_orders WHERE hospital_id = p_hospital_id),
    'report_ready', (SELECT count(*) FROM public.investigation_orders WHERE hospital_id = p_hospital_id AND status = 'report_ready'),
    'doctor_reviewed', (SELECT count(*) FROM public.investigation_orders WHERE hospital_id = p_hospital_id AND status = 'doctor_reviewed')
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_bottlenecks(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object('type', type_id, 'count', count))
      FROM (
        SELECT type_id, count(*) AS count
        FROM public.investigation_orders
        WHERE hospital_id = p_hospital_id AND status IN ('ordered', 'waitlisted', 'scheduled')
        GROUP BY type_id
      ) s
    ),
    '[]'::jsonb
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.run_hospital_maintenance(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.investigation_orders
  SET status = 'processing', updated_at = now()
  WHERE hospital_id = p_hospital_id AND status = 'performed';

  RETURN jsonb_build_object('hospital_id', p_hospital_id, 'updated', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.run_hospital_maintenance_all()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.investigation_orders
  SET status = 'processing', updated_at = now()
  WHERE status = 'performed';

  RETURN jsonb_build_object('updated', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admit_patient(
  p_hospital_id uuid,
  p_patient_id uuid,
  p_ward_id uuid,
  p_bed_id uuid,
  p_doctor_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hospital_admissions;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'admissions.manage') THEN
    RAISE EXCEPTION 'admissions.manage capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.hospital_admissions (
    hospital_id, patient_id, ward_id, bed_id, admitting_doctor_id, reason, status
  ) VALUES (
    p_hospital_id, p_patient_id, p_ward_id, p_bed_id, p_doctor_id, NULLIF(btrim(p_reason), ''), 'admitted'
  ) RETURNING * INTO v_row;

  UPDATE public.hospital_beds
  SET status = 'occupied', updated_at = now()
  WHERE id = p_bed_id AND hospital_id = p_hospital_id;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.transfer_patient(
  p_hospital_id uuid,
  p_admission_id uuid,
  p_new_ward_id uuid,
  p_new_bed_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hospital_admissions;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'admissions.manage') THEN
    RAISE EXCEPTION 'admissions.manage capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.hospital_admissions
  SET ward_id = p_new_ward_id, bed_id = p_new_bed_id, status = 'transferred', updated_at = now()
  WHERE id = p_admission_id AND hospital_id = p_hospital_id
  RETURNING * INTO v_row;

  UPDATE public.hospital_beds
  SET status = 'available', updated_at = now()
  WHERE id = v_row.bed_id AND hospital_id = p_hospital_id;

  UPDATE public.hospital_beds
  SET status = 'occupied', updated_at = now()
  WHERE id = p_new_bed_id AND hospital_id = p_hospital_id;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.discharge_patient(
  p_hospital_id uuid,
  p_admission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hospital_admissions;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'admissions.manage') THEN
    RAISE EXCEPTION 'admissions.manage capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.hospital_admissions
  SET status = 'discharged', discharged_at = now(), updated_at = now()
  WHERE id = p_admission_id AND hospital_id = p_hospital_id
  RETURNING * INTO v_row;

  UPDATE public.hospital_beds
  SET status = 'cleaning', updated_at = now()
  WHERE id = v_row.bed_id AND hospital_id = p_hospital_id;

  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.set_bed_status(
  p_hospital_id uuid,
  p_bed_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'admissions.manage') THEN
    RAISE EXCEPTION 'admissions.manage capability required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.hospital_beds
  SET status = p_status, updated_at = now()
  WHERE id = p_bed_id AND hospital_id = p_hospital_id;

  RETURN jsonb_build_object('bed_id', p_bed_id, 'status', p_status);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_ward_with_beds(
  p_hospital_id uuid,
  p_name text,
  p_bed_count integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ward_id uuid;
  v_i integer;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.hospital_wards (hospital_id, name, is_active)
  VALUES (p_hospital_id, p_name, true)
  RETURNING id INTO v_ward_id;

  FOR v_i IN 1..p_bed_count LOOP
    INSERT INTO public.hospital_beds (hospital_id, ward_id, bed_label, status)
    VALUES (p_hospital_id, v_ward_id, p_name || '-BED-' || v_i, 'available');
  END LOOP;

  RETURN jsonb_build_object('ward_id', v_ward_id, 'bed_count', p_bed_count);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.generate_patient_link_code(p_hospital_id uuid, p_patient_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code text;
BEGIN
  v_code := upper(substr(md5(random()::text), 1, 8));
  INSERT INTO public.patient_link_codes (hospital_id, patient_id, code_hash, expires_at)
  VALUES (p_hospital_id, p_patient_id, md5(v_code), now() + interval '7 days');
  RETURN v_code;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.link_patient_account(p_hospital_id uuid, p_code text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.patient_link_codes;
BEGIN
  SELECT * INTO v_row
  FROM public.patient_link_codes
  WHERE hospital_id = p_hospital_id
    AND code_hash = md5(p_code)
    AND consumed_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link code' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.hospital_patients
  SET patient_user_id = p_user_id, updated_at = now()
  WHERE id = v_row.patient_id AND hospital_id = p_hospital_id;

  UPDATE public.patient_link_codes
  SET consumed_at = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object('patient_id', v_row.patient_id, 'linked', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_hospital_visits(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object(
        'hospital_id', hp.hospital_id,
        'patient_id', hp.id,
        'patient_identifier', hp.patient_identifier,
        'name', hp.name,
        'visit_date', hv.visit_date,
        'checked_in_at', hv.checked_in_at
      ) ORDER BY hv.visit_date DESC)
      FROM public.hospital_patients hp
      JOIN public.hospital_visits hv ON hv.patient_id = hp.id
      WHERE hp.patient_user_id = p_user_id
    ),
    '[]'::jsonb
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.respond_slot_offer(p_order_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_accept THEN
    UPDATE public.investigation_waitlist
    SET status = 'accepted', offer_expires_at = NULL
    WHERE order_id = p_order_id;
    UPDATE public.investigation_orders
    SET status = 'scheduled', updated_at = now()
    WHERE id = p_order_id;
  ELSE
    UPDATE public.investigation_waitlist
    SET status = 'cancelled', offer_expires_at = NULL
    WHERE order_id = p_order_id;
  END IF;

  RETURN jsonb_build_object('order_id', p_order_id, 'accepted', p_accept);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.demo_seed_investigations(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.investigation_types (hospital_id, name, category, expected_report_min_days, expected_report_max_days, is_active, is_demo)
  VALUES
    (p_hospital_id, 'Mammography', 'imaging', 2, 5, true, true),
    (p_hospital_id, 'CT Scan', 'imaging', 1, 3, true, true),
    (p_hospital_id, 'Blood Tests', 'lab', 1, 2, true, true)
  ON CONFLICT (hospital_id, name) DO NOTHING;

  RETURN jsonb_build_object('seeded', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.demo_seed_admissions(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ward_id uuid;
  v_bed_id uuid;
BEGIN
  INSERT INTO public.hospital_wards (hospital_id, name, is_active, is_demo)
  VALUES (p_hospital_id, 'Ward A', true, true)
  ON CONFLICT (hospital_id, name) DO NOTHING;

  SELECT id INTO v_ward_id FROM public.hospital_wards WHERE hospital_id = p_hospital_id AND name = 'Ward A';
  SELECT id INTO v_bed_id FROM public.hospital_beds WHERE hospital_id = p_hospital_id AND ward_id = v_ward_id LIMIT 1;

  IF v_bed_id IS NULL THEN
    INSERT INTO public.hospital_beds (hospital_id, ward_id, bed_label, status, is_demo)
    VALUES (p_hospital_id, v_ward_id, 'A-01', 'available', true)
    RETURNING id INTO v_bed_id;
  END IF;

  RETURN jsonb_build_object('ward_id', v_ward_id, 'bed_id', v_bed_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hospital_command_center(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN jsonb_build_object(
    'kpis', jsonb_build_object(
      'waiting', (SELECT count(*) FROM public.queue_entries WHERE hospital_id = p_hospital_id AND status = 'waiting'),
      'in_consultation', (SELECT count(*) FROM public.queue_entries WHERE hospital_id = p_hospital_id AND status = 'in_consultation'),
      'pending_reports', (SELECT count(*) FROM public.investigation_orders WHERE hospital_id = p_hospital_id AND status IN ('processing', 'report_ready')), 
      'admissions', (SELECT count(*) FROM public.hospital_admissions WHERE hospital_id = p_hospital_id AND status = 'admitted')
    ),
    'queues', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.start_time) FROM public.opd_sessions s WHERE s.hospital_id = p_hospital_id), '[]'::jsonb),
    'beds', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.bed_label) FROM public.hospital_beds b WHERE b.hospital_id = p_hospital_id), '[]'::jsonb),
    'recent_orders', COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.ordered_at DESC) FROM public.investigation_orders o WHERE o.hospital_id = p_hospital_id LIMIT 20), '[]'::jsonb)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_hospital_department(
  p_hospital_id uuid,
  p_name text,
  p_department_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hospital_departments;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF p_department_type NOT IN ('clinical', 'diagnostic') THEN
    RAISE EXCEPTION 'Invalid department type' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hospital_departments (hospital_id, name, department_type)
  VALUES (p_hospital_id, NULLIF(btrim(p_name), ''), p_department_type)
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.set_hospital_department_active(
  p_hospital_id uuid,
  p_department_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hospital_departments;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.hospital_departments
  SET is_active = p_is_active
  WHERE id = p_department_id AND hospital_id = p_hospital_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Department not found' USING ERRCODE = 'P0002'; END IF;
  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_hospital_doctor(
  p_hospital_id uuid,
  p_doctor_name text,
  p_specialty text DEFAULT NULL,
  p_department_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hospital_doctors;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF p_department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hospital_departments
    WHERE id = p_department_id AND hospital_id = p_hospital_id
  ) THEN
    RAISE EXCEPTION 'Department not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.hospital_doctors (hospital_id, doctor_name, specialty, department_id)
  VALUES (p_hospital_id, NULLIF(btrim(p_doctor_name), ''), NULLIF(btrim(p_specialty), ''), p_department_id)
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.set_hospital_doctor_active(
  p_hospital_id uuid,
  p_doctor_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.hospital_doctors;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.hospital_doctors
  SET is_active = p_is_active
  WHERE id = p_doctor_id AND hospital_id = p_hospital_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Doctor not found' USING ERRCODE = 'P0002'; END IF;
  RETURN to_jsonb(v_row);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_hospital_priority_rule(
  p_hospital_id uuid,
  p_rule_id uuid,
  p_target_max_wait_days integer,
  p_allowed_slot_kinds text[],
  p_staff_approval_required boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.priority_rules;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.priority_rules
  SET target_max_wait_days = p_target_max_wait_days,
      allowed_slot_kinds = p_allowed_slot_kinds,
      staff_approval_required = p_staff_approval_required,
      updated_at = now()
  WHERE id = p_rule_id AND hospital_id = p_hospital_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Priority rule not found' USING ERRCODE = 'P0002'; END IF;
  RETURN to_jsonb(v_row);
END;
$fn$;

DO $grants$
DECLARE v_sig text; v_name text;
BEGIN
  FOR v_name, v_sig IN SELECT * FROM (VALUES
    ('create_hospital_department', 'uuid, text, text'),
    ('set_hospital_department_active', 'uuid, uuid, boolean'),
    ('create_hospital_doctor', 'uuid, text, text, uuid'),
    ('set_hospital_doctor_active', 'uuid, uuid, boolean'),
    ('update_hospital_priority_rule', 'uuid, uuid, integer, text[], boolean'),
    ('add_hospital_holiday', 'uuid, date, text')
  ) AS signatures(function_name, arg_types) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', v_name, v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', v_name, v_sig);
  END LOOP;
END;
$grants$;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS hospital_id uuid,
  ADD COLUMN IF NOT EXISTS ref_table text,
  ADD COLUMN IF NOT EXISTS ref_id uuid,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedupe
  ON public.notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- 20261003000000_create_doctor_workspace_roster.sql
-- Doctor workspace and roster foundation.
-- Clinical records and patient consent are added in later doctor migrations.

CREATE TABLE IF NOT EXISTS public.doctor_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  registration_no text,
  registration_council text,
  specialization text DEFAULT 'Medical Oncology',
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'submitted', 'verified', 'rejected')),
  demo_data_loaded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  slot_minutes smallint NOT NULL DEFAULT 30 CHECK (slot_minutes BETWEEN 5 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, weekday),
  CHECK (start_time < end_time)
);

CREATE TABLE IF NOT EXISTS public.doctor_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at)
);

CREATE TABLE IF NOT EXISTS public.doctor_patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_code text NOT NULL,
  full_name text NOT NULL,
  date_of_birth date,
  sex text,
  phone text,
  cancer_type text,
  stage text,
  current_treatment text,
  cycle_label text,
  risk_level text NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'moderate', 'high')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, patient_code)
);

CREATE TABLE IF NOT EXISTS public.doctor_patient_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note text NOT NULL CHECK (length(trim(note)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctor_patients_doctor_status
  ON public.doctor_patients (doctor_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_doctor_patient_notes_patient
  ON public.doctor_patient_notes (doctor_patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doctor_leaves_doctor_dates
  ON public.doctor_leaves (doctor_id, starts_at, ends_at);

ALTER TABLE public.doctor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_patient_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctor_profiles_owner ON public.doctor_profiles;
CREATE POLICY doctor_profiles_owner ON public.doctor_profiles
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS doctor_availability_owner ON public.doctor_availability;
CREATE POLICY doctor_availability_owner ON public.doctor_availability
  FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_leaves_owner ON public.doctor_leaves;
CREATE POLICY doctor_leaves_owner ON public.doctor_leaves
  FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_patients_owner ON public.doctor_patients;
CREATE POLICY doctor_patients_owner ON public.doctor_patients
  FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_patient_notes_owner ON public.doctor_patient_notes;
CREATE POLICY doctor_patient_notes_owner ON public.doctor_patient_notes
  FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.doctor_has_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name = 'doctor'
  );
$$;

CREATE OR REPLACE FUNCTION public.ensure_doctor_workspace()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_row public.doctor_profiles;
  display_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(NULLIF(trim(p.full_name), ''), split_part(COALESCE(p.email, ''), '@', 1), 'Doctor')
    INTO display_name
  FROM public.profiles p
  WHERE p.id = auth.uid();

  INSERT INTO public.doctor_profiles (user_id, full_name)
  VALUES (auth.uid(), COALESCE(display_name, 'Doctor'))
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.doctor_availability (doctor_id, weekday, start_time, end_time)
  SELECT auth.uid(), day_number, '09:00', '17:00'
  FROM generate_series(1, 5) AS day_number
  ON CONFLICT (doctor_id, weekday) DO NOTHING;

  SELECT * INTO profile_row FROM public.doctor_profiles WHERE user_id = auth.uid();
  RETURN jsonb_build_object(
    'profile', to_jsonb(profile_row),
    'affiliations', '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_update_profile(p_fields jsonb)
RETURNS public.doctor_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated public.doctor_profiles;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.doctor_profiles
  SET full_name = COALESCE(NULLIF(trim(p_fields->>'full_name'), ''), full_name),
      registration_no = CASE WHEN p_fields ? 'registration_no' THEN NULLIF(trim(p_fields->>'registration_no'), '') ELSE registration_no END,
      registration_council = CASE WHEN p_fields ? 'registration_council' THEN NULLIF(trim(p_fields->>'registration_council'), '') ELSE registration_council END,
      specialization = COALESCE(NULLIF(trim(p_fields->>'specialization'), ''), specialization),
      updated_at = now()
  WHERE user_id = auth.uid()
  RETURNING * INTO updated;

  IF updated.user_id IS NULL THEN
    RAISE EXCEPTION 'Doctor workspace is not initialized';
  END IF;
  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_list_patients(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  query_text text := NULLIF(trim(COALESCE(p_filters->>'q', '')), '');
  risk_filter text := NULLIF(trim(COALESCE(p_filters->>'risk', '')), '');
  status_filter text := COALESCE(NULLIF(p_filters->>'status', ''), 'active');
  result_rows jsonb;
  result_total bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO result_total
  FROM public.doctor_patients p
  WHERE p.doctor_id = auth.uid()
    AND (status_filter = 'all' OR p.status = status_filter)
    AND (risk_filter IS NULL OR p.risk_level = risk_filter)
    AND (query_text IS NULL OR p.full_name ILIKE '%' || query_text || '%' OR p.patient_code ILIKE '%' || query_text || '%');

  SELECT COALESCE(jsonb_agg(to_jsonb(rows) ORDER BY rows.updated_at DESC), '[]'::jsonb)
    INTO result_rows
  FROM (
    SELECT p.id, p.patient_code, p.full_name,
      extract(year FROM age(current_date, p.date_of_birth))::int AS age,
      p.sex, p.phone, p.cancer_type, p.stage, p.current_treatment, p.cycle_label,
      p.risk_level AS risk, p.status, p.patient_user_id, p.updated_at
    FROM public.doctor_patients p
    WHERE p.doctor_id = auth.uid()
      AND (status_filter = 'all' OR p.status = status_filter)
      AND (risk_filter IS NULL OR p.risk_level = risk_filter)
      AND (query_text IS NULL OR p.full_name ILIKE '%' || query_text || '%' OR p.patient_code ILIKE '%' || query_text || '%')
    ORDER BY p.updated_at DESC
    LIMIT LEAST(GREATEST(COALESCE((p_filters->>'limit')::int, 100), 1), 200)
    OFFSET GREATEST(COALESCE((p_filters->>'offset')::int, 0), 0)
  ) rows;

  RETURN jsonb_build_object('total', result_total, 'rows', result_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_create_patient(p_fields jsonb)
RETURNS public.doctor_patients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number integer;
  created public.doctor_patients;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(trim(p_fields->>'full_name'), '') IS NULL THEN
    RAISE EXCEPTION 'Patient name is required' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max((regexp_match(patient_code, '^OC-([0-9]+)$'))[1]::int), 0) + 1
    INTO next_number
  FROM public.doctor_patients
  WHERE doctor_id = auth.uid();

  INSERT INTO public.doctor_patients (
    doctor_id, patient_code, full_name, date_of_birth, sex, phone,
    cancer_type, stage, current_treatment, cycle_label, risk_level
  )
  VALUES (
    auth.uid(), 'OC-' || lpad(next_number::text, 4, '0'), trim(p_fields->>'full_name'),
    NULLIF(p_fields->>'date_of_birth', '')::date, NULLIF(trim(p_fields->>'sex'), ''),
    NULLIF(trim(p_fields->>'phone'), ''), NULLIF(trim(p_fields->>'cancer_type'), ''),
    NULLIF(trim(p_fields->>'stage'), ''), NULLIF(trim(p_fields->>'current_treatment'), ''),
    NULLIF(trim(p_fields->>'cycle_label'), ''), COALESCE(NULLIF(p_fields->>'risk_level', ''), 'low')
  )
  RETURNING * INTO created;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_get_patient(p_patient_id uuid)
RETURNS public.doctor_patients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  patient public.doctor_patients;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO patient FROM public.doctor_patients
  WHERE id = p_patient_id AND doctor_id = auth.uid();
  IF patient.id IS NULL THEN
    RAISE EXCEPTION 'Patient not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN patient;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count bigint;
  high_risk_count bigint;
  next_patients jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO active_count FROM public.doctor_patients WHERE doctor_id = auth.uid() AND status = 'active';
  SELECT count(*) INTO high_risk_count FROM public.doctor_patients WHERE doctor_id = auth.uid() AND status = 'active' AND risk_level = 'high';
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC), '[]'::jsonb) INTO next_patients
    FROM (SELECT id, patient_code, full_name, risk_level, updated_at FROM public.doctor_patients
      WHERE doctor_id = auth.uid() AND status = 'active' ORDER BY updated_at DESC LIMIT 5) p;
  RETURN jsonb_build_object(
    'kpis', jsonb_build_object('active_patients', active_count, 'appointments_today', 0,
      'pending_confirmations', 0, 'high_risk', high_risk_count, 'unread_items', 0),
    'next_appointments', '[]'::jsonb, 'attention', next_patients, 'trend_14d', '[]'::jsonb,
    'quick_counts', jsonb_build_object('unsigned_consultations', 0, 'unreviewed_reports', 0, 'unread_messages', 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_save_availability(p_rows jsonb)
RETURNS SETOF public.doctor_availability
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE row_data jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.doctor_availability WHERE doctor_id = auth.uid();
  FOR row_data IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) LOOP
    INSERT INTO public.doctor_availability (doctor_id, weekday, start_time, end_time, slot_minutes)
    VALUES (auth.uid(), (row_data->>'weekday')::smallint, (row_data->>'start_time')::time, (row_data->>'end_time')::time, COALESCE((row_data->>'slot_minutes')::smallint, 30));
  END LOOP;
  RETURN QUERY SELECT * FROM public.doctor_availability WHERE doctor_id = auth.uid() ORDER BY weekday;
END;
$$;

REVOKE ALL ON FUNCTION public.doctor_has_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doctor_has_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_doctor_workspace() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_update_profile(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_list_patients(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_create_patient(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_get_patient(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_dashboard_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_save_availability(jsonb) TO authenticated;

-- 20261003010000_doctor_clinical_records.sql
-- Doctor-owned clinical records. Patient links and consent scopes are added separately.

CREATE TABLE IF NOT EXISTS public.doctor_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  duration_minutes smallint NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 240),
  visit_type text NOT NULL DEFAULT 'follow_up' CHECK (visit_type IN ('initial', 'follow_up', 'teleconsultation', 'treatment')),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE RESTRICT,
  appointment_id uuid REFERENCES public.doctor_appointments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  subjective text,
  objective text,
  assessment text,
  plan text,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE RESTRICT,
  consultation_id uuid REFERENCES public.doctor_consultations(id) ON DELETE SET NULL,
  prescription_no text NOT NULL,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'cancelled', 'expired')),
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, prescription_no)
);

CREATE TABLE IF NOT EXISTS public.doctor_treatment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE RESTRICT,
  name text NOT NULL,
  protocol text,
  cycles_total integer CHECK (cycles_total IS NULL OR cycles_total > 0),
  cycles_completed integer NOT NULL DEFAULT 0 CHECK (cycles_completed >= 0),
  progress_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'review_required', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE RESTRICT,
  report_type text NOT NULL,
  report_date date NOT NULL DEFAULT current_date,
  flag text NOT NULL DEFAULT 'normal' CHECK (flag IN ('normal', 'attention', 'critical')),
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctor_appointments_schedule ON public.doctor_appointments (doctor_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_doctor_consultations_patient ON public.doctor_consultations (doctor_id, doctor_patient_id, updated_at DESC);

ALTER TABLE public.doctor_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctor_appointments_owner ON public.doctor_appointments;
CREATE POLICY doctor_appointments_owner ON public.doctor_appointments FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_consultations_owner ON public.doctor_consultations;
CREATE POLICY doctor_consultations_owner ON public.doctor_consultations FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_prescriptions_owner ON public.doctor_prescriptions;
CREATE POLICY doctor_prescriptions_owner ON public.doctor_prescriptions FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_treatment_plans_owner ON public.doctor_treatment_plans;
CREATE POLICY doctor_treatment_plans_owner ON public.doctor_treatment_plans FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_reports_owner ON public.doctor_reports;
CREATE POLICY doctor_reports_owner ON public.doctor_reports FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.doctor_list_appointments(p_from timestamptz DEFAULT now(), p_to timestamptz DEFAULT now() + interval '30 days')
RETURNS SETOF public.doctor_appointments
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.* FROM public.doctor_appointments a
  WHERE a.doctor_id = auth.uid() AND a.starts_at >= p_from AND a.starts_at < p_to
  ORDER BY a.starts_at;
$$;

CREATE OR REPLACE FUNCTION public.doctor_create_appointment(p_patient_id uuid, p_at timestamptz, p_visit_type text DEFAULT 'follow_up', p_reason text DEFAULT NULL, p_duration smallint DEFAULT 30)
RETURNS public.doctor_appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created public.doctor_appointments;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doctor_patients WHERE id = p_patient_id AND doctor_id = auth.uid() AND status = 'active') THEN
    RAISE EXCEPTION 'Patient is not in your active roster' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.doctor_appointments WHERE doctor_id = auth.uid() AND status NOT IN ('cancelled', 'no_show') AND starts_at < p_at + make_interval(mins => p_duration) AND starts_at + make_interval(mins => duration_minutes) > p_at) THEN
    RAISE EXCEPTION 'Appointment overlaps an existing appointment' USING ERRCODE = '23P01';
  END IF;
  INSERT INTO public.doctor_appointments (doctor_id, doctor_patient_id, starts_at, visit_type, reason, duration_minutes)
  VALUES (auth.uid(), p_patient_id, p_at, p_visit_type, p_reason, p_duration)
  RETURNING * INTO created;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_list_consultations()
RETURNS SETOF public.doctor_consultations
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT c.* FROM public.doctor_consultations c WHERE c.doctor_id = auth.uid() ORDER BY c.updated_at DESC; $$;

CREATE OR REPLACE FUNCTION public.doctor_save_consultation(p_id uuid, p_patient_id uuid, p_fields jsonb)
RETURNS public.doctor_consultations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE saved public.doctor_consultations;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.doctor_consultations (doctor_id, doctor_patient_id, subjective, objective, assessment, plan)
    VALUES (auth.uid(), p_patient_id, p_fields->>'subjective', p_fields->>'objective', p_fields->>'assessment', p_fields->>'plan') RETURNING * INTO saved;
  ELSE
    UPDATE public.doctor_consultations SET subjective = p_fields->>'subjective', objective = p_fields->>'objective',
      assessment = p_fields->>'assessment', plan = p_fields->>'plan', updated_at = now()
      WHERE id = p_id AND doctor_id = auth.uid() AND status = 'draft' RETURNING * INTO saved;
  END IF;
  IF saved.id IS NULL THEN RAISE EXCEPTION 'Draft consultation not found or is already signed'; END IF;
  RETURN saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_sign_consultation(p_id uuid)
RETURNS public.doctor_consultations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE signed public.doctor_consultations;
BEGIN
  UPDATE public.doctor_consultations SET status = 'signed', signed_at = now(), updated_at = now()
  WHERE id = p_id AND doctor_id = auth.uid() AND status = 'draft' RETURNING * INTO signed;
  IF signed.id IS NULL THEN RAISE EXCEPTION 'Only an existing draft can be signed'; END IF;
  RETURN signed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_list_appointments(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_create_appointment(uuid, timestamptz, text, text, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_list_consultations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_save_consultation(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_sign_consultation(uuid) TO authenticated;

-- 20261003020000_doctor_links_prescriptions_reports.sql
-- Consent-first patient links and the remaining doctor record RPCs.

CREATE TABLE IF NOT EXISTS public.doctor_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_patient_id uuid NOT NULL REFERENCES public.doctor_patients(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doctor_consents (
  doctor_patient_id uuid PRIMARY KEY REFERENCES public.doctor_patients(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scopes text[] NOT NULL DEFAULT '{}',
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE OR REPLACE FUNCTION public.redeem_doctor_link_code(p_code text, p_scopes text[] DEFAULT ARRAY['appointments']::text[])
RETURNS public.doctor_consents
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE link_row public.doctor_link_codes; consent_row public.doctor_consents;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name = 'patient'
  ) THEN RAISE EXCEPTION 'Patient role is required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO link_row FROM public.doctor_link_codes
  WHERE code_hash = encode(digest(upper(trim(p_code)), 'sha256'), 'hex')
    AND redeemed_at IS NULL AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;
  IF link_row.id IS NULL THEN RAISE EXCEPTION 'Invalid or expired link code' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.doctor_consents (doctor_patient_id, patient_user_id, scopes)
  VALUES (link_row.doctor_patient_id, auth.uid(), COALESCE(p_scopes, ARRAY['appointments']::text[]))
  ON CONFLICT (doctor_patient_id) DO UPDATE SET patient_user_id = EXCLUDED.patient_user_id, scopes = EXCLUDED.scopes, granted_at = now(), revoked_at = NULL
  RETURNING * INTO consent_row;
  UPDATE public.doctor_link_codes SET redeemed_at = now() WHERE id = link_row.id;
  UPDATE public.doctor_patients SET patient_user_id = auth.uid(), updated_at = now() WHERE id = link_row.doctor_patient_id;
  RETURN consent_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_doctor_verifications()
RETURNS SETOF public.doctor_profiles
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT dp.* FROM public.doctor_profiles dp
  WHERE EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'super_admin')
  ) ORDER BY dp.updated_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_doctor_verification(p_doctor_user_id uuid, p_status text)
RETURNS public.doctor_profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE updated public.doctor_profiles;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'super_admin')
  ) THEN RAISE EXCEPTION 'Administrator role is required' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('pending', 'submitted', 'verified', 'rejected') THEN RAISE EXCEPTION 'Invalid verification status' USING ERRCODE = '22023'; END IF;
  UPDATE public.doctor_profiles SET verification_status = p_status, updated_at = now()
  WHERE user_id = p_doctor_user_id RETURNING * INTO updated;
  RETURN updated;
END;
$$;

ALTER TABLE public.doctor_link_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doctor_link_codes_owner ON public.doctor_link_codes;
CREATE POLICY doctor_link_codes_owner ON public.doctor_link_codes FOR ALL TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());
DROP POLICY IF EXISTS doctor_consents_doctor_owner ON public.doctor_consents;
CREATE POLICY doctor_consents_doctor_owner ON public.doctor_consents FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.doctor_patients p WHERE p.id = doctor_patient_id AND p.doctor_id = auth.uid())
);
DROP POLICY IF EXISTS doctor_consents_patient_owner ON public.doctor_consents;
CREATE POLICY doctor_consents_patient_owner ON public.doctor_consents FOR SELECT TO authenticated USING (patient_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.doctor_create_link_code(p_doctor_patient_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE raw_code text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doctor_profiles WHERE user_id = auth.uid() AND verification_status = 'verified') THEN
    RAISE EXCEPTION 'Doctor verification is required before inviting a patient' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doctor_patients WHERE id = p_doctor_patient_id AND doctor_id = auth.uid() AND status = 'active') THEN
    RAISE EXCEPTION 'Patient is not in your active roster' USING ERRCODE = '42501';
  END IF;
  raw_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.doctor_link_codes (doctor_id, doctor_patient_id, code_hash, expires_at)
  VALUES (auth.uid(), p_doctor_patient_id, encode(digest(raw_code, 'sha256'), 'hex'), now() + interval '7 days');
  RETURN raw_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_list_link_codes()
RETURNS TABLE(id uuid, doctor_patient_id uuid, expires_at timestamptz, redeemed_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT id, doctor_patient_id, expires_at, redeemed_at FROM public.doctor_link_codes WHERE doctor_id = auth.uid() ORDER BY created_at DESC; $$;

CREATE OR REPLACE FUNCTION public.doctor_create_prescription(p_patient_id uuid, p_items jsonb, p_valid_until date DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS public.doctor_prescriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE created public.doctor_prescriptions; next_no integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN RAISE EXCEPTION 'At least one prescription item is required' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.doctor_patients WHERE id = p_patient_id AND doctor_id = auth.uid()) THEN RAISE EXCEPTION 'Patient is not in your roster' USING ERRCODE = '42501'; END IF;
  SELECT count(*) + 1 INTO next_no FROM public.doctor_prescriptions WHERE doctor_id = auth.uid();
  INSERT INTO public.doctor_prescriptions (doctor_id, doctor_patient_id, prescription_no, items, valid_until, notes)
  VALUES (auth.uid(), p_patient_id, 'RX-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(next_no::text, 4, '0'), p_items, p_valid_until, p_notes)
  RETURNING * INTO created;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_list_reports()
RETURNS SETOF public.doctor_reports
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT r.* FROM public.doctor_reports r WHERE r.doctor_id = auth.uid() ORDER BY r.report_date DESC, r.created_at DESC; $$;

CREATE OR REPLACE FUNCTION public.doctor_add_manual_report(p_patient_id uuid, p_type text, p_date date, p_flag text, p_summary text)
RETURNS public.doctor_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE created public.doctor_reports;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.doctor_reports (doctor_id, doctor_patient_id, report_type, report_date, flag, summary)
  SELECT auth.uid(), p.id, p_type, COALESCE(p_date, current_date), COALESCE(p_flag, 'normal'), p_summary
  FROM public.doctor_patients p WHERE p.id = p_patient_id AND p.doctor_id = auth.uid()
  RETURNING * INTO created;
  IF created.id IS NULL THEN RAISE EXCEPTION 'Patient is not in your roster' USING ERRCODE = '42501'; END IF;
  RETURN created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_create_link_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_doctor_link_code(text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_list_link_codes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_create_prescription(uuid, jsonb, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_list_reports() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_add_manual_report(uuid, text, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_doctor_verifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_doctor_verification(uuid, text) TO authenticated;

-- 20261003030000_doctor_live_data_messaging.sql
-- Consent-scoped access to existing patient data and doctor messaging.

CREATE OR REPLACE FUNCTION public.doctor_get_patient_live_data(p_doctor_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE patient_user uuid; granted text[]; result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501'; END IF;
  SELECT p.patient_user_id, c.scopes INTO patient_user, granted
  FROM public.doctor_patients p
  LEFT JOIN public.doctor_consents c ON c.doctor_patient_id = p.id AND c.revoked_at IS NULL
  WHERE p.id = p_doctor_patient_id AND p.doctor_id = auth.uid();
  IF patient_user IS NULL OR granted IS NULL THEN RAISE EXCEPTION 'Patient has not granted active consent' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object(
    'symptoms', CASE WHEN 'symptoms' = ANY(granted) THEN COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.recorded_at DESC) FROM public.symptoms s WHERE s.user_id = patient_user AND s.recorded_at > now() - interval '30 days'), '[]'::jsonb) ELSE '[]'::jsonb END,
    'side_effects', CASE WHEN 'side_effects' = ANY(granted) THEN COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.recorded_at DESC) FROM public.side_effect_entries s WHERE s.user_id = patient_user AND s.recorded_at > now() - interval '30 days'), '[]'::jsonb) ELSE '[]'::jsonb END,
    'medications', CASE WHEN 'medications' = ANY(granted) THEN COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC) FROM public.medications m WHERE m.user_id = patient_user AND m.is_active), '[]'::jsonb) ELSE '[]'::jsonb END,
    'timeline', CASE WHEN 'timeline' = ANY(granted) THEN COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.event_date DESC) FROM public.health_timeline t WHERE t.user_id = patient_user), '[]'::jsonb) ELSE '[]'::jsonb END,
    'consent_scopes', to_jsonb(granted)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_list_messages(p_doctor_patient_id uuid)
RETURNS SETOF public.messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE patient_user uuid; granted text[];
BEGIN
  SELECT p.patient_user_id, c.scopes INTO patient_user, granted
  FROM public.doctor_patients p JOIN public.doctor_consents c ON c.doctor_patient_id = p.id AND c.revoked_at IS NULL
  WHERE p.id = p_doctor_patient_id AND p.doctor_id = auth.uid();
  IF NOT ('messages' = ANY(COALESCE(granted, '{}'::text[]))) THEN RAISE EXCEPTION 'Messaging consent is not active' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT m.* FROM public.messages m
  WHERE (m.sender_id = auth.uid() AND m.recipient_id = patient_user)
     OR (m.sender_id = patient_user AND m.recipient_id = auth.uid())
  ORDER BY m.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_send_message(p_doctor_patient_id uuid, p_content text)
RETURNS public.messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE patient_user uuid; granted text[]; created public.messages;
BEGIN
  SELECT p.patient_user_id, c.scopes INTO patient_user, granted
  FROM public.doctor_patients p JOIN public.doctor_consents c ON c.doctor_patient_id = p.id AND c.revoked_at IS NULL
  WHERE p.id = p_doctor_patient_id AND p.doctor_id = auth.uid();
  IF patient_user IS NULL OR NOT ('messages' = ANY(COALESCE(granted, '{}'::text[]))) THEN RAISE EXCEPTION 'Messaging consent is not active' USING ERRCODE = '42501'; END IF;
  IF NULLIF(trim(p_content), '') IS NULL THEN RAISE EXCEPTION 'Message cannot be empty' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.messages (sender_id, recipient_id, content) VALUES (auth.uid(), patient_user, trim(p_content)) RETURNING * INTO created;
  INSERT INTO public.notifications (user_id, title, message, type) VALUES (patient_user, 'New message from your doctor', trim(p_content), 'message');
  RETURN created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_get_patient_live_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_list_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_send_message(uuid, text) TO authenticated;

-- 20261003040000_doctor_hospital_affiliation.sql
-- Connect verified doctor accounts to the existing hospital membership and OPD system.

CREATE OR REPLACE FUNCTION public.ensure_doctor_hospital_workspace()
RETURNS public.hospital_orgs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_invite public.hospital_invites;
  v_org public.hospital_orgs;
  v_doctor public.doctor_profiles;
BEGIN
  IF v_user_id IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_doctor FROM public.doctor_profiles WHERE user_id = v_user_id;
  IF v_doctor.verification_status IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'Doctor verification is required for hospital affiliation' USING ERRCODE = '42501';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  SELECT hi.* INTO v_invite
  FROM public.hospital_invites hi
  WHERE lower(hi.email) = lower(v_email)
    AND hi.staff_role = 'doctor'
    AND hi.accepted_at IS NULL
    AND hi.expires_at > now()
  ORDER BY hi.created_at
  LIMIT 1
  FOR UPDATE;

  IF v_invite.id IS NOT NULL THEN
    INSERT INTO public.hospital_members (hospital_id, user_id, staff_role)
    VALUES (v_invite.hospital_id, v_user_id, 'doctor')
    ON CONFLICT (hospital_id, user_id, staff_role) DO UPDATE SET is_active = true;

    INSERT INTO public.hospital_doctors (hospital_id, user_id, doctor_name, specialty, is_active)
    VALUES (v_invite.hospital_id, v_user_id, v_doctor.full_name, v_doctor.specialization, true)
    ON CONFLICT (hospital_id, doctor_name)
    DO UPDATE SET user_id = EXCLUDED.user_id, is_active = true;

    UPDATE public.hospital_invites SET accepted_at = now() WHERE id = v_invite.id;
    INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
    VALUES (v_invite.hospital_id, v_user_id, 'doctor.invite_accepted', jsonb_build_object('invite_id', v_invite.id));
  END IF;

  SELECT h.* INTO v_org
  FROM public.hospital_orgs h
  JOIN public.hospital_members hm ON hm.hospital_id = h.id
  WHERE hm.user_id = v_user_id AND hm.is_active AND hm.staff_role = 'doctor'
  ORDER BY hm.created_at, h.created_at
  LIMIT 1;
  RETURN v_org;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_hospital_affiliations()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'hospital_id', h.id, 'name', h.name,
    'verification_status', h.verification_status,
    'staff_roles', roles.staff_roles
  ) ORDER BY h.name), '[]'::jsonb)
  FROM public.hospital_orgs h
  JOIN public.hospital_members hm ON hm.hospital_id = h.id AND hm.user_id = auth.uid() AND hm.is_active
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(DISTINCT hm2.staff_role ORDER BY hm2.staff_role) AS staff_roles
    FROM public.hospital_members hm2
    WHERE hm2.hospital_id = h.id AND hm2.user_id = auth.uid() AND hm2.is_active
  ) roles ON true
  WHERE public.doctor_has_role();
$$;

GRANT EXECUTE ON FUNCTION public.ensure_doctor_hospital_workspace() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_hospital_affiliations() TO authenticated;

-- 20261003050000_patient_doctor_link_surfaces.sql
-- Patient-facing access to the consented doctor workspace.

CREATE OR REPLACE FUNCTION public.patient_list_doctor_appointments()
RETURNS SETOF public.doctor_appointments
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.*
  FROM public.doctor_appointments a
  JOIN public.doctor_patients dp ON dp.id = a.doctor_patient_id
  JOIN public.doctor_consents c ON c.doctor_patient_id = dp.id
    AND c.revoked_at IS NULL AND dp.doctor_id = a.doctor_id
  WHERE dp.patient_user_id = auth.uid()
  ORDER BY a.starts_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.patient_request_doctor_appointment(
  p_doctor_id uuid,
  p_starts_at timestamptz,
  p_visit_type text,
  p_reason text
)
RETURNS public.doctor_appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient public.doctor_patients;
  v_appointment public.doctor_appointments;
BEGIN
  SELECT dp.* INTO v_patient
  FROM public.doctor_patients dp
  JOIN public.doctor_consents c ON c.doctor_patient_id = dp.id
    AND c.revoked_at IS NULL AND dp.doctor_id = p_doctor_id
  WHERE dp.patient_user_id = auth.uid()
  ORDER BY c.granted_at DESC
  LIMIT 1;
  IF v_patient.id IS NULL THEN RAISE EXCEPTION 'Active doctor consent is required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.doctor_appointments (doctor_id, doctor_patient_id, starts_at, visit_type, status, reason)
  VALUES (p_doctor_id, v_patient.id, p_starts_at, p_visit_type, 'pending', NULLIF(btrim(p_reason), ''))
  RETURNING * INTO v_appointment;
  RETURN v_appointment;
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_list_doctor_messages(p_doctor_id uuid)
RETURNS TABLE(id uuid, sender_id uuid, recipient_id uuid, content text, is_read boolean, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.sender_id, m.recipient_id, m.content, m.is_read, m.created_at
  FROM public.messages m
  JOIN public.doctor_patients dp ON (m.sender_id = p_doctor_id AND m.recipient_id = dp.patient_user_id)
    OR (m.recipient_id = p_doctor_id AND m.sender_id = dp.patient_user_id)
  JOIN public.doctor_consents c ON c.doctor_patient_id = dp.id
    AND c.revoked_at IS NULL AND dp.doctor_id = p_doctor_id
  WHERE dp.patient_user_id = auth.uid()
  ORDER BY m.created_at;
$$;

CREATE OR REPLACE FUNCTION public.patient_send_doctor_message(p_doctor_id uuid, p_content text)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id uuid;
  v_message public.messages;
BEGIN
  SELECT dp.id INTO v_patient_id
  FROM public.doctor_patients dp
  JOIN public.doctor_consents c ON c.doctor_patient_id = dp.id
    AND c.revoked_at IS NULL AND dp.doctor_id = p_doctor_id
  WHERE dp.patient_user_id = auth.uid()
  LIMIT 1;
  IF v_patient_id IS NULL OR p_content IS NULL OR btrim(p_content) = '' THEN
    RAISE EXCEPTION 'Active doctor consent and message content are required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.messages (sender_id, recipient_id, content)
  VALUES (auth.uid(), p_doctor_id, btrim(p_content))
  RETURNING * INTO v_message;
  RETURN v_message;
END;
$$;

GRANT EXECUTE ON FUNCTION public.patient_list_doctor_appointments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_request_doctor_appointment(uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_list_doctor_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_send_doctor_message(uuid, text) TO authenticated;

-- 20261003060000_doctor_prescription_versions_audit.sql
-- Immutable prescription history and security audit trail.

CREATE TABLE IF NOT EXISTS public.doctor_prescription_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES public.doctor_prescriptions(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
  notes text,
  status text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prescription_id, version)
);

CREATE TABLE IF NOT EXISTS public.doctor_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  doctor_patient_id uuid REFERENCES public.doctor_patients(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doctor_prescription_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY doctor_prescription_versions_owner ON public.doctor_prescription_versions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.doctor_prescriptions p
    WHERE p.id = prescription_id AND p.doctor_id = auth.uid()
  ));
CREATE POLICY doctor_audit_log_owner ON public.doctor_audit_log
  FOR SELECT TO authenticated USING (actor_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.doctor_amend_prescription(
  p_prescription_id uuid, p_items jsonb, p_notes text
)
RETURNS public.doctor_prescription_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prescription public.doctor_prescriptions;
  v_version public.doctor_prescription_versions;
  v_next integer;
BEGIN
  SELECT * INTO v_prescription FROM public.doctor_prescriptions
  WHERE id = p_prescription_id AND doctor_id = auth.uid() FOR UPDATE;
  IF v_prescription.id IS NULL OR v_prescription.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active prescription owned by the doctor can be amended' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Prescription items are required' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(max(version), 0) + 1 INTO v_next
  FROM public.doctor_prescription_versions WHERE prescription_id = p_prescription_id;
  INSERT INTO public.doctor_prescription_versions (prescription_id, version, items, notes, status, created_by)
  VALUES (p_prescription_id, v_next, p_items, p_notes, 'active', auth.uid())
  RETURNING * INTO v_version;
  UPDATE public.doctor_prescriptions SET items = p_items, notes = p_notes WHERE id = p_prescription_id;
  INSERT INTO public.doctor_audit_log (actor_user_id, doctor_patient_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), v_prescription.doctor_patient_id, 'prescription.amended', 'doctor_prescription', p_prescription_id, jsonb_build_object('version', v_next));
  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_record_audit(
  p_action text, p_entity_type text, p_entity_id uuid, p_doctor_patient_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.doctor_audit_log (actor_user_id, doctor_patient_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_doctor_patient_id, p_action, p_entity_type, p_entity_id, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_amend_prescription(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_record_audit(text, text, uuid, uuid, jsonb) TO authenticated;

-- 20261003070000_restore_hospital_command_center.sql
CREATE OR REPLACE FUNCTION public.hospital_command_center(p_hospital_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id,'patients.read') THEN RAISE EXCEPTION 'patients.read capability required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'kpis',jsonb_build_object('opd_patients_today',(SELECT count(*) FROM public.hospital_visits WHERE hospital_id=p_hospital_id AND visit_date=public.hospital_today(p_hospital_id)),'checked_in',(SELECT count(*) FROM public.hospital_visits WHERE hospital_id=p_hospital_id AND visit_date=public.hospital_today(p_hospital_id)),'waiting',(SELECT count(*) FROM public.queue_entries WHERE hospital_id=p_hospital_id AND status='waiting' AND session_id IN(SELECT id FROM public.opd_sessions WHERE hospital_id=p_hospital_id AND session_date=public.hospital_today(p_hospital_id))),'in_consultation',(SELECT count(*) FROM public.queue_entries WHERE hospital_id=p_hospital_id AND status='in_consultation' AND session_id IN(SELECT id FROM public.opd_sessions WHERE hospital_id=p_hospital_id AND session_date=public.hospital_today(p_hospital_id))),'pending_reports',(SELECT count(*) FROM public.investigation_orders WHERE hospital_id=p_hospital_id AND status IN('performed','processing','report_ready')),'admissions_today',(SELECT count(*) FROM public.hospital_admissions WHERE hospital_id=p_hospital_id AND admitted_at >= (public.hospital_today(p_hospital_id)::timestamp AT TIME ZONE (SELECT timezone FROM public.hospital_orgs WHERE id=p_hospital_id)))),
    'queues',public.get_today_sessions(p_hospital_id),
    'action_required',COALESCE((SELECT jsonb_agg(jsonb_build_object('key',a.key,'severity',a.severity,'count',a.count,'href',a.href)) FROM (VALUES
      ('reports_ready_for_review','warning',(SELECT count(*)::integer FROM public.investigation_orders WHERE hospital_id=p_hospital_id AND status='report_ready'),'/dashboard/hospital/investigations'),
      ('waiting_beyond_estimate','warning',(SELECT count(*)::integer FROM public.queue_entries WHERE hospital_id=p_hospital_id AND status='waiting' AND est_wait_high_min IS NOT NULL AND extract(epoch FROM (now()-joined_at))/60>est_wait_high_min),'/dashboard/hospital/opd'),
      ('pending_investigations','info',(SELECT count(*)::integer FROM public.investigation_orders WHERE hospital_id=p_hospital_id AND status IN('ordered','waitlisted','scheduled')),'/dashboard/hospital/investigations')
    ) a(key,severity,count,href) WHERE a.count>0),'[]'::jsonb),
    'checkins_by_hour',COALESCE((SELECT jsonb_agg(jsonb_build_object('hour',h.hour,'count',COALESCE(c.count,0)) ORDER BY h.hour) FROM generate_series(0,23) h(hour) LEFT JOIN (SELECT extract(hour FROM v.checked_in_at AT TIME ZONE (SELECT timezone FROM public.hospital_orgs WHERE id=p_hospital_id))::integer AS hour,count(*) AS count FROM public.hospital_visits v WHERE v.hospital_id=p_hospital_id AND v.visit_date=public.hospital_today(p_hospital_id) GROUP BY 1) c ON c.hour=h.hour),'[]'::jsonb),
    'opd_14_days',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',d.day,'count',COALESCE(c.count,0)) ORDER BY d.day) FROM (SELECT generated_day::date AS day FROM generate_series(public.hospital_today(p_hospital_id)-13,public.hospital_today(p_hospital_id),'1 day') generated_day) d LEFT JOIN (SELECT visit_date,count(*) AS count FROM public.hospital_visits WHERE hospital_id=p_hospital_id GROUP BY visit_date) c ON c.visit_date=d.day),'[]'::jsonb),
    'recent_events',COALESCE((SELECT jsonb_agg(jsonb_build_object('event_type',e.event_type,'patient',p.name,'created_at',e.created_at,'details',e.details) ORDER BY e.created_at DESC) FROM (SELECT * FROM public.patient_journey_events WHERE hospital_id=p_hospital_id ORDER BY created_at DESC LIMIT 20) e JOIN public.hospital_patients p ON p.id=e.patient_id),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.hospital_command_center(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- 20261003080000_register_patient_derive_age.sql
CREATE OR REPLACE FUNCTION public.register_hospital_patient(
  p_hospital_id uuid,
  p_identifier text,
  p_name text,
  p_mobile text DEFAULT NULL,
  p_dob date DEFAULT NULL,
  p_age integer DEFAULT NULL,
  p_gender text DEFAULT NULL
)
RETURNS public.hospital_patients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient public.hospital_patients;
  v_identifier text;
  v_age integer;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.register') THEN
    RAISE EXCEPTION 'patients.register capability required' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Patient name is required' USING ERRCODE = '22023';
  END IF;
  IF p_dob > current_date THEN
    RAISE EXCEPTION 'Patient date of birth cannot be in the future' USING ERRCODE = '22023';
  END IF;
  v_age := CASE WHEN p_dob IS NOT NULL THEN date_part('year', age(current_date, p_dob))::integer ELSE p_age END;
  IF v_age IS NOT NULL AND v_age < 0 THEN
    RAISE EXCEPTION 'Patient age cannot be negative' USING ERRCODE = '22023';
  END IF;

  v_identifier := public.normalize_patient_identifier(p_hospital_id, p_identifier);
  BEGIN
    INSERT INTO public.hospital_patients (hospital_id, patient_identifier, name, mobile, dob, age, gender)
    VALUES (p_hospital_id, v_identifier, btrim(p_name), NULLIF(btrim(p_mobile), ''), p_dob, v_age, p_gender)
    RETURNING * INTO v_patient;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A patient with this identifier already exists in this hospital' USING ERRCODE = '23505';
  END;

  INSERT INTO public.patient_journey_events (hospital_id, patient_id, actor_user_id, event_type, details)
  VALUES (p_hospital_id, v_patient.id, auth.uid(), 'patient.registered', jsonb_build_object('identifier', v_patient.patient_identifier));
  INSERT INTO public.hospital_access_audit (hospital_id, patient_id, actor_user_id, action, details)
  VALUES (p_hospital_id, v_patient.id, auth.uid(), 'patient.registered', jsonb_build_object('identifier', v_patient.patient_identifier));
  RETURN v_patient;
END;
$$;

REVOKE ALL ON FUNCTION public.register_hospital_patient(uuid, text, text, text, date, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_hospital_patient(uuid, text, text, text, date, integer, text) TO authenticated;
NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.import_hospital_patients(p_hospital_id uuid, p_rows jsonb, p_dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_row jsonb; v_status text; v_message text; v_identifier text; v_patient_id uuid; v_dob date; v_age integer; v_output jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.register') THEN RAISE EXCEPTION 'patients.register capability required' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Rows must be a JSON array' USING ERRCODE = '22023'; END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_identifier := public.hospital_normalize_id(p_hospital_id, v_row ->> 'identifier');
    v_dob := NULLIF(v_row ->> 'dob', '')::date;
    IF v_dob > current_date THEN RAISE EXCEPTION 'Patient date of birth cannot be in the future' USING ERRCODE = '22023'; END IF;
    v_age := CASE WHEN v_dob IS NOT NULL THEN date_part('year', age(current_date, v_dob))::integer ELSE NULLIF(v_row ->> 'age', '')::integer END;
    IF NULLIF(v_identifier,'') IS NULL OR NULLIF(btrim(v_row ->> 'name'),'') IS NULL THEN
      v_status := 'error'; v_message := 'Identifier and name are required';
    ELSIF EXISTS (SELECT 1 FROM public.hospital_patients WHERE hospital_id = p_hospital_id AND normalized_identifier = upper(regexp_replace(v_identifier,'[[:space:]_-]+','','g'))) THEN
      v_status := 'duplicate'; v_message := 'Patient identifier already exists';
    ELSIF p_dry_run THEN
      v_status := 'new'; v_message := 'Ready to import';
    ELSE
      INSERT INTO public.hospital_patients (hospital_id, patient_identifier, name, mobile, dob, age, gender)
      VALUES (p_hospital_id, v_identifier, btrim(v_row ->> 'name'), NULLIF(btrim(v_row ->> 'mobile'),''), v_dob, v_age, NULLIF(btrim(v_row ->> 'gender'),''))
      ON CONFLICT (hospital_id, patient_identifier) DO NOTHING RETURNING id INTO v_patient_id;
      IF v_patient_id IS NULL THEN v_status := 'duplicate'; v_message := 'Patient identifier already exists';
      ELSE v_status := 'new'; v_message := 'Imported';
        INSERT INTO public.hospital_access_audit (hospital_id, patient_id, actor_user_id, action, details) VALUES (p_hospital_id, v_patient_id, auth.uid(), 'patient.imported', jsonb_build_object('identifier',v_identifier));
      END IF;
    END IF;
    v_output := v_output || jsonb_build_array(jsonb_build_object('row',v_row,'status',v_status,'message',v_message));
  END LOOP;
  RETURN jsonb_build_object('rows',v_output,'dry_run',p_dry_run);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.import_hospital_patients(uuid, jsonb, boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- 20261004000000_repair_caregiver_role_access.sql
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

-- 20261004000001_auto_generate_hospital_patient_ids.sql
CREATE OR REPLACE FUNCTION public.next_hospital_patient_identifier(p_hospital_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_number integer := 24601;
  v_candidate text;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.register') THEN
    RAISE EXCEPTION 'patients.register capability required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(NULLIF(patient_id_prefix, ''), 'PID-')
  INTO v_prefix
  FROM public.hospital_orgs
  WHERE id = p_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hospital workspace not found' USING ERRCODE = 'P0002';
  END IF;

  LOOP
    v_candidate := v_prefix || v_number::text;
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.hospital_patients
      WHERE hospital_id = p_hospital_id
        AND normalized_identifier = upper(regexp_replace(v_candidate, '[[:space:]_-]+', '', 'g'))
    );
    v_number := v_number + 1;
  END LOOP;

  RETURN v_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_hospital_patient(
  p_hospital_id uuid,
  p_identifier text,
  p_name text,
  p_mobile text DEFAULT NULL,
  p_dob date DEFAULT NULL,
  p_age integer DEFAULT NULL,
  p_gender text DEFAULT NULL
)
RETURNS public.hospital_patients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient public.hospital_patients;
  v_identifier text;
  v_prefix text;
  v_number integer := 24601;
  v_candidate text;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'patients.register') THEN
    RAISE EXCEPTION 'patients.register capability required' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Patient name is required' USING ERRCODE = '22023';
  END IF;
  IF p_dob > current_date THEN
    RAISE EXCEPTION 'Patient date of birth cannot be in the future' USING ERRCODE = '22023';
  END IF;
  v_identifier := NULLIF(btrim(p_identifier), '');

  IF v_identifier IS NULL THEN
    SELECT COALESCE(NULLIF(patient_id_prefix, ''), 'PID-')
    INTO v_prefix
    FROM public.hospital_orgs
    WHERE id = p_hospital_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Hospital workspace not found' USING ERRCODE = 'P0002';
    END IF;

    LOOP
      v_candidate := v_prefix || v_number::text;
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM public.hospital_patients
        WHERE hospital_id = p_hospital_id
          AND normalized_identifier = upper(regexp_replace(v_candidate, '[[:space:]_-]+', '', 'g'))
      );
      v_number := v_number + 1;
    END LOOP;
    v_identifier := v_candidate;
  ELSE
    v_identifier := public.normalize_patient_identifier(p_hospital_id, v_identifier);
  END IF;

  BEGIN
    INSERT INTO public.hospital_patients (hospital_id, patient_identifier, name, mobile, dob, age, gender)
    VALUES (
      p_hospital_id,
      v_identifier,
      btrim(p_name),
      NULLIF(btrim(p_mobile), ''),
      p_dob,
      CASE WHEN p_dob IS NOT NULL THEN date_part('year', age(current_date, p_dob))::integer ELSE p_age END,
      p_gender
    )
    RETURNING * INTO v_patient;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A patient with this identifier already exists in this hospital' USING ERRCODE = '23505';
  END;

  INSERT INTO public.patient_journey_events (hospital_id, patient_id, actor_user_id, event_type, details)
  VALUES (p_hospital_id, v_patient.id, auth.uid(), 'patient.registered', jsonb_build_object('identifier', v_patient.patient_identifier));
  INSERT INTO public.hospital_access_audit (hospital_id, patient_id, actor_user_id, action, details)
  VALUES (p_hospital_id, v_patient.id, auth.uid(), 'patient.registered', jsonb_build_object('identifier', v_patient.patient_identifier));
  RETURN v_patient;
END;
$$;

REVOKE ALL ON FUNCTION public.next_hospital_patient_identifier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_hospital_patient_identifier(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.register_hospital_patient(uuid, text, text, text, date, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_hospital_patient(uuid, text, text, text, date, integer, text) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- 20261005000000_notify_patient_doctor_messages.sql
-- Keep patient-to-doctor messaging and in-app notifications in one transaction.

CREATE OR REPLACE FUNCTION public.patient_send_doctor_message(p_doctor_id uuid, p_content text)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id uuid;
  v_message public.messages;
BEGIN
  SELECT dp.id INTO v_patient_id
  FROM public.doctor_patients dp
  JOIN public.doctor_consents c ON c.doctor_patient_id = dp.id
    AND c.revoked_at IS NULL
    AND dp.doctor_id = p_doctor_id
  WHERE dp.patient_user_id = auth.uid()
  LIMIT 1;

  IF v_patient_id IS NULL OR p_content IS NULL OR btrim(p_content) = '' THEN
    RAISE EXCEPTION 'Active doctor consent and message content are required'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.messages (sender_id, recipient_id, content)
  VALUES (auth.uid(), p_doctor_id, btrim(p_content))
  RETURNING * INTO v_message;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (p_doctor_id, 'New message from your patient', btrim(p_content), 'message');

  RETURN v_message;
END;
$$;

GRANT EXECUTE ON FUNCTION public.patient_send_doctor_message(uuid, text) TO authenticated;

-- 20261006000000_sync_clinical_sources.sql
-- Connect doctor and hospital clinical records to the patient-owned clinical views.

ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS source_key text,
  ADD COLUMN IF NOT EXISTS source_doctor_prescription_id uuid
    REFERENCES public.doctor_prescriptions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS medications_source_key_unique
  ON public.medications (source_key);

ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS source_key text,
  ADD COLUMN IF NOT EXISTS source_doctor_treatment_plan_id uuid
    REFERENCES public.doctor_treatment_plans(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS treatments_source_key_unique
  ON public.treatments (source_key);

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

-- 20261006010000_harden_bpl_and_demo_access.sql
-- Restrict BPL reads to the intentionally public fundraising surface and keep
-- hospital demo data unavailable to ordinary production staff.

DROP POLICY IF EXISTS "auth_view_all_patients" ON public.bpl_patients;
DROP POLICY IF EXISTS "public_view_verified_patients" ON public.bpl_patients;

CREATE POLICY "bpl_owner_read" ON public.bpl_patients
FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'super_admin')
  )
);

CREATE POLICY "bpl_public_verified_read" ON public.bpl_patients
FOR SELECT TO anon, authenticated
USING (verified = true);

CREATE OR REPLACE VIEW public.bpl_public_patients
WITH (security_invoker = true)
AS
SELECT
  id, name, age, gender, cancer_type, stage, location, treatment,
  goal_amount, raised_amount, donors_count, urgent, image_url, summary,
  verified, created_at, updated_at
FROM public.bpl_patients;

GRANT SELECT ON public.bpl_public_patients TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.load_demo_data(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.environment', true) NOT IN ('development', 'staging') THEN
    RAISE EXCEPTION 'Demo data is disabled outside development and staging'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'Use the development/staging demo bundle to load sample data'
    USING ERRCODE = '0A000';
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_demo_data(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.environment', true) NOT IN ('development', 'staging') THEN
    RAISE EXCEPTION 'Demo data is disabled outside development and staging'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.hospital_has_cap(p_hospital_id, 'config.manage') THEN
    RAISE EXCEPTION 'config.manage capability required' USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'Demo data removal must be performed by the staging maintenance job'
    USING ERRCODE = '0A000';
END;
$$;

REVOKE ALL ON FUNCTION public.load_demo_data(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_demo_data(uuid) FROM PUBLIC, anon, authenticated;

-- 20261006020000_harden_hospital_privileged_rpcs.sql
-- Close remaining unauthenticated and cross-patient hospital RPC paths.

CREATE OR REPLACE FUNCTION public.generate_patient_link_code(
  p_hospital_id uuid,
  p_patient_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_code text;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.hospital_has_cap(p_hospital_id, 'patients.register')
     OR NOT EXISTS (
       SELECT 1 FROM public.hospital_patients
       WHERE id = p_patient_id AND hospital_id = p_hospital_id
     ) THEN
    RAISE EXCEPTION 'Hospital patient-link permission is required'
      USING ERRCODE = '42501';
  END IF;

  raw_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  INSERT INTO public.patient_link_codes (
    hospital_id, patient_id, code_hash, expires_at
  )
  VALUES (
    p_hospital_id, p_patient_id,
    encode(digest(raw_code, 'sha256'), 'hex'),
    now() + interval '7 days'
  );
  RETURN raw_code;
END;
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
  IF auth.uid() IS NULL OR NULLIF(btrim(p_code), '') IS NULL THEN
    RAISE EXCEPTION 'Authentication and link code are required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO link_row
  FROM public.patient_link_codes
  WHERE hospital_id = p_hospital_id
    AND code_hash IN (
      encode(digest(upper(btrim(p_code)), 'sha256'), 'hex'),
      md5(upper(btrim(p_code)))
    )
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

  UPDATE public.patient_link_codes
  SET consumed_at = now()
  WHERE id = link_row.id AND consumed_at IS NULL;

  RETURN jsonb_build_object('patient_id', link_row.patient_id, 'linked', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_hospital_visits()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'hospital_id', hp.hospital_id,
      'patient_id', hp.id,
      'patient_identifier', hp.patient_identifier,
      'name', hp.name,
      'visit_date', hv.visit_date,
      'checked_in_at', hv.checked_in_at
    ) ORDER BY hv.visit_date DESC),
    '[]'::jsonb
  )
  FROM public.hospital_patients hp
  JOIN public.hospital_visits hv ON hv.patient_id = hp.id
  WHERE hp.patient_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.respond_slot_offer(
  p_order_id uuid,
  p_accept boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.investigation_orders;
BEGIN
  SELECT o.*
  INTO order_row
  FROM public.investigation_orders o
  JOIN public.investigation_waitlist w ON w.order_id = o.id
  JOIN public.hospital_patients hp ON hp.id = o.patient_id
  WHERE o.id = p_order_id
    AND hp.patient_user_id = auth.uid()
    AND w.status = 'offered'
    AND w.offer_expires_at > now()
  FOR UPDATE;

  IF order_row.id IS NULL THEN
    RAISE EXCEPTION 'Active investigation offer not found'
      USING ERRCODE = '42501';
  END IF;

  IF p_accept THEN
    UPDATE public.investigation_waitlist
    SET status = 'accepted', offer_expires_at = NULL
    WHERE order_id = p_order_id AND status = 'offered';
    UPDATE public.investigation_orders
    SET status = 'scheduled', updated_at = now()
    WHERE id = p_order_id AND status IN ('offered', 'waitlisted');
  ELSE
    UPDATE public.investigation_waitlist
    SET status = 'cancelled', offer_expires_at = NULL
    WHERE order_id = p_order_id AND status = 'offered';
    UPDATE public.investigation_orders
    SET status = 'cancelled', cancelled_at = now(), updated_at = now()
    WHERE id = p_order_id AND status IN ('offered', 'waitlisted');
  END IF;

  RETURN jsonb_build_object('order_id', p_order_id, 'accepted', p_accept);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_patient_link_code(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_patient_account(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_hospital_visits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_slot_offer(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.demo_seed_investigations(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_seed_admissions(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.generate_patient_link_code(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_patient_account(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_hospital_visits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_slot_offer(uuid, boolean) TO authenticated;

-- 20261007000000_hospital_managed_doctor_accounts.sql
-- Hospital-managed doctor account metadata. Passwords remain exclusively in Supabase Auth.
ALTER TABLE public.hospital_doctors
  ADD COLUMN IF NOT EXISTS doctor_identifier text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS registration_no text,
  ADD COLUMN IF NOT EXISTS registration_council text;

CREATE UNIQUE INDEX IF NOT EXISTS hospital_doctors_doctor_identifier_unique
  ON public.hospital_doctors (doctor_identifier)
  WHERE doctor_identifier IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hospital_doctors_email_unique
  ON public.hospital_doctors (lower(email))
  WHERE email IS NOT NULL;

REVOKE ALL ON FUNCTION public.create_hospital_doctor(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_hospital_doctor_active(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_hospital_doctor(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_hospital_doctor_active(uuid, uuid, boolean) TO authenticated;

-- 20261008000000_hospital_doctor_professional_careteam.sql
ALTER TABLE public.hospital_doctors
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS subspecialty text,
  ADD COLUMN IF NOT EXISTS qualifications text,
  ADD COLUMN IF NOT EXISTS years_experience smallint CHECK (years_experience BETWEEN 0 AND 80),
  ADD COLUMN IF NOT EXISTS employee_id text,
  ADD COLUMN IF NOT EXISTS joining_date date,
  ADD COLUMN IF NOT EXISTS employment_type text CHECK (employment_type IN ('full_time', 'part_time', 'consultant', 'visiting', 'contract')),
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active', 'on_leave', 'suspended', 'ended')),
  ADD COLUMN IF NOT EXISTS opd_room text,
  ADD COLUMN IF NOT EXISTS shift_schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS emergency_available boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS official_email text,
  ADD COLUMN IF NOT EXISTS official_phone text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'submitted', 'verified', 'rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS hospital_doctors_employee_id_unique
  ON public.hospital_doctors (hospital_id, lower(employee_id))
  WHERE employee_id IS NOT NULL;

ALTER TABLE public.hospital_doctors
  DROP CONSTRAINT IF EXISTS hospital_doctors_hospital_id_doctor_name_key;

ALTER TABLE public.hospital_doctors
  ADD CONSTRAINT hospital_doctors_hospital_id_id_unique UNIQUE (hospital_id, id);
ALTER TABLE public.hospital_departments
  ADD CONSTRAINT hospital_departments_hospital_id_id_unique UNIQUE (hospital_id, id);
ALTER TABLE public.hospital_members
  ADD CONSTRAINT hospital_members_hospital_user_role_unique UNIQUE (hospital_id, user_id, staff_role);

CREATE TABLE IF NOT EXISTS public.hospital_doctor_care_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospital_orgs(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL,
  staff_user_id uuid NOT NULL,
  staff_role text NOT NULL,
  department_id uuid,
  department_scope_id uuid GENERATED ALWAYS AS (
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hospital_doctor_care_team_doctor_fk
    FOREIGN KEY (hospital_id, doctor_id)
    REFERENCES public.hospital_doctors(hospital_id, id) ON DELETE CASCADE,
  CONSTRAINT hospital_doctor_care_team_staff_fk
    FOREIGN KEY (hospital_id, staff_user_id, staff_role)
    REFERENCES public.hospital_members(hospital_id, user_id, staff_role) ON DELETE CASCADE,
  CONSTRAINT hospital_doctor_care_team_department_fk
    FOREIGN KEY (hospital_id, department_id)
    REFERENCES public.hospital_departments(hospital_id, id) ON DELETE CASCADE,
  CONSTRAINT hospital_doctor_care_team_role_check
    CHECK (staff_role IN ('nurse', 'front_desk', 'lab_tech', 'radiology_tech', 'admissions_staff', 'care_coordinator')),
  UNIQUE (hospital_id, doctor_id, staff_user_id, department_scope_id)
);

CREATE INDEX IF NOT EXISTS idx_doctor_care_assignments_doctor
  ON public.hospital_doctor_care_team_assignments (hospital_id, doctor_id, staff_role);
CREATE INDEX IF NOT EXISTS idx_doctor_care_assignments_staff
  ON public.hospital_doctor_care_team_assignments (hospital_id, staff_user_id);

ALTER TABLE public.hospital_doctor_care_team_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hospital_doctor_care_team_read ON public.hospital_doctor_care_team_assignments;
CREATE POLICY hospital_doctor_care_team_read
  ON public.hospital_doctor_care_team_assignments
  FOR SELECT TO authenticated
  USING (
    public.hospital_has_cap(hospital_id, 'staff.manage')
    OR staff_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.hospital_doctors d
      JOIN public.hospital_members hm
        ON hm.hospital_id = d.hospital_id
       AND hm.user_id = d.user_id
       AND hm.staff_role = 'doctor'
       AND hm.is_active
      WHERE d.id = hospital_doctor_care_team_assignments.doctor_id
        AND d.hospital_id = hospital_doctor_care_team_assignments.hospital_id
        AND d.user_id = auth.uid()
        AND d.is_active
    )
  );
REVOKE ALL ON public.hospital_doctor_care_team_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hospital_doctor_care_team_assignments TO authenticated;

CREATE OR REPLACE FUNCTION public.doctor_hospital_can_read_record(p_hospital_id uuid, p_doctor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.hospital_doctors d
    JOIN public.hospital_members hm
      ON hm.hospital_id = d.hospital_id
     AND hm.user_id = d.user_id
     AND hm.staff_role = 'doctor'
     AND hm.is_active
    WHERE d.hospital_id = p_hospital_id
     AND d.id = p_doctor_id
      AND d.is_active
      AND (
       d.user_id = auth.uid()
       OR EXISTS (
         SELECT 1
         FROM public.hospital_doctor_care_team_assignments ca
         JOIN public.hospital_members staff
           ON staff.hospital_id = ca.hospital_id
          AND staff.user_id = ca.staff_user_id
          AND staff.staff_role = ca.staff_role
          AND staff.is_active
         WHERE ca.hospital_id = d.hospital_id
           AND ca.doctor_id = d.id
           AND ca.staff_user_id = auth.uid()
       )
     )
  );
$$;

CREATE OR REPLACE FUNCTION public.doctor_hospital_can_read_patient(p_hospital_id uuid, p_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hospital_appointments a
    WHERE a.hospital_id = p_hospital_id AND a.patient_id = p_patient_id
     AND public.doctor_hospital_can_read_record(a.hospital_id, a.doctor_id)
    UNION ALL
    SELECT 1 FROM public.consultations c
    WHERE c.hospital_id = p_hospital_id AND c.patient_id = p_patient_id
     AND public.doctor_hospital_can_read_record(c.hospital_id, c.doctor_id)
    UNION ALL
    SELECT 1 FROM public.investigation_orders io
    WHERE io.hospital_id = p_hospital_id AND io.patient_id = p_patient_id
     AND public.doctor_hospital_can_read_record(io.hospital_id, io.ordered_by_doctor_id)
    UNION ALL
    SELECT 1 FROM public.hospital_admissions ha
    WHERE ha.hospital_id = p_hospital_id AND ha.patient_id = p_patient_id
     AND public.doctor_hospital_can_read_record(ha.hospital_id, ha.admitting_doctor_id)
    UNION ALL
    SELECT 1
    FROM public.hospital_patients hp
    JOIN public.doctor_patients dp ON dp.patient_user_id = hp.patient_user_id
    JOIN public.hospital_doctors d ON d.hospital_id = hp.hospital_id AND d.user_id = auth.uid() AND d.is_active
    JOIN public.hospital_members hm ON hm.hospital_id = d.hospital_id AND hm.user_id = d.user_id
      AND hm.staff_role = 'doctor' AND hm.is_active
    WHERE hp.hospital_id = p_hospital_id
     AND hp.id = p_patient_id
     AND dp.doctor_id = auth.uid()
     AND dp.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.doctor_hospital_profile()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'hospital_id', h.id,
      'hospital_name', h.name,
      'doctor_row_id', d.id,
      'doctor_identifier', d.doctor_identifier,
      'employee_id', d.employee_id,
      'full_name', d.doctor_name,
      'designation', d.designation,
      'specialty', d.specialty,
      'subspecialty', d.subspecialty,
      'qualifications', d.qualifications,
      'registration_no', d.registration_no,
      'registration_council', d.registration_council,
      'years_experience', d.years_experience,
      'department', dep.name,
      'joining_date', d.joining_date,
      'employment_type', d.employment_type,
      'employment_status', d.employment_status,
      'opd_room', d.opd_room,
      'shift_schedule', d.shift_schedule,
      'emergency_available', d.emergency_available,
      'official_email', d.official_email,
      'official_phone', d.official_phone,
      'verification_status', COALESCE(d.verification_status, dp.verification_status),
      'is_active', d.is_active,
      'care_team', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'assignment_id', ca.id,
          'user_id', ca.staff_user_id,
          'name', COALESCE(NULLIF(p.full_name, ''), u.email),
          'email', u.email,
          'role', ca.staff_role,
          'department', cdep.name
        ) ORDER BY ca.staff_role, p.full_name)
        FROM public.hospital_doctor_care_team_assignments ca
        JOIN public.hospital_members hm ON hm.hospital_id = ca.hospital_id AND hm.user_id = ca.staff_user_id AND hm.staff_role = ca.staff_role AND hm.is_active
        JOIN auth.users u ON u.id = ca.staff_user_id
        LEFT JOIN public.profiles p ON p.id = u.id
        LEFT JOIN public.hospital_departments cdep ON cdep.id = ca.department_id
        WHERE ca.hospital_id = d.hospital_id AND ca.doctor_id = d.id
      ), '[]'::jsonb)
    ) ORDER BY h.name
  ), '[]'::jsonb)
  INTO v_result
  FROM public.hospital_doctors d
  JOIN public.hospital_orgs h ON h.id = d.hospital_id
  JOIN public.hospital_members hm ON hm.hospital_id = d.hospital_id AND hm.user_id = d.user_id AND hm.staff_role = 'doctor' AND hm.is_active
  LEFT JOIN public.hospital_departments dep ON dep.id = d.department_id
  LEFT JOIN public.doctor_profiles dp ON dp.user_id = d.user_id
  WHERE d.user_id = auth.uid() AND d.is_active;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_hospital_doctor_care_team_assignment(
  p_hospital_id uuid,
  p_doctor_id uuid,
  p_staff_user_id uuid,
  p_staff_role text,
  p_department_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.hospital_has_cap(p_hospital_id, 'staff.manage') THEN
    RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF p_staff_role NOT IN ('nurse', 'front_desk', 'lab_tech', 'radiology_tech', 'admissions_staff', 'care_coordinator') THEN
    RAISE EXCEPTION 'Unsupported care team role' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hospital_doctors d
    WHERE d.id = p_doctor_id AND d.hospital_id = p_hospital_id AND d.user_id IS NOT NULL AND d.is_active
  ) THEN
    RAISE EXCEPTION 'Active hospital doctor not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hospital_members m
    WHERE m.hospital_id = p_hospital_id AND m.user_id = p_staff_user_id
      AND m.staff_role = p_staff_role AND m.is_active
  ) THEN
    RAISE EXCEPTION 'Active staff membership not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hospital_departments dep
    WHERE dep.id = p_department_id AND dep.hospital_id = p_hospital_id AND dep.is_active
  ) THEN
    RAISE EXCEPTION 'Department does not belong to this hospital' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.hospital_doctor_care_team_assignments
    (hospital_id, doctor_id, staff_user_id, staff_role, department_id, assigned_by)
  VALUES (p_hospital_id, p_doctor_id, p_staff_user_id, p_staff_role, p_department_id, auth.uid())
  ON CONFLICT (hospital_id, doctor_id, staff_user_id, department_scope_id)
  DO UPDATE SET staff_role = EXCLUDED.staff_role, assigned_by = auth.uid()
  RETURNING id INTO v_id;

  INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
  VALUES (p_hospital_id, auth.uid(), 'doctor.care_team_assigned',
    jsonb_build_object('doctor_id', p_doctor_id, 'staff_user_id', p_staff_user_id, 'staff_role', p_staff_role, 'department_id', p_department_id));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_hospital_doctor_care_team_assignment(
  p_hospital_id uuid,
  p_assignment_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.hospital_doctor_care_team_assignments;
BEGIN
  IF auth.uid() IS NULL OR NOT public.hospital_has_cap(p_hospital_id, 'staff.manage') THEN
    RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.hospital_doctor_care_team_assignments
  WHERE id = p_assignment_id AND hospital_id = p_hospital_id
  RETURNING * INTO v_assignment;
  IF v_assignment.id IS NULL THEN RETURN false; END IF;
  INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
  VALUES (p_hospital_id, auth.uid(), 'doctor.care_team_unassigned',
    jsonb_build_object('doctor_id', v_assignment.doctor_id, 'staff_user_id', v_assignment.staff_user_id, 'assignment_id', v_assignment.id));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_hospital_doctor(
  p_hospital_id uuid,
  p_doctor_name text,
  p_specialty text DEFAULT NULL,
  p_department_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Use the hospital-managed doctor account workflow' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_hospital_doctor_active(
  p_hospital_id uuid,
  p_doctor_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Use the hospital-managed doctor account workflow' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_hospital_staff(p_hospital_id uuid, p_email text, p_staff_role text)
RETURNS public.hospital_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.hospital_invites;
BEGIN
  IF NOT public.hospital_has_cap(p_hospital_id, 'staff.manage') THEN
    RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF p_staff_role = 'doctor' THEN
    RAISE EXCEPTION 'Doctors must be created through the hospital-managed doctor account workflow' USING ERRCODE = '22023';
  END IF;
  IF p_staff_role NOT IN ('hospital_admin', 'front_desk', 'nurse', 'lab_tech', 'radiology_tech', 'admissions_staff', 'care_coordinator') THEN
    RAISE EXCEPTION 'Invalid hospital staff role' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_email), '') IS NULL OR position('@' IN p_email) < 2 THEN
    RAISE EXCEPTION 'A valid email is required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hospital_invites (hospital_id, email, staff_role, token, expires_at, accepted_at)
  VALUES (p_hospital_id, lower(btrim(p_email)), p_staff_role, gen_random_uuid()::text, now() + interval '7 days', NULL)
  ON CONFLICT (hospital_id, email, staff_role)
  DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, accepted_at = NULL
  RETURNING * INTO v_invite;
  INSERT INTO public.hospital_access_audit (hospital_id, actor_user_id, action, details)
  VALUES (p_hospital_id, auth.uid(), 'staff.invited', jsonb_build_object('email', lower(btrim(p_email)), 'role', p_staff_role));
  RETURN v_invite;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_doctor_hospital_workspace()
RETURNS public.hospital_orgs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.hospital_orgs;
  v_profile public.doctor_profiles;
BEGIN
  IF auth.uid() IS NULL OR NOT public.doctor_has_role() THEN
    RAISE EXCEPTION 'Doctor role is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_profile FROM public.doctor_profiles WHERE user_id = auth.uid();
  IF v_profile.user_id IS NULL OR v_profile.verification_status = 'rejected' THEN
    RAISE EXCEPTION 'Doctor profile is not eligible for hospital workspace access' USING ERRCODE = '42501';
  END IF;
  SELECT h.* INTO v_org
  FROM public.hospital_orgs h
  JOIN public.hospital_members hm ON hm.hospital_id = h.id
  JOIN public.hospital_doctors d ON d.hospital_id = h.id AND d.user_id = hm.user_id
  WHERE hm.user_id = auth.uid()
    AND hm.staff_role = 'doctor'
    AND hm.is_active
    AND d.is_active
  ORDER BY hm.created_at, h.created_at
  LIMIT 1;
  RETURN v_org;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_hospital_doctor_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.hospital_doctors
  SET verification_status = NEW.verification_status
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_hospital_doctor_verification_status ON public.doctor_profiles;
CREATE TRIGGER trg_sync_hospital_doctor_verification_status
AFTER INSERT OR UPDATE OF verification_status ON public.doctor_profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_hospital_doctor_verification_status();

ALTER TABLE public.hospital_members
  DROP CONSTRAINT IF EXISTS hospital_members_staff_role_check;
ALTER TABLE public.hospital_members
  ADD CONSTRAINT hospital_members_staff_role_check
  CHECK (staff_role IN ('hospital_admin', 'front_desk', 'nurse', 'doctor', 'lab_tech', 'radiology_tech', 'admissions_staff', 'care_coordinator'));
ALTER TABLE public.hospital_invites
  DROP CONSTRAINT IF EXISTS hospital_invites_staff_role_check;
ALTER TABLE public.hospital_invites
  ADD CONSTRAINT hospital_invites_staff_role_check
  CHECK (staff_role IN ('hospital_admin', 'front_desk', 'nurse', 'doctor', 'lab_tech', 'radiology_tech', 'admissions_staff', 'care_coordinator'));

CREATE OR REPLACE FUNCTION public.hospital_role_can(p_role text, p_cap text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_cap
    WHEN 'patients.read' THEN p_role = ANY (ARRAY['hospital_admin', 'front_desk', 'nurse', 'doctor', 'admissions_staff', 'lab_tech', 'radiology_tech', 'care_coordinator'])
    WHEN 'patients.register' THEN p_role = ANY (ARRAY['hospital_admin', 'front_desk', 'nurse', 'admissions_staff', 'care_coordinator'])
    WHEN 'queue.manage' THEN p_role = ANY (ARRAY['hospital_admin', 'front_desk', 'nurse', 'doctor', 'care_coordinator'])
    WHEN 'clinical.read' THEN p_role = ANY (ARRAY['hospital_admin', 'nurse', 'doctor'])
    WHEN 'clinical.write' THEN p_role = 'doctor'
    WHEN 'orders.create' THEN p_role = 'doctor'
    WHEN 'orders.pipeline' THEN p_role = ANY (ARRAY['hospital_admin', 'lab_tech', 'radiology_tech'])
    WHEN 'config.manage' THEN p_role = 'hospital_admin'
    WHEN 'admissions.manage' THEN p_role = ANY (ARRAY['hospital_admin', 'admissions_staff'])
    WHEN 'admissions.read' THEN p_role = ANY (ARRAY['hospital_admin', 'admissions_staff', 'nurse', 'doctor'])
    WHEN 'staff.manage' THEN p_role = 'hospital_admin'
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.hospital_has_cap(p_hospital_id uuid, p_cap text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.hospital_members hm
    WHERE hm.hospital_id = p_hospital_id
      AND hm.user_id = auth.uid()
      AND hm.is_active
      AND public.hospital_role_can(hm.staff_role, p_cap)
      AND (p_cap NOT IN ('patients.read', 'clinical.read') OR hm.staff_role <> 'doctor')
  );
$$;

CREATE OR REPLACE FUNCTION public.guard_hospital_doctor_clinical_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_id uuid;
  v_related_doctor_id uuid;
  v_patient_id uuid;
  v_hospital_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.hospital_members
    WHERE hospital_id = NEW.hospital_id AND user_id = auth.uid()
      AND staff_role = 'doctor' AND is_active
  ) THEN
    RETURN NEW;
  END IF;
  SELECT d.id INTO v_doctor_id
  FROM public.hospital_doctors d
  WHERE d.hospital_id = NEW.hospital_id AND d.user_id = auth.uid() AND d.is_active;
  IF v_doctor_id IS NULL THEN
    RAISE EXCEPTION 'Active doctor profile required' USING ERRCODE = '42501';
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'hospital_appointments' THEN
      IF NEW.doctor_id IS DISTINCT FROM v_doctor_id OR NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Doctor appointments must belong to the authenticated doctor and their assigned patient' USING ERRCODE = '42501';
      END IF;
    WHEN 'hospital_visits' THEN
      IF NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Doctors may only check in their assigned patients' USING ERRCODE = '42501';
      END IF;
    WHEN 'opd_sessions' THEN
      IF NEW.doctor_id IS DISTINCT FROM v_doctor_id THEN
        RAISE EXCEPTION 'Doctors may only manage their own OPD sessions' USING ERRCODE = '42501';
      END IF;
    WHEN 'consultations' THEN
      IF NEW.doctor_id IS DISTINCT FROM v_doctor_id OR NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Consultations must belong to the authenticated doctor and their assigned patient' USING ERRCODE = '42501';
      END IF;
      IF NEW.session_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.opd_sessions s
        WHERE s.id = NEW.session_id AND s.hospital_id = NEW.hospital_id AND s.doctor_id = v_doctor_id
      ) THEN
        RAISE EXCEPTION 'Consultation session is not owned by the authenticated doctor' USING ERRCODE = '42501';
      END IF;
      IF NEW.queue_entry_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.queue_entries q
        JOIN public.opd_sessions s ON s.id = q.session_id AND s.doctor_id = v_doctor_id
        WHERE q.id = NEW.queue_entry_id AND q.hospital_id = NEW.hospital_id
          AND q.patient_id = NEW.patient_id AND (NEW.session_id IS NULL OR q.session_id = NEW.session_id)
      ) THEN
        RAISE EXCEPTION 'Consultation queue entry does not match its patient and session' USING ERRCODE = '42501';
      END IF;
    WHEN 'prescriptions' THEN
      SELECT c.doctor_id INTO v_related_doctor_id FROM public.consultations c
      WHERE c.id = NEW.consultation_id AND c.hospital_id = NEW.hospital_id AND c.patient_id = NEW.patient_id;
      IF NEW.doctor_id IS DISTINCT FROM v_doctor_id OR v_related_doctor_id IS DISTINCT FROM v_doctor_id
        OR NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Prescriptions must belong to the authenticated doctor''s consultation' USING ERRCODE = '42501';
      END IF;
    WHEN 'referrals' THEN
      IF NEW.from_doctor_id IS DISTINCT FROM v_doctor_id OR NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Referrals must originate from the authenticated doctor for an assigned patient' USING ERRCODE = '42501';
      END IF;
      IF NEW.from_consultation_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.consultations c WHERE c.id = NEW.from_consultation_id
          AND c.hospital_id = NEW.hospital_id AND c.patient_id = NEW.patient_id AND c.doctor_id = v_doctor_id
      ) THEN
        RAISE EXCEPTION 'Referral source is not the authenticated doctor''s consultation' USING ERRCODE = '42501';
      END IF;
      IF NEW.to_doctor_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.hospital_doctors d
        WHERE d.id = NEW.to_doctor_id AND d.hospital_id = NEW.hospital_id AND d.is_active
      ) THEN
        RAISE EXCEPTION 'Referral destination must be an active doctor in this hospital' USING ERRCODE = '42501';
      END IF;
    WHEN 'follow_ups' THEN
      SELECT c.doctor_id INTO v_related_doctor_id FROM public.consultations c
      WHERE c.id = NEW.consultation_id AND c.hospital_id = NEW.hospital_id AND c.patient_id = NEW.patient_id;
      IF v_related_doctor_id IS DISTINCT FROM v_doctor_id OR NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Follow-ups must belong to the authenticated doctor''s consultation' USING ERRCODE = '42501';
      END IF;
    WHEN 'queue_entries' THEN
      SELECT s.doctor_id INTO v_related_doctor_id FROM public.opd_sessions s
      WHERE s.id = NEW.session_id AND s.hospital_id = NEW.hospital_id;
      IF v_related_doctor_id IS DISTINCT FROM v_doctor_id OR NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Queue entries must belong to the authenticated doctor''s session and assigned patient' USING ERRCODE = '42501';
      END IF;
      IF NEW.appointment_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.hospital_appointments a
        WHERE a.id = NEW.appointment_id AND a.hospital_id = NEW.hospital_id
          AND a.patient_id = NEW.patient_id AND a.doctor_id = v_doctor_id
      ) THEN
        RAISE EXCEPTION 'Queue appointment must match the authenticated doctor and patient' USING ERRCODE = '42501';
      END IF;
      IF NEW.visit_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.hospital_visits v
        WHERE v.id = NEW.visit_id AND v.hospital_id = NEW.hospital_id AND v.patient_id = NEW.patient_id
      ) THEN
        RAISE EXCEPTION 'Queue visit must match the patient and hospital' USING ERRCODE = '42501';
      END IF;
    WHEN 'investigation_orders' THEN
      IF NEW.ordered_by_doctor_id IS DISTINCT FROM v_doctor_id OR NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Investigation orders must belong to the authenticated doctor and an assigned patient' USING ERRCODE = '42501';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.investigation_types t
        WHERE t.id = NEW.type_id AND t.hospital_id = NEW.hospital_id AND t.is_active
      ) THEN
        RAISE EXCEPTION 'Investigation type must be active in this hospital' USING ERRCODE = '42501';
      END IF;
      IF NEW.consultation_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.consultations c WHERE c.id = NEW.consultation_id
          AND c.hospital_id = NEW.hospital_id AND c.patient_id = NEW.patient_id AND c.doctor_id = v_doctor_id
      ) THEN
        RAISE EXCEPTION 'Investigation consultation is not owned by the authenticated doctor' USING ERRCODE = '42501';
      END IF;
    WHEN 'hospital_admissions' THEN
      IF NEW.admitting_doctor_id IS DISTINCT FROM v_doctor_id OR NOT public.doctor_hospital_can_read_patient(NEW.hospital_id, NEW.patient_id) THEN
        RAISE EXCEPTION 'Admissions must belong to the authenticated doctor and an assigned patient' USING ERRCODE = '42501';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.hospital_wards w
        JOIN public.hospital_beds b ON b.ward_id = w.id AND b.hospital_id = w.hospital_id
        WHERE w.id = NEW.ward_id AND w.hospital_id = NEW.hospital_id
          AND b.id = NEW.bed_id AND b.status = 'available'
      ) THEN
        RAISE EXCEPTION 'Admission bed must be available in this hospital' USING ERRCODE = '42501';
      END IF;
    WHEN 'prescription_items' THEN
      SELECT p.doctor_id, p.hospital_id INTO v_related_doctor_id, v_hospital_id
      FROM public.prescriptions p WHERE p.id = NEW.prescription_id;
      IF v_related_doctor_id IS DISTINCT FROM v_doctor_id OR v_hospital_id IS DISTINCT FROM NEW.hospital_id THEN
        RAISE EXCEPTION 'Prescription items must belong to the authenticated doctor''s prescription' USING ERRCODE = '42501';
      END IF;
    ELSE
      RETURN NEW;
  END CASE;

  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'hospital_visits' AND NOT public.doctor_hospital_can_read_patient(OLD.hospital_id, OLD.patient_id)
      OR TG_TABLE_NAME = 'consultations' AND OLD.doctor_id IS DISTINCT FROM v_doctor_id
      OR TG_TABLE_NAME = 'prescriptions' AND OLD.doctor_id IS DISTINCT FROM v_doctor_id
      OR TG_TABLE_NAME = 'hospital_appointments' AND OLD.doctor_id IS DISTINCT FROM v_doctor_id
      OR TG_TABLE_NAME = 'opd_sessions' AND OLD.doctor_id IS DISTINCT FROM v_doctor_id
      OR TG_TABLE_NAME = 'referrals' AND OLD.from_doctor_id IS DISTINCT FROM v_doctor_id
      OR TG_TABLE_NAME = 'investigation_orders' AND OLD.ordered_by_doctor_id IS DISTINCT FROM v_doctor_id
      OR TG_TABLE_NAME = 'hospital_admissions' AND OLD.admitting_doctor_id IS DISTINCT FROM v_doctor_id
      THEN
      RAISE EXCEPTION 'Doctors may only update their own clinical records' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_doctor_hospital_appointments ON public.hospital_appointments;
CREATE TRIGGER guard_doctor_hospital_appointments BEFORE INSERT OR UPDATE ON public.hospital_appointments
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_hospital_visits ON public.hospital_visits;
CREATE TRIGGER guard_doctor_hospital_visits BEFORE INSERT OR UPDATE ON public.hospital_visits
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_opd_sessions ON public.opd_sessions;
CREATE TRIGGER guard_doctor_opd_sessions BEFORE INSERT OR UPDATE ON public.opd_sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_consultations ON public.consultations;
CREATE TRIGGER guard_doctor_consultations BEFORE INSERT OR UPDATE ON public.consultations
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_prescriptions ON public.prescriptions;
CREATE TRIGGER guard_doctor_prescriptions BEFORE INSERT OR UPDATE ON public.prescriptions
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_prescription_items ON public.prescription_items;
CREATE TRIGGER guard_doctor_prescription_items BEFORE INSERT OR UPDATE ON public.prescription_items
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_referrals ON public.referrals;
CREATE TRIGGER guard_doctor_referrals BEFORE INSERT OR UPDATE ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_follow_ups ON public.follow_ups;
CREATE TRIGGER guard_doctor_follow_ups BEFORE INSERT OR UPDATE ON public.follow_ups
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_queue_entries ON public.queue_entries;
CREATE TRIGGER guard_doctor_queue_entries BEFORE INSERT OR UPDATE ON public.queue_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_investigation_orders ON public.investigation_orders;
CREATE TRIGGER guard_doctor_investigation_orders BEFORE INSERT OR UPDATE ON public.investigation_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
DROP TRIGGER IF EXISTS guard_doctor_admissions ON public.hospital_admissions;
CREATE TRIGGER guard_doctor_admissions BEFORE INSERT OR UPDATE ON public.hospital_admissions
FOR EACH ROW EXECUTE FUNCTION public.guard_hospital_doctor_clinical_write();
REVOKE ALL ON FUNCTION public.guard_hospital_doctor_clinical_write() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_consultation_context(p_hospital_id uuid, p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient public.hospital_patients;
  v_consultations jsonb;
  v_prescriptions jsonb;
  v_followups jsonb;
  v_hospital_wide boolean;
BEGIN
  v_hospital_wide := public.hospital_has_cap(p_hospital_id, 'clinical.read');
  IF NOT v_hospital_wide AND NOT public.doctor_hospital_can_read_patient(p_hospital_id, p_patient_id) THEN
    RAISE EXCEPTION 'Clinical access to this patient is not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_patient
  FROM public.hospital_patients
  WHERE id = p_patient_id AND hospital_id = p_hospital_id;
  IF v_patient.id IS NULL THEN
    RAISE EXCEPTION 'Patient not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
  INTO v_consultations
  FROM public.consultations c
  WHERE c.hospital_id = p_hospital_id AND c.patient_id = p_patient_id
    AND (v_hospital_wide OR public.doctor_hospital_can_read_record(c.hospital_id, c.doctor_id));

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC), '[]'::jsonb)
  INTO v_prescriptions
  FROM public.prescriptions p
  WHERE p.hospital_id = p_hospital_id AND p.patient_id = p_patient_id
    AND (v_hospital_wide OR public.doctor_hospital_can_read_record(p.hospital_id, p.doctor_id));

  SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.due_date ASC), '[]'::jsonb)
  INTO v_followups
  FROM public.follow_ups f
  JOIN public.consultations c ON c.id = f.consultation_id
  WHERE f.hospital_id = p_hospital_id AND f.patient_id = p_patient_id
    AND (v_hospital_wide OR public.doctor_hospital_can_read_record(c.hospital_id, c.doctor_id));

  RETURN jsonb_build_object(
    'patient', to_jsonb(v_patient),
    'consultations', v_consultations,
    'prescriptions', v_prescriptions,
    'follow_ups', v_followups
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_today_sessions(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_id uuid;
BEGIN
  SELECT d.id INTO v_doctor_id
  FROM public.hospital_doctors d
  JOIN public.hospital_members hm ON hm.hospital_id = d.hospital_id
    AND hm.user_id = d.user_id AND hm.staff_role = 'doctor' AND hm.is_active
  WHERE d.hospital_id = p_hospital_id AND d.user_id = auth.uid() AND d.is_active;

  IF v_doctor_id IS NULL AND NOT public.hospital_has_cap(p_hospital_id, 'patients.read') THEN
    RAISE EXCEPTION 'patients.read capability required' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'session_id', s.id,
      'doctor', d.doctor_name,
      'department', dep.name,
      'room', s.room,
      'status', s.status,
      'serving_token', (SELECT q.token_number FROM public.queue_entries q WHERE q.session_id = s.id AND q.status = 'in_consultation' ORDER BY q.token_number LIMIT 1),
      'next_token', (SELECT q.token_number FROM public.queue_entries q WHERE q.session_id = s.id AND q.status = 'waiting' ORDER BY q.priority_rank, q.token_number LIMIT 1),
      'waiting', (SELECT count(*) FROM public.queue_entries q WHERE q.session_id = s.id AND q.status = 'waiting'),
      'completed', (SELECT count(*) FROM public.queue_entries q WHERE q.session_id = s.id AND q.status = 'completed'),
      'delay_flag', s.delay_note IS NOT NULL
    ) ORDER BY s.start_time)
    FROM public.opd_sessions s
    JOIN public.hospital_doctors d ON d.id = s.doctor_id
    LEFT JOIN public.hospital_departments dep ON dep.id = s.department_id
    WHERE s.hospital_id = p_hospital_id
      AND s.session_date = public.hospital_today(p_hospital_id)
      AND (v_doctor_id IS NULL OR s.doctor_id = v_doctor_id)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_queue_state(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.opd_sessions;
  v_result jsonb;
  v_doctor_id uuid;
BEGIN
  SELECT * INTO v_session FROM public.opd_sessions WHERE id = p_session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'OPD session not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT d.id INTO v_doctor_id
  FROM public.hospital_doctors d
  JOIN public.hospital_members hm ON hm.hospital_id = d.hospital_id
    AND hm.user_id = d.user_id AND hm.staff_role = 'doctor' AND hm.is_active
  WHERE d.hospital_id = v_session.hospital_id AND d.user_id = auth.uid() AND d.is_active;
  IF (v_doctor_id IS NULL AND NOT public.hospital_has_cap(v_session.hospital_id, 'patients.read'))
    OR (v_doctor_id IS NOT NULL AND v_session.doctor_id IS DISTINCT FROM v_doctor_id) THEN
    RAISE EXCEPTION 'Access to this OPD session is not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'session', jsonb_build_object('id', v_session.id, 'doctor', d.doctor_name, 'department', dep.name,
      'room', v_session.room, 'status', v_session.status, 'delay_note', v_session.delay_note, 'last_token', v_session.last_token),
    'serving', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', q.id, 'token', q.token_number, 'patient', p.name, 'status', q.status) ORDER BY q.token_number)
      FROM public.queue_entries q JOIN public.hospital_patients p ON p.id = q.patient_id
      WHERE q.session_id = p_session_id AND q.status IN ('called', 'in_consultation')), '[]'::jsonb),
    'next_token', (SELECT q.token_number FROM public.queue_entries q WHERE q.session_id = p_session_id AND q.status = 'waiting' ORDER BY q.priority_rank, q.token_number LIMIT 1),
    'waiting_count', (SELECT count(*) FROM public.queue_entries q WHERE q.session_id = p_session_id AND q.status = 'waiting'),
    'completed_today', (SELECT count(*) FROM public.queue_entries q WHERE q.session_id = p_session_id AND q.status = 'completed'),
    'avg_consult_min', (SELECT avg(extract(epoch FROM (completed_at - started_at)) / 60) FROM public.queue_entries q
      WHERE q.session_id = p_session_id AND q.status = 'completed' AND started_at IS NOT NULL),
    'entries', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', q.id, 'token', q.token_number, 'patient', p.name, 'identifier', p.patient_identifier,
      'priority', q.priority_rank, 'priority_reason', q.priority_reason, 'status', q.status,
      'joined_at', q.joined_at, 'called_at', q.called_at,
      'patients_ahead', (SELECT count(*) FROM public.queue_entries a WHERE a.session_id = q.session_id
        AND a.status IN ('waiting', 'called', 'in_consultation') AND (a.priority_rank, a.token_number) < (q.priority_rank, q.token_number)),
      'est_low', q.est_wait_low_min, 'est_high', q.est_wait_high_min, 'is_walk_in', q.is_walk_in
    ) ORDER BY CASE WHEN q.status = 'completed' THEN 1 ELSE 0 END, q.priority_rank, q.token_number)
      FROM (
        SELECT * FROM public.queue_entries WHERE session_id = p_session_id AND status IN ('waiting', 'called', 'in_consultation')
        UNION ALL
        SELECT recent.* FROM (SELECT * FROM public.queue_entries WHERE session_id = p_session_id AND status = 'completed' ORDER BY completed_at DESC LIMIT 10) recent
      ) q JOIN public.hospital_patients p ON p.id = q.patient_id), '[]'::jsonb)
  ) INTO v_result
  FROM public.hospital_doctors d
  LEFT JOIN public.hospital_departments dep ON dep.id = d.department_id
  WHERE d.id = v_session.doctor_id;

  INSERT INTO public.hospital_access_audit(hospital_id, actor_user_id, action, details)
  VALUES (v_session.hospital_id, auth.uid(), 'queue.state_read', jsonb_build_object('session_id', p_session_id));
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_hospital_patients(
  p_hospital_id uuid,
  p_query text,
  p_limit integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_norm text;
  v_digits text;
  v_result jsonb;
  v_doctor_id uuid;
BEGIN
  SELECT d.id INTO v_doctor_id
  FROM public.hospital_doctors d
  JOIN public.hospital_members hm ON hm.hospital_id = d.hospital_id
    AND hm.user_id = d.user_id AND hm.staff_role = 'doctor' AND hm.is_active
  WHERE d.hospital_id = p_hospital_id AND d.user_id = auth.uid() AND d.is_active;
  IF v_doctor_id IS NULL AND NOT public.hospital_has_cap(p_hospital_id, 'patients.read') THEN
    RAISE EXCEPTION 'patients.read capability required' USING ERRCODE = '42501';
  END IF;

  v_norm := public.hospital_normalize_id(p_hospital_id, v_query);
  v_digits := regexp_replace(COALESCE(v_query, ''), '[^0-9]', '', 'g');
  SELECT jsonb_build_object(
    'patients', COALESCE((
      SELECT jsonb_agg(patient_json ORDER BY result_rank, name_similarity DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', p.id, 'identifier', p.patient_identifier, 'name', p.name, 'age', p.age, 'gender', p.gender,
          'mobile_masked', CASE WHEN p.mobile IS NULL THEN NULL ELSE repeat('X', greatest(length(p.mobile) - 4, 0)) || right(p.mobile, 4) END,
          'today_status', qe.status, 'token', qe.token_number
        ) AS patient_json,
        CASE WHEN p.normalized_identifier = v_norm THEN 0
          WHEN v_digits <> '' AND regexp_replace(COALESCE(p.mobile, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%' THEN 1
          ELSE 2 END AS result_rank,
        similarity(p.name, COALESCE(v_query, '')) AS name_similarity,
        p.name
        FROM public.hospital_patients p
        LEFT JOIN LATERAL (
          SELECT q.status, q.token_number FROM public.queue_entries q
          JOIN public.opd_sessions s ON s.id = q.session_id
          WHERE q.hospital_id = p_hospital_id AND q.patient_id = p.id
            AND s.session_date = public.hospital_today(p_hospital_id)
            AND (v_doctor_id IS NULL OR s.doctor_id = v_doctor_id)
          ORDER BY q.created_at DESC LIMIT 1
        ) qe ON true
        WHERE p.hospital_id = p_hospital_id
          AND (v_doctor_id IS NULL OR public.doctor_hospital_can_read_patient(p_hospital_id, p.id))
          AND (v_query IS NULL OR p.normalized_identifier = v_norm
            OR (v_digits <> '' AND regexp_replace(COALESCE(p.mobile, ''), '[^0-9]', '', 'g') LIKE '%' || v_digits || '%')
            OR p.name % v_query OR p.name ILIKE '%' || v_query || '%')
        ORDER BY result_rank, name_similarity DESC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 50))
      ) result_rows
    ), '[]'::jsonb),
    'doctors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.doctor_name, 'department', dep.name))
      FROM public.hospital_doctors d
      LEFT JOIN public.hospital_departments dep ON dep.id = d.department_id
      WHERE d.hospital_id = p_hospital_id AND d.is_active
        AND (v_doctor_id IS NULL OR d.id = v_doctor_id)
        AND (v_query IS NULL OR d.doctor_name ILIKE '%' || v_query || '%' OR dep.name ILIKE '%' || v_query || '%')
    ), '[]'::jsonb),
    'departments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name))
      FROM public.hospital_departments d
      WHERE d.hospital_id = p_hospital_id AND d.is_active
        AND (v_query IS NULL OR d.name ILIKE '%' || v_query || '%')
    ), '[]'::jsonb),
    'appointments_today', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'patient_id', a.patient_id, 'patient', p.name,
        'doctor', d.doctor_name, 'scheduled_at', a.scheduled_at, 'status', a.status))
      FROM public.hospital_appointments a
      JOIN public.hospital_patients p ON p.id = a.patient_id
      JOIN public.hospital_doctors d ON d.id = a.doctor_id
      WHERE a.hospital_id = p_hospital_id
        AND (v_doctor_id IS NULL OR a.doctor_id = v_doctor_id)
        AND (a.scheduled_at AT TIME ZONE (SELECT h.timezone FROM public.hospital_orgs h WHERE h.id = p_hospital_id))::date = public.hospital_today(p_hospital_id)
        AND a.status IN ('scheduled', 'confirmed')
        AND (v_query IS NULL OR p.name ILIKE '%' || v_query || '%' OR d.doctor_name ILIKE '%' || v_query || '%')
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

DROP POLICY IF EXISTS hospital_doctors_member_select ON public.hospital_doctors;
CREATE POLICY hospital_doctors_member_select ON public.hospital_doctors
  FOR SELECT TO authenticated
  USING (public.hospital_has_cap(hospital_id, 'staff.manage') OR user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.hospital_doctors FROM authenticated;
GRANT SELECT ON public.hospital_doctors TO authenticated;

DROP POLICY IF EXISTS hospital_appointments_hospital_select ON public.hospital_appointments;
CREATE POLICY hospital_appointments_hospital_select ON public.hospital_appointments
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'patients.read')
      AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = hospital_appointments.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_record(hospital_id, doctor_id)
  );
DROP POLICY IF EXISTS opd_sessions_hospital_select ON public.opd_sessions;
CREATE POLICY opd_sessions_hospital_select ON public.opd_sessions
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'patients.read')
      AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = opd_sessions.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_record(hospital_id, doctor_id)
  );
DROP POLICY IF EXISTS hospital_visits_hospital_select ON public.hospital_visits;
CREATE POLICY hospital_visits_hospital_select ON public.hospital_visits
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'patients.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = hospital_visits.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_patient(hospital_id, patient_id)
  );
DROP POLICY IF EXISTS queue_entries_hospital_select ON public.queue_entries;
CREATE POLICY queue_entries_hospital_select ON public.queue_entries
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'patients.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = queue_entries.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR EXISTS (
      SELECT 1 FROM public.opd_sessions s
      JOIN public.hospital_doctors d ON d.id = s.doctor_id
      WHERE s.id = queue_entries.session_id AND public.doctor_hospital_can_read_record(queue_entries.hospital_id, d.id)
    )
  );
DROP POLICY IF EXISTS consultations_clinical_select ON public.consultations;
CREATE POLICY consultations_clinical_select ON public.consultations
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'clinical.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = consultations.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_record(hospital_id, doctor_id)
  );
DROP POLICY IF EXISTS prescriptions_clinical_select ON public.prescriptions;
CREATE POLICY prescriptions_clinical_select ON public.prescriptions
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'clinical.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = prescriptions.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_record(hospital_id, doctor_id)
  );
DROP POLICY IF EXISTS referrals_clinical_select ON public.referrals;
CREATE POLICY referrals_clinical_select ON public.referrals
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'clinical.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = referrals.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_record(hospital_id, from_doctor_id)
    OR public.doctor_hospital_can_read_record(hospital_id, to_doctor_id)
  );
DROP POLICY IF EXISTS follow_ups_clinical_select ON public.follow_ups;
CREATE POLICY follow_ups_clinical_select ON public.follow_ups
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'clinical.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = follow_ups.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR EXISTS (
      SELECT 1 FROM public.consultations c
      WHERE c.id = follow_ups.consultation_id AND public.doctor_hospital_can_read_record(c.hospital_id, c.doctor_id)
    )
  );
DROP POLICY IF EXISTS investigation_orders_hospital_select ON public.investigation_orders;
CREATE POLICY investigation_orders_hospital_select ON public.investigation_orders
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'patients.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = investigation_orders.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_record(hospital_id, ordered_by_doctor_id)
  );
DROP POLICY IF EXISTS hospital_admissions_hospital_select ON public.hospital_admissions;
CREATE POLICY hospital_admissions_hospital_select ON public.hospital_admissions
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'admissions.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = hospital_admissions.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_record(hospital_id, admitting_doctor_id)
  );
DROP POLICY IF EXISTS hospital_patients_capability_select ON public.hospital_patients;
CREATE POLICY hospital_patients_capability_select ON public.hospital_patients
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'patients.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = hospital_patients.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR public.doctor_hospital_can_read_patient(hospital_id, id)
  );

DROP POLICY IF EXISTS prescription_items_clinical_select ON public.prescription_items;
CREATE POLICY prescription_items_clinical_select ON public.prescription_items
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'clinical.read')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = prescription_items.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_items.prescription_id AND public.doctor_hospital_can_read_record(p.hospital_id, p.doctor_id)
    )
  );
DROP POLICY IF EXISTS investigation_reports_pipeline_select ON public.investigation_reports;
CREATE POLICY investigation_reports_pipeline_select ON public.investigation_reports
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'orders.pipeline')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = investigation_reports.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR EXISTS (
      SELECT 1 FROM public.investigation_orders io
      WHERE io.id = investigation_reports.order_id AND public.doctor_hospital_can_read_record(io.hospital_id, io.ordered_by_doctor_id)
    )
  );
DROP POLICY IF EXISTS investigation_order_notes_pipeline_select ON public.investigation_order_notes;
CREATE POLICY investigation_order_notes_pipeline_select ON public.investigation_order_notes
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'orders.pipeline')
     AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = investigation_order_notes.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR EXISTS (
      SELECT 1 FROM public.investigation_orders io
      WHERE io.id = investigation_order_notes.order_id AND public.doctor_hospital_can_read_record(io.hospital_id, io.ordered_by_doctor_id)
    )
  );
DROP POLICY IF EXISTS investigation_waitlist_hospital_select ON public.investigation_waitlist;
CREATE POLICY investigation_waitlist_hospital_select ON public.investigation_waitlist
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'patients.read')
      AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = investigation_waitlist.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR EXISTS (
      SELECT 1 FROM public.investigation_orders io
      WHERE io.id = investigation_waitlist.order_id AND public.doctor_hospital_can_read_record(io.hospital_id, io.ordered_by_doctor_id)
    )
  );
DROP POLICY IF EXISTS investigation_events_hospital_select ON public.investigation_events;
CREATE POLICY investigation_events_hospital_select ON public.investigation_events
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'orders.pipeline')
      AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = investigation_events.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR EXISTS (
      SELECT 1 FROM public.investigation_orders io
      WHERE io.id = investigation_events.order_id AND public.doctor_hospital_can_read_record(io.hospital_id, io.ordered_by_doctor_id)
    )
  );
DROP POLICY IF EXISTS investigation_slots_hospital_select ON public.investigation_slots;
CREATE POLICY investigation_slots_hospital_select ON public.investigation_slots
  FOR SELECT TO authenticated
  USING (
    (public.hospital_has_cap(hospital_id, 'orders.pipeline')
      AND NOT EXISTS (SELECT 1 FROM public.hospital_members me WHERE me.hospital_id = investigation_slots.hospital_id AND me.user_id = auth.uid() AND me.staff_role = 'doctor' AND me.is_active))
    OR EXISTS (
      SELECT 1 FROM public.investigation_orders io
      WHERE io.slot_id = investigation_slots.id
        AND public.doctor_hospital_can_read_record(io.hospital_id, io.ordered_by_doctor_id)
    )
  );

REVOKE ALL ON FUNCTION public.doctor_hospital_can_read_patient(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_hospital_can_read_patient(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.doctor_hospital_can_read_record(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_hospital_can_read_record(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.doctor_hospital_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_hospital_profile() TO authenticated;
REVOKE ALL ON FUNCTION public.ensure_doctor_hospital_workspace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_doctor_hospital_workspace() TO authenticated;
REVOKE ALL ON FUNCTION public.set_hospital_doctor_care_team_assignment(uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_hospital_doctor_care_team_assignment(uuid, uuid, uuid, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.remove_hospital_doctor_care_team_assignment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_hospital_doctor_care_team_assignment(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.sync_hospital_doctor_verification_status() FROM PUBLIC, anon, authenticated;

DO $publication$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'hospital_doctor_care_team_assignments'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hospital_doctor_care_team_assignments;
  END IF;
END;
$publication$;
REVOKE ALL ON FUNCTION public.create_hospital_doctor(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_hospital_doctor_active(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invite_hospital_staff(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_hospital_staff(uuid, text, text) TO authenticated;

-- 20261008160000_repair_patient_tracker_storage.sql
-- Keep the patient treatment tracker aligned with its persisted form fields.
ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS scheduled_time time,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS doctor text,
  ADD COLUMN IF NOT EXISTS reminder boolean NOT NULL DEFAULT true;

-- These fields are written by the shared symptom-monitor service.
ALTER TABLE public.side_effect_entries
  ADD COLUMN IF NOT EXISTS cancer_type text,
  ADD COLUMN IF NOT EXISTS treatment_type text,
  ADD COLUMN IF NOT EXISTS journey_phase text;

-- Patient photos are optional, but the configured bucket must exist in every
-- Supabase project receiving this migration.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bpl-patients',
  'bpl-patients',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "bpl_patient_photos_public_read" ON storage.objects;
CREATE POLICY "bpl_patient_photos_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'bpl-patients');

DROP POLICY IF EXISTS "bpl_patient_photos_authenticated_upload" ON storage.objects;
CREATE POLICY "bpl_patient_photos_authenticated_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bpl-patients'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

DROP POLICY IF EXISTS "bpl_patient_photos_owner_update" ON storage.objects;
CREATE POLICY "bpl_patient_photos_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'bpl-patients'
    AND auth.uid()::text = split_part(name, '/', 1)
  )
  WITH CHECK (
    bucket_id = 'bpl-patients'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

DROP POLICY IF EXISTS "bpl_patient_photos_owner_delete" ON storage.objects;
CREATE POLICY "bpl_patient_photos_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'bpl-patients'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

NOTIFY pgrst, 'reload schema';

-- 20261009000000_cross_dashboard_hospital_care.sql
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

-- 20261010000000_hospital_patient_assignments_and_doctor_appointments.sql
ALTER TABLE public.hospital_patients
  ADD COLUMN IF NOT EXISTS assigned_doctor_id uuid
    REFERENCES public.hospital_doctors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hospital_patients_assigned_doctor
  ON public.hospital_patients (hospital_id, assigned_doctor_id)
  WHERE assigned_doctor_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hospital_has_cap(p_hospital_id uuid, p_cap text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.hospital_members hm
    WHERE hm.hospital_id = p_hospital_id
      AND hm.user_id = auth.uid()
      AND hm.is_active
      AND public.hospital_role_can(hm.staff_role, p_cap)
      AND (
        p_cap IN ('config.manage', 'staff.manage')
        OR EXISTS (
          SELECT 1
          FROM public.hospital_orgs h
          WHERE h.id = hm.hospital_id
            AND h.verification_status = 'verified'
        )
      )
      AND (p_cap NOT IN ('patients.read', 'clinical.read') OR hm.staff_role <> 'doctor')
  );
$$;

CREATE OR REPLACE FUNCTION public.doctor_hospital_can_read_record(
  p_hospital_id uuid,
  p_doctor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.hospital_doctors d
    JOIN public.doctor_profiles dp
      ON dp.user_id = d.user_id
     AND dp.verification_status = 'verified'
    JOIN public.hospital_members hm
      ON hm.hospital_id = d.hospital_id
     AND hm.user_id = d.user_id
     AND hm.staff_role = 'doctor'
     AND hm.is_active
    JOIN public.hospital_orgs h
      ON h.id = d.hospital_id
     AND h.verification_status = 'verified'
    WHERE d.hospital_id = p_hospital_id
      AND d.id = p_doctor_id
      AND d.is_active
      AND d.employment_status = 'active'
      AND d.verification_status = 'verified'
      AND (
        d.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.hospital_doctor_care_team_assignments ca
          JOIN public.hospital_members staff
            ON staff.hospital_id = ca.hospital_id
           AND staff.user_id = ca.staff_user_id
           AND staff.staff_role = ca.staff_role
           AND staff.is_active
          WHERE ca.hospital_id = d.hospital_id
            AND ca.doctor_id = d.id
            AND ca.staff_user_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.doctor_hospital_can_read_patient(
  p_hospital_id uuid,
  p_patient_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hospital_appointments a
    WHERE a.hospital_id = p_hospital_id
      AND a.patient_id = p_patient_id
      AND public.doctor_hospital_can_read_record(a.hospital_id, a.doctor_id)
    UNION ALL
    SELECT 1
    FROM public.consultations c
    WHERE c.hospital_id = p_hospital_id
      AND c.patient_id = p_patient_id
      AND public.doctor_hospital_can_read_record(c.hospital_id, c.doctor_id)
    UNION ALL
    SELECT 1
    FROM public.investigation_orders io
    WHERE io.hospital_id = p_hospital_id
      AND io.patient_id = p_patient_id
      AND public.doctor_hospital_can_read_record(io.hospital_id, io.ordered_by_doctor_id)
    UNION ALL
    SELECT 1
    FROM public.hospital_admissions ha
    WHERE ha.hospital_id = p_hospital_id
      AND ha.patient_id = p_patient_id
      AND public.doctor_hospital_can_read_record(ha.hospital_id, ha.admitting_doctor_id)
    UNION ALL
    SELECT 1
    FROM public.hospital_patients hp
    JOIN public.doctor_patients dp ON dp.patient_user_id = hp.patient_user_id
    JOIN public.hospital_doctors d
      ON d.hospital_id = hp.hospital_id
     AND d.user_id = auth.uid()
     AND d.is_active
    JOIN public.hospital_members hm
      ON hm.hospital_id = d.hospital_id
     AND hm.user_id = d.user_id
     AND hm.staff_role = 'doctor'
     AND hm.is_active
    WHERE hp.hospital_id = p_hospital_id
      AND hp.id = p_patient_id
      AND dp.doctor_id = auth.uid()
      AND dp.status = 'active'
    UNION ALL
    SELECT 1
    FROM public.hospital_patients hp
    WHERE hp.hospital_id = p_hospital_id
      AND hp.id = p_patient_id
      AND hp.assigned_doctor_id IS NOT NULL
      AND public.doctor_hospital_can_read_record(hp.hospital_id, hp.assigned_doctor_id)
  );
$$;

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
          'linked', hp.patient_user_id IS NOT NULL,
          'doctor_id', hp.assigned_doctor_id
        )
        ORDER BY hp.updated_at DESC
      )
      FROM public.hospital_doctors d
      JOIN public.hospital_members hm
        ON hm.hospital_id = d.hospital_id
       AND hm.user_id = d.user_id
       AND hm.staff_role = 'doctor'
       AND hm.is_active
      JOIN public.hospital_orgs h
        ON h.id = d.hospital_id
       AND h.verification_status = 'verified'
      JOIN public.hospital_patients hp
        ON hp.hospital_id = d.hospital_id
       AND hp.assigned_doctor_id = d.id
      WHERE d.user_id = auth.uid()
        AND d.is_active
        AND d.employment_status = 'active'
        AND d.verification_status = 'verified'
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
      JOIN public.hospital_orgs h
        ON h.id = a.hospital_id
       AND h.verification_status = 'verified'
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

CREATE OR REPLACE FUNCTION public.assign_hospital_patient_doctor(
  p_hospital_id uuid,
  p_patient_id uuid,
  p_doctor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  patient_row public.hospital_patients;
BEGIN
  IF auth.uid() IS NULL OR NOT public.hospital_has_cap(p_hospital_id, 'staff.manage') THEN
    RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.hospital_orgs h
    WHERE h.id = p_hospital_id
      AND h.verification_status = 'verified'
  ) THEN
    RAISE EXCEPTION 'Hospital must be verified before assigning patients' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO patient_row
  FROM public.hospital_patients
  WHERE id = p_patient_id
    AND hospital_id = p_hospital_id
  FOR UPDATE;
  IF patient_row.id IS NULL THEN
    RAISE EXCEPTION 'Patient not found in this hospital' USING ERRCODE = 'P0002';
  END IF;

  IF p_doctor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.hospital_doctors d
    JOIN public.hospital_members hm
      ON hm.hospital_id = d.hospital_id
     AND hm.user_id = d.user_id
     AND hm.staff_role = 'doctor'
     AND hm.is_active
    JOIN public.doctor_profiles dp
      ON dp.user_id = d.user_id
     AND dp.verification_status = 'verified'
    WHERE d.id = p_doctor_id
      AND d.hospital_id = p_hospital_id
      AND d.is_active
      AND d.employment_status = 'active'
      AND d.verification_status = 'verified'
  ) THEN
    RAISE EXCEPTION 'An active, verified doctor from this hospital is required' USING ERRCODE = '22023';
  END IF;

  IF patient_row.assigned_doctor_id IS DISTINCT FROM p_doctor_id THEN
    UPDATE public.hospital_patients
    SET assigned_doctor_id = p_doctor_id,
        updated_at = now()
    WHERE id = p_patient_id
      AND hospital_id = p_hospital_id;

    INSERT INTO public.hospital_access_audit (hospital_id, patient_id, actor_user_id, action, details)
    VALUES (
      p_hospital_id,
      p_patient_id,
      auth.uid(),
      CASE WHEN p_doctor_id IS NULL THEN 'patient.doctor_unassigned' ELSE 'patient.doctor_assigned' END,
      jsonb_build_object(
        'previous_doctor_id', patient_row.assigned_doctor_id,
        'doctor_id', p_doctor_id
      )
    );

    PERFORM public.hospital_log_event(
      p_hospital_id,
      p_patient_id,
      CASE WHEN p_doctor_id IS NULL THEN 'Doctor unassigned' ELSE 'Doctor assigned' END,
      jsonb_build_object('doctor_id', p_doctor_id),
      true
    );
    IF p_doctor_id IS NOT NULL THEN
      PERFORM public.hospital_notify_patient(
        p_hospital_id,
        p_patient_id,
        'care_team_updated',
        jsonb_build_object('message', 'Your hospital care team was updated.')
      );
    END IF;
  END IF;

  RETURN p_doctor_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_hospital_appointment(
  p_hospital_id uuid,
  p_patient_id uuid,
  p_doctor_id uuid,
  p_scheduled_at timestamptz,
  p_kind text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.hospital_doctors d
    JOIN public.hospital_members hm
      ON hm.hospital_id = d.hospital_id
     AND hm.user_id = d.user_id
     AND hm.staff_role = 'doctor'
     AND hm.is_active
    WHERE d.id = p_doctor_id
      AND d.hospital_id = p_hospital_id
      AND d.user_id = auth.uid()
      AND d.is_active
  ) THEN
    RAISE EXCEPTION 'Only the assigned active hospital doctor can book this appointment' USING ERRCODE = '42501';
  END IF;

  RETURN public.doctor_create_hospital_appointment(
    p_hospital_id,
    p_patient_id,
    p_scheduled_at,
    p_kind,
    p_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_create_hospital_appointment(
  p_hospital_id uuid,
  p_patient_id uuid,
  p_scheduled_at timestamptz,
  p_kind text DEFAULT 'opd',
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  doctor_row public.hospital_doctors;
  timezone_name text;
  local_start timestamp;
  created public.hospital_appointments;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_scheduled_at IS NULL OR p_scheduled_at <= now() THEN
    RAISE EXCEPTION 'Appointment must be scheduled in the future' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('opd', 'follow_up', 'referral') THEN
    RAISE EXCEPTION 'Invalid appointment kind' USING ERRCODE = '22023';
  END IF;

  SELECT h.timezone
  INTO timezone_name
  FROM public.hospital_orgs h
  WHERE h.id = p_hospital_id
    AND h.verification_status = 'verified';
  IF timezone_name IS NULL THEN
    RAISE EXCEPTION 'Verified hospital workspace required' USING ERRCODE = '42501';
  END IF;

  SELECT d.*
  INTO doctor_row
  FROM public.hospital_doctors d
  JOIN public.hospital_members hm
    ON hm.hospital_id = d.hospital_id
   AND hm.user_id = d.user_id
   AND hm.staff_role = 'doctor'
   AND hm.is_active
  JOIN public.doctor_profiles dp
    ON dp.user_id = d.user_id
   AND dp.verification_status = 'verified'
  WHERE d.hospital_id = p_hospital_id
    AND d.user_id = auth.uid()
    AND d.is_active
    AND d.employment_status = 'active'
    AND d.verification_status = 'verified'
  ORDER BY d.created_at
  LIMIT 1
  FOR UPDATE OF d;
  IF doctor_row.id IS NULL THEN
    RAISE EXCEPTION 'An active, verified hospital doctor profile is required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.hospital_patients hp
    WHERE hp.id = p_patient_id
      AND hp.hospital_id = p_hospital_id
      AND hp.assigned_doctor_id = doctor_row.id
  ) THEN
    RAISE EXCEPTION 'Patient is not assigned to this doctor' USING ERRCODE = '42501';
  END IF;

  local_start := p_scheduled_at AT TIME ZONE timezone_name;
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(doctor_row.shift_schedule, '[]'::jsonb)) AS shifts(value)
    WHERE CASE
        WHEN COALESCE(value->>'day', '') ~ '^[0-6]$' THEN (value->>'day')::integer
        ELSE -1
      END = extract(dow FROM local_start)::integer
      AND CASE
        WHEN COALESCE(value->>'start', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         AND COALESCE(value->>'end', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        THEN local_start::time >= (value->>'start')::time
          AND (local_start + interval '30 minutes')::time <= (value->>'end')::time
        ELSE false
      END
  ) THEN
    RAISE EXCEPTION 'Appointment is outside the doctor''s configured hospital working hours' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.hospital_holidays holiday
    WHERE holiday.hospital_id = p_hospital_id
      AND holiday.holiday_date = local_start::date
  ) THEN
    RAISE EXCEPTION 'The hospital is closed on the selected date' USING ERRCODE = '22023';
  END IF;

  IF doctor_row.department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.hospital_departments department
    WHERE department.id = doctor_row.department_id
      AND department.hospital_id = p_hospital_id
      AND department.is_active
  ) THEN
    RAISE EXCEPTION 'The doctor department is inactive' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.doctor_leaves leave
    WHERE leave.doctor_id = auth.uid()
      AND leave.starts_at < p_scheduled_at + interval '30 minutes'
      AND leave.ends_at > p_scheduled_at
  ) THEN
    RAISE EXCEPTION 'Doctor is unavailable during the selected time' USING ERRCODE = '23P01';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.hospital_appointments appointment
    WHERE appointment.doctor_id = doctor_row.id
      AND appointment.status NOT IN ('cancelled', 'no_show')
      AND appointment.scheduled_at < p_scheduled_at + interval '30 minutes'
      AND appointment.scheduled_at + interval '30 minutes' > p_scheduled_at
  ) THEN
    RAISE EXCEPTION 'Appointment overlaps an existing hospital appointment' USING ERRCODE = '23P01';
  END IF;

  INSERT INTO public.hospital_appointments (
    hospital_id,
    patient_id,
    doctor_id,
    department_id,
    scheduled_at,
    kind,
    reason,
    created_by
  )
  VALUES (
    p_hospital_id,
    p_patient_id,
    doctor_row.id,
    doctor_row.department_id,
    p_scheduled_at,
    p_kind,
    NULLIF(btrim(p_reason), ''),
    auth.uid()
  )
  RETURNING * INTO created;

  PERFORM public.hospital_log_event(
    p_hospital_id,
    p_patient_id,
    'appointment.booked',
    jsonb_build_object('appointment_id', created.id, 'scheduled_at', created.scheduled_at),
    true
  );

  RETURN to_jsonb(created);
END;
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
  IF auth.uid() IS NULL OR NULLIF(btrim(p_code), '') IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.name = 'patient'
  ) THEN
    RAISE EXCEPTION 'An authenticated patient account and link code are required'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO link_row
  FROM public.patient_link_codes
  WHERE hospital_id = p_hospital_id
    AND code_hash IN (
      encode(digest(upper(btrim(p_code)), 'sha256'), 'hex'),
      md5(upper(btrim(p_code)))
    )
    AND consumed_at IS NULL
    AND expires_at > now()
    AND EXISTS (
      SELECT 1
      FROM public.hospital_orgs h
      WHERE h.id = p_hospital_id
        AND h.verification_status = 'verified'
    )
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

  UPDATE public.patient_link_codes
  SET consumed_at = now()
  WHERE id = link_row.id AND consumed_at IS NULL;

  INSERT INTO public.hospital_access_audit (
    hospital_id, patient_id, actor_user_id, action, details
  )
  VALUES (
    p_hospital_id,
    link_row.patient_id,
    auth.uid(),
    'patient.account_linked',
    jsonb_build_object('link_code_id', link_row.id)
  );

  PERFORM public.hospital_log_event(
    p_hospital_id,
    link_row.patient_id,
    'Patient account linked',
    jsonb_build_object('patient_user_id', auth.uid()),
    true
  );

  RETURN jsonb_build_object(
    'hospital_id', p_hospital_id,
    'patient_id', link_row.patient_id,
    'linked', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_patient_link_code(
  p_hospital_id uuid,
  p_patient_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_code text;
  code_row public.patient_link_codes;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.hospital_has_cap(p_hospital_id, 'patients.register')
     OR NOT EXISTS (
       SELECT 1
       FROM public.hospital_patients
       WHERE id = p_patient_id
         AND hospital_id = p_hospital_id
         AND patient_user_id IS NULL
     ) THEN
    RAISE EXCEPTION 'Hospital patient-link permission is required'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.patient_link_codes
  SET expires_at = now()
  WHERE hospital_id = p_hospital_id
    AND patient_id = p_patient_id
    AND consumed_at IS NULL
    AND expires_at > now();

  raw_code := upper(encode(gen_random_bytes(16), 'hex'));
  INSERT INTO public.patient_link_codes (
    hospital_id, patient_id, code_hash, expires_at
  )
  VALUES (
    p_hospital_id,
    p_patient_id,
    encode(digest(raw_code, 'sha256'), 'hex'),
    now() + interval '7 days'
  )
  RETURNING * INTO code_row;

  INSERT INTO public.hospital_access_audit (
    hospital_id, patient_id, actor_user_id, action, details
  )
  VALUES (
    p_hospital_id,
    p_patient_id,
    auth.uid(),
    'patient.link_code_issued',
    jsonb_build_object('link_code_id', code_row.id, 'expires_at', code_row.expires_at)
  );

  PERFORM public.hospital_log_event(
    p_hospital_id,
    p_patient_id,
    'Patient link code issued',
    jsonb_build_object('link_code_id', code_row.id),
    true
  );
  RETURN raw_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_hospital_patient_link(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_hospital_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NULLIF(btrim(p_code), '') IS NULL THEN
    RAISE EXCEPTION 'Authentication and link code are required'
      USING ERRCODE = '42501';
  END IF;

  SELECT hospital_id
  INTO target_hospital_id
  FROM public.patient_link_codes
  WHERE code_hash IN (
    encode(digest(upper(btrim(p_code)), 'sha256'), 'hex'),
    md5(upper(btrim(p_code)))
  )
    AND consumed_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF target_hospital_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link code' USING ERRCODE = 'P0002';
  END IF;

  RETURN public.link_patient_account(target_hospital_id, p_code);
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
      JOIN public.hospital_orgs h ON h.id = a.hospital_id AND h.verification_status = 'verified'
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
      JOIN public.hospital_orgs h ON h.id = a.hospital_id AND h.verification_status = 'verified'
      JOIN public.hospital_doctors d ON d.id = a.doctor_id
      WHERE p.patient_user_id = auth.uid()
        AND a.status IN ('scheduled', 'confirmed', 'checked_in', 'in_consultation')
        AND a.scheduled_at >= now() - interval '1 day'
        AND a.scheduled_at < now() + interval '30 days'
    ), '[]'::jsonb),
    'assigned_doctors', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'hospital_id', h.id,
          'hospital_name', h.name,
          'doctor_name', d.doctor_name,
          'specialty', d.specialty,
          'department', department.name
        )
        ORDER BY h.name, d.doctor_name
      )
      FROM public.hospital_patients p
      JOIN public.hospital_orgs h ON h.id = p.hospital_id AND h.verification_status = 'verified'
      JOIN public.hospital_doctors d ON d.id = p.assigned_doctor_id
        AND d.hospital_id = p.hospital_id
        AND d.is_active
      LEFT JOIN public.hospital_departments department ON department.id = d.department_id
      WHERE p.patient_user_id = auth.uid()
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_hospital_patient_doctor(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_patient_link_code(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_patient_account(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_hospital_patient_link(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_hospital_appointment(uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_create_hospital_appointment(uuid, uuid, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_hospital_dashboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_hospital_can_read_patient(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_hospital_can_read_record(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_hospital_patient_doctor(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_patient_link_code(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_patient_account(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_hospital_patient_link(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_hospital_appointment(uuid, uuid, uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_create_hospital_appointment(uuid, uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_hospital_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_hospital_can_read_patient(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_hospital_can_read_record(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
