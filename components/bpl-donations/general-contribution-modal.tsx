'use client';

import { useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { PaymentCheckoutButton } from '@/components/payments/checkout-button';

export function GeneralContributionModal({ onClose, onComplete }: { onClose: () => void; onComplete: () => void }) {
  const [amountRupees, setAmountRupees] = useState('');
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const amount = Number(amountRupees);
  const valid = Number.isSafeInteger(amount) && amount >= 1 && amount <= 100000
    && donorName.trim().length > 0
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <button type="button" onClick={onClose} aria-label="Close general contribution" className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>
        <h2 className="text-xl font-bold text-slate-900">General OncoCare+ contribution</h2>
        <p className="mt-2 text-sm text-slate-600">Funds go to the registered OncoCare+ Razorpay merchant account for general platform support. This is not a donation to a specific patient or campaign.</p>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-slate-900">Amount (₹)
            <input type="number" min="1" max="100000" step="1" value={amountRupees} onChange={(event) => setAmountRupees(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-slate-900">Your name
            <input value={donorName} onChange={(event) => setDonorName(event.target.value)} maxLength={255} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-slate-900">Email address
            <input type="email" value={donorEmail} onChange={(event) => setDonorEmail(event.target.value)} maxLength={255} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <div className="flex gap-3 rounded-lg bg-teal-50 p-3 text-xs text-teal-800"><ShieldCheck size={18} />The money is collected by OncoCare+, not sent directly to a patient or provider.</div>
          <PaymentCheckoutButton
            payload={{
              kind: 'donation',
              donationType: 'general-contribution',
              donationAmountInPaise: valid ? Math.round(amount * 100) : 0,
              donorName: donorName.trim(),
              donorEmail: donorEmail.trim(),
            }}
            description="General OncoCare+ platform contribution"
            disabled={!valid}
            onPaymentComplete={onComplete}
          />
        </div>
      </div>
    </div>
  );
}
