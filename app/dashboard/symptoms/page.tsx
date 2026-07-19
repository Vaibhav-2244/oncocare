'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Plus, Trash2, X, HeartPulse, TrendingUp,
  Calendar, LayoutDashboard, User, Settings, FileText,
  MessageSquare, Brain, Stethoscope, Pill, Clock,
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

const COMMON_SYMPTOMS = [
  'nausea', 'fatigue', 'pain', 'loss of appetite', 'anxiety',
  'insomnia', 'hair loss', 'mouth sores', 'skin changes',
  'neuropathy', 'constipation', 'diarrhea', 'shortness of breath',
] as const;

interface Symptom {
  id: string;
  user_id: string;
  name: string;
  severity: number;
  notes: string | null;
  recorded_at: string;
  created_at?: string;
}

function severityColor(severity: number): { dot: string; bg: string; text: string; bar: string } {
  if (severity <= 3) {
    return { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500' };
  }
  if (severity <= 6) {
    return { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-500' };
  }
  return { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700', bar: 'bg-rose-500' };
}

function severityLabel(severity: number): string {
  if (severity <= 3) return 'Mild';
  if (severity <= 6) return 'Moderate';
  return 'Severe';
}

function SymptomSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-4">
      <div className="h-10 w-10 animate-pulse rounded-lg bg-slate-100" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-50" />
      </div>
      <div className="h-6 w-16 animate-pulse rounded-full bg-slate-100" />
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

function SymptomCheckerContent() {
  const { user } = useAuth();
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // form state
  const [name, setName] = useState<string>('fatigue');
  const [severity, setSeverity] = useState<number>(5);
  const [notes, setNotes] = useState<string>('');
  const [recordedAt, setRecordedAt] = useState<string>(new Date().toISOString().slice(0, 10));

  const loadSymptoms = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('symptoms')
        .select('*')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: false });
      if (queryError) throw queryError;
      setSymptoms((data || []) as Symptom[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load symptoms');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadSymptoms();
  }, [user, loadSymptoms]);

  const resetForm = () => {
    setName('fatigue');
    setSeverity(5);
    setNotes('');
    setRecordedAt(new Date().toISOString().slice(0, 10));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        user_id: user.id,
        name: name.trim(),
        severity,
        notes: notes.trim() || null,
        recorded_at: new Date(recordedAt).toISOString(),
      };
      const { data, error: insertError } = await supabase
        .from('symptoms')
        .insert(payload)
        .select()
        .single();
      if (insertError) throw insertError;
      setSymptoms((prev) => [data as Symptom, ...prev]);
      resetForm();
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log symptom');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error: deleteError } = await supabase.from('symptoms').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setSymptoms((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete symptom');
    } finally {
      setDeletingId(null);
    }
  };

  // stats
  const totalSymptoms = symptoms.length;
  const avgSeverity =
    totalSymptoms > 0
      ? (symptoms.reduce((sum, s) => sum + (s.severity || 0), 0) / totalSymptoms).toFixed(1)
      : '0';
  const mostFrequent =
    totalSymptoms > 0
      ? Object.entries(
          symptoms.reduce<Record<string, number>>((acc, s) => {
            acc[s.name] = (acc[s.name] || 0) + 1;
            return acc;
          }, {}),
        ).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
      : '—';
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const entriesThisWeek = symptoms.filter((s) => new Date(s.recorded_at) >= weekAgo).length;

  const statCards = [
    { label: 'Total Tracked', value: totalSymptoms, icon: Activity, color: 'from-teal-500 to-emerald-500' },
    { label: 'Avg Severity', value: avgSeverity, icon: TrendingUp, color: 'from-blue-500 to-indigo-500' },
    { label: 'Most Frequent', value: mostFrequent, icon: HeartPulse, color: 'from-amber-500 to-orange-500' },
    { label: 'This Week', value: entriesThisWeek, icon: Calendar, color: 'from-rose-500 to-pink-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Symptom Checker &amp; Tracker</h1>
          <p className="mt-1 text-sm text-slate-500">Monitor and log your symptoms over time</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md hover:from-teal-700 hover:to-emerald-700"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Cancel' : 'Log Symptom'}
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

      {/* Add symptom form */}
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
              <h2 className="text-base font-bold text-slate-900">Log a New Symptom</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Symptom</label>
                  <select
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  >
                    {COMMON_SYMPTOMS.map((s) => (
                      <option key={s} value={s} className="capitalize">
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Date
                  </label>
                  <input
                    type="date"
                    value={recordedAt}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setRecordedAt(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-600">
                    Severity
                  </label>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-bold',
                      severityColor(severity).bg,
                      severityColor(severity).text,
                    )}
                  >
                    {severity}/10 · {severityLabel(severity)}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={severity}
                  onChange={(e) => setSeverity(Number(e.target.value))}
                  className="w-full accent-teal-600"
                />
                <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                  <span>1 · Mild</span>
                  <span>5 · Moderate</span>
                  <span>10 · Severe</span>
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Add any details about this symptom..."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                />
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
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
                  Save Symptom
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Symptom history */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Symptom History</h2>
          <span className="text-xs text-slate-400">{symptoms.length} entries</span>
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            [0, 1, 2, 3].map((i) => <SymptomSkeleton key={i} />)
          ) : symptoms.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
                <Activity className="h-7 w-7" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">No symptoms logged yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Start tracking how you feel to share insights with your care team.
              </p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md"
              >
                <Plus className="h-4 w-4" /> Log your first symptom
              </button>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {symptoms.map((symptom, i) => {
                const colors = severityColor(symptom.severity);
                return (
                  <motion.div
                    key={symptom.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: i * 0.03 }}
                    className="group flex items-start gap-3 rounded-xl border border-slate-100 p-4 transition-colors hover:border-slate-200"
                  >
                    <div
                      className={cn(
                        'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                        colors.bg,
                      )}
                    >
                      <span className={cn('h-2.5 w-2.5 rounded-full', colors.dot)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold capitalize text-slate-900">
                          {symptom.name}
                        </span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-bold',
                            colors.bg,
                            colors.text,
                          )}
                        >
                          Severity {symptom.severity}/10 · {severityLabel(symptom.severity)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {new Date(symptom.recorded_at).toLocaleDateString('en-US', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                      {symptom.notes && (
                        <p className="mt-1.5 text-sm text-slate-600">{symptom.notes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(symptom.id)}
                      disabled={deletingId === symptom.id}
                      className="rounded-lg p-2 text-slate-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100 disabled:opacity-50"
                      aria-label="Delete symptom"
                    >
                      {deletingId === symptom.id ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SymptomsPage() {
  return (
    <ProtectedRoute allowedRoles={['patient', 'family_caregiver']}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <SymptomCheckerContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
