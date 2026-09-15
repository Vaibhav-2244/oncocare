'use client';

import { ReactNode } from 'react';
import { DashboardLayout, patientNavItems } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';

export default function InsuranceLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={['patient', 'family_caregiver', 'medical_advisor']}>
      <DashboardLayout navItems={patientNavItems} dashboardTitle="Patient Dashboard">
        {children}
      </DashboardLayout>
    </ProtectedRoute>
  );
}