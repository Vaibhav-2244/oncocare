'use client';

import { FormEvent, useEffect, useState } from 'react';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ensureDoctorWorkspace } from '@/lib/doctor/api';
import { supabase } from '@/lib/supabase-client';

type Availability = { weekday: number; start_time: string; end_time: string; slot_minutes: number };
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function SettingsContent() {
  const [rows, setRows] = useState<Availability[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void (async () => { try { await ensureDoctorWorkspace(); const { data, error: queryError } = await supabase.from('doctor_availability').select('weekday,start_time,end_time,slot_minutes').order('weekday'); if (queryError) throw queryError; setRows((data || []) as Availability[]); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load availability.'); } })(); }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); const activeRows = rows.filter((row) => row.start_time && row.end_time); const { error: rpcError } = await supabase.rpc('doctor_save_availability', { p_rows: activeRows }); if (rpcError) setError(rpcError.message); else setMessage('Availability saved.'); };
  return <div className="max-w-3xl space-y-6"><div><p className="text-sm font-medium text-teal-700">Scheduling</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Availability</h1><p className="mt-1 text-sm text-slate-500">Set the hours patients can request and the default appointment slot length.</p></div>{error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}{message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div>}<form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="space-y-3">{rows.map((row, index) => <div key={row.weekday} className="grid items-center gap-3 sm:grid-cols-[7rem_1fr_1fr_7rem]"><label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={row.start_time !== ''} onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, start_time: event.target.checked ? '09:00' : '' } : item))} />{dayNames[row.weekday]}</label><input aria-label={`${dayNames[row.weekday]} start`} value={row.start_time} onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, start_time: event.target.value } : item))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input aria-label={`${dayNames[row.weekday]} end`} value={row.end_time} onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, end_time: event.target.value } : item))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input aria-label={`${dayNames[row.weekday]} slot`} type="number" min="5" max="120" value={row.slot_minutes} onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, slot_minutes: Number(event.target.value) } : item))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>)}</div><button type="submit" className="mt-6 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">Save availability</button></form></div>;
}

export default function DoctorSettingsPage() { return <ProtectedRoute allowedRoles={DOCTOR_ROLES}><DashboardLayout dashboardTitle="Availability"><SettingsContent /></DashboardLayout></ProtectedRoute>; }
