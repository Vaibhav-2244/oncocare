'use client';

import { ShieldCheck, ChevronRight } from 'lucide-react';
import type { BplPatient } from '@/lib/bpl-api';
import { ProgressBar } from './progress-bar';

interface PatientListCardProps {
  patient: BplPatient;
  onDonate: (patient: BplPatient) => void;
}

export function PatientListCard({ patient, onDonate }: PatientListCardProps) {
  const remaining = Number(patient.goal_amount) - Number(patient.raised_amount);

  return (
    <div className="flex gap-4 rounded-lg border border-slate-200 bg-white p-4 transition-all hover:shadow-md">
      <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
        <img
          src={patient.image_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=500&q=80'}
          alt={patient.name}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-900">{patient.name}</h3>
          {patient.verified && (
            <ShieldCheck size={14} className="text-teal-600" />
          )}
          {patient.urgent && (
            <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              URGENT
            </span>
          )}
        </div>
        <p className="text-sm text-slate-600">
          {patient.cancer_type} • {patient.stage} • {patient.location}
        </p>
        <ProgressBar raised={Number(patient.raised_amount)} goal={Number(patient.goal_amount)} />
      </div>
      <div className="flex flex-col items-end justify-center gap-2 flex-shrink-0">
        <div className="text-right">
          <strong className="block text-sm text-slate-900">
            ₹{remaining.toLocaleString('en-IN')}
          </strong>
          <small className="text-xs text-slate-500">still needed</small>
        </div>
        <button
          onClick={() => onDonate(patient)}
          className="flex items-center gap-1 rounded-md bg-teal-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
        >
          Donate
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
