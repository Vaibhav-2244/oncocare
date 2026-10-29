import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest, isPlatformPaymentAdmin } from '@/lib/payments/auth';
import { createRazorpayRefund, fetchRazorpayPaymentRefunds } from '@/lib/razorpay';

const requestSchema = z.object({ refundId: z.string().uuid() }).strict();

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
  const { data, error } = await result.auth.admin.from('payment_refunds')
    .select('id, order_id, amount_in_paise, reason, status, provider_refund_id, created_by, created_at, updated_at')
    .in('status', ['requested', 'approved', 'failed'])
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: 'Unable to load refund requests.' }, { status: 500 });
  return NextResponse.json({ refunds: data ?? [] });
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

  const { data: refund, error: claimError } = await result.auth.admin.rpc('claim_payment_refund', {
    p_refund_id: parsed.data.refundId,
    p_actor_user_id: result.auth.user.id,
  });
  if (claimError || !refund) {
    return NextResponse.json({ error: claimError?.code === 'P0002' ? 'Refund request not found.' : 'Refund is not available for processing.' }, { status: claimError?.code === 'P0002' ? 404 : 409 });
  }

  const { data: order, error: orderError } = await result.auth.admin.from('payment_orders')
    .select('id, provider_payment_id, amount_in_paise, currency')
    .eq('id', refund.order_id)
    .single();
  if (orderError || !order?.provider_payment_id) return NextResponse.json({ error: 'Captured provider payment reference is unavailable.' }, { status: 409 });

  try {
    const refunds = await fetchRazorpayPaymentRefunds(order.provider_payment_id);
    let providerRefund = refunds.items?.find((item) => item.notes?.internalRefundId === refund.id);
    if (providerRefund && (
      providerRefund.payment_id !== order.provider_payment_id
      || providerRefund.amount !== Number(refund.amount_in_paise)
    )) return NextResponse.json({ error: 'Provider refund reference conflicts with the internal request.' }, { status: 409 });
    if (!providerRefund) {
      providerRefund = await createRazorpayRefund({
        paymentId: order.provider_payment_id,
        refundId: refund.id,
        amountInPaise: Number(refund.amount_in_paise),
      });
    }
    if (!providerRefund.id || providerRefund.payment_id !== order.provider_payment_id || providerRefund.amount !== Number(refund.amount_in_paise)) {
      return NextResponse.json({ error: 'Provider returned an unexpected refund reference or amount.' }, { status: 502 });
    }
    const { data: saved, error: saveError } = await result.auth.admin.rpc('finish_payment_refund', {
      p_refund_id: refund.id,
      p_provider_refund_id: providerRefund.id,
      p_provider_status: providerRefund.status ?? 'pending',
      p_failure_reason: providerRefund.status === 'failed' ? 'Provider rejected the refund.' : null,
    });
    if (saveError) return NextResponse.json({ error: 'Provider refund exists but could not be reconciled locally. Retry this action.' }, { status: 503 });
    return NextResponse.json({ refund: saved });
  } catch {
    return NextResponse.json({ error: 'Refund provider response is uncertain. Retry this action to reconcile safely.' }, { status: 502 });
  }
}
