'use client';

import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ensureDoctorWorkspace, listDoctorPatients, type DoctorPatient } from '@/lib/doctor/api';
import { supabase } from '@/lib/supabase-client';

type Plan = { id: string; doctor_patient_id: string; name: string; protocol: string | null; progress_percent: number; status: string };
function TreatmentPlansContent() {
  const [rows, setRows] = useState<Plan[]>([]);
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void (async () => { try { await ensureDoctorWorkspace(); const [plans, roster] = await Promise.all([supabase.from('doctor_treatment_plans').select('id,doctor_patient_id,name,protocol,progress_percent,status').order('updated_at', { ascending: false }), listDoctorPatients()]); if (plans.error) throw plans.error; setRows((plans.data || []) as Plan[]); setPatients(roster.rows); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load treatment plans.'); } })(); }, []);
  const name = (id: string) => patients.find((patient) => patient.id === id)?.full_name || 'Patient';
  return <div className="space-y-6"><div><p className="text-sm font-medium text-teal-700">Care planning</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Treatment plans</h1><p className="mt-1 text-sm text-slate-500">Track protocol progress and review states from one secured view.</p></div>{error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="divide-y divide-slate-100">{rows.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-500">No treatment plans yet.</p> : rows.map((row) => <div key={row.id} className="flex items-center gap-4 px-5 py-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><TrendingUp className="h-5 w-5" /></div><div className="flex-1"><p className="font-semibold text-slate-800">{row.name} · {name(row.doctor_patient_id)}</p><p className="text-sm text-slate-500">{row.protocol || 'Protocol not specified'}</p><div className="mt-2 h-2 max-w-sm overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.min(100, Math.max(0, row.progress_percent))}%` }} /></div></div><span className="text-sm font-semibold text-slate-600">{row.progress_percent}%</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{row.status.replace('_', ' ')}</span></div>)}</div></section></div>;
}
export default function DoctorTreatmentPlansPage() { return <ProtectedRoute allowedRoles={DOCTOR_ROLES}><DashboardLayout dashboardTitle="Treatment plans"><TreatmentPlansContent /></DashboardLayout></ProtectedRoute>; }
