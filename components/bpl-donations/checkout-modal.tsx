'use client';

import { useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import type { BplPatient } from '@/lib/bpl-api';

interface CheckoutModalProps {
  patient: BplPatient;
  amount: number;
  onComplete: (data: {
    donorName: string;
    donorEmail: string;
    paymentMethod: string;
  }) => Promise<void>;
  onClose: () => void;
  error?: string | null;
}

export function CheckoutModal({ patient, amount, onComplete, onClose, error }: CheckoutModalProps) {
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!donorName.trim() || !donorEmail.trim()) return;

    setLoading(true);
    try {
      await onComplete({ donorName, donorEmail, paymentMethod });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-lg bg-white shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
        >
          <X size={20} />
        </button>

        <div className="border-b border-slate-200 p-6">
          <div className="flex gap-4">
            <img
              src={patient.image_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=500&q=80'}
              alt={patient.name}
              className="h-16 w-16 rounded-lg object-cover"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-slate-900">Donate to {patient.name}</h2>
                <ShieldCheck size={16} className="text-teal-600" />
              </div>
              <p className="text-sm text-slate-600">
                {patient.cancer_type} • {patient.location}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-600">Donation Amount</p>
            <p className="mt-2 text-2xl font-bold text-teal-600">
              ₹{amount.toLocaleString('en-IN')}
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-900">Your Name</label>
              <input
                type="text"
                required
                value={donorName}
                onChange={(e) => setDonorName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Enter your full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900">Email Address</label>
              <input
                type="email"
                required
                value={donorEmail}
                onChange={(e) => setDonorEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="upi">UPI</option>
                <option value="card">Debit / Credit Card</option>
                <option value="netbanking">Net Banking</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 rounded-lg bg-teal-50 p-3">
            <ShieldCheck size={18} className="flex-shrink-0 text-teal-600" />
            <p className="text-xs text-teal-700">
              Secure demo checkout. No actual payment will be processed.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || !donorName.trim() || !donorEmail.trim()}
            className="w-full rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white transition-colors disabled:opacity-50 hover:bg-teal-700"
          >
            {loading ? 'Processing...' : 'Complete Donation'}
          </button>
        </form>
      </div>
    </div>
  );
}
