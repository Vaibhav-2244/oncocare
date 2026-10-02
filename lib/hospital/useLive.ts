'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase-client';

type LiveStatus = 'live' | 'reconnecting' | 'polling';
type LiveOptions = { hospitalId: string; tables: string[]; intervalMs?: number };

export function useLiveData<T>(fetcher: () => Promise<T>, { hospitalId, tables, intervalMs = 20000 }: LiveOptions) {
  const fetcherRef = useRef(fetcher);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [technicalDetails, setTechnicalDetails] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [status, setStatus] = useState<LiveStatus>('reconnecting');
  const tableKey = tables.join('|');
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    setTechnicalDetails(null);
    try {
      const next = await fetcherRef.current();
      setData(next);
      setLastUpdated(new Date());
    } catch (caught) {
      setError('We could not load the latest hospital data.');
      setTechnicalDetails(getErrorMessage(caught));
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hospitalId) return;
    void refresh();
    const channel = supabase.channel(`hospital-live-${hospitalId}-${tableKey.replaceAll('|', '-')}`);
    for (const table of tableKey ? tableKey.split('|') : []) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `hospital_id=eq.${hospitalId}` }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => void refresh(), 500);
      });
    }
    channel.subscribe((channelStatus) => setStatus(channelStatus === 'SUBSCRIBED' ? 'live' : 'reconnecting'));
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => {
      clearInterval(timer);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [hospitalId, intervalMs, refresh, tableKey]);

  return { data, loading, error, technicalDetails, refresh, lastUpdated, status };
}
