import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest, isPlatformPaymentAdmin } from '@/lib/payments/auth';

const reviewSchema = z.object({
  applicationId: z.string().uuid(),
  status: z.enum(['under_review', 'declined']),
  reviewNotes: z.string().trim().max(1000).nullable().optional(),
}).strict().refine((value) => value.status !== 'declined' || Boolean(value.reviewNotes?.trim()), {
  message: 'A review reason is required to decline an insurance application.',
  path: ['reviewNotes'],
});

export async function GET(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (auth.unavailable) return NextResponse.json({ error: 'Payment database configuration is missing on the server.' }, { status: 503 });

  let isAdmin: boolean;
  try {
    isAdmin = await isPlatformPaymentAdmin(auth.user.id);
  } catch {
    return NextResponse.json({ error: 'Unable to verify administrator access.' }, { status: 500 });
  }
  if (isAdmin) {
    const { data, error } = await auth.admin.from('insurance_payment_applications')
      .select('id, user_id, order_id, plan_id, issuance_status, reviewed_by, review_notes, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: 'Unable to load insurance applications.' }, { status: 500 });
    return NextResponse.json({ applications: data ?? [] });
  }

  const { data, error } = await auth.admin.from('insurance_payment_applications')
    .select('id, order_id, plan_id, issuance_status, created_at, updated_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: 'Unable to load your insurance applications.' }, { status: 500 });
  return NextResponse.json({ applications: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (auth.unavailable) return NextResponse.json({ error: 'Payment database configuration is missing on the server.' }, { status: 503 });
  try {
    if (!(await isPlatformPaymentAdmin(auth.user.id))) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  } catch {
    return NextResponse.json({ error: 'Unable to verify administrator access.' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await auth.admin.rpc('review_insurance_payment_application', {
    p_application_id: parsed.data.applicationId,
    p_actor_user_id: auth.user.id,
    p_status: parsed.data.status,
    p_review_notes: parsed.data.reviewNotes ?? null,
  });
  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === '22023' ? 409 : 500;
    return NextResponse.json({ error: status === 500 ? 'Unable to save the insurance review.' : error.message }, { status });
  }
  return NextResponse.json({ application: data });
}
