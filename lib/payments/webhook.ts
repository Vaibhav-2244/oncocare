import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { finalizeCapturedPayment } from '@/lib/payments/provider';
import type { PaymentWebhook, RefundWebhookEntity } from '@/lib/payments/webhook-schema';
import {
  fetchRazorpayOrderPayments,
  fetchRazorpayPayment,
  fetchRazorpayPaymentRefunds,
} from '@/lib/razorpay';

async function reconcileCapturedOrder(
  admin: SupabaseClient,
  providerOrderId: string,
) {
  const { data: order, error: orderError } = await admin.from('payment_orders')
    .select('provider_order_id, amount_in_paise, currency')
    .eq('provider_order_id', providerOrderId)
    .maybeSingle();
  if (orderError) throw new Error('Unable to find the internal order for the captured Razorpay order.');
  if (!order) throw new Error('No internal payment order is linked to the paid Razorpay order.');

  const payments = await fetchRazorpayOrderPayments(providerOrderId);
  const capturedPayment = payments.items?.find((payment) => (
    payment.order_id === providerOrderId
    && payment.status === 'captured'
    && payment.captured === true
    && payment.amount === Number(order.amount_in_paise)
    && payment.currency === order.currency
  ));
  if (!capturedPayment?.id) {
    throw new Error('Razorpay has not returned a matching captured payment for the paid order.');
  }
  await finalizeCapturedPayment(admin, {
    providerOrderId,
    paymentId: capturedPayment.id,
  });
}

async function processRefundWebhook(
  admin: SupabaseClient,
  eventType: 'refund.created' | 'refund.processed' | 'refund.failed',
  refundEntity: RefundWebhookEntity,
) {
  const providerRefunds = await fetchRazorpayPaymentRefunds(refundEntity.payment_id);
  const providerRefund = providerRefunds.items?.find((item) => item.id === refundEntity.id);
  if (
    !providerRefund
    || providerRefund.id !== refundEntity.id
    || providerRefund.payment_id !== refundEntity.payment_id
    || providerRefund.amount !== refundEntity.amount
    || !providerRefund.status
  ) {
    throw new Error('Razorpay refund details do not match the signed webhook event.');
  }
  if (eventType === 'refund.processed' && providerRefund.status !== 'processed') {
    throw new Error('Razorpay does not currently report this refund as processed.');
  }
  if (eventType === 'refund.failed' && !['failed', 'processed'].includes(providerRefund.status)) {
    throw new Error('Razorpay does not currently report this refund as failed or processed.');
  }

  const { data: order, error: orderError } = await admin.from('payment_orders')
    .select('id, provider_payment_id')
    .eq('provider_payment_id', refundEntity.payment_id)
    .maybeSingle();
  if (orderError) throw new Error('Unable to find the payment order for this refund.');
  if (!order) throw new Error('No internal payment order is linked to the refunded payment.');

  const eventRefundId = refundEntity.notes?.internalRefundId;
  const currentRefundId = providerRefund.notes?.internalRefundId;
  if (eventRefundId && currentRefundId && eventRefundId !== currentRefundId) {
    throw new Error('Razorpay refund notes do not match the signed webhook event.');
  }
  const noteRefundId = currentRefundId ?? eventRefundId;
  const internalRefundId = typeof noteRefundId === 'string' && z.string().uuid().safeParse(noteRefundId).success
    ? noteRefundId
    : null;
  let refundQuery = admin.from('payment_refunds')
    .select('id, order_id, amount_in_paise, status, provider_refund_id')
    .eq('order_id', order.id);
  if (internalRefundId) {
    refundQuery = refundQuery.eq('id', internalRefundId);
  } else {
    refundQuery = refundQuery.eq('provider_refund_id', refundEntity.id);
  }
  const { data: internalRefund, error: refundError } = await refundQuery.maybeSingle();
  if (refundError) throw new Error('Unable to find the internal refund request for this provider refund.');
  if (
    !internalRefund
    || Number(internalRefund.amount_in_paise) !== refundEntity.amount
    || (internalRefund.provider_refund_id && internalRefund.provider_refund_id !== refundEntity.id)
  ) {
    throw new Error('The Razorpay refund does not match an internal refund request.');
  }
  if (internalRefund.status === 'processed' && providerRefund.status !== 'processed') {
    throw new Error('Razorpay refund status conflicts with the already recorded processed refund.');
  }

  const { error: saveError } = await admin.rpc('finish_payment_refund', {
    p_refund_id: internalRefund.id,
    p_provider_refund_id: providerRefund.id,
    p_provider_status: providerRefund.status,
    p_failure_reason: providerRefund.status === 'failed' ? 'Razorpay reports that the refund failed.' : null,
  });
  if (saveError) throw new Error('Unable to persist the verified Razorpay refund status.');
}

export async function processPaymentWebhook(admin: SupabaseClient, event: PaymentWebhook) {
  if (event.event === 'payment.captured') {
    const { id, order_id: providerOrderId } = event.payload.payment.entity;
    return finalizeCapturedPayment(admin, { providerOrderId, paymentId: id });
  }

  if (event.event === 'payment.failed') {
    const { id, order_id: providerOrderId } = event.payload.payment.entity;
    const providerPayment = await fetchRazorpayPayment(id);
    if (
      providerPayment.id !== id
      || providerPayment.order_id !== providerOrderId
    ) {
      throw new Error('Razorpay payment identity does not match the failure event.');
    }
    if (providerPayment.status === 'captured' && providerPayment.captured === true) {
      return finalizeCapturedPayment(admin, { providerOrderId, paymentId: id });
    }
    if (providerPayment.status !== 'failed') {
      throw new Error('Razorpay payment state is not final; retry after provider reconciliation.');
    }
    const { error } = await admin.rpc('mark_razorpay_payment_failed', {
      p_provider_order_id: providerOrderId,
      p_provider_payment_id: id,
    });
    if (error) throw new Error('Unable to persist the verified payment failure.');
    return;
  }

  if (event.event === 'order.paid') {
    return reconcileCapturedOrder(admin, event.payload.order.entity.id);
  }

  return processRefundWebhook(admin, event.event, event.payload.refund.entity);
}
