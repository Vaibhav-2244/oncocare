import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest, isPlatformPaymentAdmin } from '@/lib/payments/auth';

const querySchema = z.object({
  kind: z.enum(['tele-oncology', 'medicine', 'insurance', 'booking', 'caregiver', 'donation']).optional(),
  status: z.string().max(40).optional(),
  mode: z.enum(['test', 'live']).optional(),
}).strict();

export async function GET(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (auth.unavailable) return NextResponse.json({ error: 'Payment database configuration is missing on the server.' }, { status: 503 });
  try {
    if (!(await isPlatformPaymentAdmin(auth.user.id))) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  } catch {
    return NextResponse.json({ error: 'Unable to verify administrator access.' }, { status: 500 });
  }
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid transaction filter.' }, { status: 400 });
  const { kind, status, mode } = parsed.data;
  let query = auth.admin.from('payment_orders')
    .select('id, user_id, kind, status, amount_in_paise, currency, payment_mode, is_demo, live_demo_consent_at, provider_order_id, provider_payment_id, provider_refund_id, failure_reason, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(250);
  if (kind) query = query.eq('kind', kind);
  if (status) query = query.eq('status', status);
  if (mode) query = query.eq('payment_mode', mode);
  const { data: orders, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load payment transactions.' }, { status: 500 });

  const orderIds = (orders ?? []).map((order) => order.id);
  const [bookingsResult, refundsResult] = orderIds.length
    ? await Promise.all([
      auth.admin.from('prelaunch_demo_bookings')
        .select('payment_order_id, provider_label, service_name, status')
        .in('payment_order_id', orderIds),
      auth.admin.from('payment_refunds')
        .select('id, order_id, amount_in_paise, status, provider_refund_id')
        .in('order_id', orderIds),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (bookingsResult.error || refundsResult.error) {
    return NextResponse.json({ error: 'Unable to load associated payment details.' }, { status: 500 });
  }
  return NextResponse.json({
    transactions: (orders ?? []).map((order) => ({
      ...order,
      demo: bookingsResult.data?.find((booking) => booking.payment_order_id === order.id) ?? null,
      refunds: refundsResult.data?.filter((refund) => refund.order_id === order.id) ?? [],
    })),
  });
}
