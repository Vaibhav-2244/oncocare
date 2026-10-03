'use client';

import { FormEvent, useEffect, useState } from 'react';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ensureDoctorWorkspace } from '@/lib/doctor/api';
import { supabase } from '@/lib/supabase-client';

function ProfileContent() {
  const [fields, setFields] = useState({ full_name: '', specialization: '', registration_no: '', registration_council: '' });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void ensureDoctorWorkspace().then((result) => setFields((current) => ({ ...current, ...(result.profile as typeof current) }))).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load profile.')); }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(null); setMessage(null); const { error: rpcError } = await supabase.rpc('doctor_update_profile', { p_fields: fields }); if (rpcError) setError(rpcError.message); else setMessage('Profile saved.'); };
  return <div className="max-w-3xl space-y-6"><div><p className="text-sm font-medium text-teal-700">Professional identity</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Doctor profile</h1><p className="mt-1 text-sm text-slate-500">Keep your registration details current for patients and prescriptions.</p></div>{error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}{message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div>}<form onSubmit={submit} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">{[['full_name','Full name'],['specialization','Specialization'],['registration_no','Registration number'],['registration_council','Registration council']].map(([key, label]) => <label key={key} className="text-sm font-medium text-slate-700">{label}<input value={fields[key as keyof typeof fields] || ''} onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal outline-none focus:border-teal-500" /></label>)}<div className="sm:col-span-2"><button type="submit" className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">Save profile</button></div></form></div>;
}

export default function DoctorProfilePage() { return <ProtectedRoute allowedRoles={DOCTOR_ROLES}><DashboardLayout dashboardTitle="Doctor profile"><ProfileContent /></DashboardLayout></ProtectedRoute>; }
