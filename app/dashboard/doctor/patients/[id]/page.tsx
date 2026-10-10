'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useParams } from 'next/navigation';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import {
  ensureDoctorWorkspace,
  getDoctorPatient,
  loadDoctorPatientLiveData,
  setDoctorPatientStatus,
  updateDoctorPatient,
  type DoctorPatientLiveData,
  type DoctorPatient,
} from '@/lib/doctor/api';

type PatientDraft = {
  full_name: string;
  date_of_birth: string;
  sex: string;
  phone: string;
  cancer_type: string;
  stage: string;
  current_treatment: string;
  cycle_label: string;
  risk_level: DoctorPatient['risk'];
};

function PatientDetailContent() {
  const params = useParams<{ id: string }>();
  const [patient, setPatient] = useState<DoctorPatient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingLiveData, setLoadingLiveData] = useState(false);
  const [liveData, setLiveData] = useState<DoctorPatientLiveData | null>(null);
  const [draft, setDraft] = useState<PatientDraft>({
    full_name: '',
    date_of_birth: '',
    sex: '',
    phone: '',
    cancer_type: '',
    stage: '',
    current_treatment: '',
    cycle_label: '',
    risk_level: 'low',
  });

  useEffect(() => {
    void (async () => {
      try {
        await ensureDoctorWorkspace();
        const loadedPatient = await getDoctorPatient(params.id);
        setPatient(loadedPatient);
        setDraft({
          full_name: loadedPatient.full_name,
          date_of_birth: loadedPatient.date_of_birth || '',
          sex: loadedPatient.sex || '',
          phone: loadedPatient.phone || '',
          cancer_type: loadedPatient.cancer_type || '',
          stage: loadedPatient.stage || '',
          current_treatment: loadedPatient.current_treatment || '',
          cycle_label: loadedPatient.cycle_label || '',
          risk_level: loadedPatient.risk,
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load patient.');
      }
    })();
  }, [params.id]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateDoctorPatient(params.id, { ...draft, risk_level: draft.risk_level });
      setPatient(updated);
      setEditing(false);
      setMessage('Patient record updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update patient.');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async () => {
    if (!patient) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await setDoctorPatientStatus(
        patient.id,
        patient.status === 'active' ? 'archived' : 'active',
      );
      setPatient(updated);
      setMessage(updated.status === 'archived' ? 'Patient archived.' : 'Patient restored to the active roster.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to change patient status.');
    } finally {
      setBusy(false);
    }
  };

  const loadLiveData = async () => {
    if (!patient) return;
    setLoadingLiveData(true);
    setError(null);
    try {
      setLiveData(await loadDoctorPatientLiveData(patient.id));
    } catch (cause) {
      setLiveData(null);
      setError(cause instanceof Error ? cause.message : 'Unable to load consented patient data.');
    } finally {
      setLoadingLiveData(false);
    }
  };

  const readableValues = (record: Record<string, unknown>) => Object.entries(record)
    .filter(([key, value]) => !['id', 'user_id'].includes(key) && ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => `${key.replaceAll('_', ' ')}: ${String(value)}`);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/doctor/patients" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-700"><ArrowLeft className="h-4 w-4" /> Back to patients</Link>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div>}
      {patient && <>
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div><p className="text-sm font-medium text-teal-700">{patient.patient_code}</p><h1 className="mt-1 text-3xl font-bold text-slate-900">{patient.full_name}</h1><p className="mt-2 text-sm text-slate-500">{patient.cancer_type || 'Cancer care'}{patient.stage ? ` · ${patient.stage}` : ''}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${patient.risk === 'high' ? 'bg-rose-50 text-rose-700' : patient.risk === 'moderate' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{patient.risk} risk</span>
            <button type="button" disabled={busy} onClick={() => setEditing((value) => !value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">{editing ? 'Close editor' : 'Edit record'}</button>
            <button type="button" disabled={busy} onClick={() => void changeStatus()} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">{patient.status === 'active' ? 'Archive patient' : 'Restore patient'}</button>
          </div>
        </div>
        {editing && <form onSubmit={save} className="grid gap-4 rounded-2xl border border-teal-100 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">Full name<input required value={draft.full_name} onChange={(event) => setDraft((current) => ({ ...current, full_name: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
          <label className="text-sm font-medium text-slate-700">Date of birth<input type="date" value={draft.date_of_birth} onChange={(event) => setDraft((current) => ({ ...current, date_of_birth: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
          <label className="text-sm font-medium text-slate-700">Sex<input value={draft.sex} onChange={(event) => setDraft((current) => ({ ...current, sex: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
          <label className="text-sm font-medium text-slate-700">Phone<input type="tel" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
          <label className="text-sm font-medium text-slate-700">Cancer type<input value={draft.cancer_type} onChange={(event) => setDraft((current) => ({ ...current, cancer_type: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
          <label className="text-sm font-medium text-slate-700">Stage<input value={draft.stage} onChange={(event) => setDraft((current) => ({ ...current, stage: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
          <label className="text-sm font-medium text-slate-700">Current treatment<input value={draft.current_treatment} onChange={(event) => setDraft((current) => ({ ...current, current_treatment: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
          <label className="text-sm font-medium text-slate-700">Cycle<input value={draft.cycle_label} onChange={(event) => setDraft((current) => ({ ...current, cycle_label: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
          <label className="text-sm font-medium text-slate-700">Risk<select value={draft.risk_level} onChange={(event) => setDraft((current) => ({ ...current, risk_level: event.target.value as PatientDraft['risk_level'] }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal"><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></select></label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3"><button type="submit" disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save changes'}</button><button type="button" disabled={busy} onClick={() => setEditing(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button></div>
        </form>}
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-semibold text-slate-900">Clinical overview</h2><dl className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-500">Age</dt><dd className="mt-1 font-medium text-slate-800">{patient.age == null ? 'Not recorded' : `${patient.age} years`}</dd></div><div><dt className="text-slate-500">Treatment</dt><dd className="mt-1 font-medium text-slate-800">{patient.current_treatment || 'Not recorded'}</dd></div><div><dt className="text-slate-500">Cycle</dt><dd className="mt-1 font-medium text-slate-800">{patient.cycle_label || 'Not recorded'}</dd></div><div><dt className="text-slate-500">Sex</dt><dd className="mt-1 font-medium capitalize text-slate-800">{patient.sex || 'Not recorded'}</dd></div><div><dt className="text-slate-500">Phone</dt><dd className="mt-1 font-medium text-slate-800">{patient.phone || 'Not recorded'}</dd></div></dl></section>
          <section className="rounded-2xl border border-teal-100 bg-teal-50/60 p-6"><div className="flex items-center gap-2 text-teal-800"><ShieldCheck className="h-5 w-5" /><h2 className="font-semibold">Consent boundary</h2></div><p className="mt-3 text-sm leading-6 text-teal-900/80">Patient account data is requested from the consent-checking backend and is returned only for scopes the patient has granted.</p><p className="mt-4 text-xs font-medium uppercase tracking-wide text-teal-700">{patient.patient_user_id ? 'Linked patient account' : 'Not linked to an OncoCare account'}</p></section>
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-semibold text-slate-900">Patient-shared health data</h2><p className="mt-1 text-sm text-slate-500">Symptoms, side effects, medications and timeline are fetched only when current consent permits them.</p></div>
            <button type="button" disabled={!patient.patient_user_id || loadingLiveData} onClick={() => void loadLiveData()} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{loadingLiveData ? 'Checking consent…' : liveData ? 'Refresh shared data' : 'Load shared data'}</button>
          </div>
          {!patient.patient_user_id && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">A patient account must be linked before shared data can be requested.</p>}
          {liveData && <>
            <p className="mt-4 text-xs text-slate-500">Granted scopes: {liveData.consent_scopes.length ? liveData.consent_scopes.join(', ') : 'None'}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {([
                ['Symptoms', liveData.symptoms],
                ['Side effects', liveData.side_effects],
                ['Medications', liveData.medications],
                ['Health timeline', liveData.timeline],
              ] as const).map(([title, records]) => (
                <div key={title} className="rounded-xl border border-slate-100 p-4">
                  <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
                  {records.length ? <ul className="mt-3 space-y-2">{records.map((record, index) => <li key={`${title}-${index}`} className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">{readableValues(record).join(' · ') || 'No displayable details'}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No data available for this consented scope.</p>}
                </div>
              ))}
            </div>
          </>}
        </section>
      </>}
    </div>
  );
}

export default function DoctorPatientDetailPage() {
  return <ProtectedRoute allowedRoles={DOCTOR_ROLES}><DashboardLayout dashboardTitle="Patient detail"><PatientDetailContent /></DashboardLayout></ProtectedRoute>;
}
