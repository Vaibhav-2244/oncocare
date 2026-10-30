'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { getPublicPaymentAvailability, loadRazorpayCheckout } from '@/lib/razorpay-checkout';

type CheckoutPayload = {
  kind: 'medicine' | 'insurance' | 'booking' | 'caregiver';
  productId?: string;
  quantity?: number;
  pharmacyId?: string;
  deliveryAddress?: string;
  prescriptionId?: string;
  insurancePlanId?: string;
  offerType?: 'one-time' | 'subscription' | 'daily' | 'monthly';
  helperId?: string;
  caregiverId?: string;
  serviceId?: string;
  startDate?: string;
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  patientName?: string;
  location?: string;
  reason?: string;
};

export function PaymentCheckoutButton({
  payload,
  description,
  disabled = false,
  onPaymentComplete,
}: {
  payload: CheckoutPayload;
  description: string;
  disabled?: boolean;
  onPaymentComplete?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [paymentAvailability, setPaymentAvailability] = useState<{ available: boolean; message: string | null } | null>(null);
  const inFlight = useRef(false);
  const paymentFailed = useRef(false);
  const idempotencyKey = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    let active = true;
    void getPublicPaymentAvailability().then((availability) => {
      if (active) setPaymentAvailability(availability);
    });
    return () => { active = false; };
  }, []);

  const start = async () => {
    if (inFlight.current) return;
    if (!paymentAvailability?.available) {
      setStatus(paymentAvailability?.message || 'Payment availability is being checked.');
      return;
    }
    inFlight.current = true;
    const signature = JSON.stringify(payload);
    if (!idempotencyKey.current || idempotencyKey.current.signature !== signature) {
      idempotencyKey.current = { signature, key: crypto.randomUUID() };
    }
    setBusy(true);
    paymentFailed.current = false;
    setStatus('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sign in before starting checkout.');

      const createResponse = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...payload, idempotencyKey: idempotencyKey.current.key }),
      });
      const order = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok) {
        if (order.restartCheckout) idempotencyKey.current = null;
        throw new Error(typeof order.error === 'string' ? order.error : 'Unable to start checkout.');
      }
      if (!Number.isSafeInteger(order.amount) || order.amount <= 0) throw new Error('The server returned an invalid amount.');

      await loadRazorpayCheckout();
      if (!window.Razorpay) throw new Error('Razorpay is unavailable in this browser.');

      const verify = async (paymentId: string, signature: string) => {
        try {
          const response = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ orderId: order.orderId, paymentId, signature, kind: payload.kind }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || result.status !== 'paid') {
            setStatus(typeof result.error === 'string' ? result.error : 'Payment confirmation is pending.');
            return;
          }
          setStatus(payload.kind === 'insurance'
            ? 'Payment confirmed. Your application is pending insurer policy issuance.'
            : 'Payment confirmed.');
          idempotencyKey.current = null;
          onPaymentComplete?.();
        } catch {
          setStatus('Payment confirmation is pending. Reopen this page and check the order status.');
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      };

      const reconcileStatus = async () => {
        if (paymentFailed.current) {
          inFlight.current = false;
          setBusy(false);
          return;
        }
        try {
          const response = await fetch('/api/payments/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ orderId: order.orderId }),
          });
          const result = await response.json().catch(() => ({}));
          if (response.ok && result.order?.status === 'paid') {
            setStatus(payload.kind === 'insurance'
              ? 'Payment confirmed. Your application is pending insurer policy issuance.'
              : 'Payment confirmed.');
            idempotencyKey.current = null;
            onPaymentComplete?.();
          } else if (response.ok && result.order?.status === 'cancelled') {
            setStatus('This checkout expired without a confirmed payment. Start a new checkout to continue.');
            idempotencyKey.current = null;
          } else {
            setStatus('Payment is not confirmed yet. Check this order status again before retrying.');
          }
        } catch {
          setStatus('Payment status is pending. Reopen this page and try again.');
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      };

      const checkout = new window.Razorpay({
        key: order.key,
        amount: order.amount,
        currency: order.currency,
        name: 'OncoCare+',
        description,
        order_id: order.orderId,
        handler: (response: { razorpay_payment_id: string; razorpay_signature: string }) => {
          void verify(response.razorpay_payment_id, response.razorpay_signature);
        },
        modal: {
          ondismiss: () => { void reconcileStatus(); },
        },
      });
      checkout.on('payment.failed', () => {
        paymentFailed.current = true;
        setStatus('Payment failed. You may safely retry checkout.');
        inFlight.current = false;
        setBusy(false);
      });
      checkout.open();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Checkout failed.');
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={() => void start()} disabled={disabled || busy || paymentAvailability?.available !== true} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? 'Waiting for payment' : paymentAvailability === null ? 'Checking payment availability' : paymentAvailability.available ? 'Pay securely' : 'Payment unavailable'}
      </button>
      {paymentAvailability && !paymentAvailability.available && (
        <p role="status" className="mt-2 text-xs text-amber-800">{paymentAvailability.message}</p>
      )}
      {status && <p role="status" className="mt-2 text-xs text-slate-600">{status}</p>}
    </div>
  );
}
