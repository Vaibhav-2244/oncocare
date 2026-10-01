'use client';

import Link from 'next/link';
import { ArrowRight, PackageOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type PharmacySection = 'orders' | 'inventory' | 'medicines' | 'customers' | 'prescriptions' | 'deliveries' | 'payments' | 'settings';

export function PharmacySectionPage({ section }: { section: PharmacySection }) {
  const t = useTranslations('pharmacyApp.sections');
  return <section className="space-y-5">
    <header>
      <h2 className="text-2xl font-semibold text-slate-950">{t(`${section}.title`)}</h2>
      <p className="mt-1 text-sm text-slate-600">{t(`${section}.description`)}</p>
    </header>
    <div className="border-y border-slate-200 bg-white px-4 py-10 text-center">
      <PackageOpen className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
      <h3 className="mt-3 text-base font-semibold text-slate-900">{t('emptyTitle')}</h3>
      <p className="mx-auto mt-1 max-w-lg text-sm text-slate-600">{t('foundationPlaceholder')}</p>
      <Link href="/dashboard/pharmacy" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-800 underline underline-offset-2">
        {t('dashboardLink')}<ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  </section>;
}
