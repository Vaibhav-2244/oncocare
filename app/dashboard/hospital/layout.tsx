'use client';

import type { ReactNode } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, DOCTOR_ROLES, HOSPITAL_ROLES } from '@/components/auth/dashboard-layout';
import { HospitalProvider } from '@/lib/hospital/HospitalProvider';
import { HospitalShell } from '@/lib/hospital/HospitalShell';

export default function HospitalLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={[...HOSPITAL_ROLES, ...DOCTOR_ROLES]}>
      <DashboardLayout dashboardTitle="Hospital Portal">
        <HospitalProvider>
          <HospitalShell>{children}</HospitalShell>
        </HospitalProvider>
      </DashboardLayout>
    </ProtectedRoute>
  );
}