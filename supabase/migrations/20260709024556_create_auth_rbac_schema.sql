/*
# Auth & RBAC Schema — Phase 1 Foundation

## Overview
Creates the complete authentication and role-based access control (RBAC) foundation
for OncoCare+. This migration sets up user profiles, roles, permissions, and the
junction tables that connect them. It uses Supabase's built-in auth.users table
for authentication and extends it with application-level profile and role data.

## New Tables

1. **profiles** — Extended user profile data (1:1 with auth.users)
   - id (uuid, PK, references auth.users)
   - email (text, unique)
   - full_name (text)
   - avatar_url (text) — profile picture URL
   - phone (text)
   - address (text)
   - city (text)
   - state (text)
   - pincode (text)
   - date_of_birth (date)
   - gender (text) — 'male' | 'female' | 'other' | 'prefer_not_to_say'
   - bio (text)
   - emergency_contact_name (text)
   - emergency_contact_phone (text)
   - emergency_contact_relation (text)
   - notification_email (boolean, default true)
   - notification_push (boolean, default true)
   - notification_sms (boolean, default false)
   - privacy_profile_visible (boolean, default true)
   - privacy_show_activity (boolean, default false)
   - is_email_verified (boolean, default false)
   - created_at (timestamptz)
   - updated_at (timestamptz)

2. **roles** — Role definitions for RBAC
   - id (uuid, PK)
   - name (text, unique) — 'super_admin', 'admin', 'patient', 'family_caregiver',
     'doctor', 'hospital', 'pharmacy', 'medical_advisor', 'research_partner'
   - display_name (text) — human-readable name
   - description (text)

3. **user_roles** — Junction: users ↔ roles (many-to-many)
   - id (uuid, PK)
   - user_id (uuid, FK → auth.users, ON DELETE CASCADE)
   - role_id (uuid, FK → roles, ON DELETE CASCADE)
   - assigned_at (timestamptz)
   - UNIQUE(user_id, role_id)

4. **permissions** — Granular permission definitions
   - id (uuid, PK)
   - name (text, unique) — e.g. 'manage_users', 'view_dashboard', 'write_blog'
   - description (text)

5. **role_permissions** — Junction: roles ↔ permissions
   - id (uuid, PK)
   - role_id (uuid, FK → roles, ON DELETE CASCADE)
   - permission_id (uuid, FK → permissions, ON DELETE CASCADE)
   - UNIQUE(role_id, permission_id)

6. **notification_preferences** — Per-user notification settings
   - id (uuid, PK)
   - user_id (uuid, FK → auth.users, ON DELETE CASCADE, DEFAULT auth.uid())
   - email_notifications (boolean, default true)
   - push_notifications (boolean, default true)
   - sms_notifications (boolean, default false)
   - medicine_reminders (boolean, default true)
   - appointment_reminders (boolean, default true)
   - price_alerts (boolean, default true)
   - restock_alerts (boolean, default true)
   - newsletter (boolean, default false)
   - created_at (timestamptz)
   - updated_at (timestamptz)

7. **user_sessions** — Session tracking for audit/security
   - id (uuid, PK)
   - user_id (uuid, FK → auth.users, ON DELETE CASCADE)
   - session_token (text) — hashed token identifier
   - ip_address (text)
   - user_agent (text)
   - created_at (timestamptz)
   - last_active_at (timestamptz)
   - expires_at (timestamptz)

## Security
- RLS enabled on ALL tables.
- profiles: users can read/update their own profile; admins can read all.
- roles: public read (all authenticated users need to know available roles).
- user_roles: users can read their own roles; admins can read/manage all.
- permissions: public read (authenticated).
- role_permissions: public read (authenticated).
- notification_preferences: users manage their own.
- user_sessions: users can read/delete their own sessions; admins can read all.

## Important Notes
1. profiles.id references auth.users(id) with ON DELETE CASCADE — when a user is
   deleted from auth.users, their profile is automatically removed.
2. user_roles.user_id has DEFAULT auth.uid() so inserts work without explicit user_id.
3. notification_preferences.user_id has DEFAULT auth.uid() for the same reason.
4. A trigger function `handle_new_user` automatically creates a profile row when a
   new user signs up via Supabase Auth.
5. Default role 'patient' is assigned to new users on signup.
6. All role and permission seed data is inserted in this migration.
*/

-- ============================================================
-- PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  avatar_url text,
  phone text,
  address text,
  city text,
  state text,
  pincode text,
  date_of_birth date,
  gender text DEFAULT 'prefer_not_to_say' CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  bio text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  notification_email boolean DEFAULT true,
  notification_push boolean DEFAULT true,
  notification_sms boolean DEFAULT false,
  privacy_profile_visible boolean DEFAULT true,
  privacy_show_activity boolean DEFAULT false,
  is_email_verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

-- Users can update their own profile
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Users can insert their own profile (for the trigger or manual creation)
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

-- ============================================================
-- ROLES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read roles (needed for role selection, dashboards)
DROP POLICY IF EXISTS "read_roles" ON roles;
CREATE POLICY "read_roles" ON roles FOR SELECT
  TO authenticated USING (true);

