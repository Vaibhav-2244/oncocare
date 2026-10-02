'use client';

import { PharmacyPrescriptionQueue } from '@/components/pharmacy/PharmacyPrescriptionQueue';

export default function PharmacyPrescriptionsPage() {
  return <div className="space-y-5"><div><h2 className="text-2xl font-semibold text-slate-950">Prescriptions</h2><p className="mt-1 text-sm text-slate-600">Review and verify prescriptions for this pharmacy.</p></div><PharmacyPrescriptionQueue /></div>;
}
