'use client';

import { useTranslations } from 'next-intl';
import { getErrorMessage } from '@/lib/errors';

export function HospitalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('hospitalOps');
  return <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-900" role="alert"><h2 className="font-semibold">{t('routeError')}</h2><p className="mt-1 text-sm">{t('routeErrorBody')}</p><details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold">{t('showTechnicalDetails')}</summary><pre className="mt-2 whitespace-pre-wrap rounded-md bg-white p-3">{getErrorMessage(error)}</pre></details><button type="button" onClick={reset} className="mt-4 min-h-10 rounded-md bg-rose-800 px-4 text-sm font-semibold text-white">{t('retry')}</button></section>;
}
