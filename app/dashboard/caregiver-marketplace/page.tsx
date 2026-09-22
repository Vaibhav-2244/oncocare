import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES, commonNavItems } from '@/components/auth/dashboard-layout';
import CaregiverMarketplaceList from '@/components/caregiver-marketplace/marketplace-list';
import { getMarketplaceCaregivers } from '@/lib/caregiver-marketplace';

export const dynamic = 'force-dynamic';

export default async function CaregiverMarketplacePage() {
  const result = await getMarketplaceCaregivers();

  return (
    <ProtectedRoute allowedRoles={PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES}>
      <DashboardLayout navItems={commonNavItems} dashboardTitle="Patient Dashboard">
        <CaregiverMarketplaceList caregivers={result.caregivers} />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
