import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { serializePublicPaymentConfig } from '@/lib/razorpay';

export async function GET() {
  const config = serializePublicPaymentConfig();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('payment_offers')
    .select('offer_type, amount_in_paise, duration_days, included_usage')
    .eq('kind', 'tele-oncology')
    .eq('entity_id', 'default')
    .eq('active', true)
    .or(`valid_from.is.null,valid_from.lte.${new Date().toISOString()}`)
    .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`);
  if (error) {
    return NextResponse.json({ ...config, enabled: false, configurationError: 'Payment pricing is temporarily unavailable.' }, { status: 503 });
  }
  const offers = new Map((data ?? []).map((offer) => [offer.offer_type, offer]));
  const oneTime = offers.get('one-time');
  const monthly = offers.get('monthly');
  const valid = oneTime && monthly
    && Number(oneTime.included_usage) === 1
    && Number(monthly.included_usage) === 35
    && oneTime.duration_days === null
    && Number(monthly.duration_days) === 30
    && Number(oneTime.amount_in_paise) > 0
    && Number(monthly.amount_in_paise) > 0;
  const callProviderEnabled = process.env.TELE_ONCOLOGY_CALL_PROVIDER_ENABLED === 'true';
  const available = Boolean(valid) && callProviderEnabled;
  return NextResponse.json({
    ...config,
    enabled: config.enabled && available,
    configurationError: !valid
      ? 'Tele-oncology pricing requires administrator configuration.'
      : callProviderEnabled
        ? null
        : 'Tele-oncology checkout is unavailable until a real consultation provider is configured.',
    teleOncology: {
      available,
      oneTimeAmountInPaise: oneTime ? Number(oneTime.amount_in_paise) : null,
      monthlyAmountInPaise: monthly ? Number(monthly.amount_in_paise) : null,
      monthlyIncludedCalls: monthly ? Number(monthly.included_usage) : null,
    },
  });
}
