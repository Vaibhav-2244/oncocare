import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest } from '@/lib/payments/auth';

const cancelSchema = z.object({ paymentOrderId: z.string().uuid() }).strict();

export async function GET(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (auth.unavailable) return NextResponse.json({ error: 'Payment database configuration is missing on the server.' }, { status: 503 });

  const { data: orders, error } = await auth.admin.from('pharmacy_online_orders')
    .select('id, payment_order_id, pharmacy_id, amount_in_paise, delivery_fee_in_paise, delivery_address, status, tracking_reference, created_at, updated_at')
    .eq('patient_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: 'Unable to load your medicine orders.' }, { status: 500 });
  if (!orders?.length) return NextResponse.json({ orders: [] });

  const orderIds = orders.map((order) => order.payment_order_id);
  const [itemsResult, refundsResult, pharmacyResult] = await Promise.all([
    auth.admin.from('payment_order_items')
      .select('order_id, description, quantity, total_amount_in_paise')
      .in('order_id', orderIds),
    auth.admin.from('payment_refunds')
      .select('id, order_id, amount_in_paise, reason, status, created_at')
      .in('order_id', orderIds),
    auth.admin.from('pharmacy_orgs')
      .select('id, name')
      .in('id', [...new Set(orders.map((order) => order.pharmacy_id))]),
  ]);
  if (itemsResult.error || refundsResult.error || pharmacyResult.error) {
    return NextResponse.json({ error: 'Unable to load medicine order details.' }, { status: 500 });
  }
  const ordersWithDetails = orders.map((order) => ({
    ...order,
    items: itemsResult.data?.filter((item) => item.order_id === order.payment_order_id) ?? [],
    refunds: refundsResult.data?.filter((refund) => refund.order_id === order.payment_order_id) ?? [],
    pharmacyName: pharmacyResult.data?.find((pharmacy) => pharmacy.id === order.pharmacy_id)?.name ?? 'Pharmacy',
  }));
  return NextResponse.json({ orders: ordersWithDetails });
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
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await auth.admin.rpc('request_pharmacy_order_cancellation', {
    p_payment_order_id: parsed.data.paymentOrderId,
    p_patient_id: auth.user.id,
    p_idempotency_key: parsed.data.paymentOrderId,
  });
  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === '22023' ? 409 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to request medicine order cancellation.' : error.message }, { status });
  }
  return NextResponse.json({ refund: data }, { status: 202 });
}
