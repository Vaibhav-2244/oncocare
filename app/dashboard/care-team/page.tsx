'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Stethoscope, Plus, Trash2, X, Pencil, Users, UserCog,
  HeartPulse, Activity, Phone, Mail, Building2,
  LayoutDashboard, User, Settings, Brain, Pill, Clock,
  type LucideIcon,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, type NavItem } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';

const navItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Symptoms', href: '/dashboard/symptoms', icon: Activity },
  { label: 'Treatments', href: '/dashboard/treatments', icon: HeartPulse },
  { label: 'Medications', href: '/dashboard/medications', icon: Pill },
  { label: 'Care Team', href: '/dashboard/care-team', icon: Stethoscope },
  { label: 'Timeline', href: '/dashboard/timeline', icon: Clock },
  { label: 'AI Engine', href: '/dashboard/ai-engine', icon: Brain },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

const ROLES = [
  { value: 'oncologist', label: 'Oncologist', color: 'from-teal-500 to-emerald-500' },
  { value: 'surgeon', label: 'Surgeon', color: 'from-blue-500 to-indigo-500' },
  { value: 'radiologist', label: 'Radiologist', color: 'from-purple-500 to-violet-500' },
  { value: 'nurse', label: 'Nurse', color: 'from-rose-500 to-pink-500' },
  { value: 'dietitian', label: 'Dietitian', color: 'from-amber-500 to-orange-500' },
  { value: 'psychologist', label: 'Psychologist', color: 'from-cyan-500 to-blue-500' },
  { value: 'primary_care', label: 'Primary Care', color: 'from-emerald-500 to-green-500' },
  { value: 'caregiver', label: 'Caregiver', color: 'from-slate-500 to-slate-600' },
  { value: 'other', label: 'Other', color: 'from-slate-400 to-slate-500' },
] as const;

function roleMeta(value: string) {
  return ROLES.find((r) => r.value === value) || ROLES[ROLES.length - 1];
}

function isNurseOrCaregiver(role: string): boolean {
  return role === 'nurse' || role === 'caregiver';
}

interface CareTeamMember {
  id: string;
  user_id: string;
  member_name: string;
  role: string;
  specialty: string | null;
  phone: string | null;
  email: string | null;
  hospital: string | null;
  notes: string | null;
  created_at?: string;
}

const emptyForm = {
  member_name: '',
  role: 'oncologist' as string,
  specialty: '',
  phone: '',
  email: '',
  hospital: '',
  notes: '',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function MemberCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 animate-pulse rounded-full bg-slate-100" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-slate-50" />
        </div>
      </div>
      <div className="mt-4 h-3 w-2/3 animate-pulse rounded bg-slate-50" />
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
      <div className="mt-3 h-7 w-16 animate-pulse rounded bg-slate-100" />
      <div className="mt-1 h-3 w-24 animate-pulse rounded bg-slate-50" />
    </div>
  );
}

