'use client';

import { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getErrorMessage } from '@/lib/errors';

export default function PharmacyRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('pharmacyApp.shell');
  const [showDetails, setShowDetails] = useState(false);
  return <section className="mx-auto mt-8 max-w-2xl rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-900" role="alert">
    <div className="flex items-start gap-3">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <h1 className="font-semibold">{t('routeErrorTitle')}</h1>
        <p className="mt-1 text-sm">{t('routeErrorDescription')}</p>
        <button type="button" onClick={() => reset()} className="mt-4 inline-flex items-center gap-2 rounded-md bg-rose-800 px-3 py-2 text-sm font-semibold text-white">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />{t('retry')}
        </button>
        <div className="mt-3">
          <button type="button" onClick={() => setShowDetails((visible) => !visible)} className="text-sm font-medium underline underline-offset-2">
            {showDetails ? t('hideTechnicalDetails') : t('showTechnicalDetails')}
          </button>
          {showDetails && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{getErrorMessage(error)}</pre>}
        </div>
      </div>
    </div>
  </section>;
}
