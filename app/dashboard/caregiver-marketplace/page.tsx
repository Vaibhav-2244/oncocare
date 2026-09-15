import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, commonNavItems } from '@/components/auth/dashboard-layout';
import CaregiverMarketplaceList from '@/components/caregiver-marketplace/marketplace-list';
import { getMarketplaceCaregivers } from '@/lib/caregiver-marketplace';

export const dynamic = 'force-dynamic';

export default async function CaregiverMarketplacePage() {
  const result = await getMarketplaceCaregivers();

  return (
    <ProtectedRoute allowedRoles={['patient', 'family_caregiver', 'medical_advisor', 'admin', 'super_admin']}>
      <DashboardLayout navItems={commonNavItems} dashboardTitle="Patient Dashboard">
        <CaregiverMarketplaceList caregivers={result.caregivers} />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
