import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest } from '@/lib/payments/auth';
import { finalizeCapturedPayment } from '@/lib/payments/provider';

const verifySchema = z.object({
  orderId: z.string().min(1).max(100),
  paymentId: z.string().min(1).max(100),
  signature: z.string().regex(/^[a-f\d]{64}$/i),
  kind: z.enum(['tele-oncology', 'medicine', 'insurance', 'booking', 'caregiver']),
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
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const result = await finalizeCapturedPayment(auth.admin, {
      providerOrderId: parsed.data.orderId,
      paymentId: parsed.data.paymentId,
      signature: parsed.data.signature,
      expectedUserId: auth.user.id,
      expectedKind: parsed.data.kind,
    });
    if (result.status === 'captured_exception') {
      return NextResponse.json({
        ok: false,
        status: result.status,
        error: 'Payment arrived after checkout expired. It is recorded for refund review and no service or goods were released.',
      }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      status: result.status,
      duplicate: result.duplicate ?? false,
      orderId: parsed.data.orderId,
      paymentId: parsed.data.paymentId,
      appointmentId: result.appointment_id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payment verification failed.';
    const status = /not found/i.test(message) ? 404 : /does not belong|type does not match/i.test(message) ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
