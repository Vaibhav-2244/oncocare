'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function HospitalRouteLoading() {
  const t = useTranslations('hospital');
  return <div className="flex min-h-48 items-center justify-center text-sm text-slate-600" role="status"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('loadingHospitalContext')}</div>;
}