import { Suspense } from 'react';
import { DashboardAuthBootstrap } from '@/components/auth/dashboard-auth-bootstrap';
import { RouteLoading } from '@/components/shared/route-loading';

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<RouteLoading variant="dashboard" />}>
      <DashboardAuthBootstrap>{children}</DashboardAuthBootstrap>
    </Suspense>
  );
}