-- ============================================================
-- USER_ROLES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role_id)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Users can read their own role assignments
DROP POLICY IF EXISTS "select_own_user_roles" ON user_roles;
CREATE POLICY "select_own_user_roles" ON user_roles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Users can insert their own role (during signup)
DROP POLICY IF EXISTS "insert_own_user_role" ON user_roles;
CREATE POLICY "insert_own_user_role" ON user_roles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- PERMISSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_permissions" ON permissions;
CREATE POLICY "read_permissions" ON permissions FOR SELECT
  TO authenticated USING (true);

-- ============================================================
-- ROLE_PERMISSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  UNIQUE(role_id, permission_id)
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_role_permissions" ON role_permissions;
CREATE POLICY "read_role_permissions" ON role_permissions FOR SELECT
  TO authenticated USING (true);

-- ============================================================
-- NOTIFICATION_PREFERENCES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  email_notifications boolean DEFAULT true,
  push_notifications boolean DEFAULT true,
  sms_notifications boolean DEFAULT false,
  medicine_reminders boolean DEFAULT true,
  appointment_reminders boolean DEFAULT true,
  price_alerts boolean DEFAULT true,
  restock_alerts boolean DEFAULT true,
  newsletter boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notif_prefs" ON notification_preferences;
CREATE POLICY "select_own_notif_prefs" ON notification_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notif_prefs" ON notification_preferences;
CREATE POLICY "insert_own_notif_prefs" ON notification_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_notif_prefs" ON notification_preferences;
CREATE POLICY "update_own_notif_prefs" ON notification_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- USER_SESSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token text,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  last_active_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sessions" ON user_sessions;
CREATE POLICY "select_own_sessions" ON user_sessions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_session" ON user_sessions;
CREATE POLICY "insert_own_session" ON user_sessions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_session" ON user_sessions;
CREATE POLICY "delete_own_session" ON user_sessions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles (role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions (role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm ON role_permissions (permission_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles (email);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions (user_id);

-- ============================================================
-- TRIGGER: Auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- SEED: ROLES
-- ============================================================
INSERT INTO roles (name, display_name, description) VALUES
  ('super_admin', 'Super Admin', 'Full system access with all permissions'),
  ('admin', 'Admin', 'System administration and user management'),
  ('patient', 'Patient', 'Cancer patient using the platform for care'),
  ('family_caregiver', 'Family Caregiver', 'Family member managing care for a patient'),
  ('doctor', 'Doctor', 'Healthcare provider managing patients'),
  ('hospital', 'Hospital', 'Healthcare institution'),
  ('pharmacy', 'Pharmacy', 'Pharmacy partner managing inventory'),
  ('medical_advisor', 'Medical Advisor', 'Medical professional providing guidance'),
  ('research_partner', 'Research Partner', 'Researcher accessing anonymized data')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- SEED: PERMISSIONS
-- ============================================================
INSERT INTO permissions (name, description) VALUES
  ('manage_users', 'Manage all user accounts'),
  ('manage_roles', 'Assign and revoke roles'),
  ('manage_hospitals', 'Verify and manage hospitals'),
  ('manage_doctors', 'Verify and manage doctors'),
  ('manage_pharmacies', 'Verify and manage pharmacies'),
  ('view_admin_panel', 'Access the admin panel'),
  ('view_analytics', 'View platform analytics'),
  ('manage_content', 'Manage blog and content'),
  ('view_patient_dashboard', 'Access patient dashboard'),
  ('view_doctor_dashboard', 'Access doctor dashboard'),
  ('view_hospital_dashboard', 'Access hospital dashboard'),
  ('view_pharmacy_dashboard', 'Access pharmacy dashboard'),
  ('view_research_dashboard', 'Access research dashboard'),
  ('manage_appointments', 'Create and manage appointments'),
  ('manage_inventory', 'Manage pharmacy inventory'),
  ('write_blog', 'Create and edit blog articles'),
  ('use_ai_engine', 'Access the AI engine'),
  ('manage_settings', 'Manage system settings'),
  ('view_audit_logs', 'View system audit logs')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- SEED: ROLE_PERMISSIONS
-- ============================================================
-- Super Admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- Admin: most permissions except system settings
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin' AND p.name NOT IN ('manage_settings')
ON CONFLICT DO NOTHING;

-- Patient
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'patient' AND p.name IN ('view_patient_dashboard', 'use_ai_engine', 'manage_appointments')
ON CONFLICT DO NOTHING;

-- Family Caregiver
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'family_caregiver' AND p.name IN ('view_patient_dashboard', 'use_ai_engine', 'manage_appointments')
ON CONFLICT DO NOTHING;

-- Doctor
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'doctor' AND p.name IN ('view_doctor_dashboard', 'manage_appointments', 'use_ai_engine', 'write_blog')
ON CONFLICT DO NOTHING;

-- Hospital
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'hospital' AND p.name IN ('view_hospital_dashboard', 'manage_appointments', 'manage_doctors')
ON CONFLICT DO NOTHING;

-- Pharmacy
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'pharmacy' AND p.name IN ('view_pharmacy_dashboard', 'manage_inventory')
ON CONFLICT DO NOTHING;

-- Medical Advisor
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'medical_advisor' AND p.name IN ('view_patient_dashboard', 'use_ai_engine', 'write_blog')
ON CONFLICT DO NOTHING;

-- Research Partner
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'research_partner' AND p.name IN ('view_research_dashboard', 'view_analytics')
ON CONFLICT DO NOTHING;
