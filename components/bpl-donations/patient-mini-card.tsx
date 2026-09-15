'use client';

import { ShieldCheck, ChevronRight } from 'lucide-react';
import type { BplPatient } from '@/lib/bpl-api';
import { ProgressBar } from './progress-bar';

interface PatientCardProps {
  patient: BplPatient;
  onDonate: (patient: BplPatient) => void;
}

export function PatientMiniCard({ patient, onDonate }: PatientCardProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md">
      <div className="aspect-square overflow-hidden bg-slate-100">
        <img
          src={patient.image_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=500&q=80'}
          alt={patient.name}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="p-4 space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">{patient.name}</h3>
            {patient.verified && (
              <ShieldCheck size={14} className="text-teal-600" />
            )}
          </div>
          <p className="text-xs text-slate-600">
            {patient.cancer_type} • {patient.location}
          </p>
        </div>
        <ProgressBar raised={Number(patient.raised_amount)} goal={Number(patient.goal_amount)} />
        <button
          onClick={() => onDonate(patient)}
          className="w-full flex items-center justify-center gap-2 rounded-md bg-teal-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
        >
          Donate
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
