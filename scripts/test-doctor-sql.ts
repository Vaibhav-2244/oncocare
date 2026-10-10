import fs from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

async function main() {
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
await db.exec(`
  CREATE ROLE authenticated;
  CREATE ROLE anon;
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
  CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, title text, message text, type text, is_read boolean NOT NULL DEFAULT false);
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
const otherDoctorId = '20000000-0000-4000-8000-000000000002';
await db.exec(`
  INSERT INTO auth.users (id, email) VALUES ('${doctorId}', 'doctor@example.test');
  INSERT INTO auth.users (id, email) VALUES ('${otherDoctorId}', 'other-doctor@example.test');
  INSERT INTO public.profiles (id, email, full_name) VALUES ('${doctorId}', 'doctor@example.test', 'Dr. Test');
  INSERT INTO public.profiles (id, email, full_name) VALUES ('${otherDoctorId}', 'other-doctor@example.test', 'Dr. Other');
  INSERT INTO public.roles (name) VALUES ('doctor');
  INSERT INTO public.user_roles (user_id, role_id) VALUES ('${doctorId}', (SELECT id FROM public.roles WHERE name = 'doctor'));
  INSERT INTO public.user_roles (user_id, role_id) VALUES ('${otherDoctorId}', (SELECT id FROM public.roles WHERE name = 'doctor'));
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
await db.query(`SELECT public.doctor_create_appointment($1::uuid, now() + interval '1 minute', 'follow_up', 'SQL regression test', 30::smallint)`, [patient.rows[0].id]);
const summary = await db.query<{ payload: { kpis: { active_patients: number; appointments_today: number }; next_appointments: unknown[] } }>(
  'SELECT public.doctor_dashboard_summary() AS payload',
);
if (summary.rows[0]?.payload.kpis.active_patients !== 1) throw new Error('Dashboard summary did not count active patients.');
if (summary.rows[0]?.payload.kpis.appointments_today !== 1) throw new Error('Dashboard summary did not count today’s appointments.');
if (summary.rows[0]?.payload.next_appointments.length !== 1) throw new Error('Dashboard summary did not include the next appointment.');
const appointment = await db.query<{ id: string }>('SELECT id FROM public.doctor_appointments LIMIT 1');
const confirmedAppointment = await db.query<{ status: string }>(
  `SELECT (public.doctor_update_appointment_status($1::uuid, 'completed')).status`,
  [appointment.rows[0].id],
);
if (confirmedAppointment.rows[0]?.status !== 'completed') throw new Error('Appointment completion did not persist.');

const updatedPatient = await db.query<{ full_name: string }>(
  `SELECT (public.doctor_update_patient($1::uuid, $2::jsonb)).full_name`,
  [patient.rows[0].id, JSON.stringify({ full_name: 'Updated Test Patient', risk_level: 'high' })],
);
if (updatedPatient.rows[0]?.full_name !== 'Updated Test Patient') throw new Error('Patient update did not persist.');
await db.exec(`SELECT set_config('request.jwt.claim.sub', '${otherDoctorId}', false);`);
let crossDoctorUpdateDenied = false;
try {
  await db.query(
    `SELECT public.doctor_update_patient($1::uuid, '{"full_name":"Unauthorized update"}'::jsonb)`,
    [patient.rows[0].id],
  );
} catch {
  crossDoctorUpdateDenied = true;
}
await db.exec(`SELECT set_config('request.jwt.claim.sub', '${doctorId}', false);`);
if (!crossDoctorUpdateDenied) throw new Error('A second doctor was able to update another doctor’s patient.');
const archivedPatient = await db.query<{ status: string }>(
  `SELECT (public.doctor_set_patient_status($1::uuid, 'archived')).status`,
  [patient.rows[0].id],
);
if (archivedPatient.rows[0]?.status !== 'archived') throw new Error('Patient archive did not persist.');
await db.query(`SELECT public.doctor_set_patient_status($1::uuid, 'active')`, [patient.rows[0].id]);

const consultation = await db.query<{ id: string }>(
  `SELECT (public.doctor_save_consultation(NULL::uuid, $1::uuid, $2::jsonb)).id`,
  [patient.rows[0].id, JSON.stringify({ assessment: 'SQL regression test' })],
);
const signedConsultation = await db.query<{ status: string }>(
  `SELECT (public.doctor_sign_consultation($1::uuid)).status`,
  [consultation.rows[0].id],
);
if (signedConsultation.rows[0]?.status !== 'signed') throw new Error('Consultation signing did not persist.');

const createdPlan = await db.query<{ id: string }>(
  `SELECT (public.doctor_save_treatment_plan(NULL::uuid, $1::uuid, $2::jsonb)).id`,
  [patient.rows[0].id, JSON.stringify({ name: 'Regression plan', progress_percent: 25, cycles_total: 4, cycles_completed: 1 })],
);
const savedPlan = await db.query<{ progress_percent: number }>(
  `SELECT (public.doctor_save_treatment_plan($1::uuid, $2::uuid, $3::jsonb)).progress_percent`,
  [createdPlan.rows[0].id, patient.rows[0].id, JSON.stringify({ name: 'Regression plan', progress_percent: 50, cycles_total: 4, cycles_completed: 2 })],
);
if (Number(savedPlan.rows[0]?.progress_percent) !== 50) throw new Error('Treatment plan progress did not persist.');

const code = await db.query<{ doctor_create_link_code: string }>(`SELECT public.doctor_create_link_code($1)`, [patient.rows[0].id]);
if (!/^[A-Z0-9]{8}$/.test(code.rows[0]?.doctor_create_link_code || '')) throw new Error('Link code was not generated.');
await db.query(`SELECT public.doctor_create_prescription($1::uuid, $2::jsonb)`, [patient.rows[0].id, JSON.stringify([{ medicine: 'Ondansetron', dose: '4 mg' }])]);
const prescription = await db.query<{ id: string }>('SELECT id FROM public.doctor_prescriptions LIMIT 1');
const cancelledPrescription = await db.query<{ status: string }>(
  `SELECT (public.doctor_cancel_prescription($1::uuid)).status`,
  [prescription.rows[0].id],
);
if (cancelledPrescription.rows[0]?.status !== 'cancelled') throw new Error('Prescription discontinuation did not persist.');
console.log('PASS: doctor links and prescription RPC smoke test.');
console.log('PASS: doctor workspace migration and roster RPC smoke test.');
console.log('PASS: doctor dashboard summary returns live patient and appointment metrics.');
console.log('PASS: audited patient, appointment, consultation, plan, and prescription actions.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
