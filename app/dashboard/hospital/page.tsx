'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Users, Calendar, TrendingUp, Stethoscope,
  Activity, ArrowRight, FileText, Video, ShieldCheck,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, type NavItem } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';

const hospitalNavItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard/hospital', icon: Activity },
  { label: 'Doctors', href: '/dashboard/hospital', icon: Stethoscope },
  { label: 'Patients', href: '/dashboard/hospital', icon: Users },
  { label: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
  { label: 'Reports', href: '/dashboard/documents', icon: FileText },
  { label: 'Analytics', href: '/dashboard/hospital', icon: TrendingUp },
  { label: 'Profile', href: '/dashboard/profile', icon: Building2 },
  { label: 'Settings', href: '/dashboard/settings', icon: ShieldCheck },
];

function HospitalDashboardContent() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ doctors: 0, patients: 0, appointments: 0, teleconsults: 0 });
  const [recentAppointments, setRecentAppointments] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [apptsRes, teleRes, apptsData] = await Promise.all([
        supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('hospital_id', user.id),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('hospital_id', user.id).eq('type', 'teleconsultation'),
        supabase.from('appointments').select('*').eq('hospital_id', user.id).order('appointment_date', { ascending: false }).limit(5),
      ]);

      const doctorIds = new Set((apptsData.data || []).map((a) => a.doctor_id).filter(Boolean));
      const patientIds = new Set((apptsData.data || []).map((a) => a.user_id).filter(Boolean));

      let doctorProfiles: any[] = [];
      if (doctorIds.size > 0) {
        const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', Array.from(doctorIds));
        doctorProfiles = data || [];
      }

      setStats({
        doctors: doctorIds.size,
        patients: patientIds.size,
        appointments: apptsRes.count || 0,
        teleconsults: teleRes.count || 0,
      });
      setRecentAppointments(apptsData.data || []);
      setDoctors(doctorProfiles);
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
    { label: 'Associated Doctors', value: stats.doctors, icon: Stethoscope, color: 'from-teal-500 to-emerald-500' },
    { label: 'Total Patients', value: stats.patients, icon: Users, color: 'from-blue-500 to-indigo-500' },
    { label: 'Appointments', value: stats.appointments, icon: Calendar, color: 'from-amber-500 to-orange-500' },
    { label: 'Teleconsultations', value: stats.teleconsults, icon: Video, color: 'from-purple-500 to-pink-500' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Hospital Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your doctors, patients, and appointments</p>
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
        {/* Recent appointments */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Recent Appointments</h2>
              <a href="/dashboard/appointments" className="text-xs font-semibold text-teal-600 hover:underline">View all</a>
            </div>
            <div className="mt-4 space-y-3">
              {loading ? (
                [1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-50" />)
              ) : recentAppointments.length > 0 ? (
                recentAppointments.map((apt) => (
                  <div key={apt.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                      {apt.type === 'teleconsultation' ? <Video className="h-5 w-5" /> : <Calendar className="h-5 w-5" />}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-800">{apt.reason || 'Appointment'}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(apt.appointment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold capitalize text-slate-600">
                      {apt.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center py-8 text-center">
                  <Calendar className="h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm text-slate-400">No appointments yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Associated doctors */}
        <div>
          <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">Associated Doctors</h2>
            <div className="mt-4 space-y-3">
              {loading ? (
                [1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-50" />)
              ) : doctors.length > 0 ? (
                doctors.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
                      {doc.full_name?.charAt(0).toUpperCase() || 'D'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">Dr. {doc.full_name || 'Doctor'}</div>
                      <div className="truncate text-xs text-slate-500">{doc.email}</div>
                    </div>
                    <ShieldCheck className="h-4 w-4 text-teal-500" />
                  </div>
                ))
              ) : (
                <div className="py-6 text-center">
                  <Stethoscope className="mx-auto h-6 w-6 text-slate-300" />
                  <p className="mt-2 text-xs text-slate-400">No doctors associated yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Add Doctor', desc: 'Associate a new doctor', icon: Stethoscope, href: '/dashboard/profile' },
          { label: 'View Patients', desc: 'See patient records', icon: Users, href: '/dashboard/hospital' },
          { label: 'Analytics', desc: 'View hospital metrics', icon: TrendingUp, href: '/dashboard/hospital' },
          { label: 'Generate Report', desc: 'Create a report', icon: FileText, href: '/dashboard/documents' },
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

export default function HospitalDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['hospital']}>
      <DashboardLayout navItems={hospitalNavItems} dashboardTitle="Hospital Portal">
        <HospitalDashboardContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
