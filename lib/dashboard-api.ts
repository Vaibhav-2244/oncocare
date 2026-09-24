import { supabase } from './supabase-client';

export interface DashboardStats {
  appointmentsCount: number;
  messagesCount: number;
  documentsCount: number;
  watchlistCount: number;
}

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string | null;
  created_at: string;
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const [appointmentsRes, messagesRes, documentsRes, watchlistRes] = await Promise.all([
    supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('messages').select('id', { count: 'exact', head: true }).or(`sender_id.eq.${userId},recipient_id.eq.${userId}`),
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('user_watchlist').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  return {
    appointmentsCount: appointmentsRes.count || 0,
    messagesCount: messagesRes.count || 0,
    documentsCount: documentsRes.count || 0,
    watchlistCount: watchlistRes.count || 0,
  };
}

export async function getRecentActivity(userId: string, limit = 5): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return data || [];
}

export async function getNotifications(userId: string, limit = 5) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return data || [];
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
  if (error) throw error;
}

export async function getUpcomingAppointments(userId: string, limit = 3) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .gte('appointment_date', new Date().toISOString())
    .order('appointment_date', { ascending: true })
    .limit(limit);

  if (error) return [];
  return data || [];
}
