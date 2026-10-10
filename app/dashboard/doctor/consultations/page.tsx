'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ClipboardPenLine, Plus } from 'lucide-react';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ensureDoctorWorkspace, listDoctorPatients, type DoctorPatient } from '@/lib/doctor/api';
import { supabase } from '@/lib/supabase-client';

type Consultation = {
  id: string;
  doctor_patient_id: string;
  status: 'draft' | 'signed';
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  updated_at: string;
};

type ConsultationDraft = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

const emptyDraft: ConsultationDraft = { subjective: '', objective: '', assessment: '', plan: '' };

function ConsultationsContent() {
  const [rows, setRows] = useState<Consultation[]>([]);
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ConsultationDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      await ensureDoctorWorkspace();
      const [consultations, roster] = await Promise.all([
        supabase.rpc('doctor_list_consultations'),
        listDoctorPatients(),
      ]);
      if (consultations.error) throw new Error(consultations.error.message);
      setRows((consultations.data || []) as Consultation[]);
      setPatients(roster.rows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load consultations.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!patientId) {
      setError('Select a patient in your active roster.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('doctor_save_consultation', {
        p_id: editingId,
        p_patient_id: patientId,
        p_fields: draft,
      });
      if (rpcError) throw new Error(rpcError.message);
      const saved = data as Consultation;
      setRows((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setEditingId(saved.id);
      setDraft({
        subjective: saved.subjective || '',
        objective: saved.objective || '',
        assessment: saved.assessment || '',
        plan: saved.plan || '',
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save consultation.');
    } finally {
      setBusy(false);
    }
  };

  const sign = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('doctor_sign_consultation', { p_id: id });
      if (rpcError) throw new Error(rpcError.message);
      const signed = data as Consultation;
      setRows((current) => current.map((row) => row.id === signed.id ? signed : row));
      if (editingId === signed.id) setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign consultation.');
    } finally {
      setBusy(false);
    }
  };

  const patientName = (id: string) => patients.find((patient) => patient.id === id)?.full_name || 'Patient';
  const beginNew = () => {
    setEditingId(null);
    setPatientId('');
    setDraft(emptyDraft);
    setError(null);
  };

  const editDraft = (row: Consultation) => {
    setEditingId(row.id);
    setPatientId(row.doctor_patient_id);
    setDraft({
      subjective: row.subjective || '',
      objective: row.objective || '',
      assessment: row.assessment || '',
      plan: row.plan || '',
    });
    setError(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-medium text-teal-700">Clinical records</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Consultations</h1><p className="mt-1 text-sm text-slate-500">Draft notes remain editable until signed. Signing records the author and timestamp.</p></div>
        <button type="button" onClick={beginNew} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> New consultation</button>
      </div>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      <form onSubmit={save} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="font-semibold text-slate-900">{editingId ? 'Edit draft' : 'New clinical note'}</h2>
          <p className="mt-1 text-sm text-slate-500">Only active patients in your secured roster can be selected.</p>
        </div>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Patient<select required value={patientId} disabled={Boolean(editingId)} onChange={(event) => setPatientId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal disabled:bg-slate-50"><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} ({patient.patient_code})</option>)}</select></label>
        {([
          ['subjective', 'Subjective'],
          ['objective', 'Objective'],
          ['assessment', 'Assessment'],
          ['plan', 'Plan'],
        ] as const).map(([field, label]) => (
          <label key={field} className="text-sm font-medium text-slate-700">{label}<textarea rows={3} value={draft[field]} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
        ))}
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" disabled={busy || !patientId} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save draft'}</button>
          {editingId && <button type="button" disabled={busy} onClick={() => void sign(editingId)} className="rounded-lg border border-teal-200 px-4 py-2 text-sm font-semibold text-teal-800 disabled:opacity-50">Sign consultation</button>}
        </div>
      </form>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="divide-y divide-slate-100">
          {rows.length === 0 ? <p className="px-5 py-12 text-center text-sm text-slate-500">No consultations recorded yet.</p> : rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><ClipboardPenLine className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{patientName(row.doctor_patient_id)}</p><p className="text-sm text-slate-500">{row.assessment || 'No assessment entered'} · Updated {new Date(row.updated_at).toLocaleDateString()}</p></div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${row.status === 'signed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{row.status}</span>
              {row.status === 'draft' && <button type="button" onClick={() => editDraft(row)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">Edit draft</button>}
              {row.status === 'draft' && <button type="button" disabled={busy} onClick={() => void sign(row.id)} className="rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-800 disabled:opacity-50">Sign</button>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function DoctorConsultationsPage() {
  return <ProtectedRoute allowedRoles={DOCTOR_ROLES}><DashboardLayout dashboardTitle="Consultations"><ConsultationsContent /></DashboardLayout></ProtectedRoute>;
}
