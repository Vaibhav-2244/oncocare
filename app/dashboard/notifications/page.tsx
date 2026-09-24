'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertCircle, TrendingUp, Pill, Calendar, FileText,
  Users, Clock, MessageCircle, Bell, Brain, Siren, User, Settings,
  CheckCheck, Trash2, MessageSquare, Info, BellRing, type LucideIcon,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, PATIENT_ROLES, caregiverNavItems, patientNavItems } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';

type NotificationType = 'appointment' | 'medication' | 'community' | 'system' | 'general';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  created_at: string;
}

type FilterKey = 'all' | 'unread' | 'read';

const TYPE_CONFIG: Record<NotificationType, { icon: LucideIcon; bg: string; text: string }> = {
  appointment: { icon: Calendar, bg: 'bg-blue-50', text: 'text-blue-600' },
  medication: { icon: Pill, bg: 'bg-teal-50', text: 'text-teal-600' },
  community: { icon: MessageSquare, bg: 'bg-purple-50', text: 'text-purple-600' },
  system: { icon: Info, bg: 'bg-amber-50', text: 'text-amber-600' },
  general: { icon: BellRing, bg: 'bg-slate-100', text: 'text-slate-600' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function StatSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
      <div className="mt-3 h-7 w-16 animate-pulse rounded bg-slate-100" />
      <div className="mt-1 h-3 w-24 animate-pulse rounded bg-slate-50" />
    </div>
  );
}

function NotificationSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-100 p-4">
      <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-50" />
      </div>
      <div className="h-2 w-2 animate-pulse rounded-full bg-slate-100" />
    </div>
  );
}

function NotificationsContent() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [actionId, setActionId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;
      setNotifications((data || []) as Notification[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadNotifications();
  }, [user, loadNotifications]);

  const handleMarkAsRead = async (id: string) => {
    setActionId(id);
    try {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
      if (updateError) throw updateError;
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark notification as read');
    } finally {
      setActionId(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    setMarkingAll(true);
    try {
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      if (updateError) throw updateError;
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark all as read');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleDelete = async (id: string) => {
    setActionId(id);
    try {
      const { error: deleteError } = await supabase.from('notifications').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete notification');
    } finally {
      setActionId(null);
    }
  };

  // stats
  const total = notifications.length;
  const unread = notifications.filter((n) => !n.is_read).length;
  const read = notifications.filter((n) => n.is_read).length;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = notifications.filter((n) => new Date(n.created_at) >= weekAgo).length;

  const statCards = [
    { label: 'Total', value: total, icon: Bell, color: 'from-teal-500 to-emerald-500' },
    { label: 'Unread', value: unread, icon: BellRing, color: 'from-rose-500 to-pink-500' },
    { label: 'Read', value: read, icon: CheckCheck, color: 'from-blue-500 to-indigo-500' },
    { label: 'This Week', value: thisWeek, icon: Clock, color: 'from-amber-500 to-orange-500' },
  ];

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'unread') return !n.is_read;
    if (filter === 'read') return n.is_read;
    return true;
  });

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'read', label: 'Read' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications Center</h1>
          <p className="mt-1 text-sm text-slate-500">Stay updated on appointments, medications, and community activity</p>
        </div>
        {unread > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            disabled={markingAll}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-60"
          >
            {markingAll ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            Mark All as Read
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? [0, 1, 2, 3].map((i) => <StatSkeleton key={i} />)
          : statCards.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm"
              >
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md',
                    stat.color,
                  )}
                >
                  <stat.icon className="h-5 w-5" />
                </div>
                <div className="mt-3 text-2xl font-bold text-slate-900">{stat.value}</div>
                <div className="text-xs text-slate-500">{stat.label}</div>
              </motion.div>
            ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 rounded-xl border border-slate-200/60 bg-white p-1.5 shadow-sm">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
              filter === f.key
                ? 'bg-gradient-to-r from-teal-50 to-emerald-50 text-teal-700 ring-1 ring-teal-200/40'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
            )}
          >
            {f.label}
            {f.key === 'unread' && unread > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                {unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
        <div className="space-y-3">
          {loading ? (
            [0, 1, 2, 3].map((i) => <NotificationSkeleton key={i} />)
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
                <Bell className="h-7 w-7" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">
                {filter === 'unread'
                  ? 'No unread notifications'
                  : filter === 'read'
                    ? 'No read notifications'
                    : 'No notifications yet'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                You&apos;re all caught up. New notifications will appear here.
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {filteredNotifications.map((notification, i) => {
                const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.general;
                const Icon = config.icon;
                return (
                  <motion.div
                    key={notification.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: i * 0.02 }}
                    className={cn(
                      'group flex items-start gap-3 rounded-xl border p-4 transition-colors',
                      notification.is_read
                        ? 'border-slate-100 bg-white'
                        : 'border-teal-100 bg-teal-50/30',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                        config.bg,
                        config.text,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
                        {!notification.is_read && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-teal-500" />
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-slate-600">{notification.message}</p>
                      <p className="mt-1 text-xs text-slate-400">{timeAgo(notification.created_at)}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {!notification.is_read && (
                        <button
                          onClick={() => handleMarkAsRead(notification.id)}
                          disabled={actionId === notification.id}
                          className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-teal-50 hover:text-teal-600 disabled:opacity-50"
                          aria-label="Mark as read"
                        >
                          {actionId === notification.id ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-teal-500" />
                          ) : (
                            <CheckCheck className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(notification.id)}
                        disabled={actionId === notification.id}
                        className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50"
                        aria-label="Delete notification"
                      >
                        {actionId === notification.id ? (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const navItems = user?.primaryRole === 'family_caregiver' ? caregiverNavItems : patientNavItems;

  return (
    <ProtectedRoute allowedRoles={PATIENT_ROLES}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <NotificationsContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
