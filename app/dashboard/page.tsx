'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { roleConfig } from '@/lib/auth-types';
import { Loader2 } from 'lucide-react';

export default function DashboardRouter() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/auth/sign-in');
      return;
    }
    if (!user.primaryRole) {
      router.push('/auth/sign-in?error=role');
      return;
    }
    router.push(roleConfig[user.primaryRole].dashboardPath);
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
    </div>
  );
}
