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
import { resolveRazorpayMode } from '../lib/payments/razorpay-mode';
import { normalizePaymentError } from '../lib/payments/error-message';
import {
  homecareDemoCheckoutBlockReason,
  patientDonationBlockReason,
  resolveHomecareOffer,
  validateHomecareOffers,
} from '../lib/payments/homecare-offers';

test('Razorpay mode honors explicit Test and Live configuration', () => {
  assert.deepEqual(resolveRazorpayMode({
    configuredMode: 'test',
    livePaymentsEnabled: false,
    keyId: 'rzp_test_example',
  }), { mode: 'test', modeValid: true, inferred: false });
  assert.deepEqual(resolveRazorpayMode({
    configuredMode: 'live',
    livePaymentsEnabled: true,
    keyId: 'rzp_live_example',
  }), { mode: 'live', modeValid: true, inferred: false });
});

test('Razorpay mode detects Live credentials and never downgrades a Live request to Test', () => {
  assert.deepEqual(resolveRazorpayMode({
    configuredMode: undefined,
    livePaymentsEnabled: true,
    keyId: 'rzp_live_example',
  }), { mode: 'live', modeValid: true, inferred: true });
  assert.deepEqual(resolveRazorpayMode({
    configuredMode: 'test',
    livePaymentsEnabled: true,
    keyId: 'rzp_live_example',
  }), { mode: 'live', modeValid: false, inferred: false });
  assert.deepEqual(resolveRazorpayMode({
    configuredMode: undefined,
    livePaymentsEnabled: false,
    keyId: 'rzp_live_example',
  }), { mode: 'live', modeValid: true, inferred: true });
  assert.deepEqual(resolveRazorpayMode({
    configuredMode: undefined,
    livePaymentsEnabled: true,
    keyId: 'rzp_test_example',
  }), { mode: 'live', modeValid: false, inferred: false });
});

test('Razorpay mode keeps Test defaults and rejects an invalid explicit mode', () => {
  assert.deepEqual(resolveRazorpayMode({
    configuredMode: undefined,
    livePaymentsEnabled: false,
    keyId: 'rzp_test_example',
  }), { mode: 'test', modeValid: true, inferred: true });
  assert.deepEqual(resolveRazorpayMode({
    configuredMode: 'staging',
    livePaymentsEnabled: true,
    keyId: 'rzp_live_example',
  }), { mode: 'live', modeValid: false, inferred: false });
});

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

