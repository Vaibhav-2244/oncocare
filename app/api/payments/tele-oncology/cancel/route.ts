import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest } from '@/lib/payments/auth';

const requestSchema = z.object({ appointmentId: z.string().uuid() }).strict();

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

  const { data: appointment, error: appointmentError } = await auth.admin.from('appointments')
    .select('id, payment_order_id, type, status')
    .eq('id', parsed.data.appointmentId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (appointmentError) return NextResponse.json({ error: 'Unable to load consultation appointment.' }, { status: 500 });
  if (!appointment || appointment.type !== 'teleconsultation' || !appointment.payment_order_id) {
    return NextResponse.json({ error: 'Paid tele-oncology appointment not found.' }, { status: 404 });
  }

  const { data: order, error: orderError } = await auth.admin.from('payment_orders')
    .select('id, amount_in_paise, status')
    .eq('id', appointment.payment_order_id)
    .eq('user_id', auth.user.id)
    .eq('kind', 'tele-oncology')
    .maybeSingle();
  if (orderError) return NextResponse.json({ error: 'Unable to load consultation payment.' }, { status: 500 });
  if (!order || order.status !== 'paid' || appointment.status !== 'scheduled') {
    return NextResponse.json({ error: 'Only a paid, scheduled consultation can be submitted for cancellation review.' }, { status: 409 });
  }

  const { data: refund, error: refundError } = await auth.admin.rpc('create_payment_refund_request', {
    p_order_id: order.id,
    p_user_id: auth.user.id,
    p_amount_in_paise: Number(order.amount_in_paise),
    p_reason: 'Patient requested tele-oncology appointment cancellation',
    p_idempotency_key: order.id,
  });
  if (refundError || !refund) {
    const status = refundError?.code === '22023' ? 409 : 500;
    return NextResponse.json({ error: status === 409 ? refundError?.message : 'Unable to record consultation cancellation request.' }, { status });
  }
  return NextResponse.json({ refund, message: 'Cancellation and full-refund request submitted for administrator review.' }, { status: 202 });
}
