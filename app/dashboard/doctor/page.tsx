'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar, Users, FileText, Stethoscope, TrendingUp,
  Clock, ArrowRight, Video, Pill, Activity,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, type NavItem } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';

const doctorNavItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard/doctor', icon: Activity },
  { label: 'My Patients', href: '/dashboard/doctor', icon: Users },
  { label: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
  { label: 'Medical Notes', href: '/dashboard/documents', icon: FileText },
  { label: 'Teleconsultation', href: '/dashboard/appointments', icon: Video },
  { label: 'AI Engine', href: '/dashboard/ai-engine', icon: Stethoscope },
  { label: 'Profile', href: '/dashboard/profile', icon: Users },
  { label: 'Settings', href: '/dashboard/settings', icon: FileText },
];

function DoctorDashboardContent() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ patients: 0, appointments: 0, notes: 0, teleconsults: 0 });
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [apptsRes, teleRes, notesRes, upcomingRes, patientsRes] = await Promise.all([
        supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('doctor_id', user.id),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('doctor_id', user.id).eq('type', 'teleconsultation'),
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('appointments').select('*').eq('doctor_id', user.id).gte('appointment_date', new Date().toISOString()).order('appointment_date', { ascending: true }).limit(5),
        supabase.from('appointments').select('user_id, appointment_date, reason, status').eq('doctor_id', user.id).order('appointment_date', { ascending: false }).limit(5),
      ]);

      const patientIds = (patientsRes.data || []).map((p) => p.user_id).filter(Boolean);
      let patients: any[] = [];
      if (patientIds.length > 0) {
        const { data: patientProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url')
          .in('id', patientIds);
        patients = patientProfiles || [];
      }

      setStats({
        patients: new Set(patientIds).size,
        appointments: apptsRes.count || 0,
        notes: notesRes.count || 0,
        teleconsults: teleRes.count || 0,
      });
      setUpcomingAppointments(upcomingRes.data || []);
      setRecentPatients(patients);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'Total Patients', value: stats.patients, icon: Users, color: 'from-teal-500 to-emerald-500' },
    { label: 'Appointments', value: stats.appointments, icon: Calendar, color: 'from-blue-500 to-indigo-500' },
    { label: 'Teleconsultations', value: stats.teleconsults, icon: Video, color: 'from-purple-500 to-pink-500' },
    { label: 'Medical Notes', value: stats.notes, icon: FileText, color: 'from-amber-500 to-orange-500' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Doctor Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your patients, appointments, and medical notes</p>
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
            <div className="mt-3 text-2xl font-bold text-slate-900">{loading ? '—' : stat.value}</div>
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
              <a href="/dashboard/appointments" className="text-xs font-semibold text-teal-600 hover:underline">View all</a>
            </div>
            <div className="mt-4 space-y-3">
              {loading ? (
                [1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-50" />)
              ) : upcomingAppointments.length > 0 ? (
                upcomingAppointments.map((apt) => (
                  <div key={apt.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                      {apt.type === 'teleconsultation' ? <Video className="h-5 w-5" /> : <Calendar className="h-5 w-5" />}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-800">{apt.reason || 'Appointment'}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(apt.appointment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} at{' '}
                        {new Date(apt.appointment_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-semibold capitalize text-teal-700">
                      {apt.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center py-8 text-center">
                  <Calendar className="h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm text-slate-400">No upcoming appointments</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent patients */}
        <div>
          <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">Recent Patients</h2>
            <div className="mt-4 space-y-3">
              {loading ? (
                [1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-50" />)
              ) : recentPatients.length > 0 ? (
                recentPatients.map((patient) => (
                  <div key={patient.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-xs font-bold text-white">
                      {patient.full_name?.charAt(0).toUpperCase() || 'P'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">{patient.full_name || 'Patient'}</div>
                      <div className="truncate text-xs text-slate-500">{patient.email}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center">
                  <Users className="mx-auto h-6 w-6 text-slate-300" />
                  <p className="mt-2 text-xs text-slate-400">No patients yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Start Teleconsultation', desc: 'Begin a video call', icon: Video, href: '/dashboard/appointments' },
          { label: 'Write Medical Note', desc: 'Create a patient note', icon: FileText, href: '/dashboard/documents' },
          { label: 'AI Suggestions', desc: 'Get AI-powered insights', icon: Stethoscope, href: '/dashboard/ai-engine' },
          { label: 'View Schedule', desc: 'Check your calendar', icon: Calendar, href: '/dashboard/appointments' },
        ].map((action) => (
          <a key={action.label} href={action.href} className="group flex flex-col gap-2 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all hover:border-teal-200 hover:shadow-md">
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

export default function DoctorDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['doctor']}>
      <DashboardLayout navItems={doctorNavItems} dashboardTitle="Doctor Portal">
        <DoctorDashboardContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
