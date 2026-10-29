import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest, isPlatformPaymentAdmin } from '@/lib/payments/auth';
import { finalizeCapturedPayment } from '@/lib/payments/provider';
import { fetchRazorpayOrderPayments, fetchRazorpayOrderStatus } from '@/lib/razorpay';

const requestSchema = z.object({ orderId: z.string().uuid() }).strict();

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
  const { error: expiryError } = await result.auth.admin.rpc('expire_stale_payment_orders');
  if (expiryError) return NextResponse.json({ error: 'Unable to expire local payment orders.' }, { status: 500 });
  const [orders, events] = await Promise.all([
    result.auth.admin.from('payment_orders')
      .select('id, user_id, kind, status, amount_in_paise, currency, provider_order_id, provider_payment_id, failure_reason, created_at, updated_at')
      .in('status', ['pending', 'authorized', 'failed', 'captured_exception'])
      .order('created_at', { ascending: false })
      .limit(100),
    result.auth.admin.from('payment_webhook_events')
      .select('provider_event_id, event_type, status, attempts, last_error, created_at, last_attempt_at')
      .in('status', ['failed', 'processing'])
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (orders.error || events.error) return NextResponse.json({ error: 'Unable to load payment exceptions.' }, { status: 500 });
  return NextResponse.json({ orders: orders.data ?? [], events: events.data ?? [] });
}

export async function POST(request: Request) {
  const result = await authorize(request);
  if (!result.auth) return result.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data: order, error } = await result.auth.admin.from('payment_orders')
    .select('id, kind, status, amount_in_paise, currency, provider_order_id, user_id')
    .eq('id', parsed.data.orderId)
    .maybeSingle();
  if (error || !order) return NextResponse.json({ error: 'Payment order not found.' }, { status: 404 });
  if (!order.provider_order_id) return NextResponse.json({ error: 'Provider order reference is not available for reconciliation.' }, { status: 409 });

  try {
    const providerOrder = await fetchRazorpayOrderStatus(order.provider_order_id);
    if (
      providerOrder.id !== order.provider_order_id
      || providerOrder.amount !== Number(order.amount_in_paise)
      || providerOrder.currency !== order.currency
    ) {
      return NextResponse.json({ error: 'Provider order does not match the stored order amount, currency, or ID.' }, { status: 409 });
    }
    const { items = [] } = await fetchRazorpayOrderPayments(order.provider_order_id);
    const capturedPayments = items.filter((payment) => payment.status === 'captured' || payment.captured === true);
    const captured = capturedPayments.find((payment) => (
      payment.id && payment.order_id === order.provider_order_id
      && payment.amount === Number(order.amount_in_paise)
      && payment.currency === order.currency
      && payment.status === 'captured'
      && payment.captured === true
    ));
    if (captured?.id) {
      const reconciliation = await finalizeCapturedPayment(result.auth.admin, {
        providerOrderId: order.provider_order_id,
        paymentId: captured.id,
      });
      await result.auth.admin.from('payment_audit_log').insert({
        actor_user_id: result.auth.user.id,
        action: 'payment.reconciled',
        order_id: order.id,
        details: { providerPaymentId: captured.id, status: reconciliation.status },
      });
      return NextResponse.json({ ok: true, status: reconciliation.status, duplicate: reconciliation.duplicate ?? false });
    }
    if (capturedPayments.length > 0) {
      return NextResponse.json({ error: 'A captured provider payment does not match the internal order. It remains held for manual reconciliation.' }, { status: 409 });
    }

    const failedPayments = items.filter((payment) => payment.order_id === order.provider_order_id && payment.status === 'failed');
    const hasUnresolvedPayment = items.some((payment) => (
      payment.status !== 'failed'
      || !payment.id
      || payment.order_id !== order.provider_order_id
    ));
    if (failedPayments.length > 0 && !hasUnresolvedPayment && failedPayments.every((payment) => Boolean(payment.id))) {
      const failed = failedPayments[failedPayments.length - 1];
      const { error: failedError } = await result.auth.admin.rpc('mark_razorpay_payment_failed', {
        p_provider_order_id: order.provider_order_id,
        p_provider_payment_id: failed.id,
      });
      if (failedError) throw new Error('Unable to persist reconciled payment failure.');
      if (providerOrder.status === 'created' || providerOrder.status === 'attempted') {
        const { data: expired, error: expiryError } = await result.auth.admin.rpc('expire_stale_provider_payment_order', {
          p_order_id: order.id,
          p_provider_status: providerOrder.status,
          p_has_unresolved_payment: false,
        });
        if (expiryError) throw new Error('Unable to safely expire the failed provider order.');
        if (expired) return NextResponse.json({ ok: true, status: 'cancelled', expired: true });
      }
      return NextResponse.json({ ok: true, status: 'failed' });
    }
    if ((providerOrder.status === 'created' || providerOrder.status === 'attempted') && !hasUnresolvedPayment) {
      const { data: expired, error: expiryError } = await result.auth.admin.rpc('expire_stale_provider_payment_order', {
        p_order_id: order.id,
        p_provider_status: providerOrder.status,
        p_has_unresolved_payment: hasUnresolvedPayment,
      });
      if (expiryError) throw new Error('Unable to safely expire the reconciled provider order.');
      if (expired) {
        const { error: auditError } = await result.auth.admin.from('payment_audit_log').insert({
          actor_user_id: result.auth.user.id,
          action: 'payment.expired_after_reconciliation',
          order_id: order.id,
          details: { providerOrderStatus: providerOrder.status, providerPayments: items.length },
        });
        if (auditError) console.error('Unable to write the payment reconciliation audit entry.');
        return NextResponse.json({ ok: true, status: 'cancelled', expired: true });
      }
    }
    return NextResponse.json({ ok: true, status: order.status, providerOrderStatus: providerOrder.status, providerPayments: items.length });
  } catch {
    console.error('Payment reconciliation failed. Inspect provider and server telemetry.');
    return NextResponse.json({ error: 'Provider reconciliation failed. Retry after checking provider availability.' }, { status: 502 });
  }
}
