'use client';

import { ShieldCheck, CheckCircle2 } from 'lucide-react';

interface PatientProfileHeaderProps {
  name: string;
  verified: boolean;
  urgent: boolean;
  cancerType: string;
  stage: string;
  location: string;
}

export function PatientProfileHeader({
  name,
  verified,
  urgent,
  cancerType,
  stage,
  location,
}: PatientProfileHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold text-slate-900">{name}</h1>
        {verified && (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-3 py-1 text-sm font-medium text-teal-700">
            <ShieldCheck size={14} />
            Verified
          </span>
        )}
        {urgent && (
          <span className="inline-block rounded bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">
            URGENT
          </span>
        )}
      </div>
      <p className="text-slate-600">
        {cancerType} • {stage} • {location}
      </p>
    </div>
  );
}

interface VerificationItemProps {
  title: string;
  description: string;
  verified: boolean;
}

export function VerificationItem({ title, description, verified }: VerificationItemProps) {
  return (
    <div className="flex gap-3">
      <CheckCircle2 size={20} className={`flex-shrink-0 ${verified ? 'text-teal-600' : 'text-slate-300'}`} />
      <div>
        <p className="font-medium text-slate-900">{title}</p>
        <p className="text-sm text-slate-600">{verified ? description : 'Verification is pending review.'}</p>
      </div>
    </div>
  );
}

interface InfoBoxProps {
  label: string;
  value: string;
}

export function InfoBox({ label, value }: InfoBoxProps) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase text-slate-600">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}
