import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest, isPlatformPaymentAdmin } from '@/lib/payments/auth';

const catalogSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
  kind: z.enum(['caregiver', 'booking', 'tele-oncology', 'medicine', 'insurance']),
  providerLabel: z.string().trim().min(7).max(120).refine((value) => value.startsWith('DEMO:'), 'Provider labels must begin with DEMO:.'),
  serviceName: z.string().trim().min(7).max(120).refine((value) => value.startsWith('DEMO:'), 'Service names must begin with DEMO:.'),
  description: z.string().trim().max(1000).default(''),
  amountInPaise: z.number().int().min(100).max(100000000),
  pricingUnit: z.string().trim().min(1).max(40).default('per demo booking'),
  availableWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([0, 1, 2, 3, 4, 5, 6]),
  dailyStartTime: z.string().regex(/^\d{2}:\d{2}$/).default('00:00'),
  dailyEndTime: z.string().regex(/^\d{2}:\d{2}$/).default('23:59'),
  active: z.boolean().default(true),
}).strict();

async function authorize(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return { response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  if (auth.unavailable) return { response: NextResponse.json({ error: 'Payment database configuration is missing on the server.' }, { status: 503 }) };
  try {
    if (!(await isPlatformPaymentAdmin(auth.user.id))) {
      return { response: NextResponse.json({ error: 'Administrator access required.' }, { status: 403 }) };
    }
  } catch {
    return { response: NextResponse.json({ error: 'Unable to verify administrator access.' }, { status: 500 }) };
  }
  return { auth };
}

export async function GET(request: Request) {
  const result = await authorize(request);
  if (!result.auth) return result.response;
  const { data, error } = await result.auth.admin.from('prelaunch_demo_catalog')
    .select('id, slug, kind, provider_label, service_name, description, amount_in_paise, pricing_unit, available_weekdays, daily_start_time, daily_end_time, active, created_at, updated_at')
    .order('kind')
    .order('service_name');
  if (error) return NextResponse.json({ error: 'Unable to load demo catalogue.' }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
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
  const parsed = catalogSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const entry = parsed.data;
  if (entry.dailyEndTime <= entry.dailyStartTime) {
    return NextResponse.json({ error: 'The demo availability end time must be after its start time.' }, { status: 400 });
  }
  const { data, error } = await result.auth.admin.from('prelaunch_demo_catalog').insert({
    slug: entry.slug,
    kind: entry.kind,
    provider_label: entry.providerLabel,
    service_name: entry.serviceName,
    description: entry.description,
    amount_in_paise: entry.amountInPaise,
    pricing_unit: entry.pricingUnit,
    available_weekdays: entry.availableWeekdays,
    daily_start_time: entry.dailyStartTime,
    daily_end_time: entry.dailyEndTime,
    active: entry.active,
    created_by: result.auth.user.id,
  }).select('id').single();
  if (error) {
    return NextResponse.json(
      { error: error.code === '23505' ? 'A DEMO catalogue entry already uses that slug.' : 'Unable to create the DEMO catalogue entry.' },
      { status: error.code === '23505' ? 409 : 500 },
    );
  }
  if (!data) return NextResponse.json({ error: 'The DEMO catalogue entry was not created.' }, { status: 500 });
  const { error: auditError } = await result.auth.admin.from('payment_audit_log').insert({
    actor_user_id: result.auth.user.id,
    action: 'payment.demo_catalog_created',
    details: { catalogId: data.id, kind: entry.kind, slug: entry.slug, active: entry.active },
  });
  if (auditError) return NextResponse.json({ error: 'Demo item was created but the audit entry failed; review administrator logs.' }, { status: 503 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function PUT(request: Request) {
  const result = await authorize(request);
  if (!result.auth) return result.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const parsed = catalogSchema.safeParse(body);
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json({ error: parsed.success ? 'A catalogue entry ID is required.' : parsed.error.flatten() }, { status: 400 });
  }
  const entry = parsed.data;
  if (entry.dailyEndTime <= entry.dailyStartTime) {
    return NextResponse.json({ error: 'The demo availability end time must be after its start time.' }, { status: 400 });
  }
  const { data, error } = await result.auth.admin.from('prelaunch_demo_catalog').update({
    slug: entry.slug,
    kind: entry.kind,
    provider_label: entry.providerLabel,
    service_name: entry.serviceName,
    description: entry.description,
    amount_in_paise: entry.amountInPaise,
    pricing_unit: entry.pricingUnit,
    available_weekdays: entry.availableWeekdays,
    daily_start_time: entry.dailyStartTime,
    daily_end_time: entry.dailyEndTime,
    active: entry.active,
    updated_at: new Date().toISOString(),
  }).eq('id', entry.id).select('id').maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: error.code === '23505' ? 'A DEMO catalogue entry already uses that slug.' : 'Unable to update the DEMO catalogue entry.' },
      { status: error.code === '23505' ? 409 : 500 },
    );
  }
  if (!data) return NextResponse.json({ error: 'The DEMO catalogue entry was not found.' }, { status: 404 });
  const { error: auditError } = await result.auth.admin.from('payment_audit_log').insert({
    actor_user_id: result.auth.user.id,
    action: 'payment.demo_catalog_updated',
    details: { catalogId: entry.id, kind: entry.kind, slug: entry.slug, active: entry.active },
  });
  if (auditError) return NextResponse.json({ error: 'Demo catalogue updated but the audit entry failed; review administrator logs.' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
