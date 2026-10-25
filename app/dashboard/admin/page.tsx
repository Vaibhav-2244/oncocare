'use client';

import { ADMIN_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AdminWorkspace } from '@/components/admin/admin-workspace';

export default function AdminDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={ADMIN_ROLES}>
      <AdminWorkspace />
    </ProtectedRoute>
  );
}
