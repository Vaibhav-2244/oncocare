'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Stethoscope, XCircle } from 'lucide-react';
import { ADMIN_ROLES, DashboardLayout } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { supabase } from '@/lib/supabase-client';

type Doctor = { user_id: string; full_name: string; specialization: string | null; registration_no: string | null; registration_council: string | null; verification_status: string };
function VerificationsContent() {
  const [rows, setRows] = useState<Doctor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = async () => { const { data, error: queryError } = await supabase.rpc('admin_list_doctor_verifications'); if (queryError) setError(queryError.message); else setRows((data || []) as Doctor[]); };
  useEffect(() => { void load(); }, []);
  const update = async (doctor: Doctor, status: string) => { const { error: rpcError } = await supabase.rpc('admin_set_doctor_verification', { p_doctor_user_id: doctor.user_id, p_status: status }); if (rpcError) setError(rpcError.message); else setRows((current) => current.map((row) => row.user_id === doctor.user_id ? { ...row, verification_status: status } : row)); };
  return <div className="space-y-6"><div><p className="text-sm font-medium text-teal-700">Platform administration</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Doctor verifications</h1><p className="mt-1 text-sm text-slate-500">Review registration details before allowing patient invitations.</p></div>{error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="divide-y divide-slate-100">{rows.length === 0 ? <p className="px-5 py-12 text-center text-sm text-slate-500">No doctor profiles found.</p> : rows.map((doctor) => <div key={doctor.user_id} className="flex flex-wrap items-center gap-4 px-5 py-4"><Stethoscope className="h-5 w-5 text-teal-700" /><div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{doctor.full_name}</p><p className="text-sm text-slate-500">{doctor.specialization || 'Medical oncology'} · {doctor.registration_no || 'Registration pending'} · {doctor.registration_council || 'Council pending'}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{doctor.verification_status}</span><button type="button" onClick={() => void update(doctor, 'verified')} className="rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50" aria-label={`Verify ${doctor.full_name}`}><CheckCircle2 className="h-4 w-4" /></button><button type="button" onClick={() => void update(doctor, 'rejected')} className="rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50" aria-label={`Reject ${doctor.full_name}`}><XCircle className="h-4 w-4" /></button></div>)}</div></section></div>;
}
export default function DoctorVerificationsPage() { return <ProtectedRoute allowedRoles={ADMIN_ROLES}><DashboardLayout dashboardTitle="Doctor verifications"><VerificationsContent /></DashboardLayout></ProtectedRoute>; }
