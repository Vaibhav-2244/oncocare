'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getErrorMessage } from '@/lib/errors';
import { hospitalRolesCan, type HospitalCapability } from '@/lib/hospital/permissions';
import { supabase } from '@/lib/supabase-client';
import type { HospitalOrg } from '@/types/hospital';

interface HospitalContextValue {
  org: HospitalOrg | null;
  orgs: HospitalOrg[];
  staffRoles: string[];
  can: (capability: HospitalCapability) => boolean;
  isVerified: boolean;
  loading: boolean;
  error: string | null;
  technicalDetails: string | null;
  refresh: () => Promise<void>;
  selectOrg: (hospitalId: string) => void;
}

interface WorkspaceSnapshot {
  orgs: HospitalOrg[];
  rolesByOrg: Record<string, string[]>;
  preferredOrgId: string;
}

const HospitalContext = createContext<HospitalContextValue | null>(null);
const EMPTY_ROLES: string[] = [];

export function HospitalProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<HospitalOrg[]>([]);
  const [rolesByOrg, setRolesByOrg] = useState<Record<string, string[]>>({});
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [technicalDetails, setTechnicalDetails] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const dataOwnerUserIdRef = useRef<string | null>(null);
  const requestRef = useRef<{ userId: string; promise: Promise<WorkspaceSnapshot> } | null>(null);

  const refresh = useCallback(async () => {
    if (!user || user.primaryRole !== 'hospital') {
      requestRef.current = null;
      dataOwnerUserIdRef.current = null;
      setOrgs([]);
      setRolesByOrg({});
      setSelectedOrgId('');
      setLoading(false);
      return;
    }

    if (dataOwnerUserIdRef.current !== user.id) {
      dataOwnerUserIdRef.current = user.id;
      setOrgs([]);
      setRolesByOrg({});
      setSelectedOrgId('');
    }

    setLoading(true);
    setError(null);
    setTechnicalDetails(null);

    try {
      let request = requestRef.current;
      if (!request || request.userId !== user.id) {
        const promise = (async (): Promise<WorkspaceSnapshot> => {
          const { data: ensuredOrg, error: ensureError } = await supabase.rpc('ensure_hospital_workspace');
          if (ensureError) throw ensureError;
          if (!ensuredOrg) throw new Error('Workspace setup returned no hospital record.');

          const { data: memberships, error: memberError } = await supabase
            .from('hospital_members')
            .select('hospital_id, staff_role, created_at')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .order('created_at', { ascending: true });
          if (memberError) throw memberError;

          const memberRows = (memberships ?? []) as { hospital_id: string; staff_role: string }[];
          const hospitalIds = [...new Set([ensuredOrg.id, ...memberRows.map((membership) => membership.hospital_id)])];
          const { data: hospitalRows, error: orgError } = await supabase
            .from('hospital_orgs')
            .select('*')
            .in('id', hospitalIds);
          if (orgError) throw orgError;

          const byId = new Map(((hospitalRows ?? []) as HospitalOrg[]).map((hospital) => [hospital.id, hospital]));
          const orderedOrgs = hospitalIds.map((id) => byId.get(id)).filter((hospital): hospital is HospitalOrg => Boolean(hospital));
          const nextRoles: Record<string, string[]> = {};
          memberRows.forEach((membership) => {
            nextRoles[membership.hospital_id] ??= [];
            if (!nextRoles[membership.hospital_id].includes(membership.staff_role)) {
              nextRoles[membership.hospital_id].push(membership.staff_role);
            }
          });
          return { orgs: orderedOrgs, rolesByOrg: nextRoles, preferredOrgId: ensuredOrg.id };
        })();
        request = { userId: user.id, promise };
        requestRef.current = request;
      }

      const snapshot = await request.promise;
      if (!mountedRef.current || requestRef.current?.userId !== user.id) return;
      setOrgs(snapshot.orgs);
      setRolesByOrg(snapshot.rolesByOrg);
      setSelectedOrgId((current) => snapshot.orgs.some((hospital) => hospital.id === current)
        ? current
        : snapshot.preferredOrgId);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error('Hospital workspace load failed:', err);
      if (mountedRef.current && requestRef.current?.userId === user.id) {
        setError('We could not load your hospital workspace. Try again, or show the technical details below.');
        setTechnicalDetails(getErrorMessage(err));
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

  const org = orgs.find((hospital) => hospital.id === selectedOrgId) ?? orgs[0] ?? null;
  const staffRoles = org ? rolesByOrg[org.id] ?? EMPTY_ROLES : EMPTY_ROLES;
  const can = useCallback((capability: HospitalCapability) => hospitalRolesCan(staffRoles, capability), [staffRoles]);
  const selectOrg = useCallback((hospitalId: string) => {
    if (orgs.some((hospital) => hospital.id === hospitalId)) setSelectedOrgId(hospitalId);
  }, [orgs]);

  const value = useMemo<HospitalContextValue>(() => ({
    org,
    orgs,
    staffRoles,
    can,
    isVerified: org?.verification_status === 'verified',
    loading,
    error,
    technicalDetails,
    refresh,
    selectOrg,
  }), [org, orgs, staffRoles, can, loading, error, technicalDetails, refresh, selectOrg]);

  return <HospitalContext.Provider value={value}>{children}</HospitalContext.Provider>;
}

export function useHospital(): HospitalContextValue {
  const context = useContext(HospitalContext);
  if (!context) throw new Error('useHospital must be used within HospitalProvider');
  return context;
}