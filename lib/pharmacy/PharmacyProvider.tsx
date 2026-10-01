'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getErrorMessage } from '@/lib/errors';
import { pharmacyRolesCan, type PharmacyCapability } from '@/lib/pharmacy/permissions';
import { supabase } from '@/lib/supabase-client';
import type { PharmacyOrg } from '@/types/pharmacy';

interface PharmacyContextValue {
  org: PharmacyOrg | null;
  staffRoles: string[];
  can: (capability: PharmacyCapability) => boolean;
  isVerified: boolean;
  loading: boolean;
  error: string | null;
  technicalDetails: string | null;
  refresh: () => Promise<void>;
}

interface WorkspaceSnapshot {
  org: PharmacyOrg;
  staffRoles: string[];
}

const PharmacyContext = createContext<PharmacyContextValue | null>(null);
const EMPTY_ROLES: string[] = [];

export function PharmacyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [org, setOrg] = useState<PharmacyOrg | null>(null);
  const [staffRoles, setStaffRoles] = useState<string[]>(EMPTY_ROLES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [technicalDetails, setTechnicalDetails] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const dataOwnerUserIdRef = useRef<string | null>(null);
  const requestRef = useRef<{ userId: string; promise: Promise<WorkspaceSnapshot> } | null>(null);

  const refresh = useCallback(async () => {
    if (!user || user.primaryRole !== 'pharmacy') {
      requestRef.current = null;
      dataOwnerUserIdRef.current = null;
      setOrg(null);
      setStaffRoles(EMPTY_ROLES);
      setError(null);
      setTechnicalDetails(null);
      setLoading(false);
      return;
    }

    if (dataOwnerUserIdRef.current !== user.id) {
      dataOwnerUserIdRef.current = user.id;
      setOrg(null);
      setStaffRoles(EMPTY_ROLES);
    }

    setLoading(true);
    setError(null);
    setTechnicalDetails(null);

    try {
      let request = requestRef.current;
      if (!request || request.userId !== user.id) {
        const promise = (async (): Promise<WorkspaceSnapshot> => {
          const { data, error: ensureError } = await supabase.rpc('ensure_pharmacy_workspace');
          if (ensureError) throw ensureError;
          const ensuredOrg = (Array.isArray(data) ? data[0] : data) as PharmacyOrg | null;
          if (!ensuredOrg?.id) throw new Error('Workspace setup returned no pharmacy record.');

          const { data: memberships, error: memberError } = await supabase
            .from('pharmacy_members')
            .select('org_id, staff_role, created_at')
            .eq('org_id', ensuredOrg.id)
            .eq('user_id', user.id)
            .eq('is_active', true)
            .order('created_at', { ascending: true });
          if (memberError) throw memberError;
          if (!memberships?.length) throw new Error('No active membership was returned for this pharmacy workspace.');

          return {
            org: ensuredOrg,
            staffRoles: [...new Set(memberships.map((membership) => membership.staff_role))],
          };
        })();
        request = { userId: user.id, promise };
        requestRef.current = request;
      }

      const snapshot = await request.promise;
      if (!mountedRef.current || requestRef.current?.userId !== user.id) return;
      setOrg(snapshot.org);
      setStaffRoles(snapshot.staffRoles);
    } catch (loadError) {
      if (process.env.NODE_ENV === 'development') console.error('Pharmacy workspace load failed:', loadError);
      if (mountedRef.current && requestRef.current?.userId === user.id) {
        setError('Pharmacy workspace provisioning failed.');
        setTechnicalDetails(getErrorMessage(loadError));
      }
    } finally {
      if (requestRef.current?.userId === user.id) {
        requestRef.current = null;
        if (mountedRef.current) setLoading(false);
      }
    }
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  const can = useCallback((capability: PharmacyCapability) => pharmacyRolesCan(staffRoles, capability), [staffRoles]);
  const value = useMemo<PharmacyContextValue>(() => ({
    org,
    staffRoles,
    can,
    isVerified: org?.verification_status === 'verified',
    loading,
    error,
    technicalDetails,
    refresh,
  }), [org, staffRoles, can, loading, error, technicalDetails, refresh]);

  return <PharmacyContext.Provider value={value}>{children}</PharmacyContext.Provider>;
}

export function usePharmacy(): PharmacyContextValue {
  const context = useContext(PharmacyContext);
  if (!context) throw new Error('usePharmacy must be used within PharmacyProvider');
  return context;
}
