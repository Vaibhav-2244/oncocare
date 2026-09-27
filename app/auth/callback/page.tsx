'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { roleConfig } from '@/lib/auth-types';
import { useTranslations } from 'next-intl';

export default function AuthCallbackPage() {
  const t = useTranslations('auth.callback');
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (user) {
      if (!user.primaryRole) {
        router.push('/auth/sign-in?error=role');
        return;
      }
      router.push(roleConfig[user.primaryRole].dashboardPath);
    } else {
      router.push('/auth/sign-in');
    }
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
        <p className="text-sm text-slate-500">{t('completingSignIn')}</p>
      </div>
    </div>
  );
}
