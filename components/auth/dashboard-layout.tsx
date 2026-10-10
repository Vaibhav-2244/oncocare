'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, Bell, ChevronDown, LogOut, Menu, Search, Settings, User } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { roleConfig } from '@/lib/auth-types';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase-client';
import { getCachedUnreadNotificationCount, loadUnreadNotificationCount } from '@/lib/notification-count-cache';
import { Logo } from '@/components/shared/logo';
import { DoctorWorkspaceChrome } from '@/components/doctor/DoctorWorkspaceChrome';
import { useTranslations } from 'next-intl';
import {
  ADMIN_ROLES,
  ALL_ROLES,
  CAREGIVER_ROLES,
  DOCTOR_ROLES,
  HOSPITAL_ROLES,
  PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES,
  PATIENT_CAREGIVER_ROLES,
  PATIENT_ROLES,
  PHARMACY_ROLES,
  RESEARCH_PARTNER_ROLES,
  STAFF_AND_PARTNER_ROLES,
  caregiverNavItems,
  commonNavItems,
  getDashboardWorkspaceRole,
  getDashboardTitleForRole,
  getNavItemsForRole,
  patientNavItems,
  type NavItem,
} from '@/lib/dashboard-nav';

export {
  ADMIN_ROLES,
  ALL_ROLES,
  CAREGIVER_ROLES,
  DOCTOR_ROLES,
  HOSPITAL_ROLES,
  PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES,
  PATIENT_CAREGIVER_ROLES,
  PATIENT_ROLES,
  PHARMACY_ROLES,
  RESEARCH_PARTNER_ROLES,
  STAFF_AND_PARTNER_ROLES,
  caregiverNavItems,
  commonNavItems,
  patientNavItems,
};
export type { NavItem } from '@/lib/dashboard-nav';

