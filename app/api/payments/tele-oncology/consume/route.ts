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

  const { data, error } = await auth.admin.rpc('consume_tele_oncology_call', {
    p_user_id: auth.user.id,
    p_appointment_id: parsed.data.appointmentId,
  });
  if (error) {
    if (error.code === '42501' || error.code === 'P0002') return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: 'Unable to reserve a consultation entitlement.' }, { status: 500 });
  }
  if (!data?.allowed) return NextResponse.json({ error: 'No active consultation entitlement remains.' }, { status: 409 });
  return NextResponse.json({ ok: true, ...data });
}
