'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HeartPulse, Plus, Trash2, X, Pencil, Activity, TrendingUp,
  CheckCircle2, Calendar, LayoutDashboard, User, Settings,
  Brain, Stethoscope, Pill, Clock, Zap, Cross, Target,
  FlaskConical, Scissors, Shield, type LucideIcon,
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

const TREATMENT_TYPES = [
  { value: 'chemotherapy', label: 'Chemotherapy', icon: FlaskConical },
  { value: 'radiation', label: 'Radiation', icon: Zap },
  { value: 'immunotherapy', label: 'Immunotherapy', icon: Shield },
  { value: 'targeted_therapy', label: 'Targeted Therapy', icon: Target },
  { value: 'surgery', label: 'Surgery', icon: Scissors },
  { value: 'hormone_therapy', label: 'Hormone Therapy', icon: HeartPulse },
  { value: 'other', label: 'Other', icon: Activity },
] as const;

const TREATMENT_STATUSES = [
  'planned', 'active', 'completed', 'paused', 'cancelled',
] as const;

function typeMeta(value: string) {
  return TREATMENT_TYPES.find((t) => t.value === value) || TREATMENT_TYPES[TREATMENT_TYPES.length - 1];
}

function statusMeta(status: string): { bg: string; text: string; dot: string } {
  switch (status) {
    case 'active':
      return { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' };
    case 'completed':
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' };
    case 'planned':
      return { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' };
    case 'paused':
      return { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' };
    case 'cancelled':
      return { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' };
    default:
      return { bg: 'bg-slate-50', text: 'text-slate-700', dot: 'bg-slate-400' };
  }
}

interface Treatment {
  id: string;
  user_id: string;
  type: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  progress: number;
  created_at?: string;
}

const emptyForm = {
  type: 'chemotherapy' as string,
  name: '',
  status: 'planned' as string,
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
  notes: '',
  progress: 0,
};

function TreatmentCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 animate-pulse rounded-xl bg-slate-100" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-slate-50" />
        </div>
      </div>
      <div className="mt-4 h-2 animate-pulse rounded-full bg-slate-100" />
      <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-slate-50" />
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

function TreatmentTrackerContent() {
  const { user } = useAuth();
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({ ...emptyForm });

  const loadTreatments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('treatments')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;
      setTreatments((data || []) as Treatment[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load treatments');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadTreatments();
  }, [user, loadTreatments]);

  const openAddForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowForm(true);
  };

  const openEditForm = (t: Treatment) => {
    setForm({
      type: t.type,
      name: t.name,
      status: t.status,
      start_date: t.start_date ? t.start_date.slice(0, 10) : '',
      end_date: t.end_date ? t.end_date.slice(0, 10) : '',
      notes: t.notes || '',
      progress: t.progress || 0,
    });
    setEditingId(t.id);
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
        type: form.type,
        name: form.name.trim(),
        status: form.status,
        start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
        end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
        notes: form.notes.trim() || null,
        progress: Number(form.progress),
      };
      if (editingId) {
        const { error: updateError } = await supabase
          .from('treatments')
          .update(payload)
          .eq('id', editingId);
        if (updateError) throw updateError;
        setTreatments((prev) =>
          prev.map((t) => (t.id === editingId ? { ...t, ...payload } : t)),
        );
      } else {
        const { data, error: insertError } = await supabase
          .from('treatments')
          .insert(payload)
          .select()
          .single();
        if (insertError) throw insertError;
        setTreatments((prev) => [data as Treatment, ...prev]);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ ...emptyForm });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save treatment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error: deleteError } = await supabase.from('treatments').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setTreatments((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete treatment');
    } finally {
      setDeletingId(null);
    }
  };

  // stats
  const total = treatments.length;
  const active = treatments.filter((t) => t.status === 'active').length;
  const completed = treatments.filter((t) => t.status === 'completed').length;
  const avgProgress =
    total > 0
      ? Math.round(treatments.reduce((sum, t) => sum + (t.progress || 0), 0) / total)
      : 0;

  const statCards = [
    { label: 'Active Treatments', value: active, icon: Activity, color: 'from-teal-500 to-emerald-500' },
    { label: 'Completed', value: completed, icon: CheckCircle2, color: 'from-emerald-500 to-green-500' },
    { label: 'Total Treatments', value: total, icon: HeartPulse, color: 'from-blue-500 to-indigo-500' },
    { label: 'Avg Progress', value: `${avgProgress}%`, icon: TrendingUp, color: 'from-amber-500 to-orange-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Treatment Tracker</h1>
          <p className="mt-1 text-sm text-slate-500">Manage and track your treatment journey</p>
        </div>
        <button
          onClick={() => (showForm ? setShowForm(false) : openAddForm())}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md hover:from-teal-700 hover:to-emerald-700"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Cancel' : 'Add Treatment'}
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
                {editingId ? 'Edit Treatment' : 'Add a New Treatment'}
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  >
                    {TREATMENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Name</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. AC Chemotherapy Cycle 1"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  >
                    {TREATMENT_STATUSES.map((s) => (
                      <option key={s} value={s} className="capitalize">
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">Start Date</label>
                    <input
                      type="date"
                      value={form.start_date}
                      onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">End Date</label>
                    <input
                      type="date"
                      value={form.end_date}
                      min={form.start_date || undefined}
                      onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-600">Progress</label>
                  <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-700">
                    {form.progress}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={form.progress}
                  onChange={(e) => setForm((f) => ({ ...f, progress: Number(e.target.value) }))}
                  className="w-full accent-teal-600"
                />
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder="Add any details about this treatment..."
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
                  {editingId ? 'Update Treatment' : 'Save Treatment'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Treatment cards */}
      <div>
        <h2 className="mb-3 text-base font-bold text-slate-900">Your Treatments</h2>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <TreatmentCardSkeleton key={i} />)}
          </div>
        ) : treatments.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/60 bg-white p-12 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
                <HeartPulse className="h-7 w-7" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">No treatments yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Add your first treatment to start tracking your care journey.
              </p>
              <button
                onClick={openAddForm}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md"
              >
                <Plus className="h-4 w-4" /> Add a treatment
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <AnimatePresence initial={false}>
              {treatments.map((t, i) => {
                const meta = typeMeta(t.type);
                const Icon = meta.icon;
                const status = statusMeta(t.status);
                return (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: i * 0.04 }}
                    className="group rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-sm">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900">{t.name}</h3>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize',
                              status.bg,
                              status.text,
                            )}
                          >
                            <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />
                            {t.status}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">{meta.label}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => openEditForm(t)}
                          className="rounded-lg p-2 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                          aria-label="Edit treatment"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          disabled={deletingId === t.id}
                          className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50"
                          aria-label="Delete treatment"
                        >
                          {deletingId === t.id ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="mt-4">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-slate-500">Progress</span>
                        <span className="font-semibold text-slate-700">{t.progress || 0}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${t.progress || 0}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      {t.start_date && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          Start: {new Date(t.start_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                      {t.end_date && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          End: {new Date(t.end_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>

                    {t.notes && (
                      <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">{t.notes}</p>
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

export default function TreatmentsPage() {
  return (
    <ProtectedRoute allowedRoles={['patient', 'family_caregiver']}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <TreatmentTrackerContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
