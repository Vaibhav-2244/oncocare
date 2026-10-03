'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ShieldCheck, Stethoscope } from 'lucide-react';
import { DashboardLayout, PATIENT_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { supabase } from '@/lib/supabase-client';

type Link = { doctor_patient_id: string; scopes: string[]; granted_at: string; revoked_at: string | null; doctor_patient: { full_name: string; patient_code: string }[] | null };
function MyDoctorsContent() {
  const [code, setCode] = useState('');
  const [links, setLinks] = useState<Link[]>([]);
  const [scopes, setScopes] = useState(['appointments']);
  const [error, setError] = useState<string | null>(null);
  const load = async () => { const { data, error: queryError } = await supabase.from('doctor_consents').select('doctor_patient_id,scopes,granted_at,revoked_at,doctor_patient:doctor_patients(full_name,patient_code)'); if (queryError) setError(queryError.message); else setLinks((data || []) as Link[]); };
  useEffect(() => { void load(); }, []);
  const redeem = async (event: FormEvent) => { event.preventDefault(); setError(null); const { error: rpcError } = await supabase.rpc('redeem_doctor_link_code', { p_code: code, p_scopes: scopes }); if (rpcError) setError(rpcError.message); else { setCode(''); await load(); } };
  return <div className="max-w-3xl space-y-6"><div><p className="text-sm font-medium text-teal-700">Care team</p><h1 className="mt-1 text-3xl font-bold text-slate-900">My doctors</h1><p className="mt-1 text-sm text-slate-500">Connect using a code from your doctor and choose what to share.</p></div>{error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}<form onSubmit={redeem} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><label className="text-sm font-medium text-slate-700">One-time invite code<input required value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={8} className="mt-1 block w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 font-mono tracking-[0.25em] outline-none focus:border-teal-500" /></label><fieldset className="mt-4 flex flex-wrap gap-4 text-sm text-slate-700"><legend className="mb-2 font-medium">Consent scopes</legend>{['appointments', 'reports', 'messages'].map((scope) => <label key={scope} className="flex items-center gap-2 capitalize"><input type="checkbox" checked={scopes.includes(scope)} onChange={(event) => setScopes((current) => event.target.checked ? [...current, scope] : current.filter((item) => item !== scope))} />{scope}</label>)}</fieldset><button type="submit" className="mt-5 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">Connect doctor</button></form><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="divide-y divide-slate-100">{links.length === 0 ? <p className="px-5 py-12 text-center text-sm text-slate-500">No doctors connected yet.</p> : links.map((link) => { const doctor = link.doctor_patient?.[0]; return <div key={link.doctor_patient_id} className="flex items-center gap-4 px-5 py-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Stethoscope className="h-5 w-5" /></div><div className="flex-1"><p className="font-semibold text-slate-800">{doctor?.full_name || 'Connected doctor'}</p><p className="text-xs text-slate-500">{doctor?.patient_code} · {link.scopes.join(', ')}</p></div><ShieldCheck className="h-5 w-5 text-emerald-600" /></div>; })}</div></section></div>;
}
export default function MyDoctorsPage() { return <ProtectedRoute allowedRoles={PATIENT_ROLES}><DashboardLayout dashboardTitle="My doctors"><MyDoctorsContent /></DashboardLayout></ProtectedRoute>; }
