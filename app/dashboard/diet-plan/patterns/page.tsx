'use client';

import { DashboardLayout, caregiverNavItems, patientNavItems } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/lib/auth-context';
import DietPatternsPage from '@/components/diet-plan/diet-patterns-page';

export default function DietPatternsRoute() {
  const { user } = useAuth();
  const navItems = user?.primaryRole === 'family_caregiver' ? caregiverNavItems : patientNavItems;

  return (
    <ProtectedRoute allowedRoles={['patient', 'family_caregiver', 'medical_advisor']}>
      <DashboardLayout navItems={navItems} dashboardTitle={user?.primaryRole === 'family_caregiver' ? 'Caregiver Dashboard' : 'Patient Dashboard'}>
        <DietPatternsPage />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
