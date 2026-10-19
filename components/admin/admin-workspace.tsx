'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  ClipboardList,
  Database,
  FlaskConical,
  HeartPulse,
  Hospital,
  Loader2,
  Pill,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { roleConfig, type RoleName } from '@/lib/auth-types';
import { supabase } from '@/lib/supabase-client';

const PAGE_SIZE = 25;
const ROLE_NAMES: RoleName[] = [
  'super_admin',
  'admin',
  'patient',
  'family_caregiver',
  'doctor',
  'hospital',
  'pharmacy',
  'medical_advisor',
  'research_partner',
];

type Section = 'overview' | 'users' | 'verifications' | 'audit';
type VerificationKind = 'doctor' | 'hospital' | 'pharmacy';

type Overview = {
  registered_users: number;
  patients: number;
  doctors: number;
  hospitals: number;
  pharmacies: number;
  pending_verifications: number;
};

type AdminUser = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string | null;
  roles: string[];
};

type VerificationRequest = {
  kind: VerificationKind;
  entity_id: string;
  display_name: string;
  contact_email: string | null;
  status: string;
  submitted_at: string;
};

type AuditEntry = {
  id: string;
  actor_user_id: string | null;
  action: string;
  target_kind: string;
  target_id: string;
  previous_status: string;
  new_status: string;
  created_at: string;
};

function isRoleName(value: string): value is RoleName {
  return ROLE_NAMES.includes(value as RoleName);
}

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss error" className="shrink-0 rounded p-1 hover:bg-rose-100">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-12 text-center text-sm text-slate-500">{message}</p>;
}

