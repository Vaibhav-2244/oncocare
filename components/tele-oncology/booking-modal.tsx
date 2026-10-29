'use client';

import { useState, useEffect, useRef } from "react";
import { X, CheckCircle } from "lucide-react";
import type { Doctor } from "@/lib/data/tele-oncology";
import { doctorAvailability } from "@/lib/data/tele-oncology";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import { useTranslations } from 'next-intl';

interface BookingModalProps {
  doctor: Doctor | null;
  onClose: () => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, callback: (response: Record<string, string>) => void) => void;
    };
  }
}

export function BookingModal({ doctor, onClose }: BookingModalProps) {
  const t = useTranslations('components.teleOncology.bookingModal');
  const { user } = useAuth();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [patientName, setPatientName] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentPlan, setPaymentPlan] = useState<'one-time' | 'monthly'>('one-time');
  const [checkoutConfig, setCheckoutConfig] = useState<{ enabled: boolean; keyId?: string; configurationError?: string | null; teleOncology?: { available: boolean; oneTimeAmountInPaise: number | null; monthlyAmountInPaise: number | null; monthlyIncludedCalls: number | null } } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState(false);
  const requestInFlight = useRef(false);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/payments/config', { cache: 'no-store' });
        if (!response.ok) {
          setCheckoutConfig({ enabled: false });
          return;
        }
        setCheckoutConfig(await response.json());
      } catch {
        setCheckoutConfig({ enabled: false });
      }
    };

    loadConfig();
    setDate("");
    setTime("");
    setPatientName("");
    setPhone("");
    setError("");
    setBooked(false);
    idempotencyKey.current = null;
  }, [doctor]);

  if (!doctor) return null;

  const today = new Date().toISOString().split("T")[0];
  const availableSlots = doctorAvailability[doctor.id]?.[date] || [
    "10:00 AM",
    "11:30 AM",
    "2:00 PM",
    "4:00 PM",
    "6:00 PM",
  ]; // fallback if no specific slots defined
  const selectedAmount = paymentPlan === 'monthly'
    ? checkoutConfig?.teleOncology?.monthlyAmountInPaise
    : checkoutConfig?.teleOncology?.oneTimeAmountInPaise;
  const selectedAmountLabel = selectedAmount == null
    ? '—'
    : (selectedAmount / 100).toLocaleString('en-IN');

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requestInFlight.current) return;
    if (!user) {
      setError('You must be logged in to book an appointment.');
      return;
    }
    if (!patientName.trim()) {
      setError('Please enter the patient\'s name.');
      return;
    }
    if (!phone.trim() || phone.trim().length < 10) {
      setError('Please enter a valid mobile number.');
      return;
    }
    if (!date || !time) {
      setError('Please select both a date and a time.');
      return;
    }

    if (!checkoutConfig?.enabled || !checkoutConfig.keyId) {
      setError(checkoutConfig?.configurationError || 'Razorpay Test Mode is disabled or tele-oncology pricing is not configured.');
      return;
    }

    const timeMatch = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!timeMatch) {
      setError('Please select a valid consultation time.');
      return;
    }
    const hour12 = Number(timeMatch[1]) % 12;
    const appointmentDate = new Date(`${date}T00:00:00`);
    appointmentDate.setHours(hour12 + (timeMatch[3].toUpperCase() === 'PM' ? 12 : 0), Number(timeMatch[2]), 0, 0);
    if (appointmentDate.getTime() <= Date.now()) {
      setError('Choose a future consultation time.');
      return;
    }

    requestInFlight.current = true;
    setSubmitting(true);
    setError('');
    let checkoutOpened = false;

    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) {
        throw new Error('Authentication session is missing.');
      }

      const serverOrderResponse = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          kind: 'tele-oncology',
          plan: paymentPlan,
          idempotencyKey: idempotencyKey.current ?? (idempotencyKey.current = crypto.randomUUID()),
          doctorId: doctor.id,
          doctorName: doctor.name,
          patientName: patientName.trim(),
          patientPhone: phone.trim(),
          appointmentDate: appointmentDate.toISOString(),
          appointmentTime: time,
          reason: `Video Consultation with ${doctor.name} (${doctor.specialty})`,
        }),
      });

      const serverOrderData = await serverOrderResponse.json();
      if (!serverOrderResponse.ok) {
        throw new Error(serverOrderData.error || 'Failed to create a Razorpay order.');
      }

      const razorpayScript = document.createElement('script');
      razorpayScript.src = 'https://checkout.razorpay.com/v1/checkout.js';
      razorpayScript.async = true;
      document.body.appendChild(razorpayScript);

      await new Promise<void>((resolve, reject) => {
        razorpayScript.onload = () => resolve();
        razorpayScript.onerror = () => reject(new Error('The Razorpay checkout script could not be loaded.'));
      });

      if (!window.Razorpay) {
        throw new Error('Razorpay is not available in this browser session.');
      }

      const amountInPaise = Number(serverOrderData.amount);
      if (!Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) {
        throw new Error('The server returned an invalid consultation amount.');
      }
      const paymentHandler = new window.Razorpay({
        key: serverOrderData.key,
        amount: amountInPaise,
        currency: serverOrderData.currency || 'INR',
        name: 'OncoCare+',
        description: `${doctor.name} tele-consultation (${paymentPlan === 'monthly' ? 'Monthly plan' : 'One-time consult'})`,
        order_id: serverOrderData.orderId,
        handler: async (response: Record<string, string>) => {
          const verifyResponse = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              orderId: serverOrderData.orderId,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              kind: 'tele-oncology',
            }),
          }).catch(() => null);

          const verifyPayload = await verifyResponse?.json().catch(() => ({}));
          if (!verifyResponse?.ok || verifyPayload?.status !== 'paid') {
            setError(verifyPayload?.error || 'Payment confirmation is pending. Check payment status before retrying.');
            requestInFlight.current = false;
            setSubmitting(false);
            return;
          }

          setBooked(true);
          requestInFlight.current = false;
          setSubmitting(false);
        },
        theme: { color: '#14b8a6' },
        modal: { ondismiss: () => {
          setError('Payment was cancelled or is still pending. Check payment status before retrying.');
          requestInFlight.current = false;
          setSubmitting(false);
        } },
      });

      paymentHandler.on('payment.failed', (response: Record<string, string>) => {
        setError(response.error_description || 'Payment failed. Please try again.');
        requestInFlight.current = false;
        setSubmitting(false);
      });

      checkoutOpened = true;
      paymentHandler.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start the payment flow.');
    } finally {
      if (!checkoutOpened) {
        requestInFlight.current = false;
        setSubmitting(false);
      }
    }
  };

  if (booked) {
    const formattedDate = new Date(`${date} ${time}`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 text-teal-500">
            <CheckCircle className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">{t('consultationBooked')}</h2>
          <p className="mt-2 text-slate-600">
            {t('yourVideoConsultationWith')}{' '}<strong>{doctor.name}</strong> {t('hasBeenScheduled')}{' '}</p>
          <p className="mt-4 font-semibold text-slate-900">
            {formattedDate} {t('at')}{' '}{time}
          </p>
          <p className="mt-4 text-sm text-slate-500">
            Payment confirms the appointment and entitlement; it does not start a video call.
          </p>
          <Button onClick={onClose} className="mt-8 w-full bg-teal-600 hover:bg-teal-700 text-white">
            {t('done')}{' '}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t('bookVideoConsultation')}</h2>
            <p className="text-sm text-slate-500">{doctor.name}</p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="my-6 rounded-xl bg-teal-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">{t('consultationFee')}</p>
          <p className="mt-1 text-2xl font-bold text-teal-600">
            ₹{selectedAmountLabel}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {paymentPlan === 'monthly'
              ? `${checkoutConfig?.teleOncology?.monthlyIncludedCalls ?? 35} consultations over 30 days. One-time payment; no automatic renewal.`
              : 'One-time access for one consultation'}
          </p>
        </div>

        <div className="mb-4 space-y-3">
          <label className="block text-sm font-semibold text-slate-700">Billing option</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => { idempotencyKey.current = null; setPaymentPlan('one-time'); }}
              className={`rounded-xl border p-3 text-left ${paymentPlan === 'one-time' ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-white'}`}
            >
              <div className="text-sm font-bold text-slate-900">One-time consultation</div>
              <div className="mt-1 text-xs text-slate-600">₹{((checkoutConfig?.teleOncology?.oneTimeAmountInPaise ?? 0) / 100).toLocaleString('en-IN')} · 1 consultation</div>
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => { idempotencyKey.current = null; setPaymentPlan('monthly'); }}
              className={`rounded-xl border p-3 text-left ${paymentPlan === 'monthly' ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-white'}`}
            >
              <div className="text-sm font-bold text-slate-900">Monthly plan</div>
              <div className="mt-1 text-xs text-slate-600">₹{((checkoutConfig?.teleOncology?.monthlyAmountInPaise ?? 0) / 100).toLocaleString('en-IN')} · {checkoutConfig?.teleOncology?.monthlyIncludedCalls ?? 35} consultations / 30 days · no auto-renewal</div>
            </button>
          </div>
        </div>

        {!checkoutConfig?.teleOncology?.available && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800" role="status">
            {checkoutConfig?.configurationError || 'Tele-oncology booking is unavailable until a real consultation provider is configured.'}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleBooking} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">{t('patientName')}</label>
            <input
              type="text"
              value={patientName}
              disabled={submitting}
              onChange={(e) => { idempotencyKey.current = null; setPatientName(e.target.value); }}
              placeholder={t('enterFullName')}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">{t('mobileNumber')}</label>
            <input
              type="tel"
              value={phone}
              disabled={submitting}
              onChange={(e) => { idempotencyKey.current = null; setPhone(e.target.value); }}
              placeholder={t('text10DigitMobileNumber')}
              required
              maxLength={10}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">{t('selectDate')}</label>
            <input
              type="date"
              value={date}
              min={today}
              disabled={submitting}
              onChange={(e) => {
                idempotencyKey.current = null;
                setDate(e.target.value);
                setTime("");
              }}
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">{t('availableTimeSlots')}</label>
            {!date ? (
              <p className="text-sm text-slate-500">{t('selectADateToSeeAvailableConsultationSlots')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {availableSlots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    disabled={submitting}
                    onClick={() => { idempotencyKey.current = null; setTime(slot); }}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      time === slot
                        ? "border-teal-500 bg-teal-50 text-teal-700"
                        : "border-slate-200 text-slate-600 hover:border-teal-300 hover:bg-slate-50"
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            type="submit"
            disabled={submitting || !checkoutConfig?.enabled || selectedAmount == null || !date || !time || !patientName.trim() || !phone.trim()}
            className="mt-6 w-full bg-teal-600 py-6 text-base font-semibold hover:bg-teal-700 text-white disabled:opacity-50"
          >
            {submitting ? t('booking') : t('confirmBooking')}
          </Button>
        </form>
      </div>
    </div>
  );
}
