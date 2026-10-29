import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest, isPlatformPaymentAdmin } from '@/lib/payments/auth';

const policySchema = z.object({
  policyVersion: z.string().trim().min(1).max(80),
  basisPoints: z.number().int().min(0).max(10_000),
  active: z.boolean(),
}).strict();

async function authorize(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return { response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  if (auth.unavailable) return { response: NextResponse.json({ error: 'Payment database configuration is missing on the server.' }, { status: 503 }) };
  try {
    if (!(await isPlatformPaymentAdmin(auth.user.id))) return { response: NextResponse.json({ error: 'Administrator access required.' }, { status: 403 }) };
  } catch {
    return { response: NextResponse.json({ error: 'Unable to verify administrator access.' }, { status: 500 }) };
  }
  return { auth };
}

export async function GET(request: Request) {
  const result = await authorize(request);
  if (!result.auth) return result.response;
  const { data, error } = await result.auth.admin.from('payment_commission_policies')
    .select('policy_version, basis_points, active, updated_at')
    .order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Unable to load commission policies.' }, { status: 500 });
  const [ledgerResult, settlementResult, donationResult] = await Promise.all([
    result.auth.admin.from('payment_commission_ledger')
      .select('id, order_id, seller_id, gross_amount_in_paise, delivery_fee_in_paise, commission_amount_in_paise, seller_payable_in_paise, policy_version, status, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    result.auth.admin.from('payment_seller_settlements')
      .select('id, commission_ledger_id, status, provider_reference, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(100),
    result.auth.admin.from('payment_donations')
      .select('id, order_id, case_id, purpose, receipt_reference, reviewed_by, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (ledgerResult.error || settlementResult.error || donationResult.error) {
    return NextResponse.json({ error: 'Unable to load commission, settlement, or donation records.' }, { status: 500 });
  }
  const donationOrderIds = (donationResult.data ?? []).map((donation) => donation.order_id);
  const donationAmounts = donationOrderIds.length
    ? await result.auth.admin.from('payment_orders').select('id, amount_in_paise, status').in('id', donationOrderIds)
    : { data: [], error: null };
  if (donationAmounts.error) return NextResponse.json({ error: 'Unable to load donation payment details.' }, { status: 500 });
  return NextResponse.json({
    policies: data ?? [],
    ledger: ledgerResult.data ?? [],
    settlements: settlementResult.data ?? [],
    donations: (donationResult.data ?? []).map((donation) => ({
      ...donation,
      payment: donationAmounts.data?.find((payment) => payment.id === donation.order_id) ?? null,
    })),
  });
}

export async function PUT(request: Request) {
  const result = await authorize(request);
  if (!result.auth) return result.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const parsed = policySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { data, error } = await result.auth.admin.rpc('admin_upsert_commission_policy', {
    p_actor_user_id: result.auth.user.id,
    p_policy_version: parsed.data.policyVersion,
    p_basis_points: parsed.data.basisPoints,
    p_active: parsed.data.active,
  });
  if (error) return NextResponse.json({ error: 'Unable to save the commission policy.' }, { status: 500 });
  return NextResponse.json({ policy: data });
}
