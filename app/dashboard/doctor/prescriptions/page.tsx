'use client';

import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ensureDoctorWorkspace, listDoctorPatients, type DoctorPatient } from '@/lib/doctor/api';
import { supabase } from '@/lib/supabase-client';
import { printPrescription } from './print';

type Prescription = { id: string; doctor_patient_id: string; prescription_no: string; items: { medicine?: string; dose?: string }[]; status: string; created_at: string };
function PrescriptionsContent() {
  const [rows, setRows] = useState<Prescription[]>([]);
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [medicine, setMedicine] = useState('');
  const [dose, setDose] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void (async () => { try { await ensureDoctorWorkspace(); const [prescriptions, roster] = await Promise.all([supabase.from('doctor_prescriptions').select('*').order('created_at', { ascending: false }), listDoctorPatients()]); if (prescriptions.error) throw prescriptions.error; setRows((prescriptions.data || []) as Prescription[]); setPatients(roster.rows); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load prescriptions.'); } })(); }, []);
  const create = async () => { const { data, error: rpcError } = await supabase.rpc('doctor_create_prescription', { p_patient_id: patientId, p_items: [{ medicine, dose }] }); if (rpcError) setError(rpcError.message); else { setRows((current) => [data as Prescription, ...current]); setMedicine(''); setDose(''); } };
  const name = (id: string) => patients.find((patient) => patient.id === id)?.full_name || 'Patient';
  return <div className="space-y-6"><div><p className="text-sm font-medium text-teal-700">Clinical records</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Prescriptions</h1><p className="mt-1 text-sm text-slate-500">Create structured multi-item prescriptions linked to a patient record.</p></div>{error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}<div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-4"><select value={patientId} onChange={(event) => setPatientId(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">Patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name}</option>)}</select><input value={medicine} onChange={(event) => setMedicine(event.target.value)} placeholder="Medicine" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input value={dose} onChange={(event) => setDose(event.target.value)} placeholder="Dose and directions" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><button type="button" disabled={!patientId || !medicine} onClick={() => void create()} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Create prescription</button></div><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="divide-y divide-slate-100">{rows.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-500">No prescriptions yet.</p> : rows.map((row) => <div key={row.id} className="flex items-center gap-4 px-5 py-4"><FileText className="h-5 w-5 text-teal-700" /><div className="flex-1"><p className="font-semibold text-slate-800">{row.prescription_no} · {name(row.doctor_patient_id)}</p><p className="text-sm text-slate-500">{row.items.map((item) => `${item.medicine || 'Medicine'} ${item.dose || ''}`).join(', ')}</p></div><button type="button" onClick={() => printPrescription(row, 'Treating doctor', name(row.doctor_patient_id))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Print PDF</button><span className="text-xs font-semibold capitalize text-slate-500">{row.status}</span></div>)}</div></section></div>;
}
export default function DoctorPrescriptionsPage() { return <ProtectedRoute allowedRoles={DOCTOR_ROLES}><DashboardLayout dashboardTitle="Prescriptions"><PrescriptionsContent /></DashboardLayout></ProtectedRoute>; }
