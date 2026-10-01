import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const require = createRequire(`${process.cwd()}/scripts/verify-pharmacy-foundation.ts`);
if (!globalThis.WebSocket) globalThis.WebSocket = require('ws') as typeof globalThis.WebSocket;

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
const pharmacyIds: string[] = [];
const nonce = randomUUID().replaceAll('-', '').slice(0, 16);
const password = `PharmacyFoundation-${randomUUID()}-Aa1!`;

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
  results.push({ check: name, result: error ? 'FAIL' : 'PASS', detail: error ? messageOf(error) : 'verified' });
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
    throw new Error('ensure_pharmacy_workspace returned no workspace id');
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
    user_metadata: { full_name: 'Pharmacy Foundation Verification', role },
  });
  if (error || !data.user) throw error ?? new Error('Supabase Auth did not create the temporary user');
  userIds.push(data.user.id);

  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, client };
}

async function createPharmacyAccount(
  admin: SupabaseClient,
  url: string,
  anonKey: string,
  suffix: string,
): Promise<{ account: TestAccount; pharmacyId: string }> {
  const account = await createAccount(admin, url, anonKey, `oncocare-pharmacy-foundation-${nonce}-${suffix}@example.com`, 'pharmacy');
  const { data, error } = await account.client.rpc('ensure_pharmacy_workspace');
  if (error) throw error;
  const pharmacyId = getOrgId(data);
  pharmacyIds.push(pharmacyId);
  return { account, pharmacyId };
}

