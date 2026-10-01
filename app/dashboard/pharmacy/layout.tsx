'use client';

import type { ReactNode } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, PHARMACY_ROLES } from '@/components/auth/dashboard-layout';
import { PharmacyProvider } from '@/lib/pharmacy/PharmacyProvider';
import { PharmacyShell } from '@/lib/pharmacy/PharmacyShell';

export default function PharmacyLayout({ children }: { children: ReactNode }) {
  return <ProtectedRoute allowedRoles={PHARMACY_ROLES}>
    <DashboardLayout dashboardTitle="Pharmacy Portal">
      <PharmacyProvider><PharmacyShell>{children}</PharmacyShell></PharmacyProvider>
    </DashboardLayout>
  </ProtectedRoute>;
}
