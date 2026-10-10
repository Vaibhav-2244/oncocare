'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CalendarDays, Hospital, Link2, Stethoscope } from 'lucide-react';
import { DashboardLayout, PATIENT_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { useTranslations } from 'next-intl';

type HospitalDashboard = {
  appointments: Array<{
    id: string;
    hospital_name: string;
    doctor_name: string;
    scheduled_at: string;
    kind: string;
    status: string;
    reason: string | null;
  }>;
  assigned_doctors: Array<{
    hospital_id: string;
    hospital_name: string;
    doctor_name: string;
    specialty: string | null;
    department: string | null;
  }>;
};

type HospitalVisit = {
  hospital_id: string;
  patient_identifier: string;
  name: string;
  visit_date: string;
  checked_in_at: string | null;
};

function PatientHospitalContent() {
  const t = useTranslations('patientHospital');
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<HospitalDashboard>({ appointments: [], assigned_doctors: [] });
  const [visits, setVisits] = useState<HospitalVisit[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canLink = Boolean(user?.roles.some((role) => role.name === 'patient'));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboardResult, visitsResult] = await Promise.all([
        supabase.rpc('patient_hospital_dashboard'),
        supabase.rpc('get_my_hospital_visits'),
      ]);
      if (dashboardResult.error) throw dashboardResult.error;
      if (visitsResult.error) throw visitsResult.error;
      setDashboard((dashboardResult.data ?? { appointments: [], assigned_doctors: [] }) as HospitalDashboard);
      setVisits((visitsResult.data ?? []) as HospitalVisit[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const linkAccount = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: rpcError } = await supabase.rpc('claim_hospital_patient_link', {
        p_code: code.trim().toUpperCase(),
      });
      if (rpcError) throw rpcError;
      setCode('');
      setNotice(t('linked'));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('linkFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-sm font-medium text-teal-700">{t('title')}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">{t('intro')}</p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}

      {canLink && (
        <form onSubmit={linkAccount} className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-teal-50 p-2 text-teal-800"><Link2 className="h-5 w-5" /></div>
            <div className="flex-1">
              <h2 className="font-semibold text-slate-900">{t('linkTitle')}</h2>
              <p className="mt-1 text-sm text-slate-600">{t('linkInstructions')}</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <label className="flex-1 text-sm font-medium text-slate-700">
                  {t('codeLabel')}
                  <input
                    required
                    minLength={32}
                    maxLength={32}
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                    className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 font-mono uppercase tracking-wider"
                    placeholder={t('codePlaceholder')}
                  />
                </label>
                <button disabled={busy} className="mt-auto min-h-11 rounded-lg bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? t('linking') : t('linkButton')}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-teal-700" /><h2 className="font-semibold text-slate-900">{t('careTeam')}</h2></div>
        {loading ? <p className="mt-4 text-sm text-slate-500">{t('loading')}</p> : dashboard.assigned_doctors.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t('noCareTeam')}</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {dashboard.assigned_doctors.map((doctor) => (
              <article key={`${doctor.hospital_id}-${doctor.doctor_name}`} className="rounded-xl border border-slate-100 p-4">
                <p className="font-semibold text-slate-900">{doctor.doctor_name}</p>
                <p className="mt-1 text-sm text-slate-600">{[doctor.specialty, doctor.department].filter(Boolean).join(' · ') || t('doctor')}</p>
                <p className="mt-1 text-xs text-slate-500">{doctor.hospital_name}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-teal-700" /><h2 className="font-semibold text-slate-900">{t('appointments')}</h2></div>
        {loading ? <p className="mt-4 text-sm text-slate-500">{t('loading')}</p> : dashboard.appointments.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t('noAppointments')}</p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {dashboard.appointments.map((appointment) => (
              <article key={appointment.id} className="py-4 first:pt-0 last:pb-0">
                <p className="font-semibold text-slate-900">{appointment.doctor_name} · {appointment.hospital_name}</p>
                <p className="mt-1 text-sm text-slate-600">{new Date(appointment.scheduled_at).toLocaleString()} · {appointment.kind.replaceAll('_', ' ')}</p>
                {appointment.reason && <p className="mt-1 text-sm text-slate-600">{appointment.reason}</p>}
                <p className="mt-1 text-xs capitalize text-slate-500">{appointment.status.replaceAll('_', ' ')}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><Hospital className="h-5 w-5 text-teal-700" /><h2 className="font-semibold text-slate-900">{t('visits')}</h2></div>
        {loading ? <p className="mt-4 text-sm text-slate-500">{t('loading')}</p> : visits.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t('noVisits')}</p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {visits.map((visit, index) => (
              <article key={`${visit.hospital_id}-${visit.patient_identifier}-${visit.visit_date}-${index}`} className="py-3 first:pt-0 last:pb-0">
                <p className="font-medium text-slate-900">{visit.name} · {visit.patient_identifier}</p>
                <p className="mt-1 text-sm text-slate-600">{new Date(visit.visit_date).toLocaleString()}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function PatientHospitalPage() {
  return (
    <ProtectedRoute allowedRoles={PATIENT_ROLES}>
      <DashboardLayout dashboardTitle="My Hospital">
        <PatientHospitalContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
