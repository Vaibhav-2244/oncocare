import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticatePaymentRequest, isPlatformPaymentAdmin } from '@/lib/payments/auth';
import { processPaymentWebhook } from '@/lib/payments/webhook';
import { paymentWebhookSchema } from '@/lib/payments/webhook-schema';

const requestSchema = z.object({ providerEventId: z.string().min(1).max(255) }).strict();

export async function POST(request: Request) {
  const auth = await authenticatePaymentRequest(request);
  if (!auth) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (auth.unavailable) return NextResponse.json({ error: 'Payment database configuration is missing on the server.' }, { status: 503 });
  try {
    if (!(await isPlatformPaymentAdmin(auth.user.id))) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  } catch {
    return NextResponse.json({ error: 'Unable to verify administrator access.' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data: stored, error: storedError } = await auth.admin.from('payment_webhook_events')
    .select('provider_event_id, event_type, payload, status')
    .eq('provider_event_id', parsed.data.providerEventId)
    .maybeSingle();
  if (storedError) return NextResponse.json({ error: 'Unable to load the stored webhook event.' }, { status: 500 });
  if (!stored) return NextResponse.json({ error: 'Webhook event not found.' }, { status: 404 });
  if (!['failed', 'processing'].includes(stored.status)) {
    return NextResponse.json({ error: 'Only failed or recoverable processing events can be retried.' }, { status: 409 });
  }

  const parsedEvent = paymentWebhookSchema.safeParse(stored.payload);
  if (!parsedEvent.success || parsedEvent.data.event !== stored.event_type) {
    return NextResponse.json({ error: 'Stored webhook payload is invalid or does not match its event type.' }, { status: 409 });
  }
  const { data: claimed, error: claimError } = await auth.admin.rpc('claim_payment_webhook_event', {
    p_provider_event_id: stored.provider_event_id,
    p_event_type: stored.event_type,
    p_payload: stored.payload,
  });
  if (claimError) return NextResponse.json({ error: 'Unable to claim the webhook retry.' }, { status: 503 });
  if (!claimed) return NextResponse.json({ error: 'This webhook is already being processed or has been completed.' }, { status: 409 });

  try {
    await processPaymentWebhook(auth.admin, parsedEvent.data);
    const { error: finishError } = await auth.admin.rpc('finish_payment_webhook_event', {
      p_provider_event_id: stored.provider_event_id,
      p_error: null,
    });
    if (finishError) throw new Error('Unable to mark the retried webhook as processed.');
    const { error: auditError } = await auth.admin.from('payment_audit_log').insert({
      actor_user_id: auth.user.id,
      action: 'payment.webhook_retried',
      details: { provider_event_id: stored.provider_event_id, event_type: stored.event_type },
    });
    if (auditError) console.error('Unable to write the webhook retry audit entry.');
    return NextResponse.json({ ok: true, processed: true });
  } catch {
    const { error: finishError } = await auth.admin.rpc('finish_payment_webhook_event', {
      p_provider_event_id: stored.provider_event_id,
      p_error: 'Webhook retry failed; provider reconciliation is required.',
    });
    if (finishError) return NextResponse.json({ error: 'Webhook retry failed and recovery status could not be saved.' }, { status: 503 });
    return NextResponse.json({ error: 'Webhook retry failed; provider reconciliation is required.' }, { status: 502 });
  }
}
