import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

config({ path: '.env.local', quiet: true });

interface TestAccount {
  id: string;
  email: string;
  client: SupabaseClient;
}

interface CheckResult {
  check: string;
  result: 'PASS' | 'FAIL';
  detail: string;
}

const results: CheckResult[] = [];
const userIds: string[] = [];
const hospitalIds: string[] = [];
const nonce = randomUUID().replaceAll('-', '').slice(0, 16);
const password = `Foundation-${randomUUID()}-Aa1!`;

function requireEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: ${keys.join(' or ')}`);
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error);
}

function record(name: string, error?: unknown) {
  results.push({
    check: name,
    result: error ? 'FAIL' : 'PASS',
    detail: error ? messageOf(error) : 'verified',
  });
}

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    record(name);
  } catch (error) {
    record(name, error);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function getOrgId(data: unknown): string {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') {
    throw new Error('ensure_hospital_workspace returned no workspace id');
  }
  return value.id;
}

async function createAccount(
  admin: SupabaseClient,
  url: string,
  anonKey: string,
  email: string,
  role: string,
): Promise<TestAccount> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Foundation Verification', role },
  });
  if (error || !data.user) throw error ?? new Error('Supabase Auth did not create the temporary user');
  userIds.push(data.user.id);

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, client };
}

async function createHospitalAccount(
  admin: SupabaseClient,
  url: string,
  anonKey: string,
  suffix: string,
): Promise<{ account: TestAccount; hospitalId: string }> {
  const account = await createAccount(admin, url, anonKey, `oncocare-foundation-${nonce}-${suffix}@example.com`, 'hospital');
  const { data, error } = await account.client.rpc('ensure_hospital_workspace');
  if (error) throw error;
  const hospitalId = getOrgId(data);
  hospitalIds.push(hospitalId);
  return { account, hospitalId };
}

async function main() {
  let admin: SupabaseClient | null = null;
  try {
    const url = requireEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
    const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
    const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const hospitalAccounts: { account: TestAccount; hospitalId: string }[] = [];
    for (const suffix of ['a', 'b', 'c']) {
      hospitalAccounts.push(await createHospitalAccount(admin, url, anonKey, suffix));
    }
    const [accountA, accountB, accountC] = hospitalAccounts;

    await check('Three hospital signups receive different workspaces and six departments', async () => {
      const ids = hospitalAccounts.map(({ hospitalId }) => hospitalId);
      assert(new Set(ids).size === 3, 'workspace ids were not unique');
      for (const { account, hospitalId } of hospitalAccounts) {
        const [orgResult, memberResult, departmentResult] = await Promise.all([
          account.client.from('hospital_orgs').select('id').eq('id', hospitalId),
          account.client.from('hospital_members').select('id').eq('hospital_id', hospitalId),
          account.client.from('hospital_departments').select('id').eq('hospital_id', hospitalId),
        ]);
        assert(!orgResult.error && orgResult.data?.length === 1, 'member could not read their own workspace');
        assert(!memberResult.error && memberResult.data?.length >= 1, 'member could not read their own membership');
        assert(!departmentResult.error && departmentResult.data?.length === 6, 'workspace did not have six starter departments');
      }
    });

    await check('Direct reads are isolated across workspaces', async () => {
      const checks = await Promise.all([
        accountA.account.client.from('hospital_orgs').select('id').eq('id', accountB.hospitalId),
        accountA.account.client.from('hospital_members').select('id').eq('hospital_id', accountB.hospitalId),
        accountA.account.client.from('hospital_departments').select('id').eq('hospital_id', accountB.hospitalId),
      ]);
      for (const result of checks) assert(!result.error && result.data?.length === 0, 'a user read another workspace row');
    });

    const realIdentifier = `REAL${nonce.toUpperCase()}`;
    const realPatient = await accountA.account.client.rpc('register_hospital_patient', {
      p_hospital_id: accountA.hospitalId,
      p_identifier: realIdentifier,
      p_name: 'Foundation Real Patient',
      p_mobile: null,
      p_dob: null,
      p_age: null,
      p_gender: null,
    });

    await check('Patient records remain private and identifiers are tenant-scoped', async () => {
      assert(!realPatient.error && realPatient.data, 'patient registration control row failed');
      const crossRead = await accountB.account.client.from('hospital_patients')
        .select('id').eq('id', (realPatient.data as { id: string }).id);
      assert(!crossRead.error && crossRead.data?.length === 0, 'another tenant read the patient row');
      const sharedIdentifier = `SHARED${nonce}`;
      const [patientA, patientB] = await Promise.all([
        accountA.account.client.rpc('register_hospital_patient', {
          p_hospital_id: accountA.hospitalId, p_identifier: sharedIdentifier, p_name: 'Tenant A Patient',
        }),
        accountB.account.client.rpc('register_hospital_patient', {
          p_hospital_id: accountB.hospitalId, p_identifier: sharedIdentifier, p_name: 'Tenant B Patient',
        }),
      ]);
      assert(!patientA.error && !patientB.error, 'same identifier conflicted across different workspaces');
    });

    await check('Patient identifier formats normalize consistently', async () => {
      const inputs = ['NCI-24601', 'nci24601', '24601', 'NCI 24601'];
      const normalized = await Promise.all(inputs.map((p_input) => accountA.account.client.rpc('normalize_patient_identifier', {
        p_hospital_id: accountA.hospitalId,
        p_input,
      })));
      const org = await accountA.account.client.from('hospital_orgs').select('patient_id_prefix').eq('id', accountA.hospitalId).single();
      assert(normalized.every((result) => !result.error), 'identifier normalization RPC failed');
      assert(!org.error && typeof org.data.patient_id_prefix === 'string', 'workspace prefix could not be read');
      assert(new Set(normalized.map((result) => result.data)).size === 1, 'identifier formats did not normalize to one value');
      const expected = `${org.data.patient_id_prefix}24601`;
      assert(normalized[0].data === expected, `normalized display identifier did not preserve the configured prefix: ${expected}`);
    });

    await check('Direct table writes and cross-tenant patient RPC writes are denied', async () => {
      const directInsert = await accountA.account.client.from('hospital_patients').insert({
        hospital_id: accountB.hospitalId,
        patient_identifier: `CROSS${nonce}`,
        name: 'Unauthorized Patient',
      }).select('id');
      assert(Boolean(directInsert.error), 'direct patient table insert was not denied');
      const crossRpc = await accountA.account.client.rpc('register_hospital_patient', {
        p_hospital_id: accountB.hospitalId,
        p_identifier: `CROSS${nonce}`,
        p_name: 'Unauthorized Patient',
      });
      assert(Boolean(crossRpc.error), 'cross-tenant patient RPC was not denied');
      const forgedAudit = await accountA.account.client.from('hospital_access_audit').insert({
        hospital_id: accountB.hospitalId,
        actor_user_id: accountA.account.id,
        action: 'forged.audit',
      });
      assert(Boolean(forgedAudit.error), 'direct audit insertion was not denied');
      assert(!realPatient.error, 'control patient registration failed');
    });

    await check('Anonymous users cannot execute hospital RPCs', async () => {
      const rpcResults = await Promise.all([
        anonymous.rpc('is_hospital_member', { p_hospital_id: accountA.hospitalId }),
        anonymous.rpc('is_hospital_admin', { p_hospital_id: accountA.hospitalId }),
        anonymous.rpc('hospital_role_can', { p_role: 'hospital_admin', p_cap: 'config.manage' }),
        anonymous.rpc('hospital_has_cap', { p_hospital_id: accountA.hospitalId, p_cap: 'patients.read' }),
        anonymous.rpc('hospital_is_verified', { p_hospital_id: accountA.hospitalId }),
        anonymous.rpc('seed_hospital_defaults', { p_hospital_id: accountA.hospitalId }),
        anonymous.rpc('ensure_hospital_workspace'),
        anonymous.rpc('update_hospital_org', {
          p_hospital_id: accountA.hospitalId, p_name: 'Unauthorized', p_timezone: 'UTC',
          p_patient_id_label: 'ID', p_patient_id_prefix: 'ID-', p_settings: {},
        }),
        anonymous.rpc('request_hospital_verification', { p_hospital_id: accountA.hospitalId }),
        anonymous.rpc('admin_set_hospital_verification', { p_hospital_id: accountA.hospitalId, p_status: 'verified' }),
        anonymous.rpc('invite_hospital_staff', { p_hospital_id: accountA.hospitalId, p_email: 'nobody@example.com', p_staff_role: 'front_desk' }),
        anonymous.rpc('revoke_hospital_invite', { p_hospital_id: accountA.hospitalId, p_invite_id: randomUUID() }),
        anonymous.rpc('set_member_active', { p_hospital_id: accountA.hospitalId, p_user_id: accountA.account.id, p_active: false }),
        anonymous.rpc('set_member_roles', { p_hospital_id: accountA.hospitalId, p_user_id: accountA.account.id, p_roles: ['hospital_admin'] }),
        anonymous.rpc('normalize_patient_identifier', { p_hospital_id: accountA.hospitalId, p_input: '24601' }),
        anonymous.rpc('register_hospital_patient', { p_hospital_id: accountA.hospitalId, p_identifier: `ANON${nonce}`, p_name: 'Anonymous Patient' }),
        anonymous.rpc('load_demo_data', { p_hospital_id: accountA.hospitalId }),
        anonymous.rpc('remove_demo_data', { p_hospital_id: accountA.hospitalId }),
        anonymous.rpc('set_initial_signup_role', { p_role: 'hospital' }),
      ]);
      assert(rpcResults.every((result) => Boolean(result.error)), 'at least one hospital RPC was executable anonymously');
    });

    await check('Workspace owners cannot self-verify or change ownership', async () => {
      const [verificationUpdate, ownerUpdate] = await Promise.all([
        accountA.account.client.from('hospital_orgs')
          .update({ verification_status: 'verified' }).eq('id', accountA.hospitalId).select('id'),
        accountA.account.client.from('hospital_orgs')
          .update({ owner_user_id: accountB.account.id }).eq('id', accountA.hospitalId).select('id'),
      ]);
      assert(
        (Boolean(verificationUpdate.error) || verificationUpdate.data?.length === 0)
          && (Boolean(ownerUpdate.error) || ownerUpdate.data?.length === 0),
        'a direct workspace update changed protected fields',
      );
      const persisted = await accountA.account.client.from('hospital_orgs')
        .select('owner_user_id, verification_status').eq('id', accountA.hospitalId).single();
      assert(!persisted.error && persisted.data?.owner_user_id === accountA.account.id, 'owner field changed');
      assert(persisted.data?.verification_status !== 'verified', 'verification status changed');
    });

    await check('Patient-role users cannot ensure hospital workspaces', async () => {
      const patient = await createAccount(admin as SupabaseClient, url, anonKey, `oncocare-foundation-${nonce}-patient@example.com`, 'patient');
      const result = await patient.client.rpc('ensure_hospital_workspace');
      assert(Boolean(result.error), 'patient role unexpectedly created a hospital workspace');
    });

    await check('Demo data is tenant-scoped and removal preserves real patients', async () => {
      assert(!realPatient.error, 'real patient control row was not created');
      const demoLoad = await accountA.account.client.rpc('load_demo_data', { p_hospital_id: accountA.hospitalId });
      assert(!demoLoad.error, `demo loader failed: ${messageOf(demoLoad.error)}`);
      const secondDemoLoad = await accountA.account.client.rpc('load_demo_data', { p_hospital_id: accountA.hospitalId });
      assert(!secondDemoLoad.error, `second demo load failed: ${messageOf(secondDemoLoad.error)}`);
      const [aDemo, bDemo, aDemoDoctors, bDemoDoctors] = await Promise.all([
        accountA.account.client.from('hospital_patients').select('id').eq('hospital_id', accountA.hospitalId).eq('is_demo', true),
        accountB.account.client.from('hospital_patients').select('id').eq('hospital_id', accountA.hospitalId).eq('is_demo', true),
        accountA.account.client.from('hospital_doctors').select('id').eq('hospital_id', accountA.hospitalId).eq('is_demo', true),
        accountB.account.client.from('hospital_doctors').select('id').eq('hospital_id', accountA.hospitalId).eq('is_demo', true),
      ]);
      assert(!aDemo.error && aDemo.data?.length === 30, 'caller did not see all 30 demo patients');
      assert(!bDemo.error && bDemo.data?.length === 0, 'another workspace read demo patient rows');
      assert(!aDemoDoctors.error && aDemoDoctors.data?.length === 6, 'caller did not see all six demo doctors after repeated loading');
      assert(!bDemoDoctors.error && bDemoDoctors.data?.length === 0, 'another workspace read demo doctor rows');
      const removal = await accountA.account.client.rpc('remove_demo_data', { p_hospital_id: accountA.hospitalId });
      assert(!removal.error, `demo removal failed: ${messageOf(removal.error)}`);
      const [remainingDemo, remainingReal] = await Promise.all([
        accountA.account.client.from('hospital_patients').select('id').eq('hospital_id', accountA.hospitalId).eq('is_demo', true),
        accountA.account.client.from('hospital_patients').select('id').eq('id', (realPatient.data as { id: string }).id),
      ]);
      assert(!remainingDemo.error && remainingDemo.data?.length === 0, 'demo patients remain after removal');
      assert(!remainingReal.error && remainingReal.data?.length === 1, 'demo removal deleted the real patient');
    });

    await check('Confirmed invited email joins the inviter workspace', async () => {
      const inviteEmail = `oncocare-foundation-${nonce}-invite@example.com`;
      const invite = await accountA.account.client.rpc('invite_hospital_staff', {
        p_hospital_id: accountA.hospitalId,
        p_email: inviteEmail,
        p_staff_role: 'front_desk',
      });
      assert(!invite.error, `invite failed: ${messageOf(invite.error)}`);
      const invited = await createAccount(admin as SupabaseClient, url, anonKey, inviteEmail, 'hospital');
      const workspace = await invited.client.rpc('ensure_hospital_workspace');
      assert(!workspace.error && getOrgId(workspace.data) === accountA.hospitalId, 'invitee did not join the inviter workspace');
      const member = await invited.client.from('hospital_members')
        .select('staff_role').eq('hospital_id', accountA.hospitalId).eq('user_id', invited.id).eq('is_active', true);
      assert(!member.error && member.data?.some((row) => row.staff_role === 'front_desk'), 'invitee role was not applied');
    });

    assert(accountC.hospitalId !== accountA.hospitalId, 'workspace isolation precondition failed');
  } catch (error) {
    record('Verification setup', error);
  } finally {
    if (admin) {
      const ownedOrganizations = userIds.length > 0
        ? await admin.from('hospital_orgs').select('id').in('owner_user_id', userIds)
        : { data: [], error: null };
      if (ownedOrganizations.error) record('Find temporary workspaces for cleanup', ownedOrganizations.error);
      const allHospitalIds = [...new Set([
        ...hospitalIds,
        ...(ownedOrganizations.data ?? []).map((organization) => organization.id),
      ])];
      if (allHospitalIds.length > 0) {
        const { error } = await admin.from('hospital_orgs').delete().in('id', allHospitalIds);
        if (error) record('Cleanup temporary workspaces', error);
      }
      for (const id of userIds) {
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) record('Cleanup temporary user', error);
      }
    }
    console.table(results);
    if (results.some((result) => result.result === 'FAIL')) process.exitCode = 1;
  }
}

void main();