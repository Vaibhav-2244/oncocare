import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest } from '@/lib/payments/auth';
import { finalizeCapturedPayment } from '@/lib/payments/provider';
import { fetchRazorpayOrderPayments, fetchRazorpayOrderStatus } from '@/lib/razorpay';

const statusSchema = z.object({ orderId: z.string().min(1).max(100) }).strict();

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
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data: order, error } = await auth.admin.from('payment_orders')
    .select('id, user_id, kind, amount_in_paise, currency, status, provider_order_id, created_at, updated_at')
    .eq('provider_order_id', parsed.data.orderId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load payment status.' }, { status: 500 });
  if (!order) return NextResponse.json({ error: 'Payment order not found.' }, { status: 404 });
  if (order.user_id !== auth.user.id) return NextResponse.json({ error: 'You cannot view another user’s payment.' }, { status: 403 });

  try {
    const [provider, payments] = await Promise.all([
      fetchRazorpayOrderStatus(parsed.data.orderId),
      fetchRazorpayOrderPayments(parsed.data.orderId),
    ]);
    const captured = payments.items?.find((payment) => (
      payment.order_id === order.provider_order_id && payment.status === 'captured' && payment.captured === true
    ));
    if (captured?.id) {
      await finalizeCapturedPayment(auth.admin, {
        providerOrderId: parsed.data.orderId,
        paymentId: captured.id,
        expectedUserId: auth.user.id,
      });
    }
    const { data: current, error: currentError } = await auth.admin.from('payment_orders')
      .select('id, kind, amount_in_paise, currency, status, provider_payment_id, created_at, updated_at')
      .eq('id', order.id)
      .single();
    if (currentError) return NextResponse.json({ error: 'Unable to load reconciled payment status.' }, { status: 500 });
    return NextResponse.json({ ok: true, order: current, provider });
  } catch {
    return NextResponse.json({ error: 'Provider status is temporarily unavailable; retry shortly.' }, { status: 502 });
  }
}
