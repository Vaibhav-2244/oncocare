'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Shield, Building2, Pill, TrendingUp, Search,
  ArrowRight, Activity, FileText, Settings, Brain, Stethoscope,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, type NavItem } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { roleConfig, type RoleName } from '@/lib/auth-types';
import { cn } from '@/lib/utils';

const adminNavItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard/admin', icon: Activity },
  { label: 'User Management', href: '/dashboard/admin', icon: Users },
  { label: 'Medicine Finder', href: '/medicine-finder', icon: Pill },
  { label: 'Pharmacy Admin', href: '/admin', icon: Shield },
  { label: 'Partner Portal', href: '/partner-portal', icon: Building2 },
  { label: 'Profile', href: '/dashboard/profile', icon: Users },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

function AdminDashboardContent() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ totalUsers: 0, doctors: 0, hospitals: 0, pharmacies: 0 });
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('id, email, full_name, created_at').order('created_at', { ascending: false }).limit(20),
        supabase.from('user_roles').select('user_id, role:roles(name)'),
      ]);

      const roleMap = new Map<string, string>();
      (rolesRes.data || []).forEach((ur: any) => {
        if (ur.role?.name) roleMap.set(ur.user_id, ur.role.name);
      });

      const usersWithRoles = (profilesRes.data || []).map((p) => ({
        ...p,
        roleName: roleMap.get(p.id) || 'patient',
      }));

      setUsers(usersWithRoles);

      const doctorCount = Array.from(roleMap.values()).filter((r) => r === 'doctor').length;
      const hospitalCount = Array.from(roleMap.values()).filter((r) => r === 'hospital').length;
      const pharmacyCount = Array.from(roleMap.values()).filter((r) => r === 'pharmacy').length;

      setStats({
        totalUsers: usersWithRoles.length,
        doctors: doctorCount,
        hospitals: hospitalCount,
        pharmacies: pharmacyCount,
      });
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((u) =>
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statCards = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'from-teal-500 to-emerald-500' },
    { label: 'Doctors', value: stats.doctors, icon: Stethoscope, color: 'from-blue-500 to-indigo-500' },
    { label: 'Hospitals', value: stats.hospitals, icon: Building2, color: 'from-amber-500 to-orange-500' },
    { label: 'Pharmacies', value: stats.pharmacies, icon: Pill, color: 'from-purple-500 to-pink-500' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Manage users, verify partners, and monitor platform health</p>
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

      {/* User management table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">User Management</h2>
            <p className="text-xs text-slate-500">View and manage all registered users</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              className="rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-teal-300 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Joined</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td colSpan={4} className="px-5 py-4"><div className="h-8 animate-pulse rounded bg-slate-50" /></td>
                  </tr>
                ))
              ) : filteredUsers.length > 0 ? (
                filteredUsers.map((u) => {
                  const role = u.roleName as RoleName;
                  const config = roleConfig[role];
                  return (
                    <tr key={u.id} className="border-b border-slate-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-xs font-bold text-white">
                            {u.full_name?.charAt(0).toUpperCase() || u.email?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-800">{u.full_name || 'Unnamed User'}</div>
                            <div className="text-[10px] text-slate-400">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-semibold text-teal-700">
                          {config?.displayName || 'Patient'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-slate-400">Managed in profile</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center">
                    <Users className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm text-slate-400">No users found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Pharmacy Admin', desc: 'Manage pharmacy inventory', icon: Shield, href: '/admin' },
          { label: 'Partner Portal', desc: 'Verify new partners', icon: Building2, href: '/partner-portal' },
          { label: 'Medicine Finder', desc: 'View medicine catalog', icon: Pill, href: '/medicine-finder' },
          { label: 'System Settings', desc: 'Platform configuration', icon: Settings, href: '/dashboard/settings' },
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

export default function AdminDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
      <DashboardLayout navItems={adminNavItems} dashboardTitle="Admin Panel">
        <AdminDashboardContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
