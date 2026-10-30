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
    .select('id, user_id, kind, amount_in_paise, currency, status, provider_order_id, expires_at, created_at, updated_at')
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
    if (
      provider.id !== order.provider_order_id
      || provider.amount !== Number(order.amount_in_paise)
      || provider.currency !== order.currency
    ) {
      return NextResponse.json({ error: 'Provider order does not match the stored order amount, currency, or ID.' }, { status: 409 });
    }
    const captured = payments.items?.find((payment) => (
      payment.order_id === order.provider_order_id && payment.status === 'captured' && payment.captured === true
    ));
    if (captured?.id) {
      await finalizeCapturedPayment(auth.admin, {
        providerOrderId: parsed.data.orderId,
        paymentId: captured.id,
        expectedUserId: auth.user.id,
      });
    } else if (
      order.expires_at
      && new Date(order.expires_at).getTime() <= Date.now()
      && (provider.status === 'created' || provider.status === 'attempted')
    ) {
      const hasUnresolvedPayment = (payments.items ?? []).some((payment) => (
        payment.status !== 'failed'
        || !payment.id
        || payment.order_id !== order.provider_order_id
      ));
      if (!hasUnresolvedPayment) {
        const { error: expiryError } = await auth.admin.rpc('expire_stale_provider_payment_order', {
          p_order_id: order.id,
          p_provider_status: provider.status,
          p_has_unresolved_payment: false,
        });
        if (expiryError) return NextResponse.json({ error: 'Unable to release this expired checkout safely.' }, { status: 503 });
      }
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
