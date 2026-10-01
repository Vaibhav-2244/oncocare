'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import type { HospitalOrg } from '@/types/hospital';

export function useHospitalOrg() {
  const { user } = useAuth();
  const [org, setOrg] = useState<HospitalOrg | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadOrg = async () => {
      if (!user) {
        if (active) {
          setOrg(null);
          setLoading(false);
          setError(null);
        }
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('hospital_orgs')
          .select('*')
          .eq('owner_user_id', user.id)
          .maybeSingle();

        if (fetchError) throw fetchError;

        if (active) {
          setOrg(data as HospitalOrg | null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to load the hospital profile.');
          setOrg(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadOrg();

    return () => {
      active = false;
    };
  }, [user]);

  return { org, loading, error };
}
