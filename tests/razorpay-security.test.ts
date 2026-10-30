import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { checkoutSchema } from '../lib/payments/checkout-schema';
import { paymentWebhookSchema } from '../lib/payments/webhook-schema';
import {
  isCapturedPaymentForOrder,
  rupeesToPaise,
  verifyPaymentSignature,
  verifyRawBodySignature,
} from '../lib/payments/security';

test('checkout rejects client-supplied prices and unknown fields', () => {
  const parsed = checkoutSchema.safeParse({
    kind: 'tele-oncology',
    idempotencyKey: '74d084fe-7c5e-42b4-9f18-936e2490c14b',
    plan: 'one-time',
    amountInPaise: 1,
  });

  assert.equal(parsed.success, false);
});

test('checkout accepts a valid price-free tele-oncology request', () => {
  const parsed = checkoutSchema.safeParse({
    kind: 'tele-oncology',
    idempotencyKey: '74d084fe-7c5e-42b4-9f18-936e2490c14b',
    plan: 'one-time',
    appointmentDate: '2026-10-29T10:00:00.000Z',
    appointmentTime: '10:00 AM',
    doctorName: 'Dr Example',
  });

  assert.equal(parsed.success, true);
});

test('medicine checkout requires delivery details and rejects subscription fulfillment', () => {
  const base = {
    kind: 'medicine',
    idempotencyKey: '74d084fe-7c5e-42b4-9f18-936e2490c14b',
    productId: '4ba90ded-9954-48b4-9531-370a1327c819',
    pharmacyId: '8174f754-9f45-43b7-bc58-8f0d7b4a1ef4',
    quantity: 2,
    deliveryAddress: '10 Example Street, Bengaluru',
  };
  assert.equal(checkoutSchema.safeParse(base).success, true);
  assert.equal(checkoutSchema.safeParse({ ...base, deliveryAddress: undefined }).success, false);
  assert.equal(checkoutSchema.safeParse({ ...base, offerType: 'subscription' }).success, false);
  assert.equal(checkoutSchema.safeParse({ ...base, amountInPaise: 1 }).success, false);
});

test('insurance checkout schema does not accept a recurring charge that is not configured', () => {
  const parsed = checkoutSchema.safeParse({
    kind: 'insurance',
    idempotencyKey: '74d084fe-7c5e-42b4-9f18-936e2490c14b',
    insurancePlanId: '4ba90ded-9954-48b4-9531-370a1327c819',
    offerType: 'subscription',
  });
  assert.equal(parsed.success, false);
});

test('caregiver checkout accepts service details but never a browser-supplied amount', () => {
  const caregiverRequest = {
    kind: 'caregiver',
    idempotencyKey: '74d084fe-7c5e-42b4-9f18-936e2490c14b',
    caregiverId: '4ba90ded-9954-48b4-9531-370a1327c819',
    serviceId: '8174f754-9f45-43b7-bc58-8f0d7b4a1ef4',
    bookingDate: '2026-10-31',
    startTime: '10:00',
    endTime: '11:00',
    location: 'Bengaluru',
  };
  assert.equal(checkoutSchema.safeParse(caregiverRequest).success, true);
  assert.equal(checkoutSchema.safeParse({ ...caregiverRequest, amountInPaise: 1 }).success, false);
  assert.equal(checkoutSchema.safeParse({ ...caregiverRequest, endTime: '09:00' }).success, false);
});

test('webhook schema accepts every configured Razorpay event and rejects mismatched payload shapes', () => {
  const payment = { id: 'pay_1', order_id: 'order_1', status: 'captured' };
  const refund = { id: 'rfnd_1', payment_id: 'pay_1', amount: 100, status: 'processed' };
  const events = [
    { event: 'payment.captured', payload: { payment: { entity: payment } } },
    { event: 'payment.failed', payload: { payment: { entity: payment } } },
    { event: 'order.paid', payload: { order: { entity: { id: 'order_1', status: 'paid' } } } },
    { event: 'refund.created', payload: { refund: { entity: refund } } },
    { event: 'refund.processed', payload: { refund: { entity: refund } } },
    { event: 'refund.failed', payload: { refund: { entity: refund } } },
  ];
  events.forEach((event) => assert.equal(paymentWebhookSchema.safeParse(event).success, true, event.event));
  assert.equal(paymentWebhookSchema.safeParse({
    event: 'refund.processed',
    payload: { payment: { entity: payment } },
  }).success, false);
});

test('Razorpay payment signature accepts exact order/payment pair and rejects tampering', () => {
  const secret = 'test_secret_123';
  const orderId = 'order_test_123';
  const paymentId = 'pay_test_456';
  const signature = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

  assert.equal(verifyPaymentSignature(secret, orderId, paymentId, signature), true);
  assert.equal(verifyPaymentSignature(secret, orderId, paymentId, `${signature.slice(0, -1)}0`), false);
  assert.equal(verifyPaymentSignature(secret, orderId, paymentId, 'not-a-signature'), false);
});

test('webhook signature validates the raw body and rejects a modified body', () => {
  const secret = 'test_webhook_secret';
  const rawBody = '{"event":"payment.captured","id":"evt_1"}';
  const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  assert.equal(verifyRawBodySignature(secret, rawBody, signature), true);
  assert.equal(verifyRawBodySignature(secret, `${rawBody} `, signature), false);
  assert.equal(verifyRawBodySignature(secret, rawBody, null), false);
});

test('captured payment must match requested payment, Razorpay order, amount, and currency', () => {
  const order = { id: 'order_1', paymentId: 'pay_1', amountInPaise: 50_000, currency: 'INR' };
  const payment = {
    id: 'pay_1',
    order_id: 'order_1',
    amount: 50_000,
    currency: 'INR',
    status: 'captured',
    captured: true,
  };

  assert.equal(isCapturedPaymentForOrder(payment, order), true);
  assert.equal(isCapturedPaymentForOrder({ ...payment, id: 'pay_other' }, order), false);
  assert.equal(isCapturedPaymentForOrder({ ...payment, order_id: 'order_other' }, order), false);
  assert.equal(isCapturedPaymentForOrder({ ...payment, amount: 1 }, order), false);
  assert.equal(isCapturedPaymentForOrder({ ...payment, currency: 'USD' }, order), false);
  assert.equal(isCapturedPaymentForOrder({ ...payment, status: 'authorized' }, order), false);
  assert.equal(isCapturedPaymentForOrder({ ...payment, captured: false }, order), false);
});

test('rupee conversion rejects non-positive, non-finite, and unsafe amounts', () => {
  assert.equal(rupeesToPaise(500), 50_000);
  assert.equal(rupeesToPaise('7.25'), 725);
  assert.equal(rupeesToPaise(0), null);
  assert.equal(rupeesToPaise(-1), null);
  assert.equal(rupeesToPaise(Number.POSITIVE_INFINITY), null);
  assert.equal(rupeesToPaise(Number.MAX_SAFE_INTEGER), null);
});
