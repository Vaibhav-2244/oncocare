'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Plus, Trash2, X, Calendar, Stethoscope, Activity,
  LayoutDashboard, User, Settings, Brain, Pill, HeartPulse,
  FlaskConical, Microscope, Syringe, ScanLine, Star, Flag,
  CheckCircle2, type LucideIcon,
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

const EVENT_TYPES = [
  { value: 'diagnosis', label: 'Diagnosis', icon: Microscope, color: 'bg-rose-500', ring: 'ring-rose-100', bg: 'bg-rose-50', text: 'text-rose-600' },
  { value: 'treatment_start', label: 'Treatment Start', icon: Syringe, color: 'bg-teal-500', ring: 'ring-teal-100', bg: 'bg-teal-50', text: 'text-teal-600' },
  { value: 'treatment_end', label: 'Treatment End', icon: CheckCircle2, color: 'bg-emerald-500', ring: 'ring-emerald-100', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  { value: 'surgery', label: 'Surgery', icon: HeartPulse, color: 'bg-amber-500', ring: 'ring-amber-100', bg: 'bg-amber-50', text: 'text-amber-600' },
  { value: 'scan', label: 'Scan', icon: ScanLine, color: 'bg-blue-500', ring: 'ring-blue-100', bg: 'bg-blue-50', text: 'text-blue-600' },
  { value: 'lab_result', label: 'Lab Result', icon: FlaskConical, color: 'bg-purple-500', ring: 'ring-purple-100', bg: 'bg-purple-50', text: 'text-purple-600' },
  { value: 'appointment', label: 'Appointment', icon: Calendar, color: 'bg-cyan-500', ring: 'ring-cyan-100', bg: 'bg-cyan-50', text: 'text-cyan-600' },
  { value: 'milestone', label: 'Milestone', icon: Star, color: 'bg-indigo-500', ring: 'ring-indigo-100', bg: 'bg-indigo-50', text: 'text-indigo-600' },
  { value: 'other', label: 'Other', icon: Flag, color: 'bg-slate-500', ring: 'ring-slate-100', bg: 'bg-slate-50', text: 'text-slate-600' },
] as const;

function eventMeta(value: string) {
  return EVENT_TYPES.find((e) => e.value === value) || EVENT_TYPES[EVENT_TYPES.length - 1];
}

interface TimelineEvent {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  description: string | null;
  event_date: string;
  created_at?: string;
}

const emptyForm = {
  event_type: 'diagnosis' as string,
  title: '',
  description: '',
  event_date: new Date().toISOString().slice(0, 10),
};

function TimelineSkeleton() {
  return (
    <div className="flex gap-4 pb-6">
      <div className="flex flex-col items-center">
        <div className="h-10 w-10 animate-pulse rounded-full bg-slate-100" />
        <div className="mt-1 w-px flex-1 bg-slate-100" />
      </div>
      <div className="flex-1 space-y-2 pb-2">
        <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-1/4 animate-pulse rounded bg-slate-50" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-50" />
      </div>
    </div>
  );
}

function HealthTimelineContent() {
  const { user } = useAuth();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const [form, setForm] = useState({ ...emptyForm });

  const loadEvents = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('health_timeline')
        .select('*')
        .eq('user_id', user.id)
        .order('event_date', { ascending: false });
      if (queryError) throw queryError;
      setEvents((data || []) as TimelineEvent[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadEvents();
  }, [user, loadEvents]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        user_id: user.id,
        event_type: form.event_type,
        title: form.title.trim(),
        description: form.description.trim() || null,
        event_date: new Date(form.event_date).toISOString(),
      };
      const { data, error: insertError } = await supabase
        .from('health_timeline')
        .insert(payload)
        .select()
        .single();
      if (insertError) throw insertError;
      setEvents((prev) => {
        const next = [data as TimelineEvent, ...prev];
        next.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());
        return next;
      });
      setForm({ ...emptyForm });
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add event');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error: deleteError } = await supabase
        .from('health_timeline')
        .delete()
        .eq('id', id);
      if (deleteError) throw deleteError;
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete event');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => e.event_type === filter);
  }, [events, filter]);

  const availableTypes = useMemo(() => {
    const set = new Set(events.map((e) => e.event_type));
    return EVENT_TYPES.filter((t) => set.has(t.value));
  }, [events]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Health Timeline</h1>
          <p className="mt-1 text-sm text-slate-500">Track key events in your care journey</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md hover:from-teal-700 hover:to-emerald-700"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Cancel' : 'Add Event'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Add form */}
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
              <h2 className="text-base font-bold text-slate-900">Add a Timeline Event</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Event Type</label>
                  <select
                    value={form.event_type}
                    onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Date</label>
                  <input
                    type="date"
                    required
                    value={form.event_date}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Title</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. First chemotherapy session"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                />
              </div>
              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Add details about this event..."
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
                  Save Event
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter chips */}
      {events.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              filter === 'all'
                ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            All Events
          </button>
          {availableTypes.map((t) => {
            const Icon = t.icon;
            const active = filter === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setFilter(t.value)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                  active
                    ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
        {loading ? (
          <div>
            {[0, 1, 2, 3].map((i) => <TimelineSkeleton key={i} />)}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
              <Clock className="h-7 w-7" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-700">
              {filter === 'all' ? 'No timeline events yet' : 'No events of this type'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {filter === 'all'
                ? 'Document diagnoses, treatments, scans, and milestones to build your health story.'
                : 'Try a different filter or add a new event.'}
            </p>
            {filter === 'all' && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md"
              >
                <Plus className="h-4 w-4" /> Add your first event
              </button>
            )}
          </div>
        ) : (
          <div className="relative">
            <AnimatePresence initial={false}>
              {filteredEvents.map((event, i) => {
                const meta = eventMeta(event.event_type);
                const Icon = meta.icon;
                const isLast = i === filteredEvents.length - 1;
                return (
                  <motion.div
                    key={event.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: i * 0.04 }}
                    className="group flex gap-4 pb-6 last:pb-0"
                  >
                    {/* Dot + line */}
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4',
                          meta.color,
                          meta.ring,
                        )}
                      >
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      {!isLast && <div className="mt-1 w-px flex-1 bg-slate-200" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900">{event.title}</h3>
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                                meta.bg,
                                meta.text,
                              )}
                            >
                              {meta.label}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {new Date(event.event_date).toLocaleDateString('en-US', {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </p>
                          {event.description && (
                            <p className="mt-2 text-sm text-slate-600">{event.description}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDelete(event.id)}
                          disabled={deletingId === event.id}
                          className="rounded-lg p-2 text-slate-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100 disabled:opacity-50"
                          aria-label="Delete event"
                        >
                          {deletingId === event.id ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
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

export default function TimelinePage() {
  return (
    <ProtectedRoute allowedRoles={['patient', 'family_caregiver']}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <HealthTimelineContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
