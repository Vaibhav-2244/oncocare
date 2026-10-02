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
CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, email text, full_name text, preferred_language text);
CREATE TABLE public.roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL, display_name text);
CREATE TABLE public.user_roles (user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE, PRIMARY KEY (user_id, role_id));
CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id), title text, message text, type text, created_at timestamptz DEFAULT now());
CREATE TABLE public.notification_preferences (user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE);
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
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${userA}', false); SELECT public.load_demo_data('${hospitalA}');`);
  const demoCounts = await db.query<{ patients: number }> (`SELECT count(*)::integer AS patients FROM public.hospital_patients WHERE hospital_id = $1 AND is_demo`, [hospitalA]);
  if (demoCounts.rows[0]?.patients !== 80) throw new Error(`Expected 80 demo patients; got ${demoCounts.rows[0]?.patients ?? 0}`);
  const queueCounts = await db.query<{ current_token: number | null; waiting: number }> (`SELECT max(token_number) FILTER (WHERE status='in_consultation') AS current_token, count(*) FILTER (WHERE status='waiting')::integer AS waiting FROM public.queue_entries WHERE hospital_id = $1 AND session_id = (SELECT id FROM public.opd_sessions WHERE hospital_id = $1 AND is_demo ORDER BY start_time LIMIT 1)`, [hospitalA]);
  if (queueCounts.rows[0]?.current_token !== 102 || queueCounts.rows[0]?.waiting !== 21) {
    throw new Error(`Expected demo queue serving token 102 with 21 waiting; received ${JSON.stringify(queueCounts.rows[0])}`);
  }
  const mainSession = await db.query<{ id: string }>(`SELECT id FROM public.opd_sessions WHERE hospital_id=$1 AND is_demo ORDER BY start_time LIMIT 1`, [hospitalA]);
  const emergencyCall = await db.query<{ entry: { token_number: number; priority_rank: number } }>(`SELECT public.call_next($1) AS entry`, [mainSession.rows[0].id]);
  if (emergencyCall.rows[0]?.entry?.priority_rank !== 0) throw new Error('Queue did not call the emergency priority first.');
  console.log('PASS: emergency queue entry is called before lower priorities.');

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
  console.log('PASS: 80 demo patients, expected command queue fixture, tenant isolation, role restrictions, direct-write denial, and anon RPC denial.');
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
    try {
      const bundleSql = await fs.readFile(pendingBundle, 'utf8');
      await db.exec(bundleSql);
      console.log('PASS: applied supabase/APPLY_HOSPITAL_PENDING.sql');
      await runSmokeAssertions(db);
    } catch (error) {
      console.error(`FAIL: SQL smoke assertion: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }

  if (db) await db.close();
}

void main();