test('tele-oncology checkout payload uses a string ID and explicit paid-demo consent', () => {
  const request = {
    kind: 'tele-oncology',
    idempotencyKey: '74d084fe-7c5e-42b4-9f18-936e2490c14b',
    plan: 'one-time',
    appointmentDate: '2026-10-29T10:00:00.000Z',
    appointmentTime: '10:00 AM',
    doctorId: '1',
    doctorName: 'Demo Doctor',
    demoDisclosureAccepted: true,
  };
  assert.equal(checkoutSchema.safeParse(request).success, true);
  assert.equal(checkoutSchema.safeParse({ ...request, doctorId: 1 }).success, false);
  assert.equal(checkoutSchema.safeParse({ ...request, demoDisclosureAccepted: false }).success, true);
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

test('caregiver form payload fits server validation and rejects oversized requirements', () => {
  const caregiverRequest = {
    kind: 'caregiver',
    idempotencyKey: '74d084fe-7c5e-42b4-9f18-936e2490c14b',
    caregiverId: '4ba90ded-9954-48b4-9531-370a1327c819',
    serviceId: '8174f754-9f45-43b7-bc58-8f0d7b4a1ef4',
    bookingDate: '2026-10-31',
    startTime: '10:00',
    endTime: '11:00',
    location: 'Bengaluru',
    reason: `${'a'.repeat(249)}\n${'b'.repeat(249)}`,
    demoDisclosureAccepted: true,
  };
  assert.equal(checkoutSchema.safeParse(caregiverRequest).success, true);
  assert.equal(checkoutSchema.safeParse({ ...caregiverRequest, reason: `${'a'.repeat(500)}x` }).success, false);
});

test('payment error normalization extracts useful validation messages and redacts keys', () => {
  assert.equal(normalizePaymentError(new Error('Checkout failed')), 'Checkout failed');
  assert.equal(normalizePaymentError({ error: { message: 'Payment rejected' } }), 'Payment rejected');
  assert.equal(normalizePaymentError({
    fieldErrors: { caregiverId: ['Invalid uuid'] },
    formErrors: [],
  }), 'caregiverId: Invalid uuid');
  assert.equal(normalizePaymentError('Invalid key rzp_live_example123'), 'Invalid key [redacted]');
  assert.equal(normalizePaymentError({ code: 'unknown' }), 'Payment could not be completed. Please try again.');
});

test('BPL donation checkout requires a verified campaign and donor data', () => {
  const base = {
    kind: 'donation',
    idempotencyKey: '74d084fe-7c5e-42b4-9f18-936e2490c14b',
    donationAmountInPaise: 10000,
  };
  assert.equal(checkoutSchema.safeParse({
    ...base,
    bplPatientId: 42,
    donorName: 'Example Donor',
    donorEmail: 'donor@example.com',
  }).success, true);
  assert.equal(checkoutSchema.safeParse(base).success, false);
  assert.equal(checkoutSchema.safeParse({
    ...base,
    demoDisclosureAccepted: true,
  }).success, false);
  assert.equal(checkoutSchema.safeParse({
    kind: 'medicine',
    idempotencyKey: '74d084fe-7c5e-42b4-9f18-936e2490c14b',
    demoCatalogId: '4ba90ded-9954-48b4-9531-370a1327c819',
    demoDisclosureAccepted: true,
  }).success, false);
  assert.equal(checkoutSchema.safeParse({
    ...base,
    bplPatientId: 42,
    donorName: 'Example Donor',
    donorEmail: 'not-an-email',
  }).success, false);
});

test('general contributions remain separate from patient-campaign approval gates', () => {
  const generalContribution = {
    kind: 'donation',
    idempotencyKey: '74d084fe-7c5e-42b4-9f18-936e2490c14b',
    donationType: 'general-contribution',
    donationAmountInPaise: 10000,
    donorName: 'Example Donor',
    donorEmail: 'donor@example.com',
  };
  assert.equal(checkoutSchema.safeParse(generalContribution).success, true);
  assert.equal(checkoutSchema.safeParse({ ...generalContribution, bplPatientId: 42 }).success, false);
  assert.match(patientDonationBlockReason({
    donationsEnabled: false,
    campaignExists: true,
    campaignVerified: true,
    bplStatusVerified: true,
    medicalDocumentsVerified: true,
    beneficiaryAccountVerified: true,
  }) ?? '', /PATIENT_DONATIONS_ENABLED is false/);
  assert.equal(patientDonationBlockReason({
    donationsEnabled: false,
    campaignExists: true,
    campaignVerified: true,
    bplStatusVerified: false,
    medicalDocumentsVerified: true,
    beneficiaryAccountVerified: true,
  }), 'Patient donations require completed BPL status verification. Patient-specific donations are disabled because PATIENT_DONATIONS_ENABLED is false. Enable it only after operator and merchant approvals; campaign verification is still required.');
});

test('home-care offers expose only valid daily and one-time monthly prices', () => {
  const result = validateHomecareOffers([
    { id: 'daily-id', offer_type: 'daily', amount_in_paise: '70000', duration_days: null },
    { id: 'monthly-id', offer_type: 'monthly', amount_in_paise: 1500000, duration_days: 30 },
    { id: 'invalid-monthly', offer_type: 'monthly', amount_in_paise: 1500000, duration_days: null },
    { id: 'invalid-daily', offer_type: 'daily', amount_in_paise: 70000, duration_days: 30 },
    { id: 'invalid-amount', offer_type: 'daily', amount_in_paise: 0, duration_days: 1 },
  ]);
  assert.deepEqual(result.offers, [
    { id: 'daily-id', offer_type: 'daily', amount_in_paise: 70000, duration_days: 1 },
    { id: 'monthly-id', offer_type: 'monthly', amount_in_paise: 1500000, duration_days: 30 },
  ]);
  assert.equal(result.unavailableReason, null);
  assert.match(validateHomecareOffers([]).unavailableReason ?? '', /administrator to add and activate/);
  assert.deepEqual(resolveHomecareOffer(
    { id: 'daily-id', offer_type: 'daily', amount_in_paise: '70000', duration_days: null, terms: { description: 'One day approved service' } },
    'daily-id',
    'daily',
  ), { id: 'daily-id', offer_type: 'daily', amount_in_paise: 70000, duration_days: 1, description: 'One day approved service' });
  assert.equal(resolveHomecareOffer(
    { id: 'daily-id', offer_type: 'daily', amount_in_paise: '70000', duration_days: null },
    'monthly-id',
    'daily',
  ), null);
});

test('paid-demo home-care checkout requires operator enablement and consent', () => {
  assert.match(homecareDemoCheckoutBlockReason({
    isDemo: true,
    paidDemoCheckoutsEnabled: true,
    consentAccepted: false,
  }) ?? '', /explicit demo disclosure consent/);
  assert.match(homecareDemoCheckoutBlockReason({
    isDemo: true,
    paidDemoCheckoutsEnabled: false,
    consentAccepted: true,
  }) ?? '', /operator enablement/);
  assert.equal(homecareDemoCheckoutBlockReason({
    isDemo: false,
    paidDemoCheckoutsEnabled: false,
    consentAccepted: false,
  }), null);
});

test('home-care checkout requires a selected server offer ID and excludes client prices', () => {
  const base = {
    kind: 'booking',
    idempotencyKey: '74d084fe-7c5e-42b4-9f18-936e2490c14b',
    helperId: 'demo-helper',
    offerType: 'daily',
    startDate: '2026-10-31',
    patientName: 'Example Patient',
    location: 'Bengaluru',
    demoDisclosureAccepted: true,
  };
  assert.equal(checkoutSchema.safeParse({ ...base, offerId: '4ba90ded-9954-48b4-9531-370a1327c819' }).success, true);
  assert.equal(checkoutSchema.safeParse(base).success, false);
  assert.equal(checkoutSchema.safeParse({
    ...base,
    offerId: '4ba90ded-9954-48b4-9531-370a1327c819',
    amountInPaise: 1,
  }).success, false);
  assert.equal(checkoutSchema.safeParse({
    ...base,
    offerId: '4ba90ded-9954-48b4-9531-370a1327c819',
    demoDisclosureAccepted: false,
  }).success, true);
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
