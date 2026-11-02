import { NextResponse } from 'next/server';
import { authenticatePaymentRequest, isAuthorizedPrelaunchDemoUser } from '@/lib/payments/auth';
import { getPaymentFeatureFlags } from '@/lib/razorpay';

export async function GET(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (auth.unavailable) return NextResponse.json({ error: 'Payment database configuration is missing on the server.' }, { status: 503 });
  const flags = getPaymentFeatureFlags();
  if (!flags.prelaunchDemoEnabled || !flags.demoPaymentsEnabled) {
    return NextResponse.json({ error: 'Pre-launch demo records are unavailable.' }, { status: 403 });
  }
  try {
    if (!(await isAuthorizedPrelaunchDemoUser(auth.user.id))) {
      return NextResponse.json({ error: 'This account is not authorized for pre-launch payment tests.' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Unable to verify pre-launch tester authorization.' }, { status: 500 });
  }

  const { data, error } = await auth.admin.from('prelaunch_demo_bookings')
    .select('id, payment_order_id, kind, provider_label, service_name, requested_date, requested_start_time, requested_end_time, amount_in_paise, payment_mode, status, created_at')
    .eq('patient_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: 'Unable to load your pre-launch demo payment history.' }, { status: 500 });
  return NextResponse.json({ bookings: data ?? [] });
}
