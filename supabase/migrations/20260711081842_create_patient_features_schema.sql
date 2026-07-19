/*
# Patient Features Schema — Symptoms, Treatments, Medications, Care Team, Health Timeline

## Overview
Creates the database tables for OncoCare+ patient-facing features: symptom tracking,
treatment management, medication reminders, care team coordination, and health timeline.

## New Tables

1. **symptoms** — Patient symptom tracking
   - id, user_id, name, severity (1-10), notes, recorded_at, created_at

2. **treatments** — Treatment plan tracking
   - id, user_id, type, name, status, start_date, end_date, doctor_id, notes, progress (0-100)

3. **medications** — Medication reminders and adherence
   - id, user_id, name, dosage, frequency, times (jsonb array of times),
   - start_date, end_date, notes, is_active, last_taken_at

4. **care_team** — Patient's care team members
   - id, user_id, member_name, role, specialty, phone, email, hospital, notes

5. **health_timeline** — Chronological medical events
   - id, user_id, event_type, title, description, event_date, created_at

6. **medication_logs** — Track when medications were taken
   - id, medication_id, user_id, taken_at, status (taken/skipped/late)

## Security
- RLS enabled on all tables with owner-scoped CRUD (auth.uid() = user_id).
- All user_id columns have DEFAULT auth.uid() for seamless inserts.
*/
CREATE TABLE IF NOT EXISTS symptoms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  severity integer NOT NULL DEFAULT 5 CHECK (severity >= 1 AND severity <= 10),
  notes text,
  recorded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('chemotherapy', 'radiation', 'immunotherapy', 'targeted_therapy', 'surgery', 'hormone_therapy', 'other')),
  name text NOT NULL,
  status text DEFAULT 'active' CHECK (status IN ('planned', 'active', 'completed', 'paused', 'cancelled')),
  start_date date,
  end_date date,
  doctor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  dosage text NOT NULL,
  frequency text NOT NULL,
  times jsonb DEFAULT '[]'::jsonb,
  start_date date,
  end_date date,
  notes text,
  is_active boolean DEFAULT true,
  last_taken_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS care_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  member_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('oncologist', 'surgeon', 'radiologist', 'nurse', 'dietitian', 'psychologist', 'primary_care', 'caregiver', 'other')),
  specialty text,
  phone text,
  email text,
  hospital text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS health_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('diagnosis', 'treatment_start', 'treatment_end', 'surgery', 'scan', 'lab_result', 'appointment', 'milestone', 'other')),
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  taken_at timestamptz DEFAULT now(),
  status text DEFAULT 'taken' CHECK (status IN ('taken', 'skipped', 'late')),
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_symptoms_user ON symptoms (user_id);
CREATE INDEX IF NOT EXISTS idx_symptoms_recorded ON symptoms (recorded_at);
CREATE INDEX IF NOT EXISTS idx_treatments_user ON treatments (user_id);
CREATE INDEX IF NOT EXISTS idx_medications_user ON medications (user_id);
CREATE INDEX IF NOT EXISTS idx_care_team_user ON care_team (user_id);
CREATE INDEX IF NOT EXISTS idx_health_timeline_user ON health_timeline (user_id);
CREATE INDEX IF NOT EXISTS idx_health_timeline_date ON health_timeline (event_date);
CREATE INDEX IF NOT EXISTS idx_medication_logs_med ON medication_logs (medication_id);
CREATE INDEX IF NOT EXISTS idx_medication_logs_user ON medication_logs (user_id);

-- Enable RLS
ALTER TABLE symptoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_logs ENABLE ROW LEVEL SECURITY;

-- Symptoms: owner CRUD
DROP POLICY IF EXISTS "select_own_symptoms" ON symptoms;
CREATE POLICY "select_own_symptoms" ON symptoms FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_symptoms" ON symptoms;
CREATE POLICY "insert_own_symptoms" ON symptoms FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_symptoms" ON symptoms;
CREATE POLICY "update_own_symptoms" ON symptoms FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_symptoms" ON symptoms;
CREATE POLICY "delete_own_symptoms" ON symptoms FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Treatments: owner CRUD
DROP POLICY IF EXISTS "select_own_treatments" ON treatments;
CREATE POLICY "select_own_treatments" ON treatments FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_treatments" ON treatments;
CREATE POLICY "insert_own_treatments" ON treatments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_treatments" ON treatments;
CREATE POLICY "update_own_treatments" ON treatments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_treatments" ON treatments;
CREATE POLICY "delete_own_treatments" ON treatments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Medications: owner CRUD
DROP POLICY IF EXISTS "select_own_medications" ON medications;
CREATE POLICY "select_own_medications" ON medications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_medications" ON medications;
CREATE POLICY "insert_own_medications" ON medications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_medications" ON medications;
CREATE POLICY "update_own_medications" ON medications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_medications" ON medications;
CREATE POLICY "delete_own_medications" ON medications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Care team: owner CRUD
DROP POLICY IF EXISTS "select_own_care_team" ON care_team;
CREATE POLICY "select_own_care_team" ON care_team FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_care_team" ON care_team;
CREATE POLICY "insert_own_care_team" ON care_team FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_care_team" ON care_team;
CREATE POLICY "update_own_care_team" ON care_team FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_care_team" ON care_team;
CREATE POLICY "delete_own_care_team" ON care_team FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Health timeline: owner CRUD
DROP POLICY IF EXISTS "select_own_timeline" ON health_timeline;
CREATE POLICY "select_own_timeline" ON health_timeline FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_timeline" ON health_timeline;
CREATE POLICY "insert_own_timeline" ON health_timeline FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_timeline" ON health_timeline;
CREATE POLICY "update_own_timeline" ON health_timeline FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_timeline" ON health_timeline;
CREATE POLICY "delete_own_timeline" ON health_timeline FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Medication logs: owner CRUD
DROP POLICY IF EXISTS "select_own_med_logs" ON medication_logs;
CREATE POLICY "select_own_med_logs" ON medication_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_med_logs" ON medication_logs;
CREATE POLICY "insert_own_med_logs" ON medication_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_med_logs" ON medication_logs;
CREATE POLICY "delete_own_med_logs" ON medication_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);
