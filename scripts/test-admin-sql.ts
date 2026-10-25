import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

async function main() {
const db = new PGlite();
const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20261019000000_admin_workspace_functions.sql',
);
const roleDirectoryMigrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20261025000000_admin_role_directory.sql',
);

await db.exec(`
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id),
    email text,
    full_name text,
    created_at timestamptz DEFAULT now()
  );
  CREATE TABLE public.roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL);
  CREATE TABLE public.user_roles (
    user_id uuid NOT NULL REFERENCES auth.users(id),
    role_id uuid NOT NULL REFERENCES public.roles(id),
    PRIMARY KEY (user_id, role_id)
  );
  CREATE TABLE public.doctor_profiles (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id),
    full_name text NOT NULL,
    verification_status text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
  CREATE TABLE public.hospital_orgs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    owner_user_id uuid REFERENCES auth.users(id),
    verification_status text NOT NULL,
    verification_requested_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
  CREATE TABLE public.pharmacy_orgs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    owner_user_id uuid REFERENCES auth.users(id),
    email text,
    verification_status text NOT NULL,
    verification_requested_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );

  CREATE FUNCTION public.is_platform_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'super_admin')
    )
  $$;
  CREATE FUNCTION public.admin_set_doctor_verification(uuid, text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Administrator role is required' USING ERRCODE = '42501'; END IF;
    UPDATE public.doctor_profiles SET verification_status = $2 WHERE user_id = $1;
    RETURN FOUND;
  END
  $$;
  CREATE FUNCTION public.admin_set_hospital_verification(uuid, text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Administrator role is required' USING ERRCODE = '42501'; END IF;
    UPDATE public.hospital_orgs SET verification_status = $2 WHERE id = $1;
    RETURN FOUND;
  END
  $$;
  CREATE FUNCTION public.admin_set_pharmacy_verification(uuid, text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
  BEGIN
    IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Administrator role is required' USING ERRCODE = '42501'; END IF;
    UPDATE public.pharmacy_orgs SET verification_status = $2 WHERE id = $1;
    RETURN FOUND;
  END
  $$;
  GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
`);

await db.exec(await fs.readFile(migrationPath, 'utf8'));
await db.exec(await fs.readFile(roleDirectoryMigrationPath, 'utf8'));

const adminId = '10000000-0000-4000-8000-000000000001';
const superAdminId = '10000000-0000-4000-8000-000000000002';
const userId = '10000000-0000-4000-8000-000000000003';
const doctorId = '20000000-0000-4000-8000-000000000001';
const hospitalId = '30000000-0000-4000-8000-000000000001';
const pharmacyId = '40000000-0000-4000-8000-000000000001';

await db.exec(`
  INSERT INTO auth.users (id, email) VALUES
    ('${adminId}', 'admin@example.test'),
    ('${superAdminId}', 'superadmin@example.test'),
    ('${userId}', 'patient@example.test'),
    ('${doctorId}', 'doctor@example.test');
  INSERT INTO public.profiles (id, email, full_name) VALUES
    ('${adminId}', 'admin@example.test', 'Test Admin'),
    ('${superAdminId}', 'superadmin@example.test', 'Test Super Admin'),
    ('${userId}', 'patient@example.test', 'Test Patient'),
    ('${doctorId}', 'doctor@example.test', 'Test Doctor');
  INSERT INTO public.roles (name) VALUES
    ('admin'), ('super_admin'), ('patient'), ('doctor'), ('hospital'), ('pharmacy'), ('research_partner');
  INSERT INTO public.user_roles (user_id, role_id) VALUES
    ('${adminId}', (SELECT id FROM public.roles WHERE name = 'admin')),
    ('${superAdminId}', (SELECT id FROM public.roles WHERE name = 'super_admin')),
    ('${userId}', (SELECT id FROM public.roles WHERE name = 'patient')),
    ('${doctorId}', (SELECT id FROM public.roles WHERE name = 'doctor')),
    ('${doctorId}', (SELECT id FROM public.roles WHERE name = 'research_partner'));
  INSERT INTO public.doctor_profiles (user_id, full_name, verification_status)
    VALUES ('${doctorId}', 'Test Doctor', 'submitted');
  INSERT INTO public.hospital_orgs (id, name, verification_status)
    VALUES ('${hospitalId}', 'Test Hospital', 'pending');
  INSERT INTO public.pharmacy_orgs (id, name, verification_status)
    VALUES ('${pharmacyId}', 'Test Pharmacy', 'pending');
`);

await db.exec('SET ROLE anon');
await assert.rejects(
  db.query('SELECT public.admin_dashboard_overview()'),
  /permission denied/i,
  'anonymous callers must not execute admin RPCs',
);
await db.exec('RESET ROLE; SET ROLE authenticated;');
await db.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
await assert.rejects(
  db.query('SELECT public.admin_dashboard_overview()'),
  /system admin role required/i,
  'authenticated non-admin callers must fail admin checks',
);
await assert.rejects(
  db.query('SELECT public.admin_set_verification_request($1, $2, $3)', ['doctor', doctorId, 'verified']),
  /system admin role required/i,
  'authenticated non-admin callers must not change verification states',
);
await assert.rejects(
  db.query('SELECT * FROM public.admin_search_users_by_role($1, NULL, 10, 0)', ['doctor']),
  /system admin role required/i,
  'authenticated non-admin callers must not read role-filtered admin accounts',
);