export function DashboardLayout({
  children,
  dashboardTitle,
}: {
  children: ReactNode;
  navItems?: NavItem[];
  dashboardTitle?: string;
}) {
  const t = useTranslations('components.auth.dashboardLayout');
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentHash, setCurrentHash] = useState('');
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(() =>
    user ? getCachedUnreadNotificationCount(user.id) || 0 : 0,
  );
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/dashboard');
  };

  const initials = user?.profile?.full_name
    ? user.profile.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.phone?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U';

  const workspaceRole = getDashboardWorkspaceRole(
    pathname,
    user?.roles.map((role) => role.name) ?? [],
  );
  const resolvedRole = workspaceRole ?? user?.primaryRole ?? null;
  const dashboardNavItems = getNavItemsForRole(resolvedRole);
  const resolvedTitle = getDashboardTitleForRole(resolvedRole);
  const title = workspaceRole ? resolvedTitle : dashboardTitle || resolvedTitle;

  const filteredNavItems = searchQuery.trim()
    ? dashboardNavItems.filter((item) => item.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : [];

  useEffect(() => {
    setCurrentHash(window.location.hash || '');
    setSidebarOpen(false);
    setUserMenuOpen(false);
    setSearchQuery('');
  }, [pathname]);

  useEffect(() => {
    const handleHashChange = () => setCurrentHash(window.location.hash || '');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!user) {
      setUnreadNotificationCount(0);
      return;
    }

    setUnreadNotificationCount(getCachedUnreadNotificationCount(user.id) || 0);
    let active = true;
    const fetchUnreadNotificationCount = async (forceRefresh = false) => {
      const count = await loadUnreadNotificationCount(user.id, forceRefresh);
      if (active) setUnreadNotificationCount(count);
    };

    void fetchUnreadNotificationCount();
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        void fetchUnreadNotificationCount(true);
      })
      .subscribe();

    return () => {
      active = false;
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

  if (workspaceRole === 'doctor') {
    return (
      <DoctorWorkspaceChrome title={title} unreadNotificationCount={unreadNotificationCount}>
        {children}
      </DoctorWorkspaceChrome>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border bg-card lg:block">
        <SidebarContent
          navItems={dashboardNavItems}
          dashboardTitle={title}
          pathname={pathname}
          currentHash={currentHash}
          user={user}
          initials={initials}
          unreadNotificationCount={user?.primaryRole === 'pharmacy' || user?.primaryRole === 'doctor' || user?.primaryRole === 'hospital' ? unreadNotificationCount : 0}
        />
      </aside>

      {sidebarOpen && (
        <>
          <div
            className="dashboard-overlay-enter fixed inset-0 z-40 bg-slate-900/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="dashboard-sidebar-enter fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card lg:hidden">
            <SidebarContent
              navItems={dashboardNavItems}
              dashboardTitle={title}
              pathname={pathname}
              currentHash={currentHash}
              user={user}
              initials={initials}
              unreadNotificationCount={user?.primaryRole === 'pharmacy' || user?.primaryRole === 'doctor' || user?.primaryRole === 'hospital' ? unreadNotificationCount : 0}
              onNavigate={() => setSidebarOpen(false)}
            />
          </aside>
        </>
      )}

      <div className="flex flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-md lg:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Go back"
              title="Go back"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background/80 text-slate-600 shadow-sm transition-colors hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
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
                placeholder={t('search')}
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
                      key={`${item.label}-${item.href}`}
                      type="button"
                      onClick={() => navigateToSearchResult(item.href)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <item.icon className="h-4 w-4 text-slate-400" />
                      {item.label}
                    </button>
                  )) : (
                    <p className="px-3 py-2 text-sm text-muted-foreground">{t('noResultsFound')}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard/notifications')}
              aria-label={t('viewNotifications')}
              className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted"
            >
              <Bell className="h-5 w-5" />
              {unreadNotificationCount > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
              )}
            </button>

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

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="dashboard-menu-enter absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                    <div className="border-b border-border p-3">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {user?.profile?.full_name || t('user')}
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
                        <User className="h-4 w-4" /> {t('profile')}{' '}
                      </Link>
                      <Link href="/dashboard/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                        <Settings className="h-4 w-4" /> {t('settings')}{' '}
                      </Link>
                      <button onClick={handleSignOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
                        <LogOut className="h-4 w-4" /> {t('signOut')}{' '}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  navItems,
  dashboardTitle,
  pathname,
  currentHash,
  user,
  initials,
  unreadNotificationCount,
  onNavigate,
}: {
  navItems: NavItem[];
  dashboardTitle: string;
  pathname: string;
  currentHash: string;
  user: ReturnType<typeof useAuth>['user'];
  initials: string;
  unreadNotificationCount: number;
  onNavigate?: () => void;
}) {
  const t = useTranslations('components.auth.dashboardLayout');

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-border px-4">
        <Link href="/" className="flex items-center gap-2" onClick={onNavigate}>
          <Logo className="gap-2" textClassName="text-foreground" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {dashboardTitle}
        </p>
        <div className="space-y-1">
          {(() => {
            const activeRoute = navItems
              .filter((item) => {
                if (item.href.includes('#')) return false;
                if (item.href === '/dashboard/hospital') return pathname === item.href;
                return pathname === item.href || pathname.startsWith(`${item.href}/`);
              })
              .sort((left, right) => right.href.length - left.href.length)[0]?.href;

            return navItems.map((item) => {
              const hrefWithoutHash = item.href.split('#')[0];
              const itemHash = item.href.includes('#') ? `#${item.href.split('#')[1]}` : '';
              const sameBaseHashItems = navItems.filter(
                (entry) => entry.href.includes('#') && entry.href.split('#')[0] === hrefWithoutHash,
              );
              const pathnameMatches = item.href === '/dashboard/hospital'
                ? pathname === hrefWithoutHash
                : pathname === hrefWithoutHash || pathname.startsWith(`${hrefWithoutHash}/`);
              const isActive = item.href.includes('#')
                ? pathnameMatches && currentHash === itemHash
                : pathnameMatches && item.href === activeRoute && (sameBaseHashItems.length === 0 || currentHash === '');

              return (
                <Link
                  key={`${item.label}-${item.href}`}
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
                  {item.href === '/dashboard/notifications' && unreadNotificationCount > 0 && (
                    <span
                      aria-label={t('unreadNotificationsCount', { count: unreadNotificationCount })}
                      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-100 px-1.5 text-xs font-semibold tabular-nums text-rose-700"
                    >
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </span>
                  )}
                </Link>
              );
            });
          })()}
        </div>
      </nav>

      <div className="border-t border-border p-4">
        <Link href="/dashboard/profile" onClick={onNavigate} className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-sm font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {user?.profile?.full_name || t('user')}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
