'use client';

import { ShieldCheck, UserCog } from 'lucide-react';

export default function CaregiverSettingsPage() {
  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700">
          <UserCog className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-teal-700">Caregiver profile</p>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Verification</p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-medium text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Verified caregiver
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Availability</p>
          <p className="mt-3 text-sm text-slate-600">Available for medication reminders and patient check-ins.</p>
        </div>
      </div>
    </div>
  );
}