await db.exec(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);
const overview = await db.query<{ summary: {
  registered_users: number;
  patients: number;
  doctors: number;
  hospitals: number;
  pharmacies: number;
  pending_verifications: number;
} }>('SELECT public.admin_dashboard_overview() AS summary');
assert.deepEqual(overview.rows[0]?.summary, {
  registered_users: 4,
  patients: 1,
  doctors: 1,
  hospitals: 1,
  pharmacies: 1,
  pending_verifications: 3,
});

const search = await db.query<{ user_id: string; roles: string[] }>(
  'SELECT user_id, roles FROM public.admin_search_users($1, 10, 0)',
  ['patient'],
);
assert.equal(search.rows.length, 1);
assert.equal(search.rows[0]?.user_id, userId);
assert.deepEqual(search.rows[0]?.roles, ['patient']);

const doctorDirectory = await db.query<{ user_id: string; roles: string[] }>(
  'SELECT user_id, roles FROM public.admin_search_users_by_role($1, $2, 10, 0)',
  ['doctor', 'Test'],
);
assert.equal(doctorDirectory.rows.length, 1);
assert.equal(doctorDirectory.rows[0]?.user_id, doctorId);
assert.deepEqual(doctorDirectory.rows[0]?.roles, ['doctor', 'research_partner']);

const verificationQueue = await db.query<{ kind: string; entity_id: string }>(
  'SELECT kind, entity_id FROM public.admin_list_verification_requests(10, 0)',
);
assert.equal(verificationQueue.rows.length, 3);
await db.query('SELECT public.admin_set_verification_request($1, $2, $3)', ['doctor', doctorId, 'verified']);
await db.query('SELECT public.admin_set_verification_request($1, $2, $3)', ['hospital', hospitalId, 'verified']);
await db.query('SELECT public.admin_set_verification_request($1, $2, $3)', ['pharmacy', pharmacyId, 'verified']);
const audit = await db.query<{ target_kind: string; new_status: string }>(
  'SELECT target_kind, new_status FROM public.admin_list_audit_log(10, 0)',
);
assert.equal(audit.rows.length, 3);
assert.deepEqual(new Set(audit.rows.map((row) => row.target_kind)), new Set(['doctor', 'hospital', 'pharmacy']));
assert(audit.rows.every((row) => row.new_status === 'verified'), 'verification changes must be audited');

await db.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
const hiddenAudit = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM public.admin_audit_log');
assert.equal(hiddenAudit.rows[0]?.count, 0, 'non-admin users must not read the admin audit table');
await assert.rejects(
  db.query('SELECT * FROM public.admin_list_audit_log(10, 0)'),
  /system admin role required/i,
  'non-admin users must not use the audit RPC',
);

await db.exec(`SELECT set_config('request.jwt.claim.sub', '${adminId}', false);`);
await assert.rejects(
  db.query('SELECT public.admin_set_verification_request($1, $2, $3)', ['hospital', hospitalId, 'suspended']),
  /Only verification approval is supported for hospitals/i,
  'hospital verification must reject unsupported status transitions',
);
await assert.rejects(
  db.query('SELECT public.admin_set_verification_request($1, $2, $3)', ['doctor', doctorId, 'rejected']),
  /no longer pending/i,
  'stale doctor requests must not be changed after review',
);

await assert.rejects(
  db.query('SELECT public.admin_set_user_role($1, $2, $3)', [userId, 'doctor', true]),
  /super_admin role required/i,
  'regular admins must not grant roles',
);
await db.exec(`SELECT set_config('request.jwt.claim.sub', '${superAdminId}', false);`);
const changed = await db.query<{ changed: boolean }>(
  'SELECT public.admin_set_user_role($1, $2, $3) AS changed',
  [userId, 'doctor', true],
);
assert.equal(changed.rows[0]?.changed, true);
await assert.rejects(
  db.query('SELECT public.admin_set_user_role($1, $2, $3)', [superAdminId, 'admin', true]),
  /cannot change your own roles/i,
);
await assert.rejects(
  db.query('SELECT public.admin_set_user_role($1, $2, $3)', [userId, 'super_admin', true]),
  /separate recovery process/i,
);
const roleAudit = await db.query<{ action: string; target_kind: string }>(
  "SELECT action, target_kind FROM public.admin_audit_log WHERE action = 'user.role_added'",
);
assert.equal(roleAudit.rows[0]?.action, 'user.role_added');
assert.equal(roleAudit.rows[0]?.target_kind, 'user');

await db.close();
console.log('Admin SQL checks passed (access control, reporting, verification, role changes, and audit).');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
