'use client';

import { DashboardLayout, PATIENT_ROLES, caregiverNavItems, patientNavItems } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/lib/auth-context';
import DietPlanHistoryPage from '@/components/diet-plan/diet-plan-history-page';

export default function DietPlanHistoryRoute() {
  const { user } = useAuth();
  const navItems = user?.primaryRole === 'family_caregiver' ? caregiverNavItems : patientNavItems;

  return (
    <ProtectedRoute allowedRoles={PATIENT_ROLES}>
      <DashboardLayout navItems={navItems} dashboardTitle={user?.primaryRole === 'family_caregiver' ? 'Caregiver Dashboard' : 'Patient Dashboard'}>
        <DietPlanHistoryPage />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
