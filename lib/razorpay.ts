import 'server-only';

import { verifyPaymentSignature, verifyRawBodySignature } from '@/lib/payments/security';

export const TELE_ONCOLOGY_PRICING = {
  oneTime: { amountInPaise: 50_000, label: '₹500 one-time consultation', includedCalls: 1 },
  monthly: { amountInPaise: 1_500_000, label: '₹15,000 monthly plan', includedCalls: 35 },
} as const;

export type PaymentKind = 'tele-oncology' | 'medicine' | 'insurance' | 'booking' | 'caregiver' | 'donation';
export type TeleOncologyPlan = 'one-time' | 'monthly';

export function getPaymentFeatureFlags() {
  const enabledFlag = (value: string | undefined) => ['true', '1', 'yes'].includes((value ?? '').trim().toLowerCase());
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() || null;
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || null;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null;
  const marketplaceTransfersRequested = enabledFlag(process.env.MARKETPLACE_TRANSFERS_ENABLED);
  const teleOncologyCallProviderEnabled = enabledFlag(process.env.TELE_ONCOLOGY_CALL_PROVIDER_ENABLED);
  const donationsEnabledByFlag = enabledFlag(process.env.PATIENT_DONATIONS_ENABLED);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;

  return {
    paymentsEnabled: enabledFlag(process.env.PAYMENTS_ENABLED),
    marketplaceTransfersEnabled: false,
    marketplaceTransfersRequested,
    patientDonationsEnabled: donationsEnabledByFlag,
    donationsEnabledByFlag,
    teleOncologyCallProviderEnabled,
    keyId,
    keySecret,
    webhookSecret,
    supabaseUrlConfigured: Boolean(supabaseUrl),
    supabaseAnonKeyConfigured: Boolean(supabaseAnonKey),
    supabaseServiceRoleConfigured: Boolean(supabaseServiceRoleKey),
    enabled: enabledFlag(process.env.PAYMENTS_ENABLED)
      && Boolean(keyId && keySecret && supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey),
  };
}

export function getTeleOncologyPrice(plan: TeleOncologyPlan = 'one-time') {
  const value = plan === 'monthly' ? TELE_ONCOLOGY_PRICING.monthly : TELE_ONCOLOGY_PRICING.oneTime;
  return { plan, ...value };
}

