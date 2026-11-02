'use client';

import { useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { BPL_PATIENT_PLACEHOLDER, type BplPatient } from '@/lib/bpl-api';
import { PaymentCheckoutButton } from '@/components/payments/checkout-button';

interface CheckoutModalProps {
  patient: BplPatient;
  amount: number;
  onComplete: () => void;
  onClose: () => void;
}

export function CheckoutModal({ patient, amount, onComplete, onClose }: CheckoutModalProps) {
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const patientId = Number(patient.id);
  const donorDetailsValid = donorName.trim().length > 0
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-lg bg-white shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close donation checkout"
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
        >
          <X size={20} />
        </button>

        <div className="border-b border-slate-200 p-6">
          <div className="flex gap-4">
            <img
              src={patient.image_url || BPL_PATIENT_PLACEHOLDER}
              alt={patient.name}
              className="h-16 w-16 rounded-lg object-cover"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-slate-900">Donate to {patient.name}</h2>
                <ShieldCheck size={16} className="text-teal-600" />
              </div>
              <p className="text-sm text-slate-600">{patient.cancer_type} • {patient.location}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-6">
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-600">Donation amount</p>
            <p className="mt-2 text-2xl font-bold text-teal-600">₹{amount.toLocaleString('en-IN')}</p>
          </div>

          <div>
            <label htmlFor="donor-name" className="block text-sm font-medium text-slate-900">Your name</label>
            <input
              id="donor-name"
              type="text"
              required
              maxLength={255}
              value={donorName}
              onChange={(event) => setDonorName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              autoComplete="name"
            />
          </div>

          <div>
            <label htmlFor="donor-email" className="block text-sm font-medium text-slate-900">Email address</label>
            <input
              id="donor-email"
              type="email"
              required
              maxLength={255}
              value={donorEmail}
              onChange={(event) => setDonorEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              autoComplete="email"
            />
          </div>

          <div className="flex gap-3 rounded-lg bg-teal-50 p-3">
            <ShieldCheck size={18} className="flex-shrink-0 text-teal-600" />
            <p className="text-xs text-teal-800">
              Payment is collected by the registered OncoCare+ Razorpay merchant. Funds are disbursed separately after campaign review; this checkout does not pay the beneficiary directly.
            </p>
          </div>

          <PaymentCheckoutButton
            payload={{
              kind: 'donation',
              bplPatientId: patientId,
              donationAmountInPaise: Math.round(amount * 100),
              donorName: donorName.trim(),
              donorEmail: donorEmail.trim(),
            }}
            description={`BPL treatment campaign donation: ${patient.name}`}
            disabled={!donorDetailsValid || !Number.isSafeInteger(patientId) || patientId <= 0}
            onPaymentComplete={onComplete}
          />
        </div>
      </div>
    </div>
  );
}
