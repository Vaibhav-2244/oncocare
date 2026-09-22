'use client';

import { ReactNode } from 'react';
import { DashboardLayout, PATIENT_ROLES, patientNavItems } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';

export default function InsuranceLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={PATIENT_ROLES}>
      <DashboardLayout navItems={patientNavItems} dashboardTitle="Patient Dashboard">
        {children}
      </DashboardLayout>
    </ProtectedRoute>
  );
}