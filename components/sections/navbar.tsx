'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Activity, ChevronDown, LogOut, LayoutDashboard, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { roleConfig } from '@/lib/auth-types';

const navLinks = [
  { label: 'Platform', href: '#solution' },
  { label: 'Features', href: '#features' },
  { label: 'Medicine Finder', href: '/medicine-finder' },
  { label: 'AI Engine', href: '#ai' },
  { label: 'For Hospitals', href: '#hospitals' },
  { label: 'FAQ', href: '#faq' },
];

export function Navbar() {
  const router = useRouter();
  const { user, signOut, loading } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setUserMenuOpen(false);
    router.push('/');
  };

  const dashboardPath = user?.primaryRole ? roleConfig[user.primaryRole].dashboardPath : '/dashboard';

  const initials = user?.profile?.full_name
    ? user.profile.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <div
        className={cn(
          'mx-auto flex max-w-7xl items-center justify-between px-6 transition-all duration-500',
          scrolled
            ? 'mt-3 rounded-2xl border border-slate-200/60 bg-white/80 py-3 shadow-lg shadow-slate-900/5 backdrop-blur-xl'
            : 'mt-0 border-b border-transparent py-5'
        )}
      >
        <a href="/" className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-deep to-teal-400 shadow-md shadow-teal-500/30">
            <Activity className="h-5 w-5 text-white" strokeWidth={2.5} />
            <div className="absolute inset-0 rounded-xl bg-teal-400/30 blur-md -z-10" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            OncoCare<span className="text-emerald-deep">+</span>
          </span>
        </a>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {loading ? (
            <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200" />
          ) : user ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-xl p-1 hover:bg-slate-100"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-sm font-bold text-white">
                  {initials}
                </div>
                <ChevronDown className="h-4 w-4 text-slate-400" />
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
                          {user.profile?.full_name || 'User'}
                        </p>
                        <p className="truncate text-xs text-slate-500">{user.email}</p>
                      </div>
                      <div className="p-1.5">
                        <a href={dashboardPath} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                          <LayoutDashboard className="h-4 w-4" /> Dashboard
                        </a>
                        <a href="/dashboard/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                          <User className="h-4 w-4" /> Profile
                        </a>
                        <button onClick={handleSignOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
                          <LogOut className="h-4 w-4" /> Sign Out
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <>
              <a
                href="/auth/sign-in"
                className="text-sm font-semibold text-slate-700 transition-colors hover:text-emerald-deep"
              >
                Sign in
              </a>
              <a
                href="/auth/sign-up"
                className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-xl bg-gradient-to-r from-emerald-deep to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-500/25 transition-all hover:shadow-lg hover:shadow-teal-500/40"
              >
                <span className="relative z-10">Get Started</span>
                <ChevronDown className="h-3.5 w-3.5 rotate-[-90deg] transition-transform group-hover:translate-x-0.5" />
                <div className="absolute inset-0 bg-gradient-to-r from-teal-400 to-blue-500 opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            </>
          )}
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-700 md:hidden"
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="mx-4 mt-2 overflow-hidden rounded-2xl border border-slate-200/60 bg-white/95 p-4 shadow-xl backdrop-blur-xl md:hidden"
          >
            <nav className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
                >
                  {link.label}
                </a>
              ))}
              {user ? (
                <>
                  <a
                    href={dashboardPath}
                    onClick={() => setOpen(false)}
                    className="mt-2 rounded-xl bg-gradient-to-r from-emerald-deep to-teal-500 px-4 py-3 text-center text-sm font-semibold text-white"
                  >
                    Dashboard
                  </a>
                  <button
                    onClick={() => { handleSignOut(); setOpen(false); }}
                    className="mt-1 rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-rose-600"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <a
                    href="/auth/sign-in"
                    onClick={() => setOpen(false)}
                    className="mt-2 rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-700"
                  >
                    Sign in
                  </a>
                  <a
                    href="/auth/sign-up"
                    onClick={() => setOpen(false)}
                    className="mt-1 rounded-xl bg-gradient-to-r from-emerald-deep to-teal-500 px-4 py-3 text-center text-sm font-semibold text-white"
                  >
                    Get Started
                  </a>
                </>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
