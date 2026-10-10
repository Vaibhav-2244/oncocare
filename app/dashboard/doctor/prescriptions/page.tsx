'use client';

import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import {
  cancelDoctorPrescription,
  ensureDoctorWorkspace,
  listDoctorPatients,
  type DoctorPatient,
} from '@/lib/doctor/api';
import { supabase } from '@/lib/supabase-client';
import { printPrescription } from './print';

type Prescription = {
  id: string;
  doctor_patient_id: string;
  prescription_no: string;
  items: { medicine?: string; dose?: string }[];
  status: string;
  created_at: string;
};

function DoctorPrescriptionsContent() {
  const [rows, setRows] = useState<Prescription[]>([]);
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [medicine, setMedicine] = useState('');
  const [dose, setDose] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        await ensureDoctorWorkspace();
        const [prescriptions, roster] = await Promise.all([
          supabase.from('doctor_prescriptions').select('*').order('created_at', { ascending: false }),
          listDoctorPatients(),
        ]);
        if (prescriptions.error) throw prescriptions.error;
        setRows((prescriptions.data || []) as Prescription[]);
        setPatients(roster.rows);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load prescriptions.');
      }
    })();
  }, []);

  const create = async () => {
    if (!patientId || !medicine.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('doctor_create_prescription', {
        p_patient_id: patientId,
        p_items: [{ medicine: medicine.trim(), dose: dose.trim() }],
      });
      if (rpcError) throw new Error(rpcError.message);
      setRows((current) => [data as Prescription, ...current]);
      setMedicine('');
      setDose('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create prescription.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (row: Prescription) => {
    setCancellingId(row.id);
    setError(null);
    try {
      const updated = await cancelDoctorPrescription(row.id);
      setRows((current) => current.map((item) => item.id === updated.id ? { ...item, status: updated.status } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to discontinue prescription.');
    } finally {
      setCancellingId(null);
    }
  };

  const name = (id: string) => patients.find((patient) => patient.id === id)?.full_name || 'Patient';

  return (
    <div className="space-y-6">
      <div><p className="text-sm font-medium text-teal-700">Clinical records</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Prescriptions</h1><p className="mt-1 text-sm text-slate-500">Create prescriptions for active roster patients. Discontinuations are audited.</p></div>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">Patient<select required value={patientId} onChange={(event) => setPatientId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal"><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} ({patient.patient_code})</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Medicine<input value={medicine} onChange={(event) => setMedicine(event.target.value)} placeholder="Medicine name" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
        <label className="text-sm font-medium text-slate-700">Dose and directions<input value={dose} onChange={(event) => setDose(event.target.value)} placeholder="Dose and directions" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
        <button type="button" disabled={busy || !patientId || !medicine.trim()} onClick={() => void create()} className="self-end rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Creating…' : 'Create prescription'}</button>
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="divide-y divide-slate-100">
          {rows.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-500">No prescriptions yet.</p> : rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <FileText className="h-5 w-5 text-teal-700" />
              <div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{row.prescription_no} · {name(row.doctor_patient_id)}</p><p className="text-sm text-slate-500">{row.items.map((item) => `${item.medicine || 'Medicine'} ${item.dose || ''}`).join(', ')}</p><p className="text-xs text-slate-400">{new Date(row.created_at).toLocaleDateString()}</p></div>
              <button type="button" onClick={() => printPrescription(row, 'Treating doctor', name(row.doctor_patient_id))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Print</button>
              <span className="text-xs font-semibold capitalize text-slate-500">{row.status}</span>
              {row.status === 'active' && <button type="button" disabled={cancellingId === row.id} onClick={() => void cancel(row)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50">{cancellingId === row.id ? 'Saving…' : 'Discontinue'}</button>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function DoctorPrescriptionsPage() {
  return <ProtectedRoute allowedRoles={DOCTOR_ROLES}><DashboardLayout dashboardTitle="Prescriptions"><DoctorPrescriptionsContent /></DashboardLayout></ProtectedRoute>;
}
