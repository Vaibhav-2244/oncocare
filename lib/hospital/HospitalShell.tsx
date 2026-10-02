'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Building2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useHospital } from '@/lib/hospital/HospitalProvider';
import { HospitalSearch } from '@/components/hospital/HospitalSearch';
import { SampleDataBanner } from '@/components/hospital/ui-kit';
import { supabase } from '@/lib/supabase-client';

export function HospitalShell({ children }: { children: ReactNode }) {
  const t = useTranslations('hospital');
  const ops = useTranslations('hospitalOps');
  const { org, orgs, loading, error, technicalDetails, refresh, selectOrg } = useHospital();
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [lastConnected, setLastConnected] = useState<Date | null>(null);
  const hospitalId = org?.id;

  useEffect(() => {
    if (!hospitalId) return;
    const channel = supabase.channel(`hospital-shell-${hospitalId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospital_orgs', filter: `id=eq.${hospitalId}` }, () => setLastConnected(new Date()))
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') setLastConnected(new Date());
      });
    return () => { void supabase.removeChannel(channel); };
  }, [hospitalId]);

  const runSampleAction = async (action: 'load_demo_data' | 'remove_demo_data') => {
    if (!org) return;
    setSampleBusy(true);
    try {
      const { error: rpcError } = await supabase.rpc(action, { p_hospital_id: org.id });
      if (rpcError) throw rpcError;
      await refresh();
    } finally {
      setSampleBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-600" role="status">
        <Loader2 className="mr-3 h-5 w-5 animate-spin text-teal-700" />
        {t('loadingHospitalContext')}
      </div>
    );
  }

  if (error || !org) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-900" role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h1 className="font-semibold">{t('hospitalSetupIssue')}</h1>
            <p className="mt-1 text-sm">{error ?? t('workspaceUnavailable')}</p>
            {technicalDetails && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowTechnicalDetails((visible) => !visible)}
                  className="text-sm font-medium underline underline-offset-2"
                >
                  {showTechnicalDetails ? t('hideTechnicalDetails') : t('showTechnicalDetails')}
                </button>
                {showTechnicalDetails && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-xs">{technicalDetails}</pre>}
              </div>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-rose-800 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-900"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t('retry')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <Building2 className="h-5 w-5 shrink-0 text-teal-800" aria-hidden="true" />
          {orgs.length > 1 ? (
            <label className="sr-only" htmlFor="hospital-workspace">{t('switchWorkspace')}</label>
          ) : null}
          {orgs.length > 1 ? (
            <select
              id="hospital-workspace"
              value={org.id}
              onChange={(event) => selectOrg(event.target.value)}
              className="max-w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900"
            >
              {orgs.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name}</option>)}
            </select>
          ) : (
            <h1 className="truncate text-sm font-semibold text-slate-900">{org.name}</h1>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs font-medium">
          <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 ${org.verification_status === 'verified' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {t(org.verification_status === 'verified' ? 'verifiedStatus' : 'unverifiedWorkspace')}
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-600' : 'bg-amber-500'}`} aria-hidden="true" />
            {live && lastConnected
              ? ops('liveUpdated', { time: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: org.timezone }).format(lastConnected) })
              : ops('reconnecting')}
          </span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <HospitalSearch />
        {org.demo_data_loaded && <SampleDataBanner label={ops('sampleDataOn')} onReset={() => void runSampleAction('load_demo_data')} onRemove={() => void runSampleAction('remove_demo_data')} resetLabel={ops('resetSampleData')} removeLabel={ops('removeSampleData')} busy={sampleBusy} />}
      </div>
      {org.verification_status === 'suspended' && (
        <div className="border-l-4 border-rose-600 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="status">
          {t('workspaceSuspended')}
        </div>
      )}
      {children}
    </div>
  );
}