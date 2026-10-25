'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Command,
  Cpu,
  Database,
  FileCheck2,
  FlaskConical,
  HeartPulse,
  History,
  Hospital,
  LayoutDashboard,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Network,
  Pill,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  Users,
  UserRound,
  UserRoundCog,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { roleConfig, type RoleName } from '@/lib/auth-types';
import { supabase } from '@/lib/supabase-client';
import './admin-workspace.css';

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

type AdminSection =
  | 'Overview'
  | 'User management'
  | 'Hospital management'
  | 'Doctor management'
  | 'Patient accounts'
  | 'Caregiver management'
  | 'Pharmacy management'
  | 'Research partners'
  | 'Medical advisors'
  | 'Dashboard & Feature Control'
  | 'AI services & safety'
  | 'Notifications'
  | 'Support & incidents'
  | 'Integrations & health'
  | 'System settings'
  | 'Roles & permissions'
  | 'Audit log';

type NavEntry = {
  label: AdminSection;
  icon: LucideIcon;
};

type NavGroup = {
  group: string;
  items: NavEntry[];
};

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

type VerificationKind = 'doctor' | 'hospital' | 'pharmacy';

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

const nav: NavGroup[] = [
  {
    group: 'WORKSPACE',
    items: [
      { label: 'Overview', icon: LayoutDashboard },
      { label: 'User management', icon: Users },
      { label: 'Hospital management', icon: Building2 },
      { label: 'Doctor management', icon: Stethoscope },
      { label: 'Patient accounts', icon: HeartPulse },
      { label: 'Caregiver management', icon: UserRoundCog },
      { label: 'Pharmacy management', icon: Pill },
      { label: 'Research partners', icon: FlaskConical },
      { label: 'Medical advisors', icon: UserRound },
    ],
  },
  {
    group: 'PLATFORM',
    items: [
      { label: 'Dashboard & Feature Control', icon: SlidersHorizontal },
      { label: 'AI services & safety', icon: Cpu },
      { label: 'Notifications', icon: Bell },
      { label: 'Support & incidents', icon: LifeBuoy },
      { label: 'Integrations & health', icon: Network },
      { label: 'System settings', icon: Settings2 },
      { label: 'Roles & permissions', icon: LockKeyhole },
      { label: 'Audit log', icon: History },
    ],
  },
];

const roleForSection: Partial<Record<AdminSection, RoleName>> = {
  'Hospital management': 'hospital',
  'Doctor management': 'doctor',
  'Patient accounts': 'patient',
  'Caregiver management': 'family_caregiver',
  'Pharmacy management': 'pharmacy',
  'Research partners': 'research_partner',
  'Medical advisors': 'medical_advisor',
};

const featureNames = [
  'Medication reminders',
  'AI report explanation',
  'Patient community',
  'Hospital queue management',
  'Research-partner access',
];

const integrations = [
  { name: 'Supabase', description: 'Authentication & database', icon: Database },
  { name: 'AI provider', description: 'Gemini service', icon: Cpu },
  { name: 'Google Maps', description: 'Maps browser integration', icon: Network },
  { name: 'Notifications', description: 'Email, SMS and push', icon: Mail },
];

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function getRoleName(value: string): value is RoleName {
  return ROLE_NAMES.includes(value as RoleName);
}

