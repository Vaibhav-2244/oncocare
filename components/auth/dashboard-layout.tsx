'use client';

import { useState, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart, LayoutDashboard, User, Settings, FileText, MessageSquare,
  Calendar, Brain, Bell, LogOut, Menu, X, Search, ChevronDown,
  Activity, AlertCircle, TrendingUp, Pill, Users, Clock, MessageCircle,
  Siren,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { roleConfig, type RoleName } from '@/lib/auth-types';
import { cn } from '@/lib/utils';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export function DashboardLayout({
  children,
  navItems,
  dashboardTitle,
}: {
  children: ReactNode;
  navItems: NavItem[];
  dashboardTitle: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const initials = user?.profile?.full_name
    ? user.profile.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.phone?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <SidebarContent
          navItems={navItems}
          dashboardTitle={dashboardTitle}
          pathname={pathname}
          user={user}
          initials={initials}
          onSignOut={handleSignOut}
          userMenuOpen={userMenuOpen}
          setUserMenuOpen={setUserMenuOpen}
        />
      </aside>

      {/* Sidebar — mobile */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 bg-white lg:hidden"
            >
              <SidebarContent
                navItems={navItems}
                dashboardTitle={dashboardTitle}
                pathname={pathname}
                user={user}
                initials={initials}
                onSignOut={handleSignOut}
                userMenuOpen={userMenuOpen}
                setUserMenuOpen={setUserMenuOpen}
                onNavigate={() => setSidebarOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex flex-1 flex-col lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                className="w-64 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-xl p-1 hover:bg-slate-100"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-sm font-bold text-white">
                  {initials}
                </div>
                <span className="hidden text-sm font-medium text-slate-700 sm:block">
                  {user?.profile?.full_name || user?.phone || user?.email}
                </span>
                <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
              </button>

              <AnimatePresence>
                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
                    >
                      <div className="border-b border-slate-100 p-3">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {user?.profile?.full_name || 'User'}
                        </p>
                        <p className="truncate text-xs text-slate-500">{user?.phone || user?.email}</p>
                        {user?.primaryRole && (
                          <span className="mt-1.5 inline-block rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                            {roleConfig[user.primaryRole].displayName}
                          </span>
                        )}
                      </div>
                      <div className="p-1.5">
                        <Link href="/dashboard/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                          <User className="h-4 w-4" /> Profile
                        </Link>
                        <Link href="/dashboard/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                          <Settings className="h-4 w-4" /> Settings
                        </Link>
                        <button onClick={handleSignOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
                          <LogOut className="h-4 w-4" /> Sign Out
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  navItems,
  dashboardTitle,
  pathname,
  user,
  initials,
  onSignOut,
  userMenuOpen,
  setUserMenuOpen,
  onNavigate,
}: {
  navItems: NavItem[];
  dashboardTitle: string;
  pathname: string;
  user: ReturnType<typeof useAuth>['user'];
  initials: string;
  onSignOut: () => void;
  userMenuOpen: boolean;
  setUserMenuOpen: (v: boolean) => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6">
        <Link href="/" className="flex items-center gap-2" onClick={onNavigate}>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-600">
            <Heart className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900">OncoCare+</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {dashboardTitle}
        </p>
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-gradient-to-r from-teal-50 to-emerald-50 text-teal-700 ring-1 ring-teal-200/40'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                <item.icon className={cn('h-4 w-4', isActive ? 'text-teal-600' : 'text-slate-400')} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User card */}
      <div className="border-t border-slate-200 p-4">
        <Link href="/dashboard/profile" onClick={onNavigate} className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-50">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-sm font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {user?.profile?.full_name || 'User'}
            </p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

export const commonNavItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Symptoms', href: '/dashboard/symptoms', icon: AlertCircle },
  { label: 'Treatments', href: '/dashboard/treatments', icon: TrendingUp },
  { label: 'Medications', href: '/dashboard/medications', icon: Pill },
  { label: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
  { label: 'Documents', href: '/dashboard/documents', icon: FileText },
  { label: 'Care Team', href: '/dashboard/care-team', icon: Users },
  { label: 'Timeline', href: '/dashboard/timeline', icon: Clock },
  { label: 'Community', href: '/dashboard/community', icon: MessageCircle },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'AI Engine', href: '/dashboard/ai-engine', icon: Brain },
  { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  { label: 'Emergency', href: '/dashboard/emergency', icon: Siren },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];
