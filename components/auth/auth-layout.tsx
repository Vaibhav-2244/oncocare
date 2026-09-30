'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Logo } from '@/components/shared/logo';
import { useTranslations } from 'next-intl';

export function AuthLayout({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle: string;
}) {
  const t = useTranslations('components.auth.authLayout');
  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* Left panel — branding */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-teal-600 via-emerald-600 to-teal-700 lg:flex lg:w-1/2 lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 bg-grid-dark opacity-20" />
        <div className="absolute -right-20 top-20 h-72 w-72 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="absolute -left-20 bottom-20 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />

        <Link href="/" className="relative flex items-center gap-2 text-white">
          <Logo iconBoxSize="h-10 w-10" iconSize="h-9 w-9" textSize="text-xl" textClassName="text-white" className="gap-2" />
        </Link>

        <div className="relative">
          <h2 className="text-3xl font-bold leading-tight text-white">
            {t('theFutureOfCancerCareStartsAtHome')}{' '}</h2>
          <p className="mt-4 max-w-md text-teal-50/90">
            {t('aiPoweredCareCoordinationSymptomTrackingVerifiedCaregiversFinancialSupportAndPer')}{' '}</p>
          <div className="mt-8 flex gap-6">
            <div>
              <div className="text-2xl font-bold text-white">{t('text50k')}</div>
              <div className="text-sm text-teal-100/80">{t('patientsServed')}</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">200+</div>
              <div className="text-sm text-teal-100/80">{t('partnerHospitals')}</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">1,500+</div>
              <div className="text-sm text-teal-100/80">{t('verifiedDoctors')}</div>
            </div>
          </div>
        </div>

        <p className="relative text-sm text-teal-100/60">
          {t('text2026OncocareAllRightsReserved')}{' '}</p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <Link href="/" className="mb-8 flex items-center justify-center gap-2 lg:hidden">
            <Logo iconBoxSize="h-10 w-10" iconSize="h-9 w-9" textSize="text-xl" />
          </Link>

          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>

          <div className="mt-8">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}
