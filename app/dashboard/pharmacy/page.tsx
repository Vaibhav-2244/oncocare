'use client';

import Link from 'next/link';
import { ArrowRight, ClipboardCheck, Package, Pill, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePharmacy } from '@/lib/pharmacy/PharmacyProvider';

export default function PharmacyDashboardPage() {
  const t = useTranslations('pharmacyApp.dashboard');
  const { org } = usePharmacy();
  if (!org) return null;

  const profileComplete = Boolean(
    org.drug_licence_no && org.gstin && org.pharmacist_reg_no && org.address_line && org.city && org.state && org.pincode,
  );
  const checklist = [
    { key: 'profile', complete: profileComplete, href: '/dashboard/pharmacy/settings', icon: ClipboardCheck },
    { key: 'medicines', complete: false, href: '/dashboard/pharmacy/medicines', icon: Pill },
    { key: 'stock', complete: false, href: '/dashboard/pharmacy/inventory', icon: Package },
    { key: 'customers', complete: false, href: '/dashboard/pharmacy/customers', icon: UserRound },
  ];
  const workflow = [
    { key: 'orders', href: '/dashboard/pharmacy/orders' },
    { key: 'prescriptions', href: '/dashboard/pharmacy/prescriptions' },
    { key: 'inventory', href: '/dashboard/pharmacy/inventory' },
    { key: 'deliveries', href: '/dashboard/pharmacy/deliveries' },
    { key: 'payments', href: '/dashboard/pharmacy/payments' },
  ];

  return <div className="space-y-7">
    <header>
      <p className="text-sm font-medium text-teal-800">{t('eyebrow')}</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-950">{org.name}</h2>
      <p className="mt-1 text-sm text-slate-600">{t('description')}</p>
    </header>

    <section className="border-y border-slate-200 py-5" aria-label={t('workflowTitle')}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">{t('workflowTitle')}</h3>
          <p className="mt-1 text-sm text-slate-600">{t('workflowDescription')}</p>
        </div>
        <Link href="/dashboard/pharmacy/orders" className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800 underline underline-offset-2">
          {t('openOrders')}<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {workflow.map((step, index) => <li key={step.key}>
          <Link href={step.href} className="flex h-full items-start gap-3 border-l-2 border-teal-700 bg-white px-3 py-3 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700">
            <span className="font-mono text-xs font-semibold text-teal-800">0{index + 1}</span>
            <span className="text-sm font-semibold text-slate-900">{t(`workflowSteps.${step.key}`)}</span>
          </Link>
        </li>)}
      </ol>
    </section>

    <section className="border-t border-slate-200 pt-5">
      <div>
        <h3 className="text-lg font-semibold text-slate-950">{t('setupTitle')}</h3>
        <p className="mt-1 text-sm text-slate-600">{t('setupDescription')}</p>
      </div>
      <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
        {checklist.map((item) => {
          const Icon = item.icon;
          return <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="flex items-center gap-3 text-sm text-slate-800">
              <Icon className="h-4 w-4 text-teal-800" aria-hidden="true" />
              <span>{t(`checklist.${item.key}`)}</span>
              <span className={`rounded-md border px-2 py-0.5 text-xs ${item.complete ? 'border-emerald-700 text-emerald-900' : 'border-slate-400 text-slate-700'}`}>
                {t(item.complete ? 'complete' : 'incomplete')}
              </span>
            </span>
            {!item.complete && <Link href={item.href} className="shrink-0 text-sm font-medium text-teal-800 underline underline-offset-2">{t('open')}</Link>}
          </li>;
        })}
      </ul>
    </section>
    <p className="border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">{t('unverifiedNote')}</p>
  </div>;
}
