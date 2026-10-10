'use client';

import { useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { RoleName } from '@/lib/auth-types';
import { Loader2 } from 'lucide-react';

export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: ReactNode;
  allowedRoles?: RoleName[];
}) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const hasAllowedRole = !allowedRoles || Boolean(
    user?.roles.some((role) => allowedRoles.includes(role.name)),
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/auth/sign-in');
      return;
    }
    if (!hasAllowedRole) {
      router.push('/dashboard');
    }
  }, [user, loading, router, hasAllowedRole]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
      </div>
    );
  }

  if (!hasAllowedRole) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
      </div>
    );
  }

  return <>{children}</>;
}
