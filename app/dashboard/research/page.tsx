'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FlaskConical, Users, Pill, TrendingUp, Activity,
  ArrowRight, FileText, Brain, BarChart3, Database,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, type NavItem } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';

const researchNavItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard/research', icon: Activity },
  { label: 'Analytics', href: '/dashboard/research', icon: BarChart3 },
  { label: 'Medicine Data', href: '/medicine-finder', icon: Pill },
  { label: 'AI Engine', href: '/dashboard/ai-engine', icon: Brain },
  { label: 'Profile', href: '/dashboard/profile', icon: Users },
  { label: 'Settings', href: '/dashboard/settings', icon: FileText },
];

function ResearchDashboardContent() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ totalUsers: 0, medicines: 0, pharmacies: 0, appointments: 0 });
  const [medicineCategories, setMedicineCategories] = useState<{ category: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, medsRes, pharmsRes, apptsRes, categoriesRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('medicines').select('id', { count: 'exact', head: true }),
        supabase.from('pharmacies').select('id', { count: 'exact', head: true }),
        supabase.from('appointments').select('id', { count: 'exact', head: true }),
        supabase.from('medicines').select('category'),
      ]);

      const categoryMap = new Map<string, number>();
      (categoriesRes.data || []).forEach((m: any) => {
        if (m.category) {
          categoryMap.set(m.category, (categoryMap.get(m.category) || 0) + 1);
        }
      });
      const categories = Array.from(categoryMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      setStats({
        totalUsers: usersRes.count || 0,
        medicines: medsRes.count || 0,
        pharmacies: pharmsRes.count || 0,
        appointments: apptsRes.count || 0,
      });
      setMedicineCategories(categories);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'Platform Users', value: stats.totalUsers, icon: Users, color: 'from-teal-500 to-emerald-500' },
    { label: 'Medicines Cataloged', value: stats.medicines, icon: Pill, color: 'from-blue-500 to-indigo-500' },
    { label: 'Partner Pharmacies', value: stats.pharmacies, icon: Database, color: 'from-amber-500 to-orange-500' },
    { label: 'Total Appointments', value: stats.appointments, icon: Activity, color: 'from-purple-500 to-pink-500' },
  ];

  const maxCategoryCount = Math.max(...medicineCategories.map((c) => c.count), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Research Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Anonymized platform analytics and research insights</p>
      </div>

      {/* Data disclaimer */}
      <div className="flex items-start gap-3 rounded-2xl border border-blue-200/40 bg-blue-50/50 p-4">
        <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
        <p className="text-xs leading-relaxed text-blue-700">
          <span className="font-semibold">Research Access:</span> All data shown here is anonymized and aggregated.
          No personally identifiable information (PII) is accessible through this dashboard.
        </p>
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Medicine categories chart */}
        <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Medicine Categories</h2>
            <BarChart3 className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-4 space-y-3">
            {loading ? (
              [1, 2, 3, 4].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-slate-50" />)
            ) : medicineCategories.length > 0 ? (
              medicineCategories.map((cat) => (
                <div key={cat.category}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{cat.category}</span>
                    <span className="text-slate-500">{cat.count}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(cat.count / maxCategoryCount) * 100}%` }}
                      transition={{ duration: 0.5 }}
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500"
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center">
                <BarChart3 className="mx-auto h-6 w-6 text-slate-300" />
                <p className="mt-2 text-xs text-slate-400">No data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Platform overview */}
        <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Platform Overview</h2>
            <TrendingUp className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-4 space-y-4">
            <div className="rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 p-4">
              <div className="text-xs font-semibold text-teal-700">User Distribution</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{stats.totalUsers}</div>
              <div className="text-xs text-slate-500">Total registered users across all roles</div>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
              <div className="text-xs font-semibold text-blue-700">Medicine Coverage</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{stats.medicines}</div>
              <div className="text-xs text-slate-500">Cancer medicines cataloged with pricing data</div>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 p-4">
              <div className="text-xs font-semibold text-amber-700">Pharmacy Network</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{stats.pharmacies}</div>
              <div className="text-xs text-slate-500">Verified pharmacy partners across India</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Medicine Data', desc: 'Browse medicine catalog', icon: Pill, href: '/medicine-finder' },
          { label: 'AI Engine', desc: 'AI-powered analysis', icon: Brain, href: '/dashboard/ai-engine' },
          { label: 'Export Data', desc: 'Download research data', icon: FileText, href: '/dashboard/research' },
          { label: 'Analytics', desc: 'View detailed metrics', icon: BarChart3, href: '/dashboard/research' },
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

export default function ResearchDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['research_partner']}>
      <DashboardLayout navItems={researchNavItems} dashboardTitle="Research Portal">
        <ResearchDashboardContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
