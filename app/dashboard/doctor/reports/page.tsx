'use client';

import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ensureDoctorWorkspace, listDoctorPatients, type DoctorPatient } from '@/lib/doctor/api';
import { supabase } from '@/lib/supabase-client';

type Report = { id: string; doctor_patient_id: string; report_type: string; report_date: string; flag: string; summary: string };
function ReportsContent() {
  const [rows, setRows] = useState<Report[]>([]);
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [type, setType] = useState('Clinical note');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void (async () => { try { await ensureDoctorWorkspace(); const [reports, roster] = await Promise.all([supabase.rpc('doctor_list_reports'), listDoctorPatients()]); if (reports.error) throw reports.error; setRows((reports.data || []) as Report[]); setPatients(roster.rows); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load reports.'); } })(); }, []);
  const create = async () => { const { data, error: rpcError } = await supabase.rpc('doctor_add_manual_report', { p_patient_id: patientId, p_type: type, p_date: new Date().toISOString().slice(0, 10), p_flag: 'normal', p_summary: summary }); if (rpcError) setError(rpcError.message); else { setRows((current) => [data as Report, ...current]); setSummary(''); } };
  const name = (id: string) => patients.find((patient) => patient.id === id)?.full_name || 'Patient';
  return <div className="space-y-6"><div><p className="text-sm font-medium text-teal-700">Clinical records</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Reports</h1><p className="mt-1 text-sm text-slate-500">Record clinician-authored findings and review flags.</p></div>{error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}<div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-4"><select value={patientId} onChange={(event) => setPatientId(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">Patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name}</option>)}</select><input value={type} onChange={(event) => setType(event.target.value)} placeholder="Report type" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Summary" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><button type="button" disabled={!patientId || !summary} onClick={() => void create()} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add report</button></div><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="divide-y divide-slate-100">{rows.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-500">No reports yet.</p> : rows.map((row) => <div key={row.id} className="flex items-start gap-4 px-5 py-4"><FlaskConical className="mt-1 h-5 w-5 text-teal-700" /><div className="flex-1"><p className="font-semibold text-slate-800">{row.report_type} · {name(row.doctor_patient_id)}</p><p className="text-sm text-slate-500">{row.summary}</p></div><span className="text-xs font-semibold capitalize text-slate-500">{row.flag}</span></div>)}</div></section></div>;
}
export default function DoctorReportsPage() { return <ProtectedRoute allowedRoles={DOCTOR_ROLES}><DashboardLayout dashboardTitle="Reports"><ReportsContent /></DashboardLayout></ProtectedRoute>; }
