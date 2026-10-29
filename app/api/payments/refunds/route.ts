import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest } from '@/lib/payments/auth';

const requestSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().uuid(),
}).strict();

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
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data: order, error: orderError } = await auth.admin.from('payment_orders')
    .select('id, kind, status, amount_in_paise')
    .eq('id', parsed.data.orderId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (orderError) return NextResponse.json({ error: 'Unable to load payment order for refund review.' }, { status: 500 });
  if (!order) return NextResponse.json({ error: 'Payment order not found.' }, { status: 404 });
  if (order.kind === 'medicine') {
    return NextResponse.json({ error: 'Medicine order cancellation must use the pharmacy order workflow.' }, { status: 409 });
  }
  const { data: existingRefunds, error: refundsError } = await auth.admin.from('payment_refunds')
    .select('amount_in_paise')
    .eq('order_id', order.id)
    .in('status', ['requested', 'approved', 'processed']);
  if (refundsError) return NextResponse.json({ error: 'Unable to calculate the remaining refundable balance.' }, { status: 500 });
  const alreadyRefundedOrReserved = (existingRefunds ?? []).reduce((total, refund) => total + Number(refund.amount_in_paise), 0);
  const remainingAmount = Number(order.amount_in_paise) - alreadyRefundedOrReserved;
  if (remainingAmount <= 0) return NextResponse.json({ error: 'No refundable balance remains for this order.' }, { status: 409 });

  const { data, error } = await auth.admin.rpc('create_payment_refund_request', {
    p_order_id: parsed.data.orderId,
    p_user_id: auth.user.id,
    p_amount_in_paise: remainingAmount,
    p_reason: parsed.data.reason,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === '22023' ? 409 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to record refund request.' : error.message }, { status });
  }
  return NextResponse.json({ refund: data }, { status: 202 });
}
