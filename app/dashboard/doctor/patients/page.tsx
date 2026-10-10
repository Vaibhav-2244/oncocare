'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Users } from 'lucide-react';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import {
  createDoctorPatient,
  ensureDoctorWorkspace,
  listDoctorPatients,
  loadDoctorHospitalDashboard,
  type DoctorHospitalDashboard,
  type DoctorPatient,
} from '@/lib/doctor/api';

function PatientsContent() {
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [hospitalCare, setHospitalCare] = useState<DoctorHospitalDashboard>({ patients: [], appointments: [] });
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [cancerType, setCancerType] = useState('');
  const [risk, setRisk] = useState<'low' | 'moderate' | 'high'>('low');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      await ensureDoctorWorkspace();
      const [result, hospitalResult] = await Promise.all([
        listDoctorPatients({ q: query, limit: 100 }),
        loadDoctorHospitalDashboard(),
      ]);
      setPatients(result.rows);
      setHospitalCare(hospitalResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load patients.');
    }
  }, [query]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const patient = await createDoctorPatient({ full_name: name, cancer_type: cancerType, risk_level: risk });
      setPatients((current) => [patient, ...current]);
      setName('');
      setCancerType('');
      setRisk('low');
      setShowCreate(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create patient.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-medium text-teal-700">Roster</p><h1 className="mt-1 text-3xl font-bold text-slate-900">My patients</h1><p className="mt-1 text-sm text-slate-500">Patient records stay in the secured workspace and are linked only through consent.</p></div>
        <button type="button" onClick={() => setShowCreate((visible) => !visible)} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"><Plus className="h-4 w-4" /> Add patient</button>
      </div>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      <section className="overflow-hidden rounded-2xl border border-teal-100 bg-white shadow-sm">
        <div className="border-b border-teal-100 bg-teal-50/60 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Patients assigned through your hospital</h2>
          <p className="mt-1 text-sm text-slate-600">Hospital appointments and care records for which you are the assigned doctor.</p>
        </div>
        {hospitalCare.patients.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No hospital patient assignments are linked to your account yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {hospitalCare.patients
              .filter((patient) => !query.trim() || `${patient.name} ${patient.identifier} ${patient.hospital_name}`.toLowerCase().includes(query.trim().toLowerCase()))
              .map((patient) => (
                <article key={`${patient.hospital_id}-${patient.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="font-semibold text-slate-800">{patient.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{patient.identifier} · {patient.hospital_name}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${patient.linked ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {patient.linked ? 'Patient account linked' : 'Patient account not linked'}
                  </span>
                </article>
              ))}
          </div>
        )}
      </section>
      {showCreate && <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-teal-100 bg-teal-50/50 p-5 sm:grid-cols-4">
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Full name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-teal-500" /></label>
        <label className="text-sm font-medium text-slate-700">Cancer type<input value={cancerType} onChange={(event) => setCancerType(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-teal-500" /></label>
        <label className="text-sm font-medium text-slate-700">Risk<select value={risk} onChange={(event) => setRisk(event.target.value as typeof risk)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal outline-none focus:border-teal-500"><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></select></label>
        <div className="sm:col-span-4"><button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Save patient</button></div>
      </form>}
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or patient code" className="w-full bg-transparent text-sm outline-none" /></div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {patients.length === 0 ? <div className="flex flex-col items-center gap-2 px-6 py-16 text-center"><Users className="h-10 w-10 text-slate-300" /><p className="font-medium text-slate-700">No patients found</p><p className="text-sm text-slate-500">Add a patient to start building your roster.</p></div> : <div className="divide-y divide-slate-100">
          {patients.map((patient) => <Link key={patient.id} href={`/dashboard/doctor/patients/${patient.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50"><div><p className="font-semibold text-slate-800">{patient.full_name}</p><p className="mt-1 text-xs text-slate-500">{patient.patient_code} · {patient.cancer_type || 'Cancer care'}{patient.stage ? ` · ${patient.stage}` : ''}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${patient.risk === 'high' ? 'bg-rose-50 text-rose-700' : patient.risk === 'moderate' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{patient.risk} risk</span></Link>)}
        </div>}
      </div>
    </div>
  );
}

export default function DoctorPatientsPage() {
  return <ProtectedRoute allowedRoles={DOCTOR_ROLES}><DashboardLayout dashboardTitle="My patients"><PatientsContent /></DashboardLayout></ProtectedRoute>;
}
