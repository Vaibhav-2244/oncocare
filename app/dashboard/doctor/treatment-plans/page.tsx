'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Plus, TrendingUp } from 'lucide-react';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import {
  ensureDoctorWorkspace,
  listDoctorPatients,
  saveDoctorTreatmentPlan,
  type DoctorPatient,
  type DoctorTreatmentPlan,
} from '@/lib/doctor/api';
import { supabase } from '@/lib/supabase-client';

type PlanDraft = {
  name: string;
  protocol: string;
  cycles_total: string;
  cycles_completed: string;
  progress_percent: string;
  status: DoctorTreatmentPlan['status'];
};

const emptyDraft: PlanDraft = {
  name: '',
  protocol: '',
  cycles_total: '',
  cycles_completed: '0',
  progress_percent: '0',
  status: 'active',
};

function DoctorTreatmentPlansContent() {
  const [rows, setRows] = useState<DoctorTreatmentPlan[]>([]);
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        await ensureDoctorWorkspace();
        const [plans, roster] = await Promise.all([
          supabase.from('doctor_treatment_plans')
            .select('id,doctor_patient_id,name,protocol,cycles_total,cycles_completed,progress_percent,status')
            .order('updated_at', { ascending: false }),
          listDoctorPatients(),
        ]);
        if (plans.error) throw plans.error;
        setRows((plans.data || []) as DoctorTreatmentPlan[]);
        setPatients(roster.rows);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load treatment plans.');
      }
    })();
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!patientId) {
      setError('Select a patient in your active roster.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await saveDoctorTreatmentPlan(editingId, patientId, {
        ...draft,
        cycles_total: draft.cycles_total || null,
        cycles_completed: Number(draft.cycles_completed),
        progress_percent: Number(draft.progress_percent),
      });
      setRows((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      setEditingId(saved.id);
      setDraft({
        name: saved.name,
        protocol: saved.protocol || '',
        cycles_total: saved.cycles_total?.toString() || '',
        cycles_completed: saved.cycles_completed.toString(),
        progress_percent: saved.progress_percent.toString(),
        status: saved.status,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save treatment plan.');
    } finally {
      setBusy(false);
    }
  };

  const beginNew = () => {
    setEditingId(null);
    setPatientId('');
    setDraft(emptyDraft);
    setError(null);
  };

  const beginEdit = (plan: DoctorTreatmentPlan) => {
    setEditingId(plan.id);
    setPatientId(plan.doctor_patient_id);
    setDraft({
      name: plan.name,
      protocol: plan.protocol || '',
      cycles_total: plan.cycles_total?.toString() || '',
      cycles_completed: plan.cycles_completed.toString(),
      progress_percent: plan.progress_percent.toString(),
      status: plan.status,
    });
    setError(null);
  };

  const name = (id: string) => patients.find((patient) => patient.id === id)?.full_name || 'Patient';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-medium text-teal-700">Care planning</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Treatment plans</h1><p className="mt-1 text-sm text-slate-500">Create and update plans for patients in your secured roster.</p></div>
        <button type="button" onClick={beginNew} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> New plan</button>
      </div>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      <form onSubmit={save} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3"><h2 className="font-semibold text-slate-900">{editingId ? 'Update treatment plan' : 'Create treatment plan'}</h2></div>
        <label className="text-sm font-medium text-slate-700">Patient<select required disabled={Boolean(editingId)} value={patientId} onChange={(event) => setPatientId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal disabled:bg-slate-50"><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} ({patient.patient_code})</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Plan name<input required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
        <label className="text-sm font-medium text-slate-700">Protocol<input value={draft.protocol} onChange={(event) => setDraft((current) => ({ ...current, protocol: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
        <label className="text-sm font-medium text-slate-700">Total cycles<input type="number" min="1" value={draft.cycles_total} onChange={(event) => setDraft((current) => ({ ...current, cycles_total: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
        <label className="text-sm font-medium text-slate-700">Completed cycles<input type="number" min="0" max={draft.cycles_total || undefined} value={draft.cycles_completed} onChange={(event) => setDraft((current) => ({ ...current, cycles_completed: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
        <label className="text-sm font-medium text-slate-700">Progress %<input type="number" min="0" max="100" step="0.1" value={draft.progress_percent} onChange={(event) => setDraft((current) => ({ ...current, progress_percent: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
        <label className="text-sm font-medium text-slate-700">Status<select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as PlanDraft['status'] }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal"><option value="active">Active</option><option value="review_required">Review required</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3"><button type="submit" disabled={busy || !patientId} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save plan'}</button><button type="button" onClick={beginNew} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Clear</button></div>
      </form>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="divide-y divide-slate-100">
          {rows.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-500">No treatment plans yet.</p> : rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><TrendingUp className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{row.name} · {name(row.doctor_patient_id)}</p><p className="text-sm text-slate-500">{row.protocol || 'Protocol not specified'}{row.cycles_total ? ` · ${row.cycles_completed}/${row.cycles_total} cycles` : ''}</p><div className="mt-2 h-2 max-w-sm overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.min(100, Math.max(0, row.progress_percent))}%` }} /></div></div>
              <span className="text-sm font-semibold text-slate-600">{row.progress_percent}%</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{row.status.replace('_', ' ')}</span><button type="button" onClick={() => beginEdit(row)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">Edit</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function DoctorTreatmentPlansPage() {
  return <ProtectedRoute allowedRoles={DOCTOR_ROLES}><DashboardLayout dashboardTitle="Treatment plans"><DoctorTreatmentPlansContent /></DashboardLayout></ProtectedRoute>;
}
