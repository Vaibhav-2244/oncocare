'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { roleConfig } from '@/lib/auth-types';
import { supabase } from '@/lib/supabase-client';
import { useTranslations } from 'next-intl';

export default function AuthCallbackPage() {
  const t = useTranslations('auth.callback');
  const router = useRouter();
  const { user, loading, session, refreshUser } = useAuth();
  const handledRoleRef = useRef(false);

  useEffect(() => {
    if (loading) return;

    const applyStoredRole = async () => {
      if (!session || handledRoleRef.current) return;

      const role = sessionStorage.getItem('oncocare_signup_role');
      if (role) {
        handledRoleRef.current = true;
        sessionStorage.removeItem('oncocare_signup_role');

        try {
          await supabase.rpc('set_initial_signup_role', { p_role: role });
        } catch {
          // expected for existing users or unsupported roles; ignore and continue
        }

        await refreshUser();
        return;
      }

      handledRoleRef.current = true;
    };

    void applyStoredRole();
  }, [loading, refreshUser, session]);

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