export function AdminWorkspace() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const isSuperAdmin = Boolean(user?.roles.some(({ name }) => name === 'super_admin'));
  const [active, setActive] = useState<AdminSection>('Overview');
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [notice, setNotice] = useState('');
  const [overviewError, setOverviewError] = useState('');
  const [userError, setUserError] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [auditError, setAuditError] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [userPage, setUserPage] = useState(0);
  const [verifications, setVerifications] = useState<VerificationRequest[]>([]);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationPage, setVerificationPage] = useState(0);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [featureEnabled, setFeatureEnabled] = useState<Record<string, boolean>>({
    'Medication reminders': true,
    'AI report explanation': false,
    'Patient community': true,
    'Hospital queue management': true,
    'Research-partner access': false,
  });
  const [roleScope, setRoleScope] = useState('LME Super Admin');

  const visibleNav = useMemo(
    () => nav
      .map((group) => ({
        ...group,
        items: group.items.filter(({ label }) => label.toLowerCase().includes(search.toLowerCase())),
      }))
      .filter(({ items }) => items.length > 0),
    [search],
  );

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    const { data, error: rpcError } = await supabase.rpc('admin_dashboard_overview');
    if (rpcError) {
      setOverview(null);
      setOverviewError(rpcError.message);
    } else {
      setOverview(data as Overview);
      setOverviewError('');
    }
    setOverviewLoading(false);
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    const roleName = roleForSection[active];
    const result = roleName
      ? await supabase.rpc('admin_search_users_by_role', {
        p_role_name: roleName,
        p_query: userSearch || null,
        p_limit: PAGE_SIZE,
        p_offset: userPage * PAGE_SIZE,
      })
      : await supabase.rpc('admin_search_users', {
        p_query: userSearch || null,
        p_limit: PAGE_SIZE,
        p_offset: userPage * PAGE_SIZE,
      });
    if (result.error) {
      setUsers([]);
      setUserError(result.error.message);
    } else {
      setUsers((result.data || []) as AdminUser[]);
      setUserError('');
    }
    setUsersLoading(false);
  }, [active, userPage, userSearch]);

  const loadVerifications = useCallback(async () => {
    setVerificationLoading(true);
    const { data, error: rpcError } = await supabase.rpc('admin_list_verification_requests', {
      p_limit: PAGE_SIZE,
      p_offset: verificationPage * PAGE_SIZE,
    });
    if (rpcError) {
      setVerifications([]);
      setVerificationError(rpcError.message);
    } else {
      setVerifications((data || []) as VerificationRequest[]);
      setVerificationError('');
    }
    setVerificationLoading(false);
  }, [verificationPage]);

  const loadAudit = useCallback(async (limit = PAGE_SIZE, offset = auditPage * PAGE_SIZE) => {
    setAuditLoading(true);
    const { data, error: rpcError } = await supabase.rpc('admin_list_audit_log', {
      p_limit: limit,
      p_offset: offset,
    });
    if (rpcError) {
      setAudit([]);
      setAuditError(rpcError.message);
    } else {
      setAudit((data || []) as AuditEntry[]);
      setAuditError('');
    }
    setAuditLoading(false);
  }, [auditPage]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (active === 'User management' || roleForSection[active]) void loadUsers();
  }, [active, loadUsers]);

  useEffect(() => {
    if (active === 'Hospital management' || active === 'Doctor management' || active === 'Pharmacy management') {
      void loadVerifications();
    }
  }, [active, loadVerifications]);

  useEffect(() => {
    if (active === 'Audit log') void loadAudit();
  }, [active, loadAudit]);

  useEffect(() => {
    if (active === 'Overview') void loadAudit(5, 0);
  }, [active, loadAudit]);

  const setPage = (section: AdminSection) => {
    setActive(section);
    setSidebarOpen(false);
    setNotice('');
    setOverviewError('');
    setUserError('');
    setVerificationError('');
    setAuditError('');
    setUserPage(0);
    setUserSearch('');
    setSearchDraft('');
    setVerificationPage(0);
    setAuditPage(0);
  };

  const refreshCurrentSection = () => {
    void loadOverview();
    if (active === 'User management' || roleForSection[active]) void loadUsers();
    if (active === 'Hospital management' || active === 'Doctor management' || active === 'Pharmacy management') {
      void loadVerifications();
    }
    if (active === 'Audit log' || active === 'Overview') void loadAudit(active === 'Overview' ? 5 : PAGE_SIZE, 0);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUserPage(0);
    setUserSearch(searchDraft.trim());
  };

  const setVerificationStatus = async (request: VerificationRequest, status: 'verified' | 'rejected') => {
    const key = `${request.kind}:${request.entity_id}`;
    setBusyAction(key);
    setVerificationError('');
    setNotice('');
    const { error: rpcError } = await supabase.rpc('admin_set_verification_request', {
      p_kind: request.kind,
      p_entity_id: request.entity_id,
      p_status: status,
    });
    if (rpcError) {
      setVerificationError(rpcError.message);
      setBusyAction(null);
      return;
    }
    setNotice(`Verification ${status === 'verified' ? 'approved' : 'rejected'} for ${request.display_name}.`);
    await Promise.all([loadVerifications(), loadOverview()]);
    setBusyAction(null);
  };

  const setUserRole = async (target: AdminUser, roleName: RoleName, enabled: boolean) => {
    const key = `${target.user_id}:${roleName}`;
    setBusyAction(key);
    setUserError('');
    setNotice('');
    const { data, error: rpcError } = await supabase.rpc('admin_set_user_role', {
      p_user_id: target.user_id,
      p_role_name: roleName,
      p_enabled: enabled,
    });
    if (rpcError) {
      setUserError(rpcError.message);
    } else if (data) {
      setNotice(`Role ${enabled ? 'added to' : 'removed from'} ${target.full_name || target.email || 'user'}.`);
      await loadUsers();
    } else {
      setNotice('That role assignment was already up to date.');
    }
    setBusyAction(null);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const heading = active === 'Overview' ? 'Platform overview' : active;
  const roleForUsers = roleForSection[active];
  const displayRole = (name: string) => getRoleName(name) ? roleConfig[name].displayName : name;
  const totalPartners = (overview?.hospitals || 0) + (overview?.pharmacies || 0);
  const pendingRows = verifications.filter((request) => {
    if (active === 'Hospital management') return request.kind === 'hospital';
    if (active === 'Doctor management') return request.kind === 'doctor';
    if (active === 'Pharmacy management') return request.kind === 'pharmacy';
    return true;
  });

  const renderUsers = () => (
    <section className="panel data-panel">
      <div className="panel-header">
        <div>
          <h3>{roleForUsers ? `${active} directory` : 'All registered accounts'}</h3>
          <p>{roleForUsers ? `Accounts assigned the ${displayRole(roleForUsers)} role.` : 'Search accounts and review their assigned OncoCare roles.'}</p>
        </div>
        {roleForUsers && <span className="status-tag tag-muted"><i />{displayRole(roleForUsers)}</span>}
      </div>
      <form className="directory-search" onSubmit={submitSearch}>
        <Search size={16} />
        <input
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          aria-label="Search users"
          placeholder="Search name or email..."
        />
        <button className="button button-primary" type="submit">Search</button>
      </form>
      {userError && <div className="admin-error" role="alert">{userError}</div>}
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead><tr><th>User</th><th>Assigned roles</th><th>Joined</th>{isSuperAdmin && <th>Role controls</th>}</tr></thead>
          <tbody>
            {usersLoading ? (
              <tr><td colSpan={isSuperAdmin ? 4 : 3} className="admin-empty">Loading accounts...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={isSuperAdmin ? 4 : 3} className="admin-empty">No matching accounts found.</td></tr>
            ) : users.map((account) => (
              <tr key={account.user_id}>
                <td><strong>{account.full_name || 'Unnamed user'}</strong><span>{account.email || 'No email address'}</span></td>
                <td><div className="role-chips">{account.roles.length
                  ? account.roles.map((roleName) => <span key={roleName}>{displayRole(roleName)}</span>)
                  : <span>No assigned roles</span>}</div></td>
                <td>{formatDate(account.created_at)}</td>
                {isSuperAdmin && (
                  <td>
                    {account.user_id === user?.id ? <span className="text-muted">Your account</span> : (
                      <details className="role-control">
                        <summary>Manage roles</summary>
                        <div className="role-menu">
                          {ROLE_NAMES.filter((roleName) => roleName !== 'super_admin').map((roleName) => {
                            const assigned = account.roles.includes(roleName);
                            const actionKey = `${account.user_id}:${roleName}`;
                            return (
                              <button
                                type="button"
                                key={roleName}
                                disabled={busyAction === actionKey}
                                onClick={() => void setUserRole(account, roleName, !assigned)}
                              >
                                <span>{displayRole(roleName)}</span>
                                {busyAction === actionKey ? '…' : assigned ? <Check size={14} /> : '+'}
                              </button>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-pagination">
        <span>Page {userPage + 1}</span>
        <div>
          <button type="button" disabled={userPage === 0 || usersLoading} onClick={() => setUserPage((page) => Math.max(0, page - 1))}><ArrowUp size={14} /> Previous</button>
          <button type="button" disabled={users.length < PAGE_SIZE || usersLoading} onClick={() => setUserPage((page) => page + 1)}>Next <ArrowDown size={14} /></button>
        </div>
      </div>
    </section>
  );

  const renderVerifications = () => (
    <section className="panel data-panel">
      <div className="panel-header">
        <div>
          <h3>Verification requests</h3>
          <p>Review pending provider and partner applications. Actions are recorded in the admin audit log.</p>
        </div>
        <span className="status-tag tag-warn"><i />{overview?.pending_verifications ?? '—'} pending</span>
      </div>
      {verificationError && <div className="admin-error" role="alert">{verificationError}</div>}
      {verificationLoading ? <div className="empty-state"><div className="empty-icon"><Activity size={22} /></div><strong>Loading verification requests...</strong></div>
        : pendingRows.length === 0 ? <div className="empty-state"><div className="empty-icon"><FileCheck2 size={22} /></div><strong>No pending verification requests</strong><p>New applications will appear here when submitted.</p></div>
          : <div className="verification-list">{pendingRows.map((request) => {
            const actionKey = `${request.kind}:${request.entity_id}`;
            const busy = busyAction === actionKey;
            const Icon = request.kind === 'doctor' ? Stethoscope : request.kind === 'hospital' ? Hospital : Pill;
            return (
              <article className="verification-row" key={actionKey}>
                <div className="integration-icon"><Icon size={18} /></div>
                <div className="verification-copy">
                  <strong>{request.display_name}</strong>
                  <span>{request.kind} {request.contact_email ? `· ${request.contact_email}` : ''}</span>
                  <small>Submitted {formatDate(request.submitted_at)} · Status: {request.status}</small>
                </div>
                {request.kind === 'doctor' && (
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Reject verification for ${request.display_name}?`)) {
                        void setVerificationStatus(request, 'rejected');
                      }
                    }}
                  >Reject</button>
                )}
                <button
                  className="button button-primary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Verify ${request.display_name}?`)) {
                      void setVerificationStatus(request, 'verified');
                    }
                  }}
                >{busy ? 'Saving...' : <><Check size={15} /> Verify</>}</button>
              </article>
            );
          })}</div>}
      <div className="table-pagination">
        <span>Page {verificationPage + 1}</span>
        <div>
          <button type="button" disabled={verificationPage === 0 || verificationLoading} onClick={() => setVerificationPage((page) => Math.max(0, page - 1))}><ArrowUp size={14} /> Previous</button>
          <button type="button" disabled={verifications.length < PAGE_SIZE || verificationLoading} onClick={() => setVerificationPage((page) => page + 1)}>Next <ArrowDown size={14} /></button>
        </div>
      </div>
    </section>
  );

  const renderAudit = (rows: AuditEntry[] = audit, compact = false) => (
    <section className={`data-panel ${compact ? '' : 'panel'}`}>
      <div className="panel-header">
        <div><h3>Administrative activity</h3><p>Audited verification and role changes from this workspace.</p></div>
        {active === 'Audit log' && <span className="status-tag tag-muted"><i />Protected log</span>}
      </div>
      {auditError && <div className="admin-error" role="alert">{auditError}</div>}
      {auditLoading ? <div className="empty-state"><div className="empty-icon"><Activity size={22} /></div><strong>Loading audit events...</strong></div>
        : rows.length === 0 ? <div className="empty-state"><div className="empty-icon"><Activity size={22} /></div><strong>No administrative events recorded yet</strong><p>Verified actions will appear here with their actor, target, and timestamp.</p></div>
          : <div className="admin-table-scroll"><table className="admin-table">
            <thead><tr><th>Date</th><th>Action</th><th>Target</th><th>Change</th><th>Actor</th></tr></thead>
            <tbody>{rows.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDate(entry.created_at)}</td>
                <td><strong>{entry.action.replaceAll('.', ' ')}</strong></td>
                <td>{entry.target_kind} · {entry.target_id.slice(0, 8)}</td>
                <td>{entry.previous_status} → {entry.new_status}</td>
                <td>{entry.actor_user_id?.slice(0, 8) || '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>}
      {active === 'Audit log' && (
        <div className="table-pagination">
          <span>Page {auditPage + 1}</span>
          <div>
            <button type="button" disabled={auditPage === 0 || auditLoading} onClick={() => setAuditPage((page) => Math.max(0, page - 1))}><ArrowUp size={14} /> Previous</button>
            <button type="button" disabled={audit.length < PAGE_SIZE || auditLoading} onClick={() => setAuditPage((page) => page + 1)}>Next <ArrowDown size={14} /></button>
          </div>
        </div>
      )}
    </section>
  );

  const renderModule = () => (
    <section className="panel module-panel">
      <div className="module-hero">
        <div className="module-hero-icon"><Command size={24} /></div>
        <div><span className="eyebrow">MODULE WORKSPACE</span><h2>{active}</h2><p>This module is not connected to an admin-safe backend workflow yet.</p></div>
      </div>
      <div className="module-cards">
        <div className="module-info-card"><CheckCircle2 size={19} /><div><strong>Existing authorization retained</strong><p>All administration continues to use OncoCare authentication, roles, RLS and server-side permission checks.</p></div></div>
        <div className="module-info-card"><ShieldCheck size={19} /><div><strong>Privacy-first administration</strong><p>Clinical information stays minimized. Sensitive access requires an approved, audited workflow.</p></div></div>
        <div className="module-info-card"><Database size={19} /><div><strong>No preview-only actions presented as live</strong><p>Only data and actions backed by verified OncoCare database functions are enabled.</p></div></div>
      </div>
      <div className="module-footer">
        <div><strong>Available admin workspaces</strong><span>Use the connected user directory, partner verification queue and audit log.</span></div>
        <button className="button button-primary" type="button" onClick={() => setPage('User management')}>Open user management <ChevronRight size={16} /></button>
      </div>
    </section>
  );

  return (
    <div className="oncocare-admin">
      <div className="app-shell">
        {sidebarOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
        <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <div className="brand">
            <div className="brand-mark"><HeartPulse size={23} strokeWidth={2.5} /></div>
            <div><div className="brand-name">OncoCare<span>+</span></div><div className="brand-sub">LME CONTROL CENTRE</div></div>
            <button className="icon-btn sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18} /></button>
          </div>
          <div className="workspace-switch">
            <div className="workspace-icon"><ShieldCheck size={17} /></div>
            <div className="workspace-copy"><strong>Central Admin</strong><span>All workspaces</span></div>
            <ChevronDown size={15} />
          </div>
          <div className="nav-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search menu..." aria-label="Search menu" /><kbd>⌘ K</kbd></div>
          <nav className="nav-list">
            {visibleNav.map((group) => (
              <div className="nav-group" key={group.group}>
                <div className="nav-heading">{group.group}</div>
                {group.items.map(({ label, icon: Icon }) => (
                  <button key={label} onClick={() => setPage(label)} className={`nav-item ${active === label ? 'nav-active' : ''}`} aria-current={active === label ? 'page' : undefined}>
                    <Icon size={17} /><span>{label}</span>
                  </button>
                ))}
              </div>
            ))}
            {visibleNav.length === 0 && <p className="no-results">No matching sections.</p>}
          </nav>
          <div className="sidebar-bottom">
            <Link className="help-card" href="/dashboard/admin/doctor-verifications">
              <div className="help-icon"><CircleHelp size={18} /></div><div><strong>Need a hand?</strong><span>Open verification workspace</span></div><ChevronRight size={16} />
            </Link>
            <div className="sidebar-user">
              <div className="avatar">{(user?.profile?.full_name || user?.email || 'A').slice(0, 2).toUpperCase()}</div>
              <div className="user-copy"><strong>{user?.profile?.full_name || 'Admin workspace'}</strong><span>{user?.email || 'Signed-in administrator'}</span></div>
              <button className="icon-btn" aria-label="Sign out" title="Sign out" onClick={() => void handleSignOut()}><LogOut size={15} /></button>
            </div>
          </div>
        </aside>

        <main className="main-area">
          <header className="topbar">
            <div className="top-left">
              <button className="icon-btn mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
              <div className="breadcrumbs">OncoCare+ <ChevronRight size={14} /><span>{active}</span></div>
            </div>
            <div className="top-actions">
              <div className="env-pill"><span />Development workspace</div>
              <button className="icon-btn notification-btn" aria-label="Open notifications" onClick={() => router.push('/dashboard/notifications')}><Bell size={19} /></button>
              <div className="top-divider" />
              <div className="profile-wrap">
                <button className="profile-button" onClick={() => setShowProfile((shown) => !shown)} aria-expanded={showProfile}>
                  <div className="avatar small">{(user?.profile?.full_name || user?.email || 'A').slice(0, 1).toUpperCase()}</div>
                  <span>{user?.profile?.full_name || user?.email || 'Administrator'}</span><ChevronDown size={15} />
                </button>
                {showProfile && (
                  <div className="profile-pop header-profile-pop">
                    <strong>{user?.profile?.full_name || 'Administrator'}</strong>
                    <p>{user?.email} · {isSuperAdmin ? 'Super administrator' : 'Administrator'}</p>
                    <button type="button" onClick={() => void handleSignOut()}>Sign out</button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="page-content">
            {notice && <div className="notice-banner"><CircleHelp size={18} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={16} /></button></div>}
            {overviewError && <div className="admin-error" role="alert">{overviewError}</div>}
            <div className="page-heading">
              <div><div className="eyebrow"><span className="eyebrow-dot" />{active === 'Overview' ? 'MONITORING & OPERATIONS' : 'CENTRAL ADMINISTRATION'}</div><h1>{heading}</h1><p>{active === 'Overview' ? 'A clear view of platform activity, services, and operational health.' : 'Manage this area from one central workspace.'}</p></div>
              <div className="heading-actions">
                <button className="button button-secondary" type="button" onClick={() => setNotice('Report export is not available until a protected reporting endpoint is added.')}><ClipboardList size={16} /> Export report</button>
                <button className="button button-primary" type="button" onClick={() => setPage('System settings')}><Settings2 size={16} /> Configure</button>
              </div>
            </div>

            {active === 'Overview' ? (
              <>
                <div className="status-strip">
                  <div className="status-left"><span className={`status-indicator ${overviewError ? 'warning' : ''}`}><Activity size={15} /></span><div><strong>{overviewLoading ? 'Checking admin data' : overviewError ? 'Admin data unavailable' : 'Protected admin data connected'}</strong><span>Status is based on the protected OncoCare admin metrics endpoint.</span></div></div>
                  <div className="status-right"><span className={`status-tag ${overviewError ? 'tag-muted' : 'tag-warn'}`}><i />{overviewLoading ? 'Checking' : overviewError ? 'Unavailable' : 'Verified access'}</span><button className="text-link" onClick={() => setPage('Integrations & health')}>View integrations <ChevronRight size={15} /></button></div>
                </div>
                <div className="section-title-row"><div><h2>Platform at a glance</h2><p>Live counts from the protected OncoCare admin database function.</p></div><button className="filter-button" type="button" onClick={refreshCurrentSection}><Activity size={15} /> Refresh</button></div>
                <div className="metric-grid">
                  {[
                    { label: 'Registered users', value: overview?.registered_users, icon: Users, tone: 'blue' },
                    { label: 'Active patients', value: overview?.patients, icon: HeartPulse, tone: 'pink' },
                    { label: 'Pending verifications', value: overview?.pending_verifications, icon: FileCheck2, tone: 'amber' },
                    { label: 'Partner organizations', value: totalPartners, icon: Building2, tone: 'red' },
                  ].map((metric, index) => (
                    <article className="metric-card" key={metric.label}>
                      <div className="metric-top"><div className={`metric-icon ${metric.tone}`}><metric.icon size={19} /></div><span className="metric-index">0{index + 1}</span></div>
                      <div className="metric-value">{overviewLoading || metric.value === undefined ? '—' : metric.value.toLocaleString()}</div>
                      <div className="metric-label">{metric.label}</div>
                      <div className="metric-note">{overviewError ? 'Unavailable' : overviewLoading ? 'Loading live data' : 'Live OncoCare data'}</div>
                    </article>
                  ))}
                </div>
                <div className="content-grid">
                  <section className="panel activity-panel">
                    <div className="panel-header"><div><h3>Operational activity</h3><p>Recent audited administrator actions</p></div><button className="subtle-button" onClick={() => setPage('Audit log')}>View audit log <ChevronRight size={15} /></button></div>
                    {renderAudit(audit, true)}
                  </section>
                  <section className="panel health-panel">
                    <div className="panel-header"><div><h3>Service health</h3><p>Only verified connection states are shown</p></div><span className="health-count">4 services</span></div>
                    <div className="integration-list">
                      {integrations.map((item, index) => {
                        const Icon = item.icon;
                        const connected = index === 0 && !overviewLoading && !overviewError;
                        return <div className="integration-row" key={item.name}><div className="integration-icon"><Icon size={17} /></div><div className="integration-copy"><strong>{item.name}</strong><span>{item.description}</span></div><span className={`mini-status ${connected ? 'pending' : ''}`}><i />{index === 0 ? overviewLoading ? 'Checking' : connected ? 'Admin RPC verified' : 'Unavailable' : 'Not verified'}</span></div>;
                      })}
                    </div>
                    <button className="full-link" onClick={() => setPage('Integrations & health')}>Open integration monitor <ChevronRight size={16} /></button>
                  </section>
                </div>
                <div className="section-title-row lower-title"><div><h2>Quick controls</h2><p>Common actions for platform administrators</p></div><span className="text-muted"><LockKeyhole size={14} /> Role-protected actions</span></div>
                <div className="quick-grid">
                  <button className="quick-card" onClick={() => setPage('User management')}><div className="quick-icon purple"><Users size={19} /></div><div><strong>User management</strong><span>Accounts, roles and access</span></div><ChevronRight size={17} /></button>
                  <button className="quick-card" onClick={() => setPage('Dashboard & Feature Control')}><div className="quick-icon teal"><SlidersHorizontal size={19} /></div><div><strong>Feature controls</strong><span>Preview settings and rollout status</span></div><ChevronRight size={17} /></button>
                  <button className="quick-card" onClick={() => setPage('Support & incidents')}><div className="quick-icon orange"><LifeBuoy size={19} /></div><div><strong>Support & incidents</strong><span>Integration status and next steps</span></div><ChevronRight size={17} /></button>
                </div>
              </>
            ) : active === 'Dashboard & Feature Control' ? (
              <section className="panel feature-panel">
                <div className="panel-header"><div><h3>Feature availability</h3><p>These controls are local previews only and do not change backend access or production flags.</p></div><span className="status-tag tag-warn"><i />Local preview</span></div>
                <div className="feature-toolbar"><label>Scope <select value={roleScope} onChange={(event) => setRoleScope(event.target.value)}><option>LME Super Admin</option><option>LME Operations Admin</option><option>Hospital Admin</option><option>Doctor</option><option>Caregiver</option><option>Patient</option></select></label><span className="text-muted">Environment: Development</span></div>
                {featureNames.map((name) => {
                  const enabled = featureEnabled[name];
                  return <div className="feature-row" key={name}><div className="feature-symbol"><Zap size={17} /></div><div className="feature-info"><strong>{name}</strong><span>Scope: {roleScope} · No server-side feature flag configured</span></div><button role="switch" aria-checked={enabled} aria-label={`${name} preview`} className={`toggle ${enabled ? 'toggle-on' : ''}`} onClick={() => setFeatureEnabled((current) => ({ ...current, [name]: !current[name] }))}><span /></button><span className={`toggle-label ${enabled ? 'enabled' : ''}`}>{enabled ? 'Preview on' : 'Preview off'}</span></div>;
                })}
                <div className="warning-note"><AlertTriangle size={17} /><span>Clinical and patient-care workflows must not be disabled without impact review and an approved fallback.</span></div>
              </section>
            ) : active === 'User management' || roleForUsers ? (
              <>
                {renderUsers()}
                {(active === 'Hospital management' || active === 'Doctor management' || active === 'Pharmacy management') && (
                  <div className="section-title-row lower-title"><div><h2>Pending verifications</h2><p>Verification changes are permission-checked and audited.</p></div></div>
                )}
                {(active === 'Hospital management' || active === 'Doctor management' || active === 'Pharmacy management') && renderVerifications()}
              </>
            ) : active === 'Audit log' ? renderAudit() : (
              <>
                {active === 'Integrations & health' && (
                  <section className="panel health-panel">
                    <div className="panel-header">
                      <div><h3>Connection verification</h3><p>The Supabase state only confirms access to the admin metrics RPC; other services remain unverified.</p></div>
                      <span className="health-count">4 services</span>
                    </div>
                    <div className="integration-list">
                      {integrations.map((item, index) => {
                        const Icon = item.icon;
                        const state = index !== 0
                          ? 'Not verified'
                          : overviewLoading
                            ? 'Checking'
                            : overviewError
                              ? 'Unavailable'
                              : 'Admin RPC verified';
                        return (
                          <div className="integration-row" key={item.name}>
                            <div className="integration-icon"><Icon size={17} /></div>
                            <div className="integration-copy"><strong>{item.name}</strong><span>{item.description}</span></div>
                            <span className={`mini-status ${index === 0 && !overviewError && !overviewLoading ? 'pending' : ''}`}><i />{state}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
                {active === 'Roles & permissions' && <div className="module-role-link"><ShieldCheck size={17} /><span>Role changes are available to super administrators from the connected user directory and are enforced by database authorization.</span><button className="text-link" onClick={() => setPage('User management')}>Open user management <ChevronRight size={15} /></button></div>}
                {renderModule()}
              </>
            )}
            <footer className="footer"><span>© {new Date().getFullYear()} OncoCare+ · LME Control Centre</span><span><ShieldCheck size={14} /> Built with privacy and accountability in mind</span></footer>
          </div>
        </main>
      </div>
    </div>
  );
}