export function verifyRazorpaySignature({
  orderId,
  paymentId,
  signature,
}: {
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  const { keySecret } = getPaymentFeatureFlags();
  if (!keySecret) throw new Error('Razorpay secret is not configured.');
  return verifyPaymentSignature(keySecret, orderId, paymentId, signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  const { webhookSecret } = getPaymentFeatureFlags();
  return Boolean(webhookSecret && verifyRawBodySignature(webhookSecret, rawBody, signature));
}

async function razorpayRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { keyId, keySecret, enabled } = getPaymentFeatureFlags();
  if (!enabled || !keyId || !keySecret) throw new Error('Razorpay is disabled or not configured.');

  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Razorpay request failed (${response.status}): ${text.slice(0, 500)}`);
  }
  return response.json() as Promise<T>;
}

export async function createRazorpayOrder({
  amountInPaise,
  receipt,
  notes,
}: {
  amountInPaise: number;
  receipt: string;
  notes?: Record<string, string | number | boolean | undefined>;
}) {
  const result = await razorpayRequest<{
    id?: string;
    amount?: number;
    currency?: string;
    receipt?: string;
    notes?: Record<string, unknown>;
  }>('/orders', {
    method: 'POST',
    body: JSON.stringify({ amount: amountInPaise, currency: 'INR', receipt, notes: notes ?? {} }),
  });
  if (!result.id || result.amount !== amountInPaise || result.currency !== 'INR' || result.receipt !== receipt) {
    throw new Error('Razorpay returned an order with unexpected ID, amount, currency, or receipt.');
  }
  return { id: result.id, amount: result.amount, currency: result.currency, receipt: result.receipt, notes: result.notes ?? {} };
}

export async function findRazorpayOrderByReceipt(receipt: string) {
  try {
    const result = await razorpayRequest<{
      items?: Array<{ id?: string; amount?: number; currency?: string; receipt?: string; notes?: Record<string, unknown> }>;
    }>(`/orders?receipt=${encodeURIComponent(receipt)}`);
    return result.items?.find((order) => order.receipt === receipt) ?? null;
  } catch (error) {
    if (error instanceof Error && error.message.includes('(404)')) return null;
    throw error;
  }
}

export async function fetchRazorpayOrderStatus(providerOrderId: string) {
  return razorpayRequest<{ id?: string; status?: string; amount?: number; currency?: string }>(
    `/orders/${encodeURIComponent(providerOrderId)}`,
  );
}

export async function fetchRazorpayPayment(paymentId: string) {
  return razorpayRequest<{
    id?: string;
    order_id?: string;
    amount?: number;
    currency?: string;
    status?: string;
    captured?: boolean;
  }>(`/payments/${encodeURIComponent(paymentId)}`);
}

export async function fetchRazorpayOrderPayments(providerOrderId: string) {
  return razorpayRequest<{
    items?: Array<{ id?: string; order_id?: string; amount?: number; currency?: string; status?: string; captured?: boolean }>;
  }>(`/orders/${encodeURIComponent(providerOrderId)}/payments`);
}

export async function fetchRazorpayPaymentRefunds(paymentId: string) {
  return razorpayRequest<{
    items?: Array<{ id?: string; payment_id?: string; amount?: number; status?: string; notes?: Record<string, unknown> }>;
  }>(`/payments/${encodeURIComponent(paymentId)}/refunds`);
}

export async function createRazorpayRefund({
  paymentId,
  refundId,
  amountInPaise,
}: {
  paymentId: string;
  refundId: string;
  amountInPaise: number;
}) {
  return razorpayRequest<{ id?: string; payment_id?: string; amount?: number; status?: string; notes?: Record<string, unknown> }>(
    `/payments/${encodeURIComponent(paymentId)}/refund`,
    {
      method: 'POST',
      headers: { 'X-Razorpay-Idempotency-Key': refundId },
      body: JSON.stringify({ amount: amountInPaise, notes: { internalRefundId: refundId } }),
    },
  );
}

export function serializePublicPaymentConfig() {
  const config = getPaymentFeatureFlags();
  const missingConfiguration = [
    !config.paymentsEnabled && 'PAYMENTS_ENABLED',
    !config.keyId && 'RAZORPAY_KEY_ID',
    !config.keySecret && 'RAZORPAY_KEY_SECRET',
    !config.webhookSecret && 'RAZORPAY_WEBHOOK_SECRET',
    !config.supabaseUrlConfigured && 'NEXT_PUBLIC_SUPABASE_URL',
    !config.supabaseAnonKeyConfigured && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    !config.supabaseServiceRoleConfigured && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter((variable): variable is string => Boolean(variable));
  return {
    enabled: config.enabled,
    paymentsEnabled: config.paymentsEnabled,
    marketplaceTransfersEnabled: config.marketplaceTransfersEnabled,
    marketplaceTransfersRequested: config.marketplaceTransfersRequested,
    patientDonationsEnabled: false,
    donationsEnabledByFlag: config.donationsEnabledByFlag,
    teleOncologyCallProviderEnabled: config.teleOncologyCallProviderEnabled,
    configuration: {
      razorpayKeyIdConfigured: Boolean(config.keyId),
      razorpayKeySecretConfigured: Boolean(config.keySecret),
      razorpayWebhookSecretConfigured: Boolean(config.webhookSecret),
      supabaseUrlConfigured: config.supabaseUrlConfigured,
      supabaseAnonKeyConfigured: config.supabaseAnonKeyConfigured,
      supabaseServiceRoleConfigured: config.supabaseServiceRoleConfigured,
      missingVariables: missingConfiguration,
    },
    configurationError: config.enabled
      ? null
      : 'Online payments are unavailable. Configure the required Razorpay variables and enable PAYMENTS_ENABLED.',
    keyId: config.enabled ? config.keyId : null,
    currency: 'INR',
    teleOncology: {
      oneTimeAmountInPaise: TELE_ONCOLOGY_PRICING.oneTime.amountInPaise,
      monthlyAmountInPaise: TELE_ONCOLOGY_PRICING.monthly.amountInPaise,
      monthlyIncludedCalls: TELE_ONCOLOGY_PRICING.monthly.includedCalls,
    },
  };
}
