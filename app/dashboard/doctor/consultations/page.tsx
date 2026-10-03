'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardPenLine } from 'lucide-react';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ensureDoctorWorkspace, listDoctorPatients, type DoctorPatient } from '@/lib/doctor/api';
import { supabase } from '@/lib/supabase-client';

type Consultation = { id: string; doctor_patient_id: string; status: string; assessment: string | null; updated_at: string };

function ConsultationsContent() {
  const [rows, setRows] = useState<Consultation[]>([]);
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      await ensureDoctorWorkspace();
      const [consultations, roster] = await Promise.all([supabase.rpc('doctor_list_consultations'), listDoctorPatients()]);
      if (consultations.error) throw new Error(consultations.error.message);
      setRows((consultations.data || []) as Consultation[]);
      setPatients(roster.rows);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load consultations.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const patientName = (id: string) => patients.find((patient) => patient.id === id)?.full_name || 'Patient';
  return <div className="space-y-6"><div><p className="text-sm font-medium text-teal-700">Clinical records</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Consultations</h1><p className="mt-1 text-sm text-slate-500">Draft notes remain editable until you explicitly sign them.</p></div>{error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="divide-y divide-slate-100">{rows.length === 0 ? <p className="px-5 py-12 text-center text-sm text-slate-500">No consultations recorded yet.</p> : rows.map((row) => <div key={row.id} className="flex items-center gap-4 px-5 py-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><ClipboardPenLine className="h-5 w-5" /></div><div className="flex-1"><p className="font-semibold text-slate-800">{patientName(row.doctor_patient_id)}</p><p className="text-sm text-slate-500">{row.assessment || 'No assessment entered'} · Updated {new Date(row.updated_at).toLocaleDateString()}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${row.status === 'signed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{row.status}</span></div>)}</div></section></div>;
}

export default function DoctorConsultationsPage() { return <ProtectedRoute allowedRoles={DOCTOR_ROLES}><DashboardLayout dashboardTitle="Consultations"><ConsultationsContent /></DashboardLayout></ProtectedRoute>; }
