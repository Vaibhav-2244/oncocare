import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { processPaymentWebhook } from '@/lib/payments/webhook';
import { paymentWebhookSchema } from '@/lib/payments/webhook-schema';
import { verifyWebhookSignature } from '@/lib/razorpay';

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature');
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 });
  }
  const parsed = paymentWebhookSchema.safeParse(event);
  if (!parsed.success) return NextResponse.json({ error: 'Unsupported webhook payload.' }, { status: 400 });

  const eventType = parsed.data.event;
  const entityKey = eventType === 'order.paid'
    ? parsed.data.payload.order.entity.id
    : eventType === 'refund.created' || eventType === 'refund.processed' || eventType === 'refund.failed'
      ? `${parsed.data.payload.refund.entity.id}:${parsed.data.payload.refund.entity.payment_id}`
      : `${parsed.data.payload.payment.entity.id}:${parsed.data.payload.payment.entity.order_id}`;
  const providerEventId = request.headers.get('x-razorpay-event-id') || `${eventType}:${entityKey}`;
  const admin = createSupabaseAdminClient();

  const { data: claimed, error: claimError } = await admin.rpc('claim_payment_webhook_event', {
    p_provider_event_id: providerEventId,
    p_event_type: eventType,
    p_payload: event,
  });
  if (claimError) return NextResponse.json({ error: 'Unable to record webhook for processing.' }, { status: 503 });
  if (!claimed) return NextResponse.json({ ok: true, duplicate: true });

  try {
    await processPaymentWebhook(admin, parsed.data);
    const { error: completeError } = await admin.rpc('finish_payment_webhook_event', {
      p_provider_event_id: providerEventId,
      p_error: null,
    });
    if (completeError) throw new Error('Unable to mark the webhook as processed.');
    return NextResponse.json({ ok: true, processed: true });
  } catch (error) {
    let diagnostic = error instanceof Error ? error.message : 'Unknown webhook processing error.';
    for (const secret of [process.env.RAZORPAY_KEY_SECRET, process.env.RAZORPAY_WEBHOOK_SECRET]) {
      if (secret) diagnostic = diagnostic.replaceAll(secret, '[redacted]');
    }
    diagnostic = diagnostic.slice(0, 500);
    console.error('Payment webhook processing failed.', { eventType, providerEventId, diagnostic });
    const { error: saveError } = await admin.rpc('finish_payment_webhook_event', {
      p_provider_event_id: providerEventId,
      p_error: diagnostic,
    });
    if (saveError) return NextResponse.json({ error: 'Webhook processing failed and recovery status could not be saved.' }, { status: 503 });
    return NextResponse.json({ error: 'Webhook processing failed; provider retry is required.' }, { status: 503 });
  }
}
