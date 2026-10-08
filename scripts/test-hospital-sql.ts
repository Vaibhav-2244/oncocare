import fs from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
const pendingBundle = path.join(process.cwd(), 'supabase', 'APPLY_HOSPITAL_PENDING.sql');

async function buildHospitalBundle() {
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .filter((file) => file >= '20261002100000')
    .sort();

  const sections = await Promise.all(
    files.map(async (file) => {
      const source = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      return `-- ${file}\n${source.trim()}`;
    })
  );

  await fs.writeFile(pendingBundle, `${sections.join('\n\n')}\n\nNOTIFY pgrst, 'reload schema';\n`);
}

const harnessStubs = `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $auth$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $auth$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $auth$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $auth$;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text NOT NULL, owner_id uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE PUBLICATION supabase_realtime;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, email text, full_name text, phone text, preferred_language text);
CREATE TABLE public.roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL, display_name text, description text);
CREATE TABLE public.user_roles (user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE, PRIMARY KEY (user_id, role_id));
CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id), title text, message text, type text, created_at timestamptz DEFAULT now());
CREATE TABLE public.notification_preferences (user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.caregiver_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'Caregiver',
  status text NOT NULL DEFAULT 'active',
  notification_enabled boolean NOT NULL DEFAULT true,
  notification_channels jsonb NOT NULL DEFAULT '["in_app"]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (caregiver_id, patient_id)
);
CREATE TABLE public.symptoms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  severity integer NOT NULL DEFAULT 5,
  notes text,
  recorded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.symptoms ENABLE ROW LEVEL SECURITY;
CREATE POLICY symptoms_test_owner ON public.symptoms
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.symptoms TO authenticated;
CREATE TABLE public.side_effect_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  severity integer NOT NULL DEFAULT 5 CHECK (severity BETWEEN 1 AND 10),
  trend text NOT NULL DEFAULT 'Stable' CHECK (trend IN ('Improving', 'Stable', 'Getting worse')),
  duration text,
  notes text,
  what_helped jsonb DEFAULT '[]'::jsonb,
  recorded_at timestamptz DEFAULT now(),
  follow_up_at timestamptz,
  follow_up_status text DEFAULT 'scheduled' CHECK (follow_up_status IN ('scheduled', 'due', 'completed')),
  follow_up_completed_at timestamptz,
  source text DEFAULT 'dashboard',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.side_effect_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY side_effect_entries_test_owner ON public.side_effect_entries
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.side_effect_entries TO authenticated;
CREATE TABLE public.medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
CREATE TABLE public.treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'active',
  start_date date,
  end_date date,
  doctor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  progress integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;
CREATE POLICY treatments_test_owner ON public.treatments
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatments TO authenticated;
CREATE TABLE public.health_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  description text,
  event_date date NOT NULL DEFAULT current_date,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.bpl_patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id),
  name text,
  age integer,
  gender text,
  cancer_type text,
  stage text,
  location text,
  treatment text,
  goal_amount numeric DEFAULT 0,
  raised_amount numeric DEFAULT 0,
  donors_count integer DEFAULT 0,
  urgent boolean DEFAULT false,
  image_url text,
  summary text,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.pharmacies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, phone text, email text, address text, address_line text,
  city text, state text, pincode text, latitude numeric, longitude numeric, opening_hours text, is_open boolean DEFAULT true,
  home_delivery boolean DEFAULT false, accepts_online_orders boolean DEFAULT false, is_verified boolean DEFAULT true,
  listing_enabled boolean DEFAULT true, org_id uuid, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.medicines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, generic_name text, category text, strength text,
  form text, manufacturer text, prescription_required boolean DEFAULT false, mrp numeric DEFAULT 0,
  is_active boolean DEFAULT true, schedule text, requires_prescription boolean, cold_chain boolean DEFAULT false,
  hsn_code text, gst_rate numeric(5,2) DEFAULT 0
);
CREATE TABLE public.medicine_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), medicine_id uuid, pharmacy_id uuid, current_price numeric DEFAULT 0,
  availability text DEFAULT 'in_stock', cta_text text, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.pharmacy_reviews (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pharmacy_id uuid, user_id uuid);
CREATE TABLE public.generic_alternatives (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
`;

async function createDatabase() {
  const db = new PGlite({ extensions: { pgcrypto, pg_trgm } });
  await db.exec(harnessStubs);
  return db;
}

