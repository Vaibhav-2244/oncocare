import fs from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

async function main() {
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
await db.exec(`
  CREATE ROLE authenticated;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id), email text, full_name text);
  CREATE TABLE public.roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL);
  CREATE TABLE public.user_roles (user_id uuid REFERENCES auth.users(id), role_id uuid REFERENCES public.roles(id), PRIMARY KEY (user_id, role_id));
  CREATE TABLE public.symptoms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, name text, severity integer, recorded_at timestamptz DEFAULT now());
  CREATE TABLE public.side_effect_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, name text, severity integer, recorded_at timestamptz DEFAULT now());
  CREATE TABLE public.medications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, name text, is_active boolean DEFAULT true, created_at timestamptz DEFAULT now());
  CREATE TABLE public.health_timeline (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, title text, event_date date);
  CREATE TABLE public.messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sender_id uuid, recipient_id uuid, content text, is_read boolean DEFAULT false, created_at timestamptz DEFAULT now());
  CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, title text, message text, type text);
  CREATE TABLE public.hospital_orgs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, owner_user_id uuid, timezone text NOT NULL DEFAULT 'Asia/Kolkata', patient_id_label text NOT NULL DEFAULT 'Patient ID', patient_id_prefix text NOT NULL DEFAULT 'PID-', verification_status text NOT NULL DEFAULT 'pending', settings jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
  CREATE TABLE public.hospital_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL, user_id uuid NOT NULL, staff_role text NOT NULL, is_active boolean NOT NULL DEFAULT true, created_at timestamptz DEFAULT now(), UNIQUE (hospital_id, user_id, staff_role));
  CREATE TABLE public.hospital_invites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL, email text NOT NULL, staff_role text NOT NULL, token text NOT NULL, expires_at timestamptz NOT NULL, accepted_at timestamptz, created_at timestamptz DEFAULT now());
  CREATE TABLE public.hospital_doctors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid NOT NULL, user_id uuid, doctor_name text NOT NULL, specialty text, is_active boolean NOT NULL DEFAULT true, created_at timestamptz DEFAULT now(), UNIQUE (hospital_id, doctor_name));
  CREATE TABLE public.hospital_access_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hospital_id uuid, actor_user_id uuid, action text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());
`);

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const files = (await fs.readdir(migrationsDir))
  .filter((file) => /^20261003.*_doctor_.*\.sql$/.test(file))
  .sort();
for (const file of files) {
  try {
    await db.exec(await fs.readFile(path.join(migrationsDir, file), 'utf8'));
  } catch (error) {
    throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
await db.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;`);

const doctorId = '20000000-0000-4000-8000-000000000001';
await db.exec(`
  INSERT INTO auth.users (id, email) VALUES ('${doctorId}', 'doctor@example.test');
  INSERT INTO public.profiles (id, email, full_name) VALUES ('${doctorId}', 'doctor@example.test', 'Dr. Test');
  INSERT INTO public.roles (name) VALUES ('doctor');
  INSERT INTO public.user_roles (user_id, role_id) VALUES ('${doctorId}', (SELECT id FROM public.roles WHERE name = 'doctor'));
  SET ROLE authenticated;
  SELECT set_config('request.jwt.claim.sub', '${doctorId}', false);
`);
const workspace = await db.query<{ payload: { profile: { full_name: string } } }>('SELECT public.ensure_doctor_workspace() AS payload');
if (workspace.rows[0]?.payload?.profile?.full_name !== 'Dr. Test') throw new Error('Workspace was not initialized.');
await db.exec(`SELECT public.doctor_create_patient('{"full_name":"Test Patient","risk_level":"moderate"}'::jsonb);`);
await db.exec(`UPDATE public.doctor_profiles SET verification_status = 'verified' WHERE user_id = '${doctorId}';`);
const roster = await db.query<{ total: number }>(`SELECT (public.doctor_list_patients('{}'::jsonb)->>'total')::int AS total`);
if (roster.rows[0]?.total !== 1) throw new Error('Roster RPC did not return the created patient.');
const patient = await db.query<{ id: string }>(`SELECT id FROM public.doctor_patients LIMIT 1`);
const code = await db.query<{ doctor_create_link_code: string }>(`SELECT public.doctor_create_link_code($1)`, [patient.rows[0].id]);
if (!/^[A-Z0-9]{8}$/.test(code.rows[0]?.doctor_create_link_code || '')) throw new Error('Link code was not generated.');
await db.query(`SELECT public.doctor_create_prescription($1, $2::jsonb)`, [patient.rows[0].id, JSON.stringify([{ medicine: 'Ondansetron', dose: '4 mg' }])]);
console.log('PASS: doctor links and prescription RPC smoke test.');
console.log('PASS: doctor workspace migration and roster RPC smoke test.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
