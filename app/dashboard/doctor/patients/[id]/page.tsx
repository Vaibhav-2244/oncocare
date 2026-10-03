'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useParams } from 'next/navigation';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ensureDoctorWorkspace, getDoctorPatient, type DoctorPatient } from '@/lib/doctor/api';

function PatientDetailContent() {
  const params = useParams<{ id: string }>();
  const [patient, setPatient] = useState<DoctorPatient | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        await ensureDoctorWorkspace();
        setPatient(await getDoctorPatient(params.id));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load patient.');
      }
    })();
  }, [params.id]);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/doctor/patients" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-700"><ArrowLeft className="h-4 w-4" /> Back to patients</Link>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {patient && <>
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div><p className="text-sm font-medium text-teal-700">{patient.patient_code}</p><h1 className="mt-1 text-3xl font-bold text-slate-900">{patient.full_name}</h1><p className="mt-2 text-sm text-slate-500">{patient.cancer_type || 'Cancer care'}{patient.stage ? ` · ${patient.stage}` : ''}</p></div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${patient.risk === 'high' ? 'bg-rose-50 text-rose-700' : patient.risk === 'moderate' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{patient.risk} risk</span>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-semibold text-slate-900">Clinical overview</h2><dl className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-500">Treatment</dt><dd className="mt-1 font-medium text-slate-800">{patient.current_treatment || 'Not recorded'}</dd></div><div><dt className="text-slate-500">Cycle</dt><dd className="mt-1 font-medium text-slate-800">{patient.cycle_label || 'Not recorded'}</dd></div><div><dt className="text-slate-500">Sex</dt><dd className="mt-1 font-medium capitalize text-slate-800">{patient.sex || 'Not recorded'}</dd></div><div><dt className="text-slate-500">Phone</dt><dd className="mt-1 font-medium text-slate-800">{patient.phone || 'Not recorded'}</dd></div></dl></section>
          <section className="rounded-2xl border border-teal-100 bg-teal-50/60 p-6"><div className="flex items-center gap-2 text-teal-800"><ShieldCheck className="h-5 w-5" /><h2 className="font-semibold">Consent boundary</h2></div><p className="mt-3 text-sm leading-6 text-teal-900/80">Live patient data appears here only after the patient has linked their account and granted the relevant consent scopes. This roster record is authored by you.</p><p className="mt-4 text-xs font-medium uppercase tracking-wide text-teal-700">{patient.patient_user_id ? 'Linked patient' : 'Not linked to an OncoCare account'}</p></section>
        </div>
      </>}
    </div>
  );
}

export default function DoctorPatientDetailPage() {
  return <ProtectedRoute allowedRoles={DOCTOR_ROLES}><DashboardLayout dashboardTitle="Patient detail"><PatientDetailContent /></DashboardLayout></ProtectedRoute>;
}
