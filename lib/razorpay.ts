import 'server-only';

import { verifyPaymentSignature, verifyRawBodySignature } from '@/lib/payments/security';
import { resolveRazorpayMode } from '@/lib/payments/razorpay-mode';
import { PRELAUNCH_PILOT_MERCHANT_LABEL } from '@/lib/payments/constants';

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
  const livePaymentsEnabled = enabledFlag(process.env.LIVE_PAYMENTS_ENABLED);
  const { mode, modeValid, inferred: modeInferred } = resolveRazorpayMode({
    configuredMode: process.env.RAZORPAY_MODE,
    livePaymentsEnabled,
    keyId,
  });
  const keyModeValid = Boolean(keyId?.startsWith(`rzp_${mode}_`));
  const marketplaceTransfersRequested = enabledFlag(process.env.MARKETPLACE_TRANSFERS_ENABLED);
  const teleOncologyProviderFlagRequested = enabledFlag(process.env.TELE_ONCOLOGY_CALL_PROVIDER_ENABLED);
  const teleOncologyCallProviderEnabled = false;
  const donationsEnabledByFlag = enabledFlag(process.env.PATIENT_DONATIONS_ENABLED);
  const prelaunchDemoEnabled = enabledFlag(process.env.PRELAUNCH_DEMO_MODE);
  const demoPaymentsEnabled = enabledFlag(process.env.DEMO_PAYMENTS_ENABLED);
  const liveDemoCollectionEnabled = enabledFlag(process.env.PRELAUNCH_LIVE_DEMO_COLLECTION_ENABLED);
  const liveDemoPaymentsEnabled = mode === 'live'
    && livePaymentsEnabled
    && prelaunchDemoEnabled
    && demoPaymentsEnabled
    && liveDemoCollectionEnabled;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;

  return {
    mode,
    modeValid,
    modeInferred,
    keyModeValid,
    paymentsEnabled: enabledFlag(process.env.PAYMENTS_ENABLED),
    livePaymentsEnabled,
    prelaunchDemoEnabled,
    demoPaymentsEnabled,
    liveDemoCollectionEnabled,
    liveDemoPaymentsEnabled,
    marketplaceTransfersEnabled: false,
    marketplaceTransfersRequested,
    patientDonationsEnabled: donationsEnabledByFlag,
    donationsEnabledByFlag,
    teleOncologyCallProviderEnabled,
    teleOncologyProviderFlagRequested,
    keyId,
    keySecret,
    webhookSecret,
    supabaseUrlConfigured: Boolean(supabaseUrl),
    supabaseAnonKeyConfigured: Boolean(supabaseAnonKey),
    supabaseServiceRoleConfigured: Boolean(supabaseServiceRoleKey),
    enabled: enabledFlag(process.env.PAYMENTS_ENABLED)
      && modeValid
      && keyModeValid
      && Boolean(keyId && keySecret && webhookSecret && supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey)
      && (mode !== 'live' || livePaymentsEnabled),
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
    !config.modeValid && 'RAZORPAY_MODE (must be exactly test or live)',
    !config.keyId && 'RAZORPAY_KEY_ID',
    !config.keySecret && 'RAZORPAY_KEY_SECRET',
    Boolean(config.modeValid && config.keyId && !config.keyModeValid) && `RAZORPAY_KEY_ID (must use the rzp_${config.mode}_ prefix)`,
    !config.webhookSecret && 'RAZORPAY_WEBHOOK_SECRET',
    config.mode === 'live' && !config.livePaymentsEnabled && 'LIVE_PAYMENTS_ENABLED',
    !config.supabaseUrlConfigured && 'NEXT_PUBLIC_SUPABASE_URL',
    !config.supabaseAnonKeyConfigured && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    !config.supabaseServiceRoleConfigured && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter((variable): variable is string => Boolean(variable));
  const prelaunchDemoMissingVariables = [
    ...missingConfiguration,
    !config.prelaunchDemoEnabled && 'PRELAUNCH_DEMO_MODE',
    !config.demoPaymentsEnabled && 'DEMO_PAYMENTS_ENABLED',
    config.mode === 'live' && !config.liveDemoCollectionEnabled && 'PRELAUNCH_LIVE_DEMO_COLLECTION_ENABLED',
  ].filter((variable): variable is string => Boolean(variable));
  const configurationError = missingConfiguration.length
    ? `Online payments are unavailable. Configure or enable: ${missingConfiguration.join(', ')}.`
    : null;
  const prelaunchDemoConfigurationError = prelaunchDemoMissingVariables.length
    ? `Pre-launch checkout is unavailable. Configure or enable: ${[...new Set(prelaunchDemoMissingVariables)].join(', ')}.`
    : null;
  return {
    enabled: config.enabled,
    mode: config.mode,
    modeValid: config.modeValid,
    modeInferred: config.modeInferred,
    keyModeValid: config.keyModeValid,
    prelaunchDemoEnabled: config.prelaunchDemoEnabled,
    demoPaymentsEnabled: config.demoPaymentsEnabled && config.prelaunchDemoEnabled,
    liveDemoCollectionEnabled: config.liveDemoCollectionEnabled,
    liveDemoPaymentsEnabled: config.liveDemoPaymentsEnabled,
    prelaunchPilotMerchantLabel: PRELAUNCH_PILOT_MERCHANT_LABEL,
    paymentsEnabled: config.paymentsEnabled,
    marketplaceTransfersEnabled: config.marketplaceTransfersEnabled,
    marketplaceTransfersRequested: config.marketplaceTransfersRequested,
    patientDonationsEnabled: config.patientDonationsEnabled,
    donationsEnabledByFlag: config.donationsEnabledByFlag,
    teleOncologyCallProviderEnabled: config.teleOncologyCallProviderEnabled,
    teleOncologyProviderFlagRequested: config.teleOncologyProviderFlagRequested,
    configuration: {
      razorpayKeyIdConfigured: Boolean(config.keyId),
      razorpayKeySecretConfigured: Boolean(config.keySecret),
      razorpayWebhookSecretConfigured: Boolean(config.webhookSecret),
      supabaseUrlConfigured: config.supabaseUrlConfigured,
      supabaseAnonKeyConfigured: config.supabaseAnonKeyConfigured,
      supabaseServiceRoleConfigured: config.supabaseServiceRoleConfigured,
      missingVariables: missingConfiguration,
      prelaunchDemoMissingVariables: [...new Set(prelaunchDemoMissingVariables)],
    },
    configurationError,
    prelaunchDemoConfigurationError,
    keyId: config.enabled ? config.keyId : null,
    currency: 'INR',
    teleOncology: {
      oneTimeAmountInPaise: TELE_ONCOLOGY_PRICING.oneTime.amountInPaise,
      monthlyAmountInPaise: TELE_ONCOLOGY_PRICING.monthly.amountInPaise,
      monthlyIncludedCalls: TELE_ONCOLOGY_PRICING.monthly.includedCalls,
    },
  };
}
