import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRazorpayPayment, verifyRazorpaySignature, type PaymentKind } from '@/lib/razorpay';
import { isCapturedPaymentForOrder } from '@/lib/payments/security';

export async function finalizeCapturedPayment(
  admin: SupabaseClient,
  {
    providerOrderId,
    paymentId,
    signature,
    expectedUserId,
    expectedKind,
  }: {
    providerOrderId: string;
    paymentId: string;
    signature?: string;
    expectedUserId?: string;
    expectedKind?: PaymentKind;
  },
) {
  const { data: order, error: orderError } = await admin.from('payment_orders')
    .select('id, user_id, kind, amount_in_paise, currency, status, provider_order_id')
    .eq('provider_order_id', providerOrderId)
    .maybeSingle();
  if (orderError) throw new Error('Unable to load payment order.');
  if (!order) throw new Error('Payment order was not found.');
  if (expectedUserId && order.user_id !== expectedUserId) throw new Error('Payment order does not belong to this user.');
  if (expectedKind && order.kind !== expectedKind) throw new Error('Payment order type does not match the request.');

  if (signature && !verifyRazorpaySignature({ orderId: providerOrderId, paymentId, signature })) {
    throw new Error('Payment signature verification failed.');
  }

  const payment = await fetchRazorpayPayment(paymentId);
  if (!isCapturedPaymentForOrder(payment, {
    id: providerOrderId,
    paymentId,
    amountInPaise: Number(order.amount_in_paise),
    currency: order.currency,
  })) {
    throw new Error('Payment has not been successfully captured.');
  }

  const { data, error } = await admin.rpc('finalize_razorpay_payment', {
    p_provider_order_id: providerOrderId,
    p_provider_payment_id: paymentId,
    p_amount_in_paise: payment.amount,
    p_currency: payment.currency,
  });
  if (error) {
    const { data: latest, error: latestError } = await admin.from('payment_orders')
      .select('id, status, amount_in_paise, currency, provider_order_id')
      .eq('id', order.id)
      .maybeSingle();
    if (latestError) throw new Error('Unable to determine payment recovery state.');
    if (latest && ['cancelled', 'captured_exception'].includes(latest.status)) {
      const { data: exception, error: exceptionError } = await admin.rpc('record_captured_payment_exception', {
        p_provider_order_id: providerOrderId,
        p_provider_payment_id: paymentId,
        p_amount_in_paise: payment.amount,
        p_currency: payment.currency,
      });
      if (exceptionError || !exception) throw new Error('A late payment was captured but could not be recorded for refund review.');
      return exception as { status: string; duplicate?: boolean; order_id: string; refund_id?: string; appointment_id?: string | null };
    }
    throw new Error('Unable to finalize payment in the durable ledger.');
  }
  return data as { status: string; duplicate?: boolean; order_id: string; entitlement_id?: string | null; appointment_id?: string | null };
}
