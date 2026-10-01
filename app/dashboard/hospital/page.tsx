'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Loader2, RefreshCw, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getErrorMessage } from '@/lib/errors';
import { useHospital } from '@/lib/hospital/HospitalProvider';
import { supabase } from '@/lib/supabase-client';

interface WorkspaceCounts {
  departments: number;
  doctors: number;
  patients: number;
}

const EMPTY_COUNTS: WorkspaceCounts = { departments: 0, doctors: 0, patients: 0 };

export default function HospitalDashboardPage() {
  const t = useTranslations('hospital');
  const { org, can, refresh: refreshWorkspace } = useHospital();
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [technicalDetails, setTechnicalDetails] = useState<string | null>(null);

  const loadCounts = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    setError(null);
    setTechnicalDetails(null);
    try {
      const [departments, doctors, patients] = await Promise.all([
        supabase.from('hospital_departments').select('id', { count: 'exact', head: true }).eq('hospital_id', org.id),
        supabase.from('hospital_doctors').select('id', { count: 'exact', head: true }).eq('hospital_id', org.id),
        supabase.from('hospital_patients').select('id', { count: 'exact', head: true }).eq('hospital_id', org.id),
      ]);
      const failure = departments.error ?? doctors.error ?? patients.error;
      if (failure) throw failure;
      setCounts({
        departments: departments.count ?? 0,
        doctors: doctors.count ?? 0,
        patients: patients.count ?? 0,
      });
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error('Hospital command center data load failed:', err);
      setError(t('workspaceDataError'));
      setTechnicalDetails(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [org, t]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  const loadDemoData = async () => {
    if (!org) return;
    setBusy(true);
    setError(null);
    setTechnicalDetails(null);
    try {
      const { error: rpcError } = await supabase.rpc('load_demo_data', { p_hospital_id: org.id });
      if (rpcError) throw rpcError;
      await refreshWorkspace();
      await loadCounts();
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error('Hospital demo data load failed:', err);
      setError(t('demoDataError'));
      setTechnicalDetails(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const requestVerification = async () => {
    if (!org) return;
    setBusy(true);
    setError(null);
    setTechnicalDetails(null);
    try {
      const { error: rpcError } = await supabase.rpc('request_hospital_verification', { p_hospital_id: org.id });
      if (rpcError) throw rpcError;
      await refreshWorkspace();
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error('Hospital verification request failed:', err);
      setError(t('verificationRequestError'));
      setTechnicalDetails(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading && counts === EMPTY_COUNTS) {
    return <div className="flex min-h-52 items-center justify-center text-sm text-slate-600" role="status"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('loadingHospitalContext')}</div>;
  }

  const checklist = [
    { label: t('checkHospitalName'), complete: Boolean(org?.name.trim()), href: '/dashboard/hospital/settings' },
    { label: t('checkPatientId'), complete: Boolean(org?.patient_id_label && org.patient_id_prefix), href: '/dashboard/hospital/settings' },
    { label: t('checkDoctors'), complete: counts.doctors > 0, href: '/dashboard/hospital/doctors' },
    { label: t('checkSessions'), complete: false, href: '/dashboard/hospital/opd' },
    { label: t('checkPatients'), complete: counts.patients > 0, href: '/dashboard/hospital/patients' },
    { label: t('checkDemoData'), complete: Boolean(org?.demo_data_loaded), href: '/dashboard/hospital/settings' },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-teal-800">{t('commandCenter')}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">{org?.name}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('workspaceWorkflow')}</p>
        </div>
        {org?.verification_status !== 'verified' && can('config.manage') && (
          <button type="button" onClick={requestVerification} disabled={busy || Boolean(org?.verification_requested_at)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60">
            {org?.verification_requested_at ? t('verificationRequested') : t('requestVerification')}
          </button>
        )}
      </header>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
          <p>{error}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void loadCounts()} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"><RefreshCw className="h-3.5 w-3.5" />{t('retry')}</button>
            {technicalDetails && <details><summary className="cursor-pointer font-semibold">{t('showTechnicalDetails')}</summary><pre className="mt-2 max-w-full whitespace-pre-wrap">{technicalDetails}</pre></details>}
          </div>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3" aria-label={t('workspaceOverview')}>
        {[
          { label: t('departments'), value: counts.departments },
          { label: t('doctorsAndCareTeam'), value: counts.doctors },
          { label: t('registeredPatients'), value: counts.patients },
        ].map((item) => (
          <div key={item.label} className="border-l-2 border-teal-700 bg-white px-4 py-3">
            <p className="text-2xl font-semibold tabular-nums text-slate-950">{loading ? '…' : item.value}</p>
            <p className="mt-1 text-xs font-medium text-slate-600">{item.label}</p>
          </div>
        ))}
      </section>

      <section className="border-t border-slate-200 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{t('setupChecklist')}</h2>
            <p className="mt-1 text-sm text-slate-600">{t('setupChecklistDescription')}</p>
          </div>
          {can('config.manage') && !org?.demo_data_loaded && (
            <button type="button" onClick={loadDemoData} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-teal-800 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
              {t('loadDemoData')}
            </button>
          )}
        </div>
        <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span className="flex items-center gap-3 text-slate-800">
                <span aria-label={item.complete ? t('complete') : t('incomplete')} className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs ${item.complete ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-400 text-slate-500'}`}>{item.complete ? '✓' : ''}</span>
                {item.label}
              </span>
              {!item.complete && <Link href={item.href} className="shrink-0 font-medium text-teal-800 underline underline-offset-2">{t('open')}</Link>}
            </li>
          ))}
        </ul>
        {counts.patients === 0 && (
          <div className="mt-5 flex items-start gap-3 border-l-2 border-slate-300 bg-slate-50 p-4">
            <Users className="mt-0.5 h-5 w-5 text-slate-600" aria-hidden="true" />
            <div>
              <h3 className="font-semibold text-slate-900">{t('noPatientsYet')}</h3>
              <p className="mt-1 text-sm text-slate-600">{t('patientEmptyState')}</p>
              <Link href="/dashboard/hospital/patients" className="mt-2 inline-block text-sm font-semibold text-teal-800 underline underline-offset-2">{t('openPatientDirectory')}</Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}