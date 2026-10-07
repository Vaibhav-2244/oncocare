'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarDays, ClipboardList, Loader2, RefreshCw, Users } from 'lucide-react';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ensureDoctorWorkspace, loadDoctorSummary, type DoctorDashboardSummary } from '@/lib/doctor/api';

function DoctorDashboardContent() {
  const [summary, setSummary] = useState<DoctorDashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureDoctorWorkspace();
      setSummary(await loadDoctorSummary());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the doctor workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = summary?.kpis;
  const cards = [
    { label: 'Active patients', value: kpis?.active_patients, icon: Users, href: '/dashboard/doctor/patients', tone: 'teal' },
    { label: 'Appointments today', value: kpis?.appointments_today, icon: CalendarDays, href: '/dashboard/doctor/appointments', tone: 'blue' },
    { label: 'Needs confirmation', value: kpis?.pending_confirmations, icon: ClipboardList, href: '/dashboard/doctor/appointments', tone: 'amber' },
    { label: 'High risk', value: kpis?.high_risk, icon: AlertTriangle, href: '/dashboard/doctor/patients?risk=high', tone: 'rose' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-teal-700">Doctor workspace</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Good to see you</h1>
          <p className="mt-1 text-sm text-slate-500">A secure overview of your roster and today{"'"}s priorities.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, href, tone }) => {
          const toneClasses = {
            teal: 'bg-teal-50 text-teal-600',
            blue: 'bg-blue-50 text-blue-600',
            amber: 'bg-amber-50 text-amber-600',
            rose: 'bg-rose-50 text-rose-600',
          }[tone];
          return (
          <Link key={label} href={href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClasses}`}>
              <Icon className="h-5 w-5" />
            </div>
            <p className="mt-4 text-2xl font-bold text-slate-900">{loading ? <Loader2 className="h-6 w-6 animate-spin" /> : value ?? 0}</p>
            <p className="mt-1 text-sm text-slate-500">{label}</p>
          </Link>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Patients needing attention</h2>
              <p className="mt-1 text-sm text-slate-500">Review risk and follow-up items from your roster.</p>
            </div>
            <Link href="/dashboard/doctor/patients" className="text-sm font-semibold text-teal-700 hover:underline">View roster</Link>
          </div>
          <div className="mt-5 divide-y divide-slate-100">
            {!loading && summary?.attention.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No patients need attention yet.</p>}
            {summary?.attention.map((patient) => (
              <Link href={`/dashboard/doctor/patients/${patient.id}`} key={patient.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{patient.full_name}</p>
                  <p className="text-xs text-slate-500">{patient.patient_code} · {patient.cancer_type || 'Cancer care'}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${patient.risk === 'high' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{patient.risk}</span>
              </Link>
            ))}
          </div>
        </section>
        <section className="lg:col-span-2 rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
          <h2 className="font-semibold">Quick actions</h2>
          <div className="mt-4 grid gap-2">
            <Link href="/dashboard/doctor/patients?new=1" className="rounded-xl bg-white/10 px-4 py-3 text-sm font-medium transition hover:bg-white/20">Add a patient</Link>
            <Link href="/dashboard/doctor/appointments" className="rounded-xl bg-white/10 px-4 py-3 text-sm font-medium transition hover:bg-white/20">Review appointments</Link>
            <Link href="/dashboard/profile" className="rounded-xl bg-white/10 px-4 py-3 text-sm font-medium transition hover:bg-white/20">Complete professional profile</Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function DoctorDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={DOCTOR_ROLES}>
      <DashboardLayout dashboardTitle="Doctor workspace">
        <DoctorDashboardContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
