'use client';

import { CheckCircle2, Download, ChevronRight } from 'lucide-react';
import type { BplDonation } from '@/lib/bpl-api';

interface SuccessModalProps {
  donation: BplDonation & { patientName?: string };
  onClose: () => void;
  onDownloadReceipt: (donation: BplDonation & { patientName?: string }) => void;
  onViewHistory: () => void;
}

export function SuccessModal({
  donation,
  onClose,
  onDownloadReceipt,
  onViewHistory,
}: SuccessModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="border-b border-slate-200 bg-gradient-to-r from-teal-50 to-teal-100 p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-600">
            <CheckCircle2 size={32} className="text-white" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-slate-900">Donation Successful!</h2>
          <p className="mt-2 text-slate-600">Thank you for supporting cancer care.</p>
        </div>

        <div className="space-y-4 p-6">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase text-slate-600">Receipt ID</p>
            <p className="mt-1 font-mono font-semibold text-slate-900">
              {donation.id?.toString().slice(0, 8).toUpperCase()}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-600">Donor</p>
              <p className="mt-1 font-medium text-slate-900">{donation.donor_name}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-600">Amount</p>
              <p className="mt-1 font-medium text-teal-600">
                ₹{Number(donation.amount).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="col-span-2 rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-600">Beneficiary</p>
              <p className="mt-1 font-medium text-slate-900">{donation.patientName}</p>
            </div>
          </div>

          <div className="space-y-2 rounded-lg bg-teal-50 p-4">
            <p className="text-xs font-semibold uppercase text-teal-600">What Happens Next</p>
            <ul className="space-y-2 text-sm text-teal-900">
              <li>✓ Receipt will be sent to your email</li>
              <li>✓ Donation recorded in your history</li>
              <li>✓ Funds designated for patient&apos;s treatment</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => onDownloadReceipt(donation)}
              className="flex items-center justify-center gap-2 rounded-lg border border-teal-600 px-4 py-2 font-semibold text-teal-600 transition-colors hover:bg-teal-50"
            >
              <Download size={16} />
              Download Receipt
            </button>
            <button
              onClick={onViewHistory}
              className="flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-teal-700"
            >
              View Donation History
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-900 transition-colors hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
