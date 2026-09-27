import { supabase } from '@/lib/supabase-client';

const CACHE_TTL_MS = 30_000;
const countCache = new Map<string, { count: number; updatedAt: number }>();
const pendingCounts = new Map<string, Promise<number>>();

export function getCachedUnreadNotificationCount(userId: string) {
  return countCache.get(userId)?.count;
}

export function loadUnreadNotificationCount(userId: string, forceRefresh = false) {
  const cached = countCache.get(userId);
  if (!forceRefresh && cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached.count);
  }

  const pending = pendingCounts.get(userId);
  if (pending) return pending;

  const request = Promise.resolve(
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false),
  )
    .then(({ count }) => {
      const unreadCount = count || 0;
      countCache.set(userId, { count: unreadCount, updatedAt: Date.now() });
      return unreadCount;
    })
    .finally(() => pendingCounts.delete(userId));

  pendingCounts.set(userId, request);
  return request;
}