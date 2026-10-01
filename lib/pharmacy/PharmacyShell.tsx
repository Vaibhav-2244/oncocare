'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle, Building2, Loader2, RefreshCw, ShieldCheck, Wifi } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase-client';
import { usePharmacy } from '@/lib/pharmacy/PharmacyProvider';

export function PharmacyShell({ children }: { children: ReactNode }) {
  const t = useTranslations('pharmacyApp.shell');
  const { org, can, loading, error, technicalDetails, refresh } = usePharmacy();
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [showMutationDetails, setShowMutationDetails] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [technicalMutationError, setTechnicalMutationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleOpen = async () => {
    if (!org || !can('settings.manage') || org.verification_status === 'suspended') return;
    setSaving(true);
    setMutationError(null);
    setTechnicalMutationError(null);
    try {
      const { error: rpcError } = await supabase.rpc('update_pharmacy_org', {
        p_org_id: org.id,
        p_updates: { is_open: !org.is_open },
      });
      if (rpcError) throw rpcError;
      await refresh();
    } catch (caughtError) {
      setMutationError(t('saveStatusError'));
      const { getErrorMessage } = await import('@/lib/errors');
      setTechnicalMutationError(getErrorMessage(caughtError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-600" role="status">
      <Loader2 className="mr-3 h-5 w-5 animate-spin text-teal-700" />{t('loading')}
    </div>;
  }

  if (error || !org) {
    return <section className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-900" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="font-semibold">{t('setupIssue')}</h1>
          <p className="mt-1 text-sm">{t('workspaceUnavailable')}</p>
          {technicalDetails && <div className="mt-3">
            <button type="button" onClick={() => setShowTechnicalDetails((visible) => !visible)} className="text-sm font-medium underline underline-offset-2">
              {showTechnicalDetails ? t('hideTechnicalDetails') : t('showTechnicalDetails')}
            </button>
            {showTechnicalDetails && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-xs">{technicalDetails}</pre>}
          </div>}
          <button type="button" onClick={() => void refresh()} className="mt-4 inline-flex items-center gap-2 rounded-md bg-rose-800 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-900">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />{t('retry')}
          </button>
        </div>
      </div>
    </section>;
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <div className="flex min-w-0 items-center gap-3">
        <Building2 className="h-5 w-5 shrink-0 text-teal-800" aria-hidden="true" />
        <h1 className="truncate text-sm font-semibold text-slate-900">{org.name}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
        <button type="button" role="switch" aria-checked={org.is_open} onClick={toggleOpen}
          disabled={!can('settings.manage') || org.verification_status === 'suspended' || saving}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
          <span className={`h-2 w-2 rounded-full ${org.is_open ? 'bg-emerald-600' : 'bg-slate-400'}`} aria-hidden="true" />
          {saving ? t('saving') : t(org.is_open ? 'open' : 'closed')}
        </button>
        <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 ${org.verification_status === 'verified' ? 'bg-emerald-50 text-emerald-800' : org.verification_status === 'suspended' ? 'bg-rose-50 text-rose-900' : 'bg-amber-50 text-amber-900'}`}>
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t(org.verification_status === 'verified' ? 'verified' : org.verification_status === 'suspended' ? 'suspended' : 'unverified')}
        </span>
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <Wifi className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />{t('connected')}
        </span>
      </div>
    </div>
    {org.verification_status === 'suspended' && <div className="border-l-4 border-rose-600 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="status">{t('workspaceSuspended')}</div>}
    {mutationError && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900" role="alert">
      <p>{mutationError}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <button type="button" onClick={() => void toggleOpen()} className="font-semibold underline underline-offset-2">{t('retry')}</button>
        {technicalMutationError && <div>
          <button type="button" onClick={() => setShowMutationDetails((visible) => !visible)} className="font-semibold underline underline-offset-2">{showMutationDetails ? t('hideTechnicalDetails') : t('showTechnicalDetails')}</button>
          {showMutationDetails && <pre className="mt-2 max-w-full whitespace-pre-wrap">{technicalMutationError}</pre>}
        </div>}
      </div>
    </div>}
    {children}
  </div>;
}