function CareTeamContent() {
  const { user } = useAuth();
  const [members, setMembers] = useState<CareTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({ ...emptyForm });

  const loadMembers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('care_team')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;
      setMembers((data || []) as CareTeamMember[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load care team');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadMembers();
  }, [user, loadMembers]);

  const openAddForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowForm(true);
  };

  const openEditForm = (m: CareTeamMember) => {
    setForm({
      member_name: m.member_name,
      role: m.role,
      specialty: m.specialty || '',
      phone: m.phone || '',
      email: m.email || '',
      hospital: m.hospital || '',
      notes: m.notes || '',
    });
    setEditingId(m.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        user_id: user.id,
        member_name: form.member_name.trim(),
        role: form.role,
        specialty: form.specialty.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        hospital: form.hospital.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editingId) {
        const { error: updateError } = await supabase
          .from('care_team')
          .update(payload)
          .eq('id', editingId);
        if (updateError) throw updateError;
        setMembers((prev) =>
          prev.map((m) => (m.id === editingId ? { ...m, ...payload } : m)),
        );
      } else {
        const { data, error: insertError } = await supabase
          .from('care_team')
          .insert(payload)
          .select()
          .single();
        if (insertError) throw insertError;
        setMembers((prev) => [data as CareTeamMember, ...prev]);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ ...emptyForm });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save team member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error: deleteError } = await supabase.from('care_team').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete team member');
    } finally {
      setDeletingId(null);
    }
  };

  // stats
  const total = members.length;
  const doctors = members.filter((m) =>
    ['oncologist', 'surgeon', 'radiologist', 'primary_care'].includes(m.role),
  ).length;
  const nursesCaregivers = members.filter((m) => isNurseOrCaregiver(m.role)).length;
  const hospitals = new Set(members.map((m) => m.hospital).filter(Boolean)).size;

  const statCards = [
    { label: 'Total Members', value: total, icon: Users, color: 'from-teal-500 to-emerald-500' },
    { label: 'Doctors', value: doctors, icon: Stethoscope, color: 'from-blue-500 to-indigo-500' },
    { label: 'Nurses / Caregivers', value: nursesCaregivers, icon: HeartPulse, color: 'from-rose-500 to-pink-500' },
    { label: 'Hospitals', value: hospitals, icon: Building2, color: 'from-amber-500 to-orange-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Care Team</h1>
          <p className="mt-1 text-sm text-slate-500">Manage your healthcare providers and caregivers</p>
        </div>
        <button
          onClick={() => (showForm ? setShowForm(false) : openAddForm())}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md hover:from-teal-700 hover:to-emerald-700"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Cancel' : 'Add Member'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? [0, 1, 2, 3].map((i) => <StatSkeleton key={i} />)
          : statCards.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm"
              >
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md',
                    stat.color,
                  )}
                >
                  <stat.icon className="h-5 w-5" />
                </div>
                <div className="mt-3 text-2xl font-bold text-slate-900">{stat.value}</div>
                <div className="text-xs text-slate-500">{stat.label}</div>
              </motion.div>
            ))}
      </div>

      {/* Add/Edit form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm"
            >
              <h2 className="text-base font-bold text-slate-900">
                {editingId ? 'Edit Team Member' : 'Add a Care Team Member'}
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Name</label>
                  <input
                    type="text"
                    required
                    value={form.member_name}
                    onChange={(e) => setForm((f) => ({ ...f, member_name: e.target.value }))}
                    placeholder="e.g. Dr. Sarah Chen"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Specialty</label>
                  <input
                    type="text"
                    value={form.specialty}
                    onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))}
                    placeholder="e.g. Medical Oncology"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Hospital</label>
                  <input
                    type="text"
                    value={form.hospital}
                    onChange={(e) => setForm((f) => ({ ...f, hospital: e.target.value }))}
                    placeholder="e.g. City Cancer Center"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="e.g. +1 555 123 4567"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="e.g. s.chen@hospital.com"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder="Add any notes about this team member..."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                />
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-60"
                >
                  {submitting ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {editingId ? 'Update Member' : 'Save Member'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Member cards */}
      <div>
        <h2 className="mb-3 text-base font-bold text-slate-900">Your Care Team</h2>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => <MemberCardSkeleton key={i} />)}
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/60 bg-white p-12 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
                <Stethoscope className="h-7 w-7" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">No care team members yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Add your doctors, nurses, and caregivers to keep their contact info handy.
              </p>
              <button
                onClick={openAddForm}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md"
              >
                <Plus className="h-4 w-4" /> Add a member
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence initial={false}>
              {members.map((m, i) => {
                const meta = roleMeta(m.role);
                return (
                  <motion.div
                    key={m.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: i * 0.04 }}
                    className="group rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-sm',
                          meta.color,
                        )}
                      >
                        {getInitials(m.member_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900">{m.member_name}</h3>
                        <span
                          className={cn(
                            'mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold',
                            'bg-teal-50 text-teal-700',
                          )}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => openEditForm(m)}
                          className="rounded-lg p-2 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                          aria-label="Edit member"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(m.id)}
                          disabled={deletingId === m.id}
                          className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50"
                          aria-label="Delete member"
                        >
                          {deletingId === m.id ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {m.specialty && (
                      <p className="mt-3 text-xs font-medium text-slate-600">{m.specialty}</p>
                    )}

                    <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                      {m.phone && (
                        <a
                          href={`tel:${m.phone}`}
                          className="flex items-center gap-2 transition-colors hover:text-teal-600"
                        >
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          {m.phone}
                        </a>
                      )}
                      {m.email && (
                        <a
                          href={`mailto:${m.email}`}
                          className="flex items-center gap-2 truncate transition-colors hover:text-teal-600"
                        >
                          <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{m.email}</span>
                        </a>
                      )}
                      {m.hospital && (
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          {m.hospital}
                        </div>
                      )}
                    </div>

                    {m.notes && (
                      <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
                        {m.notes}
                      </p>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CareTeamPage() {
  return (
    <ProtectedRoute allowedRoles={['patient', 'family_caregiver']}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <CareTeamContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
