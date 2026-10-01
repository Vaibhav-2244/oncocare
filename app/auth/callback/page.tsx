'use client';

import { useEffect, useRef, useState } from 'react';
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
  const roleResolutionRef = useRef<Promise<void> | null>(null);
  const [roleResolutionComplete, setRoleResolutionComplete] = useState(false);

  useEffect(() => {
    if (loading) return;
    let active = true;

    if (!session) {
      setRoleResolutionComplete(true);
      return () => {
        active = false;
      };
    }

    if (!roleResolutionRef.current) {
      roleResolutionRef.current = (async () => {
        let role: string | null = null;
        try {
          role = sessionStorage.getItem('oncocare_signup_role');
          if (role) sessionStorage.removeItem('oncocare_signup_role');
        } catch {
          role = null;
        }

        if (role) {
          try {
            await supabase.rpc('set_initial_signup_role', { p_role: role });
          } catch {
            // OAuth role assignment failures must not block sign-in.
          }
        }

        try {
          await refreshUser();
        } catch {
          // The redirect effect handles a user refresh that cannot be completed.
        }
      })();
    }

    void roleResolutionRef.current.then(() => {
      if (active) setRoleResolutionComplete(true);
    });

    return () => {
      active = false;
    };
  }, [loading, refreshUser, session]);

  useEffect(() => {
    if (loading || !roleResolutionComplete) return;

    if (user) {
      if (!user.primaryRole) {
        router.push('/auth/sign-in?error=role');
        return;
      }
      router.push(roleConfig[user.primaryRole].dashboardPath);
    } else {
      router.push('/auth/sign-in');
    }
  }, [user, loading, roleResolutionComplete, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
        <p className="text-sm text-slate-500">{t('completingSignIn')}</p>
      </div>
    </div>
  );
}
