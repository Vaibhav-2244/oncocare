import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { paymentWebhookSchema, processPaymentWebhook } from '@/lib/payments/webhook';
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

  const { event: eventType, payload: { payment: { entity } } } = parsed.data;
  const providerEventId = request.headers.get('x-razorpay-event-id')
    || `${eventType}:${entity.id}:${entity.order_id}`;
  const admin = createSupabaseAdminClient();

  const { data: claimed, error: claimError } = await admin.rpc('claim_payment_webhook_event', {
    p_provider_event_id: providerEventId,
    p_event_type: eventType,
    p_payload: event,
  });
  if (claimError) return NextResponse.json({ error: 'Unable to record webhook for processing.' }, { status: 503 });
  if (!claimed) return NextResponse.json({ ok: true, duplicate: true });

  try {
    await processPaymentWebhook(admin, eventType, entity);
    const { error: completeError } = await admin.rpc('finish_payment_webhook_event', {
      p_provider_event_id: providerEventId,
      p_error: null,
    });
    if (completeError) throw new Error('Unable to mark the webhook as processed.');
    return NextResponse.json({ ok: true, processed: true });
  } catch {
    console.error('Payment webhook processing failed; inspect payment and provider telemetry.');
    const { error: saveError } = await admin.rpc('finish_payment_webhook_event', {
      p_provider_event_id: providerEventId,
      p_error: 'Webhook processing failed; provider retry or reconciliation is required.',
    });
    if (saveError) return NextResponse.json({ error: 'Webhook processing failed and recovery status could not be saved.' }, { status: 503 });
    return NextResponse.json({ error: 'Webhook processing failed; provider retry is required.' }, { status: 503 });
  }
}
