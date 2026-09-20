'use client';

import { DashboardLayout, caregiverNavItems, patientNavItems } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/lib/auth-context';
import DietPlanDashboard from '@/components/diet-plan/diet-plan-dashboard';

export default function DietPlanPage() {
  const { user } = useAuth();
  const navItems = user?.primaryRole === 'family_caregiver' ? caregiverNavItems : patientNavItems;

  return (
    <ProtectedRoute allowedRoles={['patient', 'family_caregiver', 'medical_advisor']}>
      <DashboardLayout navItems={navItems} dashboardTitle={user?.primaryRole === 'family_caregiver' ? 'Caregiver Dashboard' : 'Patient Dashboard'}>
        <DietPlanDashboard />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
