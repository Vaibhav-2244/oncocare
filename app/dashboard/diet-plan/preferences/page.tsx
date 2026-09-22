'use client';

import { DashboardLayout, PATIENT_ROLES, caregiverNavItems, patientNavItems } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/lib/auth-context';
import DietPreferencesForm from '@/components/diet-preferences/diet-preferences-form';

export default function DietPreferencesRoute() {
  const { user } = useAuth();
  const navItems = user?.primaryRole === 'family_caregiver' ? caregiverNavItems : patientNavItems;

  return (
    <ProtectedRoute allowedRoles={PATIENT_ROLES}>
      <DashboardLayout navItems={navItems} dashboardTitle={user?.primaryRole === 'family_caregiver' ? 'Caregiver Dashboard' : 'Patient Dashboard'}>
        <DietPreferencesForm />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
