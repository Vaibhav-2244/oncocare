import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { finalizeCapturedPayment } from '@/lib/payments/provider';
import { fetchRazorpayPayment } from '@/lib/razorpay';

export const paymentWebhookSchema = z.object({
  event: z.enum(['payment.captured', 'payment.failed']),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string().min(1),
        order_id: z.string().min(1),
        status: z.string().optional(),
      }).passthrough(),
    }),
  }),
}).passthrough();

export async function processPaymentWebhook(
  admin: SupabaseClient,
  eventType: 'payment.captured' | 'payment.failed',
  payment: { id: string; order_id: string },
) {
  if (eventType === 'payment.captured') {
    return finalizeCapturedPayment(admin, {
      providerOrderId: payment.order_id,
      paymentId: payment.id,
    });
  }

  const providerPayment = await fetchRazorpayPayment(payment.id);
  if (
    providerPayment.id !== payment.id
    || providerPayment.order_id !== payment.order_id
    || providerPayment.status !== 'failed'
  ) {
    throw new Error('Provider payment state does not match the failure event.');
  }
  const { error } = await admin.rpc('mark_razorpay_payment_failed', {
    p_provider_order_id: payment.order_id,
    p_provider_payment_id: payment.id,
  });
  if (error) throw new Error('Unable to persist payment failure.');
}