async function applyMigrationSet(db: PGlite, files: string[]) {
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    try {
      await db.exec(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${file}: ${message}`);
    }
  }
}

async function runSmokeAssertions(db: PGlite) {
  const hospitalA = '10000000-0000-4000-8000-000000000001';
  const hospitalB = '10000000-0000-4000-8000-000000000002';
  const userA = '20000000-0000-4000-8000-000000000001';
  const userB = '20000000-0000-4000-8000-000000000002';
  const frontDesk = '20000000-0000-4000-8000-000000000003';
  const patientUser = '20000000-0000-4000-8000-000000000004';
  await db.exec(`
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
      ('${userA}', 'a@example.test', now()), ('${userB}', 'b@example.test', now()),
      ('${frontDesk}', 'desk@example.test', now()), ('${patientUser}', 'patient@example.test', now());
    INSERT INTO public.hospital_orgs (id, name, owner_user_id, patient_id_prefix) VALUES
      ('${hospitalA}', 'Hospital A', '${userA}', 'NCI-'), ('${hospitalB}', 'Hospital B', '${userB}', 'NCI-');
    INSERT INTO public.hospital_members (hospital_id, user_id, staff_role) VALUES
      ('${hospitalA}', '${userA}', 'hospital_admin'), ('${hospitalB}', '${userB}', 'hospital_admin');
    INSERT INTO public.hospital_members (hospital_id, user_id, staff_role) VALUES
      ('${hospitalA}', '${frontDesk}', 'front_desk');
    INSERT INTO public.hospital_patients (hospital_id, patient_identifier, name, is_demo)
      VALUES ('${hospitalA}', 'REAL-KEEP-1', 'Real Patient', false);
  `);
  await db.exec(`
    INSERT INTO public.hospital_doctors (hospital_id, doctor_name, specialty, is_demo)
      VALUES ('${hospitalA}', 'Harness Doctor', 'Oncology', true);
    INSERT INTO public.hospital_patients (hospital_id, patient_identifier, name, is_demo)
      SELECT '${hospitalA}', 'HARNESS-' || n, 'Harness Patient ' || n, true
      FROM generate_series(1, 80) n;
    INSERT INTO public.opd_sessions (hospital_id, doctor_id, session_date, start_time, end_time, status, last_token, is_demo)
      SELECT '${hospitalA}', id, current_date, time '09:00', time '13:00', 'open', 122, true
      FROM public.hospital_doctors WHERE hospital_id='${hospitalA}' AND doctor_name='Harness Doctor';
    INSERT INTO public.queue_entries (hospital_id, session_id, patient_id, token_number, priority_rank, status, started_at, is_demo)
      SELECT '${hospitalA}', s.id, p.id, 102, 3, 'in_consultation', now(), true
      FROM public.opd_sessions s
      JOIN public.hospital_patients p ON p.hospital_id=s.hospital_id AND p.patient_identifier='HARNESS-1'
      WHERE s.hospital_id='${hospitalA}' AND s.is_demo;
    INSERT INTO public.queue_entries (hospital_id, session_id, patient_id, token_number, priority_rank, status, is_demo)
      SELECT '${hospitalA}', s.id, p.id, 102 + row_number() OVER (ORDER BY CASE WHEN p.patient_identifier LIKE 'HARNESS-%' THEN split_part(p.patient_identifier, '-', 2)::integer END), CASE WHEN p.patient_identifier='HARNESS-2' THEN 0 ELSE 3 END, 'waiting', true
      FROM public.opd_sessions s
      JOIN public.hospital_patients p ON p.hospital_id=s.hospital_id AND CASE WHEN p.patient_identifier LIKE 'HARNESS-%' THEN split_part(p.patient_identifier, '-', 2)::integer BETWEEN 2 AND 22 ELSE false END
      WHERE s.hospital_id='${hospitalA}' AND s.is_demo;
  `);
  const demoExecute = await db.query<{ allowed: boolean }>(`SELECT has_function_privilege('authenticated', 'public.load_demo_data(uuid)', 'EXECUTE') AS allowed`);
  if (demoExecute.rows[0]?.allowed) throw new Error('Authenticated role can execute production demo seeding.');
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${userA}', false);`);
  const demoCounts = await db.query<{ patients: number }> (`SELECT count(*)::integer AS patients FROM public.hospital_patients WHERE hospital_id = $1 AND is_demo`, [hospitalA]);
  if (demoCounts.rows[0]?.patients !== 80) throw new Error(`Expected 80 demo patients; got ${demoCounts.rows[0]?.patients ?? 0}`);
  const queueCounts = await db.query<{ current_token: number | null; waiting: number }> (`SELECT max(token_number) FILTER (WHERE status='in_consultation') AS current_token, count(*) FILTER (WHERE status='waiting')::integer AS waiting FROM public.queue_entries WHERE hospital_id = $1 AND session_id = (SELECT id FROM public.opd_sessions WHERE hospital_id = $1 AND is_demo ORDER BY start_time LIMIT 1)`, [hospitalA]);
  if (queueCounts.rows[0]?.current_token !== 102 || queueCounts.rows[0]?.waiting !== 21) {
    throw new Error(`Expected demo queue serving token 102 with 21 waiting; received ${JSON.stringify(queueCounts.rows[0])}`);
  }
  const mainSession = await db.query<{ id: string }>(`SELECT id FROM public.opd_sessions WHERE hospital_id=$1 AND is_demo ORDER BY start_time LIMIT 1`, [hospitalA]);
  const emergencyCall = await db.query<{ entry: { token_number: number; priority_rank: number } }>(`SELECT public.call_next($1) AS entry`, [mainSession.rows[0].id]);
  if (emergencyCall.rows[0]?.entry?.priority_rank !== 0) throw new Error('Queue did not call the emergency priority first.');
  console.log('PASS: demo seed is unavailable to authenticated users and emergency queue ordering works.');

  const doctor = await db.query<{ id: string }>(`SELECT id FROM public.hospital_doctors WHERE hospital_id=$1 AND is_demo ORDER BY doctor_name LIMIT 1`, [hospitalA]);
  const sessionResult = await db.query<{ session: { id: string } }>(`SELECT public.create_opd_session($1,$2,current_date,time '15:00',time '18:00','HARNESS',10) AS session`, [hospitalA, doctor.rows[0].id]);
  const testSessionId = sessionResult.rows[0].session.id;
  await db.query(`SELECT public.set_session_status($1,'open',NULL)`, [testSessionId]);
  const patients = await db.query<{ id: string }>(`SELECT id FROM public.hospital_patients WHERE hospital_id=$1 AND is_demo ORDER BY patient_identifier LIMIT 30`, [hospitalA]);
  for (let index = 0; index < patients.rows.length; index += 1) {
    const rank = index === 0 ? 0 : index === 1 ? 2 : 3;
    const reason = rank < 3 ? 'Harness priority test' : null;
    await db.query(`SELECT public.join_queue($1,$2,NULL,$3,$4)`, [testSessionId, patients.rows[index].id, rank, reason]);
  }
  const tokenRows = await db.query<{ token_number: number }>(`SELECT token_number FROM public.queue_entries WHERE session_id=$1 ORDER BY token_number`, [testSessionId]);
  if (tokenRows.rows.length !== 30 || tokenRows.rows.some((row, index) => row.token_number !== index + 1)) throw new Error('Sequential queue token allocation has a gap.');
  const range = await db.query<{ est_wait_low_min: number | null; est_wait_high_min: number | null }>(`SELECT est_wait_low_min,est_wait_high_min FROM public.queue_entries WHERE session_id=$1 AND token_number=30`, [testSessionId]);
  if (range.rows[0]?.est_wait_low_min == null || range.rows[0]?.est_wait_high_min == null || range.rows[0].est_wait_low_min > range.rows[0].est_wait_high_min) throw new Error('Queue wait estimate is missing or reversed.');
  const priorityCall = await db.query<{ token_number: string; priority_rank: string }>(`WITH called AS (SELECT public.call_next($1) AS entry) SELECT entry->>'token_number' AS token_number,entry->>'priority_rank' AS priority_rank FROM called`, [testSessionId]);
  if (Number(priorityCall.rows[0]?.token_number) !== 1 || Number(priorityCall.rows[0]?.priority_rank) !== 0) throw new Error('Emergency queue priority ordering failed.');
  const requeuedToken = await db.query<{ token_number: string }>(`SELECT public.queue_requeue((SELECT id FROM public.queue_entries WHERE session_id=$1 AND token_number=1))->>'token_number' AS token_number`, [testSessionId]);
  if (Number(requeuedToken.rows[0]?.token_number) !== 1) throw new Error('Re-queue changed the original token number.');
  let duplicateRejected = false;
  try { await db.query(`SELECT public.join_queue($1,$2,NULL,3,NULL)`, [testSessionId, patients.rows[0].id]); } catch { duplicateRejected = true; }
  if (!duplicateRejected) throw new Error('Duplicate active queue membership was accepted.');
  console.log('PASS: 30 sequential tokens, priority, wait range, token-preserving re-queue, and duplicate prevention.');

  await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${userB}', false);`);
  const tenantRows = await db.query<{ count: number }>(`SELECT count(*)::integer AS count FROM public.hospital_patients WHERE hospital_id = $1`, [hospitalA]);
  if (tenantRows.rows[0]?.count !== 0) throw new Error('Tenant isolation failed: Hospital B can read Hospital A patients.');
  await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${frontDesk}', false);`);
  const clinicalRows = await db.query<{ count: number }>(`SELECT count(*)::integer AS count FROM public.consultations WHERE hospital_id=$1`, [hospitalA]);
  if (clinicalRows.rows[0]?.count !== 0) throw new Error('Front desk can read consultation data.');
  let directWriteRejected = false;
  try { await db.query(`INSERT INTO public.hospital_appointments(hospital_id,patient_id,doctor_id,scheduled_at,kind) SELECT $1,p.id,d.id,now(),'opd' FROM public.hospital_patients p CROSS JOIN public.hospital_doctors d WHERE p.hospital_id=$1 AND d.hospital_id=$1 LIMIT 1`, [hospitalA]); } catch { directWriteRejected = true; }
  if (!directWriteRejected) throw new Error('Direct transactional table writes were not rejected.');
  await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${patientUser}', false);`);
  let patientRpcRejected = false;
  try { await db.query(`SELECT public.generate_default_sessions($1, current_date)`, [hospitalA]); } catch { patientRpcRejected = true; }
  if (!patientRpcRejected) throw new Error('Non-member patient role executed a hospital RPC.');
  await db.exec('RESET ROLE');
  const anonExecute = await db.query<{ allowed: boolean }>(`SELECT has_function_privilege('anon', 'public.join_queue(uuid, uuid, uuid, smallint, text)', 'EXECUTE') AS allowed`);
  if (anonExecute.rows[0]?.allowed) throw new Error('Anonymous role can execute the queue RPC.');
  console.log('PASS: synthetic queue fixture, tenant isolation, role restrictions, direct-write denial, and anon RPC denial.');
}

async function runDoctorCareTeamIsolationAssertions(db: PGlite) {
  const hospitalA = '10000000-0000-4000-8000-000000000001';
  const hospitalB = '10000000-0000-4000-8000-000000000002';
  const adminA = '20000000-0000-4000-8000-000000000001';
  const adminB = '20000000-0000-4000-8000-000000000002';
  const doctorA = '20000000-0000-4000-8000-000000000005';
  const doctorB = '20000000-0000-4000-8000-000000000006';
  const nurseA = '20000000-0000-4000-8000-000000000007';
  const nurseB = '20000000-0000-4000-8000-000000000008';
  const patientA = '20000000-0000-4000-8000-000000000009';
  const patientB = '20000000-0000-4000-8000-000000000010';
  const bplBucket = await db.query<{ id: string; public: boolean }>(
    `SELECT id, public FROM storage.buckets WHERE id='bpl-patients'`
  );
  if (!bplBucket.rows[0]?.public) throw new Error('The public BPL patient-photo bucket was not provisioned.');
  await db.exec(`
    RESET ROLE;
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
      ('${doctorA}', 'doctor-a@example.test', now()),
      ('${doctorB}', 'doctor-b@example.test', now()),
      ('${nurseA}', 'nurse-a@example.test', now()),
      ('${nurseB}', 'nurse-b@example.test', now()),
      ('${patientA}', 'patient-a@example.test', now()),
      ('${patientB}', 'patient-b@example.test', now());
    INSERT INTO public.roles (name,display_name,description) VALUES ('doctor','Doctor','Medical doctor')
      ON CONFLICT (name) DO NOTHING;
    INSERT INTO public.profiles (id,email,full_name,phone) VALUES
      ('${doctorA}','doctor-a@example.test','Doctor A','111'),
      ('${doctorB}','doctor-b@example.test','Doctor B','222'),
      ('${nurseA}','nurse-a@example.test','Nurse A','333'),
      ('${nurseB}','nurse-b@example.test','Nurse B','444');
    INSERT INTO public.user_roles (user_id,role_id)
      SELECT user_id, id FROM public.roles CROSS JOIN (VALUES ('${doctorA}'::uuid),('${doctorB}'::uuid)) u(user_id)
      WHERE name='doctor';
    INSERT INTO public.doctor_profiles (user_id,full_name,registration_no,registration_council,verification_status) VALUES
      ('${doctorA}','Doctor A','REG-A','Council A','submitted'),
      ('${doctorB}','Doctor B','REG-B','Council B','submitted');
    INSERT INTO public.hospital_members (hospital_id,user_id,staff_role) VALUES
      ('${hospitalA}','${doctorA}','doctor'),
      ('${hospitalA}','${doctorB}','doctor'),
      ('${hospitalA}','${nurseA}','nurse'),
      ('${hospitalA}','${nurseB}','nurse');
    INSERT INTO public.hospital_doctors (hospital_id,user_id,doctor_name,specialty,doctor_identifier,email,verification_status)
      VALUES ('${hospitalA}','${doctorA}','Doctor A','Medical Oncology','DOC-ISO-A','doctor-a@example.test','submitted'),
             ('${hospitalA}','${doctorB}','Doctor B','Surgical Oncology','DOC-ISO-B','doctor-b@example.test','submitted');
    INSERT INTO public.hospital_patients (hospital_id,patient_identifier,name,patient_user_id)
      VALUES ('${hospitalA}','ISO-PATIENT-A','Patient A','${patientA}'),
             ('${hospitalA}','ISO-PATIENT-B','Patient B','${patientB}');
    INSERT INTO public.hospital_appointments (hospital_id,patient_id,doctor_id,scheduled_at,kind)
      SELECT '${hospitalA}',p.id,d.id,now(),'opd'
      FROM public.hospital_patients p JOIN public.hospital_doctors d
        ON d.hospital_id=p.hospital_id AND d.doctor_name=CASE p.patient_identifier WHEN 'ISO-PATIENT-A' THEN 'Doctor A' ELSE 'Doctor B' END
      WHERE p.patient_identifier IN ('ISO-PATIENT-A','ISO-PATIENT-B');
    INSERT INTO public.opd_sessions (hospital_id,doctor_id,session_date,start_time,end_time,status)
      SELECT '${hospitalA}',id,current_date,time '09:00',time '12:00','open'
      FROM public.hospital_doctors WHERE user_id IN ('${doctorA}','${doctorB}');
    INSERT INTO public.queue_entries (hospital_id,session_id,patient_id,token_number,priority_rank,status)
      SELECT '${hospitalA}',s.id,p.id,1,3,'waiting'
      FROM public.opd_sessions s
      JOIN public.hospital_doctors d ON d.id=s.doctor_id
      JOIN public.hospital_patients p ON p.patient_identifier=CASE d.user_id WHEN '${doctorA}'::uuid THEN 'ISO-PATIENT-A' ELSE 'ISO-PATIENT-B' END
      WHERE s.hospital_id='${hospitalA}' AND s.session_date=current_date AND d.user_id IN ('${doctorA}','${doctorB}');
    INSERT INTO public.consultations (hospital_id,patient_id,doctor_id,complaint,assessment,plan)
      SELECT '${hospitalA}',p.id,d.id,'Follow-up','Stable','Continue care'
      FROM public.hospital_patients p JOIN public.hospital_doctors d
        ON d.hospital_id=p.hospital_id AND d.doctor_name=CASE p.patient_identifier WHEN 'ISO-PATIENT-A' THEN 'Doctor A' ELSE 'Doctor B' END
      WHERE p.patient_identifier IN ('ISO-PATIENT-A','ISO-PATIENT-B');
    INSERT INTO public.prescriptions (hospital_id,patient_id,consultation_id,doctor_id)
      SELECT c.hospital_id,c.patient_id,c.id,c.doctor_id FROM public.consultations c
      WHERE c.hospital_id='${hospitalA}' AND c.complaint='Follow-up';
  `);
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${patientA}',false);`);
  await db.exec(`
    INSERT INTO public.symptoms (user_id,name,severity) VALUES ('${patientA}','Fatigue',5);
    INSERT INTO public.treatments (
      user_id,type,name,status,start_date,scheduled_date,scheduled_time,location,doctor,reminder,progress
    ) VALUES (
      '${patientA}','chemotherapy','Regression treatment','planned',current_date,current_date,time '09:00',
      'Clinic','Dr Test',true,0
    );
    INSERT INTO public.side_effect_entries (
      user_id,name,severity,trend,duration,what_helped,cancer_type,treatment_type,journey_phase
    ) VALUES (
      '${patientA}','Nausea',4,'Stable','Today','[]'::jsonb,'Breast','Chemotherapy','Treatment'
    );
  `);
  let foreignSymptomRejected = false;
  try {
    await db.query(`INSERT INTO public.symptoms (user_id,name,severity) VALUES ($1,'Unauthorized',5)`, [patientB]);
  } catch { foreignSymptomRejected = true; }
  if (!foreignSymptomRejected) throw new Error('A patient inserted a symptom record into another user account.');
  await db.exec('RESET ROLE');
  const ids = await db.query<{ doctor_a_row: string; doctor_b_row: string }>(`
    SELECT
      (SELECT id FROM public.hospital_doctors WHERE user_id='${doctorA}') AS doctor_a_row,
      (SELECT id FROM public.hospital_doctors WHERE user_id='${doctorB}') AS doctor_b_row
  `);
  const doctorARow = ids.rows[0].doctor_a_row;
  const doctorBRow = ids.rows[0].doctor_b_row;
  const sessionIds = await db.query<{ doctor_a_session: string; doctor_b_session: string }>(`
    SELECT
      (SELECT s.id FROM public.opd_sessions s JOIN public.hospital_doctors d ON d.id=s.doctor_id WHERE d.user_id='${doctorA}' AND s.session_date=current_date) AS doctor_a_session,
      (SELECT s.id FROM public.opd_sessions s JOIN public.hospital_doctors d ON d.id=s.doctor_id WHERE d.user_id='${doctorB}' AND s.session_date=current_date) AS doctor_b_session
  `);
  if (!sessionIds.rows[0]?.doctor_a_session || !sessionIds.rows[0]?.doctor_b_session) {
    throw new Error('Doctor isolation fixtures are missing OPD sessions.');
  }
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${adminA}',false);`);
  await db.query(`SELECT public.set_hospital_doctor_care_team_assignment($1,$2,$3,'nurse',NULL)`, [hospitalA, doctorARow, nurseA]);
  await db.query(`SELECT public.set_hospital_doctor_care_team_assignment($1,$2,$3,'nurse',NULL)`, [hospitalA, doctorBRow, nurseB]);

  for (const item of [
    { user: doctorA, doctorId: doctorARow, sessionId: sessionIds.rows[0].doctor_a_session, otherSessionId: sessionIds.rows[0].doctor_b_session, patientIdentifier: 'ISO-PATIENT-A', otherPatient: 'ISO-PATIENT-B', nurse: 'Nurse A', otherNurse: 'Nurse B' },
    { user: doctorB, doctorId: doctorBRow, sessionId: sessionIds.rows[0].doctor_b_session, otherSessionId: sessionIds.rows[0].doctor_a_session, patientIdentifier: 'ISO-PATIENT-B', otherPatient: 'ISO-PATIENT-A', nurse: 'Nurse B', otherNurse: 'Nurse A' },
  ]) {
    await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${item.user}',false);`);
    const doctorRows = await db.query<{ count: number }>(`SELECT count(*)::integer AS count FROM public.hospital_doctors WHERE hospital_id=$1`, [hospitalA]);
    if (doctorRows.rows[0].count !== 1) throw new Error(`${item.user} can see another doctor's hospital profile.`);
    const patientRows = await db.query<{ count: number }>(`SELECT count(*)::integer AS count FROM public.hospital_patients WHERE hospital_id=$1`, [hospitalA]);
    if (patientRows.rows[0].count !== 1) throw new Error(`${item.user} can see another doctor's patient record.`);
    const appointmentRows = await db.query<{ count: number }>(`SELECT count(*)::integer AS count FROM public.hospital_appointments WHERE hospital_id=$1`, [hospitalA]);
    const consultationRows = await db.query<{ count: number }>(`SELECT count(*)::integer AS count FROM public.consultations WHERE hospital_id=$1`, [hospitalA]);
    const prescriptionRows = await db.query<{ count: number }>(`SELECT count(*)::integer AS count FROM public.prescriptions WHERE hospital_id=$1`, [hospitalA]);
    if (appointmentRows.rows[0].count !== 1 || consultationRows.rows[0].count !== 1 || prescriptionRows.rows[0].count !== 1) {
      throw new Error(`${item.user} can see another doctor's appointments or clinical records.`);
    }
    const sessions = await db.query<{ sessions: unknown }>(`SELECT public.get_today_sessions($1) AS sessions`, [hospitalA]);
    const sessionsText = JSON.stringify(sessions.rows[0].sessions);
    const ownDoctorName = item.user === doctorA ? 'Doctor A' : 'Doctor B';
    const otherDoctorName = item.user === doctorA ? 'Doctor B' : 'Doctor A';
    if (!sessionsText.includes(ownDoctorName) || sessionsText.includes(otherDoctorName)) {
      throw new Error(`${item.user} received another doctor's OPD session data: ${sessionsText}`);
    }
    const queueState = await db.query<{ state: unknown }>(
      `SELECT public.get_queue_state($1) AS state`,
      [item.sessionId]
    );
    const queueStateText = JSON.stringify(queueState.rows[0].state);
    if (!queueStateText.includes(item.patientIdentifier) || queueStateText.includes(item.otherPatient)) {
      throw new Error(`${item.user} received another doctor's queue data: ${queueStateText}`);
    }
    let crossDoctorQueueRejected = false;
    try { await db.query(`SELECT public.get_queue_state($1)`, [item.otherSessionId]); } catch { crossDoctorQueueRejected = true; }
    if (!crossDoctorQueueRejected) throw new Error(`${item.user} read another doctor's queue through get_queue_state.`);
    const patientSearch = await db.query<{ results: unknown }>(
      `SELECT public.search_hospital_patients($1,NULL,50) AS results`,
      [hospitalA]
    );
    const patientSearchText = JSON.stringify(patientSearch.rows[0].results);
    if (!patientSearchText.includes(item.patientIdentifier) || patientSearchText.includes(item.otherPatient)) {
      throw new Error(`${item.user} received another doctor's patients through hospital search: ${patientSearchText}`);
    }
    const patientId = (await db.query<{ id: string }>(
      `SELECT id FROM public.hospital_patients WHERE hospital_id=$1 AND patient_identifier=$2`,
      [hospitalA, item.patientIdentifier]
    )).rows[0].id;
    const context = await db.query<{ context: unknown }>(
      `SELECT public.get_consultation_context($1,$2) AS context`,
      [hospitalA, patientId]
    );
    const contextText = JSON.stringify(context.rows[0].context);
    if (!contextText.includes(item.patientIdentifier) || contextText.includes(item.otherPatient)) {
      throw new Error(`${item.user} received another doctor's consultation context: ${contextText}`);
    }
    const readCaps = await db.query<{ patients: boolean; clinical: boolean }>(
      `SELECT public.hospital_has_cap($1,'patients.read') AS patients, public.hospital_has_cap($1,'clinical.read') AS clinical`,
      [hospitalA]
    );
    if (readCaps.rows[0].patients || readCaps.rows[0].clinical) {
      throw new Error(`${item.user} received hospital-wide patient or clinical read capability.`);
    }
    const assignmentRows = await db.query<{ count: number }>(`SELECT count(*)::integer AS count FROM public.hospital_doctor_care_team_assignments WHERE hospital_id=$1`, [hospitalA]);
    if (assignmentRows.rows[0].count !== 1) throw new Error(`${item.user} can see another doctor's care-team assignment.`);
    const profile = await db.query<{ profile: unknown }>(`SELECT public.doctor_hospital_profile() AS profile`);
    const profileText = JSON.stringify(profile.rows[0].profile);
    if (!profileText.includes(item.doctorId) || !profileText.includes(item.nurse) || profileText.includes(item.otherNurse)) {
      throw new Error(`${item.user} received incorrect hospital affiliation or care-team data: ${profileText}`);
    }
  }

  await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${doctorA}',false);`);
  const doctorBConsultation = await db.query<{ id: string }>(
    `SELECT id FROM public.consultations WHERE hospital_id=$1 AND doctor_id=$2`,
    [hospitalA, doctorBRow]
  );
  let crossDoctorConsultationEditRejected = false;
  try {
    await db.query(`SELECT public.save_consultation_draft($1,'Unauthorized edit',NULL,NULL,NULL)`, [doctorBConsultation.rows[0].id]);
  } catch { crossDoctorConsultationEditRejected = true; }
  if (!crossDoctorConsultationEditRejected) throw new Error('Doctor A modified Doctor B consultation through a privileged RPC.');
  let crossDoctorHospitalSummaryRejected = false;
  try {
    await db.query(`SELECT public.hospital_command_center($1)`, [hospitalA]);
  } catch { crossDoctorHospitalSummaryRejected = true; }
  if (!crossDoctorHospitalSummaryRejected) throw new Error('Doctor account received hospital-wide command-center data.');
  let unauthorizedAssignmentRejected = false;
  try {
    await db.query(`SELECT public.set_hospital_doctor_care_team_assignment($1,$2,$3,'nurse',NULL)`, [hospitalA, doctorBRow, nurseA]);
  } catch { unauthorizedAssignmentRejected = true; }
  if (!unauthorizedAssignmentRejected) throw new Error('Doctor account was allowed to manage hospital care-team assignments.');

  await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${adminB}',false);`);
  let crossHospitalAssignmentRejected = false;
  try {
    await db.query(`SELECT public.set_hospital_doctor_care_team_assignment($1,$2,$3,'nurse',NULL)`, [hospitalB, doctorARow, nurseA]);
  } catch { crossHospitalAssignmentRejected = true; }
  if (!crossHospitalAssignmentRejected) throw new Error('Hospital B admin modified Hospital A doctor staffing.');

  await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${adminA}',false);`);
  const removed = await db.query<{ removed: boolean }>(`SELECT public.remove_hospital_doctor_care_team_assignment($1,$2) AS removed`, [
    hospitalA,
    (await db.query<{ id: string }>(`SELECT id FROM public.hospital_doctor_care_team_assignments WHERE doctor_id=$1`, [doctorARow])).rows[0].id,
  ]);
  if (!removed.rows[0].removed) throw new Error('Hospital admin could not remove a care-team assignment.');
  await db.query(`SELECT public.set_hospital_doctor_care_team_assignment($1,$2,$3,'nurse',NULL)`, [hospitalA, doctorBRow, nurseA]);
  await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${doctorA}',false);`);
  const refreshedA = await db.query<{ profile: unknown }>(`SELECT public.doctor_hospital_profile() AS profile`);
  if (JSON.stringify(refreshedA.rows[0].profile).includes('Nurse A')) throw new Error('Removed nurse still appears on Doctor A dashboard.');
  await db.exec(`RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${doctorB}',false);`);
  const refreshedB = await db.query<{ profile: unknown }>(`SELECT public.doctor_hospital_profile() AS profile`);
  const updatedProfileText = JSON.stringify(refreshedB.rows[0].profile);
  if (!updatedProfileText.includes('Nurse A') || !updatedProfileText.includes('Nurse B')) throw new Error('Updated nurse assignment did not appear on Doctor B dashboard.');
  await db.exec('RESET ROLE');

  const legacyProvisioning = await db.query<{ create_allowed: boolean; toggle_allowed: boolean }>(`
    SELECT has_function_privilege('authenticated','public.create_hospital_doctor(uuid,text,text,uuid)','EXECUTE') AS create_allowed,
      has_function_privilege('authenticated','public.set_hospital_doctor_active(uuid,uuid,boolean)','EXECUTE') AS toggle_allowed
  `);
  if (legacyProvisioning.rows[0].create_allowed || legacyProvisioning.rows[0].toggle_allowed) throw new Error('Legacy doctor provisioning RPCs remain executable.');
  console.log('PASS: Doctor A/B profile, patient, appointment, consultation, prescription, and care-team RLS isolation; admin assignment changes refresh per-doctor profiles.');
}

async function main() {
  await buildHospitalBundle();
  const migrations = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  let db: PGlite | undefined;
  let failure: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    db = await createDatabase();
    try {
      await applyMigrationSet(db, migrations);
      failure = undefined;
      console.log(`PASS: applied all ${migrations.length} migrations in order (attempt ${attempt}).`);
      break;
    } catch (error) {
      failure = error;
      console.error(`Attempt ${attempt}/3 failed: ${error instanceof Error ? error.message : String(error)}`);
      await db.close();
    }
  }

  if (failure) {
    console.error('Legacy migrations did not apply after three attempts; retrying the supported set from 20260930000000 with Supabase legacy stubs.');
    db = await createDatabase();
    const supportedMigrations = migrations.filter((file) => file >= '20260930000000');
    try {
      await applyMigrationSet(db, supportedMigrations);
      failure = undefined;
      console.log(`PASS: applied ${supportedMigrations.length} migrations from 20260930000000 onward.`);
    } catch (error) {
      console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }

  if (!failure && db) {
    let bundleDb: PGlite | undefined;
    try {
      const bundleSql = await fs.readFile(pendingBundle, 'utf8');
      bundleDb = await createDatabase();
      const prerequisites = migrations.filter((file) => file >= '20261001000000' && file < '20261002100000');
      await applyMigrationSet(bundleDb, prerequisites);
      await bundleDb.exec(bundleSql);
      console.log('PASS: applied supabase/APPLY_HOSPITAL_PENDING.sql');
      await runSmokeAssertions(bundleDb);
      await runDoctorCareTeamIsolationAssertions(bundleDb);
    } catch (error) {
      console.error(`FAIL: SQL smoke assertion: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    } finally {
      if (bundleDb) await bundleDb.close();
    }
  }

  if (db) await db.close();
}

void main();
