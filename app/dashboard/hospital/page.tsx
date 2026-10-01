'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Loader2,
  Plus,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, HOSPITAL_ROLES } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { useHospitalOrg } from '@/lib/hospital/useHospitalOrg';
import { supabase } from '@/lib/supabase-client';
import { createHospitalSchema } from '@/lib/validation/hospital';

const defaultForm = {
  name: '',
  timezone: 'Asia/Kolkata',
  patientIdLabel: 'NCI Number',
  patientIdPrefix: 'NCI-',
};

function HospitalDashboardContent() {
  const t = useTranslations('hospital');
  const { user } = useAuth();
  const { org, loading, error } = useHospitalOrg();
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const heroCards = useMemo(
    () => [
      { label: t('commandCenter'), value: org ? 'Live' : '—', tone: 'bg-teal-50 text-teal-700' },
      { label: t('checkedIn'), value: org ? '18' : '—', tone: 'bg-indigo-50 text-indigo-700' },
      { label: t('waitingNow'), value: org ? '12' : '—', tone: 'bg-amber-50 text-amber-700' },
      { label: t('pendingReports'), value: org ? '5' : '—', tone: 'bg-rose-50 text-rose-700' },
    ],
    [org, t],
  );

  const handleCreateHospital = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const payload = createHospitalSchema.parse({
        name: form.name,
        timezone: form.timezone,
        patientIdLabel: form.patientIdLabel,
        patientIdPrefix: form.patientIdPrefix,
      });

      const { data, error: rpcError } = await supabase.rpc('create_hospital_org', {
        p_name: payload.name,
        p_timezone: payload.timezone,
        p_patient_id_label: payload.patientIdLabel,
        p_patient_id_prefix: payload.patientIdPrefix,
      });

      if (rpcError) throw rpcError;

      if (!data) {
        throw new Error('Hospital setup returned no organisation record.');
      }

      window.location.reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to create the hospital organisation.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
          {t('loadingHospitalContext')}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5" />
          <div>
            <h2 className="text-lg font-semibold">{t('hospitalSetupIssue')}</h2>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-teal-900 to-emerald-800 p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 text-sm font-medium text-teal-200">
            <Building2 className="h-5 w-5" />
            {t('hospitalOnboarding')}
          </div>
          <h1 className="mt-4 text-3xl font-bold">{t('createHospitalOrganisation')}</h1>
          <p className="mt-3 max-w-xl text-sm text-slate-200">{t('nciWorkflowDescription')}</p>
        </section>

        <form onSubmit={handleCreateHospital} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Plus className="h-4 w-4 text-teal-600" />
            {t('newHospitalProfile')}
          </div>

          <div className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              {t('hospitalName')}
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:bg-white"
                placeholder={t('aiimsJhajjarExample')}
                required
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              {t('timezone')}
              <input
                value={form.timezone}
                onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:bg-white"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                {t('patientIdLabel')}
                <input
                  value={form.patientIdLabel}
                  onChange={(event) => setForm((current) => ({ ...current, patientIdLabel: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:bg-white"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                {t('patientIdPrefix')}
                <input
                  value={form.patientIdPrefix}
                  onChange={(event) => setForm((current) => ({ ...current, patientIdPrefix: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:bg-white"
                />
              </label>
            </div>

            {formError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
              {submitting ? t('creatingHospital') : t('createHospital')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (org.verification_status !== 'verified') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-600" />
          <div>
            <h2 className="text-lg font-semibold text-amber-900">{t('verificationPending')}</h2>
            <p className="mt-2 text-sm text-amber-800">{t('verificationPendingDescription')}</p>
            <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4 text-sm text-amber-900">
              <div className="font-medium">{org.name}</div>
              <div className="mt-1 text-amber-700">{org.timezone}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-teal-900 to-emerald-800 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-200">{t('commandCenter')}</p>
            <h1 className="mt-2 text-3xl font-bold">{org.name}</h1>
            <p className="mt-2 text-sm text-slate-200">{t('nciWorkflowDescription')}</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-sm text-white ring-1 ring-white/20">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            {t('verifiedStatus')}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {heroCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.tone}`}>
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <p className="mt-4 text-2xl font-bold text-slate-900">{card.value}</p>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
          </div>
        ))}
      </section>

      <section id="patients" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{t(' patientDirectory')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('searchByNci')}</p>
          </div>
          <div className="inline-flex items-center gap-2 text-sm font-medium text-teal-700">
            <Users className="h-4 w-4" />
            30 {t('patients')}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {['NCI-24601', 'NCI-24605', 'NCI-24610', 'NCI-24618', 'NCI-24624', 'NCI-24630'].map((identifier) => (
            <div key={identifier} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="font-semibold text-slate-800">{identifier}</div>
              <div className="mt-1 text-slate-500">{t('recentPatientRecord')}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="queue" className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{t('liveOpdQueue')}</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
              <Clock3 className="h-3.5 w-3.5" />
              {t('live')}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {[
              { token: '#102', doctor: 'Dr. Raj Sharma', status: 'Serving now' },
              { token: '#103', doctor: 'Dr. Raj Sharma', status: 'Next up' },
              { token: '#104', doctor: 'Dr. Raj Sharma', status: 'Waiting' },
            ].map((entry) => (
              <div key={entry.token} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div>
                  <div className="font-semibold text-slate-800">{entry.token}</div>
                  <div className="text-sm text-slate-500">{entry.doctor}</div>
                </div>
                <span className="rounded-full bg-teal-100 px-2.5 py-1 text-xs font-medium text-teal-700">{entry.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t('actionRequired')}</h2>
          <div className="mt-4 space-y-3">
            {[
              t('reportsReadyForReview'),
              t('waitingBeyondExpectedWindow'),
              t('pendingInvestigationBookings'),
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="appointments" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('appointments')}</h2>
            <p className="text-sm text-slate-500">{t('appointmentList')}</p>
          </div>
          <span className="text-sm font-medium text-teal-700">{t('scheduleToday')}</span>
        </div>
        <div className="mt-4 space-y-3">
          {[
            { patient: 'NCI-24601', time: '09:30 AM', dept: 'Medical Oncology' },
            { patient: 'NCI-24618', time: '10:15 AM', dept: 'Radiology' },
            { patient: 'NCI-24624', time: '11:00 AM', dept: 'Radiation Oncology' },
          ].map((item) => (
            <div key={item.patient} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div>
                <div className="font-semibold text-slate-800">{item.patient}</div>
                <div className="text-slate-500">{item.dept}</div>
              </div>
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">{item.time}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="doctors" className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{t('departments')}</h2>
            <Stethoscope className="h-5 w-5 text-teal-600" />
          </div>
          <div className="mt-4 space-y-3">
            {['Medical Oncology', 'Radiation Oncology', 'Surgical Oncology', 'Radiology', 'Pathology'].map((department) => (
              <div key={department} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <span>{department}</span>
                <span className="rounded-full bg-teal-100 px-2.5 py-1 text-xs font-medium text-teal-700">{t('online')}</span>
              </div>
            ))}
          </div>
        </div>

        <div id="investigations" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t('investigations')}</h2>
          <div className="mt-4 space-y-3">
            {[
              { label: 'Mammography', value: 'Full • next 15 Oct' },
              { label: 'CBC', value: 'Report ready' },
              { label: 'PET-CT', value: 'Scheduled for tomorrow' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <span className="font-medium text-slate-800">{item.label}</span>
                <span className="text-slate-500">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="admissions" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{t('admissions')}</h2>
          <span className="text-sm font-medium text-teal-700">{t('todaysAdmissions')}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {['Ward A', 'Ward B', 'ICU'].map((ward) => (
            <div key={ward} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="font-semibold text-slate-800">{ward}</div>
              <div className="mt-1 text-sm text-slate-500">{t('occupancySummary')}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function HospitalDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={HOSPITAL_ROLES}>
      <DashboardLayout dashboardTitle="Hospital Portal">
        <HospitalDashboardContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
