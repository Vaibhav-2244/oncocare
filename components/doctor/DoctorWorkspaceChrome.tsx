'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, ChevronDown, LogOut, Menu, Search, X } from 'lucide-react';
import { Logo } from '@/components/shared/logo';
import { useAuth } from '@/lib/auth-context';
import { doctorNavItems } from '@/lib/dashboard-nav';
import { ensureDoctorWorkspace, listDoctorPatients, type DoctorPatient } from '@/lib/doctor/api';
import { cn } from '@/lib/utils';

const navGroups = [
  { title: 'Workspace', hrefs: ['/dashboard/doctor', '/dashboard/doctor/patients', '/dashboard/doctor/appointments'] },
  {
    title: 'Clinical',
    hrefs: [
      '/dashboard/doctor/consultations',
      '/dashboard/doctor/prescriptions',
      '/dashboard/doctor/reports',
      '/dashboard/doctor/treatment-plans',
    ],
  },
  {
    title: 'Coordination',
    hrefs: [
      '/dashboard/doctor/links',
      '/dashboard/doctor/messages',
      '/dashboard/hospital/opd',
      '/dashboard/notifications',
      '/dashboard/doctor/profile',
      '/dashboard/doctor/settings',
    ],
  },
];

function getInitials(name: string | null | undefined, fallback: string | undefined) {
  const value = name?.trim() || fallback || 'Doctor';
  return value.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export function DoctorWorkspaceChrome({
  children,
  title,
  unreadNotificationCount,
}: {
  children: ReactNode;
  title: string;
  unreadNotificationCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const initials = getInitials(user?.profile?.full_name, user?.email);

  const groupedNavigation = useMemo(() => navGroups.map((group) => ({
    ...group,
    items: group.hrefs
      .map((href) => doctorNavItems.find((item) => item.href === href))
      .filter((item) => item !== undefined),
  })), []);
  const matchingNavigation = query.trim()
    ? doctorNavItems.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setPatients([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      void (async () => {
        try {
          await ensureDoctorWorkspace();
          const result = await listDoctorPatients({ q: value, limit: 8 });
          if (active) setPatients(result.rows);
        } catch (cause) {
          if (active) {
            setPatients([]);
            setSearchError(cause instanceof Error ? cause.message : 'Unable to search patients.');
          }
        } finally {
          if (active) setSearching(false);
        }
      })();
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    setSidebarOpen(false);
    setAccountMenuOpen(false);
    setQuery('');
  }, [pathname]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const activeHref = [...doctorNavItems]
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;

  const sidebar = (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-[4.5rem] items-center border-b border-slate-100 px-5">
        <Link href="/dashboard/doctor" className="flex items-center" aria-label="OncoCare doctor overview">
          <Logo className="gap-2" textClassName="text-slate-900" />
        </Link>
      </div>
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-700">Clinical workspace</p>
        <p className="mt-1 truncate text-sm font-semibold text-slate-800">{user?.profile?.full_name || 'Doctor portal'}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">{user?.email}</p>
      </div>
      <nav aria-label="Doctor workspace navigation" className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {groupedNavigation.map((group) => (
          <div key={group.title}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{group.title}</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                if (!item) return null;
                const active = item.href === activeHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                    )}
                  >
                    <item.icon className={cn('h-4 w-4 shrink-0', active ? 'text-teal-700' : 'text-slate-400')} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.href === '/dashboard/notifications' && unreadNotificationCount > 0 && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                        {unreadNotificationCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-3">
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 lg:block">{sidebar}</aside>
      {sidebarOpen && (
        <>
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-2xl lg:hidden">{sidebar}</aside>
        </>
      )}
      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-30 flex h-[4.5rem] items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-8">
          <button
            type="button"
            aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
            onClick={() => setSidebarOpen((open) => !open)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
          </div>
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && matchingNavigation[0]) router.push(matchingNavigation[0].href);
              }}
              placeholder="Search patients or workspace"
              aria-label="Search patients or workspace"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
            />
            {query.trim() && (
              <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                {matchingNavigation.map((item) => (
                  <Link key={item.href} href={item.href} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    <item.icon className="h-4 w-4 text-slate-400" />
                    {item.label}
                  </Link>
                ))}
                {query.trim().length < 2 ? (
                  <p className="px-3 py-2 text-xs text-slate-500">Type at least 2 characters to search patients.</p>
                ) : (
                  <>
                    {searching && <p className="px-3 py-2 text-xs text-slate-500">Searching patients…</p>}
                    {searchError && <p role="alert" className="px-3 py-2 text-xs text-rose-700">{searchError}</p>}
                    {!searching && !searchError && patients.map((patient) => (
                      <Link
                        key={patient.id}
                        href={`/dashboard/doctor/patients/${patient.id}`}
                        className="block rounded-lg px-3 py-2 hover:bg-teal-50"
                      >
                        <span className="block truncate text-sm font-medium text-slate-800">{patient.full_name}</span>
                        <span className="block text-xs text-slate-500">{patient.patient_code} · {patient.cancer_type || 'Cancer care'}</span>
                      </Link>
                    ))}
                    {!searching && !searchError && patients.length === 0 && (
                      <p className="px-3 py-2 text-xs text-slate-500">No matching patients found.</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <Link
            href="/dashboard/notifications"
            aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`}
            className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <Bell className="h-5 w-5" />
            {unreadNotificationCount > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />}
          </Link>
          <div className="relative">
            <button
              type="button"
              onClick={() => setAccountMenuOpen((open) => !open)}
              aria-expanded={accountMenuOpen}
              className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-slate-100"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">{initials}</span>
              <span className="hidden max-w-36 truncate text-sm font-medium text-slate-700 sm:block">{user?.profile?.full_name || user?.email}</span>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
            </button>
            {accountMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <Link href="/dashboard/doctor/profile" className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Professional profile</Link>
                <Link href="/dashboard/doctor/settings" className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Availability</Link>
                <button type="button" onClick={() => void handleSignOut()} className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50">Sign out</button>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
