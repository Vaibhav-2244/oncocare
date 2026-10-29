import crypto from 'node:crypto';

export type ProviderPayment = {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  captured?: boolean;
};

export function isCapturedPaymentForOrder(
  payment: ProviderPayment,
  order: { id: string; paymentId: string; amountInPaise: number; currency: string },
) {
  return payment.id === order.paymentId
    && payment.order_id === order.id
    && payment.amount === order.amountInPaise
    && payment.currency === order.currency
    && payment.status === 'captured'
    && payment.captured === true;
}

export function verifyPaymentSignature(secret: string, orderId: string, paymentId: string, signature: string) {
  if (!/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest();
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(expected, actual);
}

export function verifyRawBodySignature(secret: string, rawBody: string, signature: string | null) {
  if (!signature || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(expected, actual);
}

export function rupeesToPaise(value: number | string | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const paise = Math.round(parsed * 100);
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}
