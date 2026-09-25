'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart, LayoutDashboard, User, Settings, FileText, MessageSquare,
  Calendar, Brain, Bell, LogOut, Menu, X, Search, ChevronDown,
  Activity, AlertCircle, TrendingUp, Pill, Users, Clock, MessageCircle,
  Siren, Map, Video, BookOpen, Hospital,
  ShieldCheck, FileSearch, ChefHat, FlaskConical,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { roleConfig, type RoleName } from '@/lib/auth-types';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase-client';
import { Logo } from '@/components/shared/logo';

export const ADMIN_ROLES: RoleName[] = ['super_admin', 'admin'];
export const PATIENT_ROLES: RoleName[] = ['patient', 'family_caregiver', 'medical_advisor'];
export const PATIENT_CAREGIVER_ROLES: RoleName[] = ['patient', 'family_caregiver'];
export const PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES: RoleName[] = ['patient', 'family_caregiver', 'medical_advisor', 'admin', 'super_admin'];
export const CAREGIVER_ROLES: RoleName[] = ['family_caregiver'];
export const DOCTOR_ROLES: RoleName[] = ['doctor'];
export const HOSPITAL_ROLES: RoleName[] = ['hospital'];
export const PHARMACY_ROLES: RoleName[] = ['pharmacy'];
export const RESEARCH_PARTNER_ROLES: RoleName[] = ['research_partner'];

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export function DashboardLayout({
  children,
  dashboardTitle,
  navItems,
}: {
  children: ReactNode;
  navItems?: NavItem[];
  dashboardTitle: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const initials = user?.profile?.full_name
    ? user.profile.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.phone?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U';

  const dashboardNavItems = navItems || (user?.primaryRole === 'family_caregiver'
    ? caregiverNavItems
    : patientNavItems);
  // Full data search across appointments, medications, and documents can be added later.
  const filteredNavItems = searchQuery.trim()
    ? dashboardNavItems.filter((item) => item.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : [];

  useEffect(() => {
    if (!user) {
      setUnreadNotificationCount(0);
      return;
    }

    const fetchUnreadNotificationCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      setUnreadNotificationCount(count || 0);
    };

    fetchUnreadNotificationCount();
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, fetchUnreadNotificationCount)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const navigateToSearchResult = (href: string) => {
    router.push(href);
    setSearchQuery('');
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border bg-card lg:block">
        <SidebarContent
          navItems={dashboardNavItems}
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
              className="fixed inset-0 z-40 bg-slate-900/60 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card lg:hidden"
            >
              <SidebarContent
                navItems={dashboardNavItems}
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
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-md lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div ref={searchContainerRef} className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && filteredNavItems[0]) {
                    navigateToSearchResult(filteredNavItems[0].href);
                  }
                }}
                className="w-64 rounded-xl border border-border bg-muted py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-teal-300 focus:bg-card focus:outline-none focus:ring-2 focus:ring-teal-200/30"
              />
              {searchQuery.trim() && (
                <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-xl">
                  {filteredNavItems.length > 0 ? filteredNavItems.map((item) => (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => navigateToSearchResult(item.href)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <item.icon className="h-4 w-4 text-slate-400" />
                      {item.label}
                    </button>
                  )) : (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No results found</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard/notifications')}
              aria-label="View notifications"
              className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted"
            >
              <Bell className="h-5 w-5" />
              {unreadNotificationCount > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
              )}
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-xl p-1 hover:bg-muted"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-sm font-bold text-white">
                  {initials}
                </div>
                <span className="hidden text-sm font-medium text-foreground sm:block">
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
                      className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
                    >
                      <div className="border-b border-border p-3">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {user?.profile?.full_name || 'User'}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{user?.phone || user?.email}</p>
                        {user?.primaryRole && (
                          <span className="mt-1.5 inline-block rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                            {roleConfig[user.primaryRole].displayName}
                          </span>
                        )}
                      </div>
                      <div className="p-1.5">
                        <Link href="/dashboard/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                          <User className="h-4 w-4" /> Profile
                        </Link>
                        <Link href="/dashboard/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
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
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <Link href="/" className="flex items-center gap-2" onClick={onNavigate}>
          <Logo className="gap-2" textClassName="text-foreground" />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {dashboardTitle}
        </p>
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = item.href === '/dashboard'
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-gradient-to-r from-teal-50 to-emerald-50 text-teal-700 ring-1 ring-teal-200/40'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
      <div className="border-t border-border p-4">
        <Link href="/dashboard/profile" onClick={onNavigate} className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-sm font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {user?.profile?.full_name || 'User'}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

export const commonNavItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Personalized Nutrition', href: '/dashboard/diet-plan', icon: ChefHat },
  { label: 'BPL Donations', href: '/dashboard/bpl-donations', icon: Heart },
  { label: 'Symptoms', href: '/dashboard/symptoms', icon: AlertCircle },
  { label: 'Treatments', href: '/dashboard/treatments', icon: TrendingUp },
  { label: 'Medications', href: '/dashboard/medications', icon: Pill },
  { label: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
  { label: 'Tele-Oncology', href: '/dashboard/tele-oncology', icon: Video },
  { label: 'Documents', href: '/dashboard/documents', icon: FileText },
  { label: 'Lab Reports', href: '/dashboard/lab-reports', icon: FlaskConical },
  { label: 'Second Opinion', href: '/dashboard/second-opinion', icon: FileSearch },
  { label: 'Care Team', href: '/dashboard/care-team', icon: Users },
  { label: 'Caregiver Marketplace', href: '/dashboard/caregiver-marketplace', icon: Users },
  { label: 'Timeline', href: '/dashboard/timeline', icon: Clock },
  { label: 'Community', href: '/dashboard/community', icon: MessageCircle },
  { label: 'Cook & Maid', href: '/dashboard/cook-maid', icon: ChefHat },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'AI Engine', href: '/dashboard/ai-engine', icon: Brain },
  { label: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  { label: 'Emergency', href: '/dashboard/emergency', icon: Siren },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export const patientNavItems: NavItem[] = [
  ...commonNavItems,
  { label: 'Caregiver Support', href: '/dashboard/caregiver-support', icon: Heart },
  { label: 'Ayurveda Support', href: '/dashboard/ayurveda-support', icon: Activity },
  { label: 'Nearby Hospitals', href: '/dashboard/nearby-hospitals', icon: Hospital },
  { label: 'Cancer Journey Roadmap', href: '/dashboard/cancer-journey', icon: Map },
  { label: 'Survivor Stories', href: '/dashboard/survivor-stories', icon: BookOpen },
  { label: 'Cancer Insurance', href: '/dashboard/insurance', icon: ShieldCheck },
  { label: 'Government Schemes', href: '/dashboard/insurance/government-schemes', icon: ShieldCheck },
];

export const caregiverNavItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Caregiver Support', href: '/dashboard/caregiver-support', icon: Heart },
  { label: 'Ayurveda Support', href: '/dashboard/ayurveda-support', icon: Activity },
  { label: 'Patient Medications', href: '/dashboard/caregiver-medications', icon: Pill },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];
