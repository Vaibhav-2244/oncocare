'use client';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { CAREGIVER_ROLES, DashboardLayout, caregiverNavItems } from '@/components/auth/dashboard-layout';
import type { ReactNode } from 'react';

export default function CaregiverLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={CAREGIVER_ROLES}>
      <DashboardLayout navItems={caregiverNavItems} dashboardTitle="Caregiver Dashboard">
        {children}
      </DashboardLayout>
    </ProtectedRoute>
  );
}