async function main() {
  let admin: SupabaseClient | null = null;
  try {
    const url = requireEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
    const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
    const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const accounts: { account: TestAccount; pharmacyId: string }[] = [];
    for (const suffix of ['a', 'b', 'c']) {
      accounts.push(await createPharmacyAccount(admin, url, anonKey, suffix));
    }
    const [accountA, accountB, accountC] = accounts;

    await check('Three pharmacy accounts receive isolated workspaces', async () => {
      const ids = accounts.map(({ pharmacyId }) => pharmacyId);
      assert(new Set(ids).size === 3, 'workspace ids were not unique');
      for (const { account, pharmacyId } of accounts) {
        const [orgResult, memberResult] = await Promise.all([
          account.client.from('pharmacy_orgs').select('id, verification_status, owner_user_id').eq('id', pharmacyId),
          account.client.from('pharmacy_members').select('id, staff_role').eq('org_id', pharmacyId).eq('user_id', account.id).eq('is_active', true),
        ]);
        assert(!orgResult.error && orgResult.data?.length === 1, 'member could not read their own workspace');
        assert(orgResult.data[0].verification_status === 'pending', 'new workspace was not pending verification');
        assert(!memberResult.error && memberResult.data?.some((row) => row.staff_role === 'pharmacy_admin'), 'owner is missing active admin membership');
      }
      assert(accountA.pharmacyId !== accountB.pharmacyId && accountB.pharmacyId !== accountC.pharmacyId, 'workspace isolation precondition failed');
    });

    await check('Workspace reads are isolated across pharmacy accounts', async () => {
      const [org, membership] = await Promise.all([
        accountA.account.client.from('pharmacy_orgs').select('id').eq('id', accountB.pharmacyId),
        accountA.account.client.from('pharmacy_members').select('id').eq('org_id', accountB.pharmacyId),
      ]);
      assert(!org.error && org.data?.length === 0, 'another pharmacy workspace was readable');
      assert(!membership.error && membership.data?.length === 0, 'another pharmacy membership was readable');
    });

    await check('Direct workspace updates and audit forgery are denied', async () => {
      const [verification, owner, forgedAudit] = await Promise.all([
        accountA.account.client.from('pharmacy_orgs').update({ verification_status: 'verified' }).eq('id', accountA.pharmacyId).select('id'),
        accountA.account.client.from('pharmacy_orgs').update({ owner_user_id: accountB.account.id }).eq('id', accountA.pharmacyId).select('id'),
        accountA.account.client.from('pharmacy_audit').insert({ org_id: accountB.pharmacyId, actor_user_id: accountA.account.id, action: 'forged' }),
      ]);
      assert(Boolean(verification.error) || verification.data?.length === 0, 'workspace self-verification was not denied');
      assert(Boolean(owner.error) || owner.data?.length === 0, 'workspace owner mutation was not denied');
      assert(Boolean(forgedAudit.error), 'client audit insertion was not denied');
      const persisted = await accountA.account.client.from('pharmacy_orgs').select('owner_user_id, verification_status').eq('id', accountA.pharmacyId).single();
      assert(!persisted.error && persisted.data.owner_user_id === accountA.account.id, 'workspace owner changed');
      assert(persisted.data.verification_status !== 'verified', 'workspace verification changed');
    });

    await check('Patient role cannot provision a pharmacy workspace', async () => {
      const patient = await createAccount(admin as SupabaseClient, url, anonKey, `oncocare-pharmacy-foundation-${nonce}-patient@example.com`, 'patient');
      const result = await patient.client.rpc('ensure_pharmacy_workspace');
      assert(Boolean(result.error), 'patient role unexpectedly provisioned a pharmacy workspace');
    });

    await check('Anonymous clients cannot execute pharmacy functions', async () => {
      const calls = await Promise.all([
        anonymous.rpc('is_pharmacy_member', { p_org_id: accountA.pharmacyId }),
        anonymous.rpc('is_pharmacy_admin', { p_org_id: accountA.pharmacyId }),
        anonymous.rpc('pharmacy_role_can', { p_role: 'pharmacy_admin', p_cap: 'settings.manage' }),
        anonymous.rpc('pharmacy_has_cap', { p_org_id: accountA.pharmacyId, p_cap: 'settings.manage' }),
        anonymous.rpc('pharmacy_is_verified', { p_org_id: accountA.pharmacyId }),
        anonymous.rpc('is_platform_admin'),
        anonymous.rpc('seed_pharmacy_defaults', { p_org_id: accountA.pharmacyId }),
        anonymous.rpc('ensure_pharmacy_workspace'),
        anonymous.rpc('update_pharmacy_org', { p_org_id: accountA.pharmacyId, p_updates: { name: 'Unauthorized' } }),
        anonymous.rpc('request_pharmacy_verification', { p_org_id: accountA.pharmacyId }),
        anonymous.rpc('admin_set_pharmacy_verification', { p_org_id: accountA.pharmacyId, p_status: 'verified' }),
        anonymous.rpc('invite_pharmacy_staff', { p_org_id: accountA.pharmacyId, p_email: 'nobody@example.com', p_staff_role: 'store_staff' }),
        anonymous.rpc('revoke_pharmacy_invite', { p_org_id: accountA.pharmacyId, p_invite_id: randomUUID() }),
        anonymous.rpc('set_pharmacy_member_active', { p_org_id: accountA.pharmacyId, p_user_id: accountA.account.id, p_active: false }),
        anonymous.rpc('set_pharmacy_member_roles', { p_org_id: accountA.pharmacyId, p_user_id: accountA.account.id, p_roles: ['pharmacy_admin'] }),
        anonymous.rpc('next_pharmacy_number', { p_org_id: accountA.pharmacyId, p_kind: 'order', p_prefix: 'ORD-' }),
      ]);
      assert(calls.every((result) => Boolean(result.error)), 'at least one pharmacy function was executable anonymously');
    });

    await check('Confirmed invited email joins the inviter workspace with its assigned role', async () => {
      const inviteEmail = `oncocare-pharmacy-foundation-${nonce}-invite@example.com`;
      const invite = await accountA.account.client.rpc('invite_pharmacy_staff', {
        p_org_id: accountA.pharmacyId,
        p_email: inviteEmail,
        p_staff_role: 'store_staff',
      });
      assert(!invite.error, `invite failed: ${messageOf(invite.error)}`);
      const invited = await createAccount(admin as SupabaseClient, url, anonKey, inviteEmail, 'pharmacy');
      const workspace = await invited.client.rpc('ensure_pharmacy_workspace');
      assert(!workspace.error && getOrgId(workspace.data) === accountA.pharmacyId, 'invitee did not join inviter workspace');
      const member = await invited.client.from('pharmacy_members')
        .select('staff_role').eq('org_id', accountA.pharmacyId).eq('user_id', invited.id).eq('is_active', true);
      assert(!member.error && member.data?.some((row) => row.staff_role === 'store_staff'), 'invite role was not applied');
    });
  } catch (error) {
    record('Verification setup', error);
  } finally {
    if (admin) {
      const ownedWorkspaces = userIds.length > 0
        ? await admin.from('pharmacy_orgs').select('id').in('owner_user_id', userIds)
        : { data: [], error: null };
      if (ownedWorkspaces.error) record('Find temporary workspaces for cleanup', ownedWorkspaces.error);
      const allPharmacyIds = [...new Set([
        ...pharmacyIds,
        ...(ownedWorkspaces.data ?? []).map((workspace) => workspace.id),
      ])];
      if (allPharmacyIds.length > 0) {
        const { error } = await admin.from('pharmacy_orgs').delete().in('id', allPharmacyIds);
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
