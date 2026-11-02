import { NextResponse } from 'next/server';
import { authenticatePaymentRequest, isAuthorizedPrelaunchDemoUser } from '@/lib/payments/auth';
import { getPaymentFeatureFlags } from '@/lib/razorpay';

export async function GET(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return NextResponse.json({ error: 'Sign in to browse the pre-launch demo catalogue.' }, { status: 401 });
  if (auth.unavailable) return NextResponse.json({ error: 'Payment database configuration is missing on the server.' }, { status: 503 });

  const flags = getPaymentFeatureFlags();
  if (!flags.enabled || !flags.prelaunchDemoEnabled || !flags.demoPaymentsEnabled) {
    return NextResponse.json({ error: 'Pre-launch demo checkout is not enabled.' }, { status: 403 });
  }
  try {
    if (!(await isAuthorizedPrelaunchDemoUser(auth.user.id))) {
      return NextResponse.json({ error: 'This account is not authorized for pre-launch payment tests.' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Unable to verify pre-launch tester authorization.' }, { status: 500 });
  }

  const kind = new URL(request.url).searchParams.get('kind');
  const allowedKinds = ['caregiver', 'booking', 'tele-oncology', 'medicine', 'insurance'];
  if (kind && !allowedKinds.includes(kind)) {
    return NextResponse.json({ error: 'Unsupported demo catalogue category.' }, { status: 400 });
  }
  let query = auth.admin.from('prelaunch_demo_catalog')
    .select('id, kind, provider_label, service_name, description, amount_in_paise, pricing_unit, available_weekdays, daily_start_time, daily_end_time')
    .eq('active', true)
    .order('kind')
    .order('service_name');
  if (kind) query = query.eq('kind', kind);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load the pre-launch demo catalogue.' }, { status: 503 });
  return NextResponse.json({
    mode: flags.mode,
    merchantName: flags.mode === 'live' ? process.env.PRELAUNCH_LIVE_MERCHANT_NAME?.trim() || null : null,
    entries: data ?? [],
  });
}
