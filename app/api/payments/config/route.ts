import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { serializePublicPaymentConfig } from '@/lib/razorpay';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = serializePublicPaymentConfig();
  let data;
  try {
    const admin = createSupabaseAdminClient();
    const result = await admin.from('payment_offers')
      .select('offer_type, amount_in_paise, duration_days, included_usage')
      .eq('kind', 'tele-oncology')
      .eq('entity_id', 'default')
      .eq('active', true)
      .or(`valid_from.is.null,valid_from.lte.${new Date().toISOString()}`)
      .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`);
    if (result.error) {
      return NextResponse.json({
        ...config,
        configurationError: config.configurationError || 'Payment configuration could not be verified because approved payment data is unavailable.',
        teleOncology: { available: false, unavailableReason: 'Tele-oncology pricing is temporarily unavailable.' },
      }, { status: 503 });
    }
    data = result.data;
  } catch {
    return NextResponse.json({
      ...config,
      configurationError: config.configurationError || 'Payment configuration could not be verified because approved payment data is unavailable.',
      teleOncology: { available: false, unavailableReason: 'Tele-oncology pricing is temporarily unavailable.' },
    }, { status: 503 });
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
  const callProviderEnabled = config.teleOncologyCallProviderEnabled;
  const available = config.enabled && Boolean(valid) && callProviderEnabled;
  return NextResponse.json({
    ...config,
    teleOncology: {
      available,
      unavailableReason: !config.enabled
        ? config.configurationError
        : !valid
          ? 'Tele-oncology pricing requires administrator configuration.'
          : !callProviderEnabled
            ? 'Tele-oncology checkout is unavailable until a real consultation provider is configured.'
            : null,
      oneTimeAmountInPaise: oneTime ? Number(oneTime.amount_in_paise) : null,
      monthlyAmountInPaise: monthly ? Number(monthly.amount_in_paise) : null,
      monthlyIncludedCalls: monthly ? Number(monthly.included_usage) : null,
    },
  });
}
