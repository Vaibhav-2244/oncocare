'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar, MessageSquare, FileText, Heart, TrendingUp,
  Bell, Activity, Clock, ArrowRight, CheckCircle2,
  User, Brain, Pill,
  ChefHat,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { caregiverNavItems, DashboardLayout, PATIENT_ROLES, patientNavItems } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { getRecentActivity, getNotifications } from '@/lib/dashboard-api';
import type { ActivityItem } from '@/lib/dashboard-api';

function PatientDashboardContent() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ appointments: 0, messages: 0, documents: 0, watchlist: 0 });
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [apptsRes, msgsRes, docsRes, wlRes, actRes, notifRes, upcomingRes] = await Promise.all([
        supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('recipient_id', user.id).eq('is_read', false),
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('user_watchlist').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        getRecentActivity(user.id, 5),
        getNotifications(user.id, 4),
        supabase.from('appointments').select('*').eq('user_id', user.id).gte('appointment_date', new Date().toISOString()).order('appointment_date', { ascending: true }).limit(3),
      ]);

      setStats({
        appointments: apptsRes.count || 0,
        messages: msgsRes.count || 0,
        documents: docsRes.count || 0,
        watchlist: wlRes.count || 0,
      });
      setActivity(actRes);
      setNotifications(notifRes);
      setUpcomingAppointments(upcomingRes.data || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, loadData]);

  const statCards = [
    { label: 'Appointments', value: stats.appointments, icon: Calendar, color: 'from-teal-500 to-emerald-500', href: '/dashboard/appointments' },
    { label: 'Unread Messages', value: stats.messages, icon: MessageSquare, color: 'from-blue-500 to-indigo-500', href: '/dashboard/messages' },
    { label: 'Documents', value: stats.documents, icon: FileText, color: 'from-amber-500 to-orange-500', href: '/dashboard/documents' },
    { label: 'Watchlist Items', value: stats.watchlist, icon: Heart, color: 'from-rose-500 to-pink-500', href: '/medicine-finder' },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome back, {user?.profile?.full_name?.split(' ')[0] || 'there'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Here&apos;s an overview of your care journey</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${stat.color} text-white shadow-md`}>
              <stat.icon className="h-5 w-5" />
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900">
              {loading ? '—' : stat.value}
            </div>
            <div className="text-xs text-slate-500">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upcoming appointments */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Upcoming Appointments</h2>
              <a href="/dashboard/appointments" className="text-xs font-semibold text-teal-600 hover:underline">
                View all
              </a>
            </div>
            <div className="mt-4 space-y-3">
              {loading ? (
                [1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-50" />
                ))
              ) : upcomingAppointments.length > 0 ? (
                upcomingAppointments.map((apt) => (
                  <div key={apt.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-800">{apt.reason || 'Appointment'}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(apt.appointment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} at{' '}
                        {new Date(apt.appointment_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-semibold capitalize text-teal-700">
                      {apt.type || 'in_person'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center py-8 text-center">
                  <Calendar className="h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm text-slate-400">No upcoming appointments</p>
                  <a href="/dashboard/appointments" className="mt-3 text-xs font-semibold text-teal-600 hover:underline">
                    Schedule one
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div>
          <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Notifications</h2>
              <Bell className="h-4 w-4 text-slate-400" />
            </div>
            <div className="mt-4 space-y-3">
              {loading ? (
                [1, 2].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-50" />
                ))
              ) : notifications.length > 0 ? (
                notifications.map((notif) => (
                  <div key={notif.id} className="flex items-start gap-2 rounded-xl border border-slate-100 p-3">
                    <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-teal-500" />
                    <div>
                      <div className="text-xs font-semibold text-slate-800">{notif.title}</div>
                      {notif.message && <div className="text-[11px] text-slate-500">{notif.message}</div>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center">
                  <Bell className="mx-auto h-6 w-6 text-slate-300" />
                  <p className="mt-2 text-xs text-slate-400">No notifications</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Recent Activity</h2>
          <Activity className="h-4 w-4 text-slate-400" />
        </div>
        <div className="mt-4 space-y-3">
          {loading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-50" />
            ))
          ) : activity.length > 0 ? (
            activity.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800">{item.title}</div>
                  {item.description && <div className="text-xs text-slate-500">{item.description}</div>}
                </div>
                <span className="text-[10px] text-slate-400">
                  {new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            ))
          ) : (
            <div className="py-6 text-center">
              <Activity className="mx-auto h-6 w-6 text-slate-300" />
              <p className="mt-2 text-xs text-slate-400">No recent activity</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Personalized Nutrition', desc: 'View today\'s meal plan', icon: ChefHat, href: '/dashboard/diet-plan' },
          { label: 'Track Symptoms', desc: 'Log and monitor symptoms', icon: Activity, href: '/dashboard/symptoms' },
          { label: 'Treatment Tracker', desc: 'View treatment progress', icon: TrendingUp, href: '/dashboard/treatments' },
          { label: 'Medication Reminders', desc: 'Manage medication schedule', icon: Heart, href: '/dashboard/medications' },
          { label: 'Appointments', desc: 'Book and manage visits', icon: Calendar, href: '/dashboard/appointments' },
          { label: 'Documents', desc: 'Upload medical records', icon: FileText, href: '/dashboard/documents' },
          { label: 'Community', desc: 'Connect with others', icon: MessageSquare, href: '/dashboard/community' },
          { label: 'Notifications', desc: 'Stay updated', icon: Bell, href: '/dashboard/notifications' },
          { label: 'AI Engine', desc: 'Ask questions, upload reports', icon: Brain, href: '/dashboard/ai-engine' },
          { label: 'Care Team', desc: 'Your doctors and caregivers', icon: User, href: '/dashboard/care-team' },
          { label: 'Health Timeline', desc: 'Your medical journey', icon: Calendar, href: '/dashboard/timeline' },
          { label: 'Medicine Finder', desc: 'Compare prices & availability', icon: Pill, href: '/medicine-finder' },
          { label: 'Emergency SOS', desc: 'Quick access to emergency help', icon: Clock, href: '/dashboard/emergency' },
        ].map((action) => (
          <a
            key={action.label}
            href={action.href}
            className="group flex flex-col gap-2 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all hover:border-teal-200 hover:shadow-md"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <action.icon className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">{action.label}</div>
              <div className="text-xs text-slate-500">{action.desc}</div>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-slate-300 transition-colors group-hover:text-teal-500" />
          </a>
        ))}
      </div>
    </div>
  );
}

export default function PatientDashboardPage() {
  const { user } = useAuth();

  return (
    <ProtectedRoute allowedRoles={PATIENT_ROLES}>
      <DashboardLayout navItems={user?.primaryRole === 'family_caregiver' ? caregiverNavItems : patientNavItems} dashboardTitle={user?.primaryRole === 'family_caregiver' ? 'Caregiver Dashboard' : 'Patient Dashboard'}>
        <PatientDashboardContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
