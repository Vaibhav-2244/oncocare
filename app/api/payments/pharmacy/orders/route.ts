import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest } from '@/lib/payments/auth';

const transitionSchema = z.object({
  paymentOrderId: z.string().uuid(),
  status: z.enum(['accepted', 'preparing', 'dispatched', 'delivered', 'refund_pending']),
  trackingReference: z.string().trim().max(200).nullable().optional(),
}).strict();

export async function GET(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (auth.unavailable) return NextResponse.json({ error: 'Payment database configuration is missing on the server.' }, { status: 503 });

  const { data: memberships, error: membershipError } = await auth.admin.from('pharmacy_members')
    .select('org_id, staff_role')
    .eq('user_id', auth.user.id)
    .eq('is_active', true);
  if (membershipError) return NextResponse.json({ error: 'Unable to verify pharmacy membership.' }, { status: 500 });
  const pharmacyIds = [...new Set((memberships ?? []).map((membership) => membership.org_id))];
  if (!pharmacyIds.length) return NextResponse.json({ error: 'Active pharmacy membership is required.' }, { status: 403 });

  const { data: orders, error } = await auth.admin.from('pharmacy_online_orders')
    .select('id, payment_order_id, patient_id, pharmacy_id, amount_in_paise, delivery_fee_in_paise, delivery_address, status, tracking_reference, created_at, updated_at')
    .in('pharmacy_id', pharmacyIds)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: 'Unable to load pharmacy orders.' }, { status: 500 });
  if (!orders?.length) return NextResponse.json({ orders: [] });

  const orderIds = orders.map((order) => order.payment_order_id);
  const [itemsResult, refundsResult] = await Promise.all([
    auth.admin.from('payment_order_items')
      .select('order_id, description, quantity, total_amount_in_paise')
      .in('order_id', orderIds),
    auth.admin.from('payment_refunds')
      .select('id, order_id, amount_in_paise, reason, status, created_at')
      .in('order_id', orderIds),
  ]);
  if (itemsResult.error || refundsResult.error) return NextResponse.json({ error: 'Unable to load pharmacy order details.' }, { status: 500 });
  return NextResponse.json({
    orders: orders.map((order) => ({
      ...order,
      items: itemsResult.data?.filter((item) => item.order_id === order.payment_order_id) ?? [],
      refunds: refundsResult.data?.filter((refund) => refund.order_id === order.payment_order_id) ?? [],
    })),
  });
}

export async function POST(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (auth.unavailable) return NextResponse.json({ error: 'Payment database configuration is missing on the server.' }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const parsed = transitionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { data, error } = await auth.admin.rpc('transition_pharmacy_online_order', {
    p_payment_order_id: parsed.data.paymentOrderId,
    p_actor_user_id: auth.user.id,
    p_next_status: parsed.data.status,
    p_tracking_reference: parsed.data.trackingReference ?? null,
  });
  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === '42501' ? 403 : error.code === '22023' ? 409 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to update pharmacy order.' : error.message }, { status });
  }
  return NextResponse.json({ order: data });
}