function AdminWorkspaceContent() {
  const t = useTranslations('admin');
  const currentLocale = useLocale();
  const { user } = useAuth();
  const locale = currentLocale === 'hi' ? 'hi-IN' : 'en-IN';
  const isSuperAdmin = Boolean(user?.roles.some(({ name }) => name === 'super_admin'));

  const [section, setSection] = useState<Section>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [userRows, setUserRows] = useState<AdminUser[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [userPage, setUserPage] = useState(0);
  const [verificationRows, setVerificationRows] = useState<VerificationRequest[]>([]);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationPage, setVerificationPage] = useState(0);
  const [auditRows, setAuditRows] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditPage, setAuditPage] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const syncSectionFromHash = () => {
      const hashSection: Record<string, Section> = {
        '#users': 'users',
        '#verifications': 'verifications',
        '#audit': 'audit',
      };
      const nextSection = hashSection[window.location.hash];
      if (nextSection) setSection(nextSection);
    };
    syncSectionFromHash();
    window.addEventListener('hashchange', syncSectionFromHash);
    return () => window.removeEventListener('hashchange', syncSectionFromHash);
  }, []);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    const { data, error } = await supabase.rpc('admin_dashboard_overview');
    if (error) {
      setOverview(null);
      setOverviewError(error.message);
    } else {
      setOverview(data as Overview);
    }
    setOverviewLoading(false);
  }, []);

  const loadUsers = useCallback(async () => {
    setUserLoading(true);
    setUserError(null);
    const { data, error } = await supabase.rpc('admin_search_users', {
      p_query: searchQuery || null,
      p_limit: PAGE_SIZE,
      p_offset: userPage * PAGE_SIZE,
    });
    if (error) {
      setUserRows([]);
      setUserError(error.message);
    } else {
      setUserRows((data || []) as AdminUser[]);
    }
    setUserLoading(false);
  }, [searchQuery, userPage]);

  const loadVerifications = useCallback(async () => {
    setVerificationLoading(true);
    setVerificationError(null);
    const { data, error } = await supabase.rpc('admin_list_verification_requests', {
      p_limit: PAGE_SIZE,
      p_offset: verificationPage * PAGE_SIZE,
    });
    if (error) {
      setVerificationRows([]);
      setVerificationError(error.message);
    } else {
      setVerificationRows((data || []) as VerificationRequest[]);
    }
    setVerificationLoading(false);
  }, [verificationPage]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    const { data, error } = await supabase.rpc('admin_list_audit_log', {
      p_limit: PAGE_SIZE,
      p_offset: auditPage * PAGE_SIZE,
    });
    if (error) {
      setAuditRows([]);
      setAuditError(error.message);
    } else {
      setAuditRows((data || []) as AuditEntry[]);
    }
    setAuditLoading(false);
  }, [auditPage]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);
  useEffect(() => {
    if (section === 'users') void loadUsers();
  }, [loadUsers, section]);
  useEffect(() => {
    if (section === 'verifications') void loadVerifications();
  }, [loadVerifications, section]);
  useEffect(() => {
    if (section === 'audit') void loadAudit();
  }, [loadAudit, section]);

  const chooseSection = (nextSection: Section) => {
    setSection(nextSection);
    setNotice(null);
    const hash = nextSection === 'overview' ? '' : `#${nextSection}`;
    window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUserPage(0);
    setSearchQuery(searchDraft.trim());
  };

  const setVerificationStatus = async (request: VerificationRequest, status: string) => {
    const actionKey = `${request.kind}:${request.entity_id}`;
    setBusyAction(actionKey);
    setVerificationError(null);
    setNotice(null);
    const { error } = await supabase.rpc('admin_set_verification_request', {
      p_kind: request.kind,
      p_entity_id: request.entity_id,
      p_status: status,
    });
    if (error) {
      setVerificationError(error.message);
      setBusyAction(null);
      return;
    }
    setNotice(t('adminActionSucceeded'));
    await Promise.all([loadVerifications(), loadOverview()]);
    setBusyAction(null);
  };

  const setUserRole = async (targetUser: AdminUser, roleName: RoleName, enabled: boolean) => {
    const actionKey = `${targetUser.user_id}:${roleName}`;
    setBusyAction(actionKey);
    setUserError(null);
    setNotice(null);
    const { data, error } = await supabase.rpc('admin_set_user_role', {
      p_user_id: targetUser.user_id,
      p_role_name: roleName,
      p_enabled: enabled,
    });
    if (error) {
      setUserError(error.message);
      setBusyAction(null);
      return;
    }
    if (!data) {
      setNotice(t('userRoleUnchanged'));
    } else {
      setNotice(t('userRoleUpdated'));
      await Promise.all([loadUsers(), loadOverview()]);
    }
    setBusyAction(null);
  };

  const displayRole = (roleName: string) => (
    isRoleName(roleName) ? roleConfig[roleName].displayName : roleName
  );
  const overviewCards = overview ? [
    { label: t('registeredUsers'), value: overview.registered_users, icon: Users, color: 'bg-sky-50 text-sky-700' },
    { label: t('activePatients'), value: overview.patients, icon: HeartPulse, color: 'bg-rose-50 text-rose-700' },
    { label: t('registeredDoctors'), value: overview.doctors, icon: Stethoscope, color: 'bg-indigo-50 text-indigo-700' },
    { label: t('partnerOrganizations'), value: overview.hospitals + overview.pharmacies, icon: Building2, color: 'bg-amber-50 text-amber-700' },
  ] : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">{t('platformAdministration')}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{t('adminDashboard')}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{t('adminWorkspaceDescription')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void loadOverview();
            if (section === 'users') void loadUsers();
            if (section === 'verifications') void loadVerifications();
            if (section === 'audit') void loadAudit();
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />{t('refreshAdminData')}
        </button>
      </header>

      <nav aria-label={t('adminSections')} className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {([
          ['overview', t('overview'), Activity],
          ['users', t('userManagement'), Users],
          ['verifications', t('verificationRequests'), ShieldCheck],
          ['audit', t('auditLog'), ClipboardList],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => chooseSection(key)}
            aria-current={section === key ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              section === key ? 'bg-teal-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </nav>

      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      {section === 'overview' && (
        <section className="space-y-6">
          {overviewError && <ErrorBanner message={overviewError} onDismiss={() => setOverviewError(null)} />}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${overviewError ? 'bg-rose-50 text-rose-700' : overviewLoading ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {overviewLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Database className="h-5 w-5" />}
              </span>
              <div>
                <p className="font-semibold text-slate-900">{overviewError ? t('databaseUnavailable') : overviewLoading ? t('checkingDatabase') : t('databaseConnected')}</p>
                <p className="text-xs text-slate-500">{t('databaseStatusDescription')}</p>
              </div>
            </div>
            {overview && (
              <button type="button" onClick={() => chooseSection('verifications')} className="rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-100">
                {t('pendingVerificationCount', { count: overview.pending_verifications })}
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {overviewLoading && !overview
              ? Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white" />)
              : overviewCards.map(({ label, value, icon: Icon, color }) => (
                <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></span>
                  <p className="mt-4 text-3xl font-bold text-slate-900">{overviewLoading ? '—' : value.toLocaleString(locale)}</p>
                  <p className="mt-1 text-sm text-slate-600">{label}</p>
                </article>
              ))}
          </div>

          {overview && (
            <div className="grid gap-4 md:grid-cols-2">
              <article className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="font-bold text-slate-900">{t('partnerWorkspaces')}</h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-4"><Hospital className="h-5 w-5 text-teal-700" /><p className="mt-3 text-2xl font-bold">{overview.hospitals.toLocaleString(locale)}</p><p className="text-sm text-slate-600">{t('hospitals')}</p></div>
                  <div className="rounded-xl bg-slate-50 p-4"><Pill className="h-5 w-5 text-teal-700" /><p className="mt-3 text-2xl font-bold">{overview.pharmacies.toLocaleString(locale)}</p><p className="text-sm text-slate-600">{t('pharmacies')}</p></div>
                </div>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="font-bold text-slate-900">{t('adminTools')}</h2>
                <div className="mt-3 divide-y divide-slate-100">
                  <Link href="/dashboard/admin/doctor-verifications" className="flex items-center justify-between gap-3 py-3 text-sm font-medium text-slate-700 hover:text-teal-700"><span className="flex items-center gap-2"><Stethoscope className="h-4 w-4" />{t('doctorVerifications')}</span><span aria-hidden="true">→</span></Link>
                  <Link href="/admin" className="flex items-center justify-between gap-3 py-3 text-sm font-medium text-slate-700 hover:text-teal-700"><span className="flex items-center gap-2"><Pill className="h-4 w-4" />{t('pharmacyAdmin')}</span><span aria-hidden="true">→</span></Link>
                  <Link href="/partner-portal" className="flex items-center justify-between gap-3 py-3 text-sm font-medium text-slate-700 hover:text-teal-700"><span className="flex items-center gap-2"><Building2 className="h-4 w-4" />{t('partnerPortal')}</span><span aria-hidden="true">→</span></Link>
                  <Link href="/medicine-finder" className="flex items-center justify-between gap-3 py-3 text-sm font-medium text-slate-700 hover:text-teal-700"><span className="flex items-center gap-2"><FlaskConical className="h-4 w-4" />{t('medicineFinder')}</span><span aria-hidden="true">→</span></Link>
                </div>
              </article>
            </div>
          )}
        </section>
      )}

      {section === 'users' && (
        <section id="users" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-xl font-bold text-slate-900">{t('userManagement')}</h2><p className="mt-1 text-sm text-slate-600">{t('userDirectoryDescription')}</p></div>
            <form onSubmit={handleSearch} className="flex gap-2">
              <label className="sr-only" htmlFor="admin-user-search">{t('searchUsers')}</label>
              <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input id="admin-user-search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder={t('searchUsers')} className="w-64 max-w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" /></div>
              <button type="submit" className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800">{t('search')}</button>
            </form>
          </div>
          {userError && <ErrorBanner message={userError} onDismiss={() => setUserError(null)} />}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {userLoading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{t('loadingUsers')}</div> : userRows.length === 0 ? <EmptyState message={t('noUsersFound')} /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px]">
                  <thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-5 py-3">{t('user')}</th><th className="px-5 py-3">{t('role')}</th><th className="px-5 py-3">{t('joined')}</th>{isSuperAdmin && <th className="px-5 py-3">{t('roleControls')}</th>}</tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {userRows.map((row) => (
                      <tr key={row.user_id} className="align-top">
                        <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800"><UserRound className="h-4 w-4" /></span><div><p className="font-semibold text-slate-900">{row.full_name || t('unnamedUser')}</p><p className="text-xs text-slate-500">{row.email || t('noEmail')}</p></div></div></td>
                        <td className="px-5 py-4"><div className="flex flex-wrap gap-1.5">{row.roles.length ? row.roles.map((roleName) => <span key={roleName} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{displayRole(roleName)}</span>) : <span className="text-xs text-slate-500">{t('noAssignedRoles')}</span>}</div></td>
                        <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{formatDate(row.created_at, locale)}</td>
                        {isSuperAdmin && (
                          <td className="px-5 py-4">
                            <details className="group">
                              <summary className="cursor-pointer list-none text-sm font-semibold text-teal-700 hover:text-teal-900">{t('manageRoles')}</summary>
                              <div className="mt-3 min-w-48 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                                {ROLE_NAMES.filter((roleName) => roleName !== 'super_admin').map((roleName) => {
                                  const assigned = row.roles.includes(roleName);
                                  const actionKey = `${row.user_id}:${roleName}`;
                                  return (
                                    <button key={roleName} type="button" disabled={busyAction === actionKey} onClick={() => void setUserRole(row, roleName, !assigned)} className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-50 disabled:opacity-50">
                                      <span>{displayRole(roleName)}</span>{busyAction === actionKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : assigned ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <span className="text-slate-400">+</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </details>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
              <span className="text-xs text-slate-500">{t('pageNumber', { page: userPage + 1 })}</span>
              <div className="flex gap-2">
                <button type="button" disabled={userPage === 0 || userLoading} onClick={() => setUserPage((page) => Math.max(0, page - 1))} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs disabled:opacity-40"><ArrowUp className="h-3.5 w-3.5" />{t('previous')}</button>
                <button type="button" disabled={userRows.length < PAGE_SIZE || userLoading} onClick={() => setUserPage((page) => page + 1)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs disabled:opacity-40">{t('next')}<ArrowDown className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>
        </section>
      )}

      {section === 'verifications' && (
        <section id="verifications" className="space-y-4">
          <div><h2 className="text-xl font-bold text-slate-900">{t('verificationRequests')}</h2><p className="mt-1 text-sm text-slate-600">{t('verificationQueueDescription')}</p></div>
          {verificationError && <ErrorBanner message={verificationError} onDismiss={() => setVerificationError(null)} />}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {verificationLoading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{t('loadingVerifications')}</div> : verificationRows.length === 0 ? <EmptyState message={t('noPendingVerifications')} /> : (
              <div className="divide-y divide-slate-100">
                {verificationRows.map((request) => {
                  const actionKey = `${request.kind}:${request.entity_id}`;
                  const pending = busyAction === actionKey;
                  const Icon = request.kind === 'doctor' ? Stethoscope : request.kind === 'hospital' ? Hospital : Pill;
                  const kindLabel = {
                    doctor: t('verificationKind_doctor'),
                    hospital: t('verificationKind_hospital'),
                    pharmacy: t('verificationKind_pharmacy'),
                  }[request.kind];
                  return (
                    <article key={actionKey} className="flex flex-wrap items-center gap-3 px-5 py-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800"><Icon className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{request.display_name}</p><p className="text-sm text-slate-500">{kindLabel}{request.contact_email ? ` · ${request.contact_email}` : ''}</p><p className="mt-1 text-xs text-slate-400">{t('submitted')} {formatDate(request.submitted_at, locale)} · {t('status')}: {request.status}</p></div>
                      {request.kind === 'doctor' && <button type="button" disabled={pending} onClick={() => { if (window.confirm(t('confirmRejectDoctor', { name: request.display_name }))) void setVerificationStatus(request, 'rejected'); }} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('reject')}</button>}
                      <button type="button" disabled={pending} onClick={() => { if (window.confirm(t('confirmVerify', { name: request.display_name }))) void setVerificationStatus(request, 'verified'); }} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{t('verify')}</button>
                    </article>
                  );
                })}
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
              <span className="text-xs text-slate-500">{t('pageNumber', { page: verificationPage + 1 })}</span>
              <div className="flex gap-2">
                <button type="button" disabled={verificationPage === 0 || verificationLoading} onClick={() => setVerificationPage((page) => Math.max(0, page - 1))} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs disabled:opacity-40">{t('previous')}</button>
                <button type="button" disabled={verificationRows.length < PAGE_SIZE || verificationLoading} onClick={() => setVerificationPage((page) => page + 1)} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs disabled:opacity-40">{t('next')}</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {section === 'audit' && (
        <section id="audit" className="space-y-4">
          <div><h2 className="text-xl font-bold text-slate-900">{t('auditLog')}</h2><p className="mt-1 text-sm text-slate-600">{t('auditLogDescription')}</p></div>
          {auditError && <ErrorBanner message={auditError} onDismiss={() => setAuditError(null)} />}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {auditLoading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{t('loadingAuditLog')}</div> : auditRows.length === 0 ? <EmptyState message={t('noAdminActionsYet')} /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px]">
                  <thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-5 py-3">{t('date')}</th><th className="px-5 py-3">{t('action')}</th><th className="px-5 py-3">{t('target')}</th><th className="px-5 py-3">{t('change')}</th><th className="px-5 py-3">{t('actor')}</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{auditRows.map((entry) => <tr key={entry.id}><td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{formatDate(entry.created_at, locale)}</td><td className="px-5 py-4 text-sm font-medium text-slate-800">{entry.action.replaceAll('.', ' ')}</td><td className="px-5 py-4 text-sm capitalize text-slate-600">{entry.target_kind} · {entry.target_id.slice(0, 8)}</td><td className="px-5 py-4 text-sm text-slate-600">{entry.previous_status} → {entry.new_status}</td><td className="px-5 py-4 font-mono text-xs text-slate-500">{entry.actor_user_id?.slice(0, 8) || '—'}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
              <span className="text-xs text-slate-500">{t('pageNumber', { page: auditPage + 1 })}</span>
              <div className="flex gap-2">
                <button type="button" disabled={auditPage === 0 || auditLoading} onClick={() => setAuditPage((page) => Math.max(0, page - 1))} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs disabled:opacity-40">{t('previous')}</button>
                <button type="button" disabled={auditRows.length < PAGE_SIZE || auditLoading} onClick={() => setAuditPage((page) => page + 1)} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs disabled:opacity-40">{t('next')}</button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export function AdminWorkspace() {
  return <AdminWorkspaceContent />;
}
