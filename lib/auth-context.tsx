'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase-client';
import type { AuthUser, Profile, Role, RoleName } from '@/lib/auth-types';

interface AuthContextValue {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string, role: RoleName) => Promise<{ error: string | null }>;
  signInWithOAuth: (provider: 'google' | 'github' | 'azure') => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  resendVerification: (email: string) => Promise<{ error: string | null }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async (authUser: User): Promise<AuthUser> => {
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle(),
      supabase
        .from('user_roles')
        .select('role:roles(*)')
        .eq('user_id', authUser.id),
    ]);

    const profile = profileRes.data as Profile | null;
    const roles: Role[] = (rolesRes.data || [])
      .map((r: any) => r.role)
      .filter((r: any): r is Role => r !== null && r !== undefined);

    return {
      id: authUser.id,
      email: authUser.email || '',
      profile,
      roles,
      primaryRole: roles[0]?.name || null,
    };
  }, []);

  const refreshUser = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession?.user) {
      const userData = await fetchUserData(currentSession.user);
      setUser(userData);
      setSession(currentSession);
    } else {
      setUser(null);
      setSession(null);
    }
  }, [fetchUserData]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (initialSession?.user) {
        try {
          const userData = await fetchUserData(initialSession.user);
          if (mounted) {
            setUser(userData);
            setSession(initialSession);
          }
        } catch {
          if (mounted) {
            setUser(null);
          }
        }
      }
      if (mounted) setLoading(false);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !newSession) {
        setUser(null);
        setSession(null);
        return;
      }

      if (newSession.user) {
        try {
          const userData = await fetchUserData(newSession.user);
          if (mounted) {
            setUser(userData);
            setSession(newSession);
          }
        } catch {
          if (mounted) setUser(null);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserData]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message || null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string, role: RoleName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    });
    if (error) return { error: error.message };

    if (data.user) {
      const { data: roleData } = await supabase.from('roles').select('id').eq('name', role).maybeSingle();
      if (roleData) {
        await supabase.from('user_roles').insert({ user_id: data.user.id, role_id: roleData.id });
      }
      await supabase.from('notification_preferences').insert({ user_id: data.user.id }).then(() => {});
    }

    return { error: null };
  }, []);

  const signInWithOAuth = useCallback(async (provider: 'google' | 'github' | 'azure') => {
    const providerMap: Record<string, 'google' | 'github' | 'azure'> = {
      google: 'google',
      github: 'github',
      azure: 'azure',
    };
    const { error } = await supabase.auth.signInWithOAuth({
      provider: providerMap[provider],
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    return { error: error?.message || null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    return { error: error?.message || null };
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message || null };
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    return { error: error?.message || null };
  }, []);

  const value: AuthContextValue = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signInWithOAuth,
    signOut,
    resetPassword,
    updatePassword,
    resendVerification,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
