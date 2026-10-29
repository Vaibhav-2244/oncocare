import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest, isPlatformPaymentAdmin } from '@/lib/payments/auth';

const offerSchema = z.object({
  kind: z.enum(['tele-oncology', 'medicine', 'insurance', 'booking']),
  entityId: z.string().min(1).max(100),
  offerType: z.enum(['one-time', 'subscription', 'daily', 'monthly']),
  amountInPaise: z.number().int().positive(),
  durationDays: z.number().int().positive().nullable(),
  includedUsage: z.number().int().positive().nullable(),
  active: z.boolean(),
  validFrom: z.string().datetime().nullable(),
  validUntil: z.string().datetime().nullable(),
  terms: z.record(z.unknown()).default({}),
}).strict();

export async function GET(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (auth.unavailable) return NextResponse.json({ error: 'Payment database configuration is missing on the server.' }, { status: 503 });
  try {
    if (!(await isPlatformPaymentAdmin(auth.user.id))) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  } catch {
    return NextResponse.json({ error: 'Unable to verify administrator access.' }, { status: 500 });
  }
  const { data, error } = await auth.admin.from('payment_offers')
    .select('id, kind, entity_id, offer_type, amount_in_paise, duration_days, included_usage, active, terms, valid_from, valid_until, updated_at')
    .order('kind')
    .order('entity_id');
  if (error) return NextResponse.json({ error: 'Unable to load payment offers.' }, { status: 500 });
  return NextResponse.json({ offers: data ?? [] });
}

export async function PUT(request: Request) {
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
  const parsed = offerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const offer = parsed.data;
  if (offer.kind === 'medicine' && offer.offerType === 'subscription') {
    return NextResponse.json({ error: 'Medicine subscriptions are disabled until recurring billing and fulfillment rules are approved.' }, { status: 409 });
  }
  if (offer.kind === 'insurance' && offer.offerType === 'subscription') {
    return NextResponse.json({ error: 'Insurance subscriptions are disabled until an approved Razorpay subscription plan and billing terms are configured.' }, { status: 409 });
  }
  if (offer.kind === 'booking' && offer.offerType === 'monthly' && !offer.durationDays) {
    return NextResponse.json({ error: 'Monthly home-care bookings require an explicitly configured service duration.' }, { status: 400 });
  }
  if (offer.validFrom && offer.validUntil && offer.validUntil <= offer.validFrom) {
    return NextResponse.json({ error: 'Offer end time must be after its start time.' }, { status: 400 });
  }
  if (offer.kind === 'tele-oncology') {
    const expectedUsage = offer.offerType === 'monthly' ? 35 : offer.offerType === 'one-time' ? 1 : null;
    const expectedDuration = offer.offerType === 'monthly' ? 30 : null;
    if (
      offer.entityId !== 'default'
      || expectedUsage === null
      || offer.includedUsage !== expectedUsage
      || offer.durationDays !== expectedDuration
    ) {
      return NextResponse.json({ error: 'Tele-oncology plan identifiers and consultation quotas are fixed by the approved plan.' }, { status: 400 });
    }
  }

  const { data: saved, error } = await auth.admin.rpc('admin_upsert_payment_offer', {
    p_actor_user_id: auth.user.id,
    p_kind: offer.kind,
    p_entity_id: offer.entityId,
    p_offer_type: offer.offerType,
    p_amount_in_paise: offer.amountInPaise,
    p_duration_days: offer.durationDays,
    p_included_usage: offer.includedUsage,
    p_active: offer.active,
    p_valid_from: offer.validFrom,
    p_valid_until: offer.validUntil,
    p_terms: offer.terms,
  });
  if (error || !saved) return NextResponse.json({ error: 'Unable to save approved payment offer.' }, { status: 500 });
  return NextResponse.json({ offer: saved });
}
