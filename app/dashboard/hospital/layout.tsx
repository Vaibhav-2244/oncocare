'use client';

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, DOCTOR_ROLES, HOSPITAL_ROLES } from '@/components/auth/dashboard-layout';
import { HospitalProvider } from '@/lib/hospital/HospitalProvider';
import { HospitalShell } from '@/lib/hospital/HospitalShell';

export default function HospitalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const allowedRoles = useMemo(() => {
    const doctorOpdRoute = pathname === '/dashboard/hospital/opd' ||
      pathname.startsWith('/dashboard/hospital/opd/');
    return doctorOpdRoute ? [...HOSPITAL_ROLES, ...DOCTOR_ROLES] : HOSPITAL_ROLES;
  }, [pathname]);

  return (
    <ProtectedRoute allowedRoles={allowedRoles}>
      <DashboardLayout dashboardTitle="Hospital Portal">
        <HospitalProvider>
          <HospitalShell>{children}</HospitalShell>
        </HospitalProvider>
      </DashboardLayout>
    </ProtectedRoute>
  );
}