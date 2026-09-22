'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HeartPulse, Plus, Trash2, X, Pencil, Activity, TrendingUp,
  CheckCircle2, Calendar, LayoutDashboard, User, Settings,
  Brain, Stethoscope, Pill, Clock, Zap, Target, FlaskConical,
  Scissors, Shield, ChevronLeft, ChevronRight, MapPin, BellRing,
  type LucideIcon,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, PATIENT_CAREGIVER_ROLES, type NavItem } from '@/components/auth/dashboard-layout';
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

const TREATMENT_STATUSES = ['planned', 'active', 'completed', 'paused', 'cancelled'] as const;
const TYPE_FILTERS = ['all', ...TREATMENT_TYPES.map((item) => item.value)] as const;

type TreatmentType = (typeof TREATMENT_STATUSES)[number] | 'upcoming';

interface Treatment {
  id: string;
  user_id: string;
  type: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  doctor: string | null;
  reminder: boolean;
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
  date: new Date().toISOString().slice(0, 10),
  time: '09:00',
  location: '',
  doctor: '',
  reminder: true,
  notes: '',
  progress: 0,
};

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

function getTreatmentStatus(treatment: Treatment): TreatmentType {
  const rawStatus = treatment.status || 'planned';
  if (rawStatus === 'completed') return 'completed';
  if (rawStatus === 'paused') return 'paused';
  if (rawStatus === 'cancelled') return 'cancelled';

  const scheduled = treatment.date || treatment.start_date;
  if (!scheduled) return rawStatus as TreatmentType;

  const targetDate = new Date(`${scheduled}T${treatment.time || '00:00'}:00`);
  if (Number.isNaN(targetDate.getTime())) return rawStatus as TreatmentType;

  if (targetDate.getTime() < Date.now()) return 'completed';
  if (targetDate.getTime() <= Date.now() + 1000 * 60 * 60 * 24 * 7) return 'active';
  return 'planned';
}

function normalizeTreatment(record: any): Treatment {
  const scheduledDate = record?.scheduled_date || record?.date || record?.start_date || null;
  const scheduledTime = record?.scheduled_time || record?.time || null;

  return {
    id: record.id,
    user_id: record.user_id,
    type: record.type || 'other',
    name: record.name || 'Untitled treatment',
    status: record.status || 'planned',
    start_date: record.start_date ?? scheduledDate,
    end_date: record.end_date ?? null,
    date: scheduledDate,
    time: scheduledTime,
    location: record.location ?? null,
    doctor: record.doctor ?? record.doctor_name ?? null,
    reminder: record.reminder ?? true,
    notes: record.notes ?? null,
    progress: Number(record.progress ?? 0),
    created_at: record.created_at,
  };
}

function formatDateLabel(dateValue: string | null) {
  if (!dateValue) return 'Not scheduled';
  const d = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 'Not scheduled';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimeLabel(timeValue: string | null) {
  if (!timeValue) return 'Time TBD';
  const value = timeValue.length === 5 ? timeValue : `${timeValue}:00`;
  return new Date(`2000-01-01T${value}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

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
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'upcoming' | 'completed'>('all');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [currentMonth, setCurrentMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [notificationPermission, setNotificationPermission] = useState<'default' | 'granted' | 'denied'>('default');

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
      setTreatments((data || []).map((item) => normalizeTreatment(item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load treatments');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadTreatments();
      if ('Notification' in window) {
        setNotificationPermission(Notification.permission as 'default' | 'granted' | 'denied');
      }
    }
  }, [user, loadTreatments]);

  const openAddForm = () => {
    setForm({
      ...emptyForm,
      date: selectedDate || new Date().toISOString().slice(0, 10),
      start_date: selectedDate || new Date().toISOString().slice(0, 10),
    });
    setEditingId(null);
    setShowForm(true);
  };

  const openEditForm = (t: Treatment) => {
    setForm({
      type: t.type,
      name: t.name,
      status: t.status,
      start_date: t.start_date ? t.start_date.slice(0, 10) : t.date ? t.date.slice(0, 10) : '',
      end_date: t.end_date ? t.end_date.slice(0, 10) : '',
      date: t.date ? t.date.slice(0, 10) : t.start_date ? t.start_date.slice(0, 10) : '',
      time: t.time || '09:00',
      location: t.location || '',
      doctor: t.doctor || '',
      reminder: Boolean(t.reminder ?? true),
      notes: t.notes || '',
      progress: t.progress || 0,
    });
    setEditingId(t.id);
    setShowForm(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    if (!form.name.trim() || !form.date || !form.time) {
      setError('Treatment name, date, and time are required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        user_id: user.id,
        type: form.type,
        name: form.name.trim(),
        status: form.status,
        start_date: form.start_date || form.date || null,
        end_date: form.end_date || null,
        scheduled_date: form.date || form.start_date || null,
        scheduled_time: form.time || null,
        location: form.location.trim() || null,
        doctor: form.doctor.trim() || null,
        reminder: form.reminder,
        notes: form.notes.trim() || null,
        progress: Number(form.progress),
      };

      if (editingId) {
        const { error: updateError } = await supabase
          .from('treatments')
          .update(payload)
          .eq('id', editingId);
        if (updateError) throw updateError;
        setTreatments((prev) => prev.map((t) => (t.id === editingId ? normalizeTreatment({ ...t, ...payload }) : t)));
      } else {
        const { data, error: insertError } = await supabase
          .from('treatments')
          .insert(payload)
          .select()
          .single();
        if (insertError) throw insertError;
        setTreatments((prev) => [normalizeTreatment(data), ...prev]);
      }

      setShowForm(false);
      setEditingId(null);
      setForm({ ...emptyForm, date: selectedDate || new Date().toISOString().slice(0, 10) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save treatment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this treatment?')) return;

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

  const requestBrowserNotifications = async () => {
    if (!('Notification' in window)) {
      setError('This browser does not support notifications.');
      return;
    }

    const result = await Notification.requestPermission();
    setNotificationPermission(result);
    if (result === 'granted') {
      new Notification('OncoCare reminders enabled', {
        body: 'Treatment reminders will now appear in your browser.',
      });
    }
  };

  const visibleTreatments = useMemo(() => {
    return [...treatments]
      .filter((treatment) => {
        const matchesType = typeFilter === 'all' || treatment.type === typeFilter;
        const treatmentStatus = getTreatmentStatus(treatment);
        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'upcoming' ? treatmentStatus !== 'completed' && treatmentStatus !== 'cancelled' : treatmentStatus === 'completed');
        return matchesType && matchesStatus;
      })
      .sort((a, b) => {
        const dateA = new Date(`${a.date || a.start_date || '2099-01-01'}T${a.time || '00:00'}`).getTime();
        const dateB = new Date(`${b.date || b.start_date || '2099-01-01'}T${b.time || '00:00'}`).getTime();
        return dateA - dateB;
      });
  }, [treatments, typeFilter, statusFilter]);

  const reminderCount = useMemo(
    () => treatments.filter((treatment) => (treatment.reminder ?? true) && getTreatmentStatus(treatment) !== 'completed').length,
    [treatments],
  );

  const upcomingTreatments = useMemo(
    () =>
      [...treatments]
        .filter((treatment) => (treatment.reminder ?? true) && getTreatmentStatus(treatment) !== 'completed')
        .sort((a, b) => {
          const dateA = new Date(`${a.date || a.start_date || '2099-01-01'}T${a.time || '00:00'}`).getTime();
          const dateB = new Date(`${b.date || b.start_date || '2099-01-01'}T${b.time || '00:00'}`).getTime();
          return dateA - dateB;
        })
        .slice(0, 4),
    [treatments],
  );

  const selectedDateTreatments = useMemo(() => {
    return [...treatments]
      .filter((treatment) => (treatment.date || treatment.start_date) === selectedDate)
      .sort((a, b) => {
        const dateA = new Date(`${a.date || a.start_date || '2099-01-01'}T${a.time || '00:00'}`).getTime();
        const dateB = new Date(`${b.date || b.start_date || '2099-01-01'}T${b.time || '00:00'}`).getTime();
        return dateA - dateB;
      });
  }, [treatments, selectedDate]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const monthLength = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + monthLength) / 7) * 7;

    const result: Array<{ dateString: string; day: number; isCurrentMonth: boolean; isToday: boolean }> = [];

    for (let index = 0; index < totalCells; index += 1) {
      const dayNumber = index - startOffset + 1;
      const date = new Date(year, month, dayNumber);
      const dateString = date.toISOString().slice(0, 10);
      result.push({
        dateString,
        day: date.getDate(),
        isCurrentMonth: date.getMonth() === month,
        isToday: dateString === new Date().toISOString().slice(0, 10),
      });
    }

    return result;
  }, [currentMonth]);

  const total = treatments.length;
  const active = treatments.filter((t) => getTreatmentStatus(t) === 'active' || getTreatmentStatus(t) === 'planned').length;
  const completed = treatments.filter((t) => getTreatmentStatus(t) === 'completed').length;
  const avgProgress = total > 0 ? Math.round(treatments.reduce((sum, t) => sum + (t.progress || 0), 0) / total) : 0;

  const statCards = [
    { label: 'Upcoming', value: active, icon: Activity, color: 'from-teal-500 to-emerald-500' },
    { label: 'Completed', value: completed, icon: CheckCircle2, color: 'from-emerald-500 to-green-500' },
    { label: 'Total Treatments', value: total, icon: HeartPulse, color: 'from-blue-500 to-indigo-500' },
    { label: 'Avg Progress', value: `${avgProgress}%`, icon: TrendingUp, color: 'from-amber-500 to-orange-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Treatment Tracker</h1>
          <p className="mt-1 text-sm text-slate-500">Track appointments, reminders, and treatment milestones.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {typeof Notification !== 'undefined' && notificationPermission !== 'granted' && (
            <button
              type="button"
              onClick={requestBrowserNotifications}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <BellRing className="h-4 w-4" />
              Enable reminders
            </button>
          )}
          <button
            onClick={() => (showForm ? setShowForm(false) : openAddForm())}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md hover:from-teal-700 hover:to-emerald-700"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Cancel' : 'Add Treatment'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? [0, 1, 2, 3].map((i) => <StatSkeleton key={i} />) : statCards.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md', stat.color)}>
              <stat.icon className="h-5 w-5" />
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900">{stat.value}</div>
            <div className="text-xs text-slate-500">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
              <h2 className="text-base font-bold text-slate-900">{editingId ? 'Edit Treatment' : 'Add a New Treatment'}</h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Treatment type</label>
                  <select value={form.type} onChange={(event) => setForm((previous) => ({ ...previous, type: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30">
                    {TREATMENT_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Treatment name</label>
                  <input required value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} placeholder="e.g. AC Chemotherapy Cycle 1" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30" />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Status</label>
                  <select value={form.status} onChange={(event) => setForm((previous) => ({ ...previous, status: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30">
                    {TREATMENT_STATUSES.map((status) => (
                      <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Date</label>
                  <input type="date" required value={form.date} onChange={(event) => {
                    const nextDate = event.target.value;
                    setForm((previous) => ({ ...previous, date: nextDate, start_date: nextDate || previous.start_date }));
                  }} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30" />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Time</label>
                  <input type="time" required value={form.time} onChange={(event) => setForm((previous) => ({ ...previous, time: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30" />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Location</label>
                  <input value={form.location} onChange={(event) => setForm((previous) => ({ ...previous, location: event.target.value }))} placeholder="Cancer Center" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30" />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Doctor</label>
                  <input value={form.doctor} onChange={(event) => setForm((previous) => ({ ...previous, doctor: event.target.value }))} placeholder="Dr. Smith" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30" />
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <input id="reminder-toggle" type="checkbox" checked={form.reminder} onChange={(event) => setForm((previous) => ({ ...previous, reminder: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                <label htmlFor="reminder-toggle" className="text-sm font-medium text-slate-700">Enable reminder for this treatment</label>
              </div>

              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-600">Progress</label>
                  <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-700">{form.progress}%</span>
                </div>
                <input type="range" min={0} max={100} value={form.progress} onChange={(event) => setForm((previous) => ({ ...previous, progress: Number(event.target.value) }))} className="w-full accent-teal-600" />
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Notes</label>
                <textarea value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} rows={3} placeholder="Add details or care instructions..." className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30" />
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-60">
                  {submitting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Plus className="h-4 w-4" />}
                  {editingId ? 'Update Treatment' : 'Save Treatment'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Schedule overview</h2>
                <p className="text-xs text-slate-500">Filter by type and view upcoming care events.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => setStatusFilter('all')} className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold', statusFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600')}>All</button>
                <button onClick={() => setStatusFilter('upcoming')} className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold', statusFilter === 'upcoming' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600')}>Upcoming</button>
                <button onClick={() => setStatusFilter('completed')} className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold', statusFilter === 'completed' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600')}>Completed</button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {TYPE_FILTERS.map((filter) => (
                <button key={filter} onClick={() => setTypeFilter(filter)} className={cn('rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors', typeFilter === filter ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                  {filter === 'all' ? 'All treatments' : filter.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
              <h3 className="text-base font-bold text-slate-900">{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
              <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-2">
              {calendarDays.map((cell) => {
                const treatmentCount = treatments.filter((treatment) => (treatment.date || treatment.start_date) === cell.dateString).length;
                const isSelected = selectedDate === cell.dateString;
                return (
                  <button key={`${cell.dateString}-${cell.day}`} type="button" onClick={() => setSelectedDate(cell.dateString)} className={cn('relative flex min-h-[68px] flex-col items-center justify-start rounded-xl border p-2 text-sm transition', cell.isCurrentMonth ? 'border-slate-200 bg-slate-50 text-slate-900' : 'border-transparent bg-slate-100/50 text-slate-400', isSelected && 'border-teal-500 bg-teal-50 shadow-sm', cell.isToday && !isSelected && 'border-emerald-200 bg-emerald-50')}>
                    <span className={cn('font-semibold', cell.isToday && 'text-emerald-700')}>{cell.day}</span>
                    {treatmentCount > 0 && (
                      <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-teal-500" title={`${treatmentCount} scheduled treatments`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900">{formatDateLabel(selectedDate)}</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">{selectedDateTreatments.length} item(s)</span>
            </div>

            {selectedDateTreatments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No treatments scheduled for this date.</div>
            ) : (
              <div className="space-y-3">
                {selectedDateTreatments.map((treatment) => {
                  const meta = typeMeta(treatment.type);
                  const status = statusMeta(getTreatmentStatus(treatment));
                  const Icon = meta.icon;
                  return (
                    <div key={treatment.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white"><Icon className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{treatment.name}</p>
                            <p className="text-[11px] text-slate-500">{meta.label}</p>
                          </div>
                          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize', status.bg, status.text)}><span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />{getTreatmentStatus(treatment)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDateLabel(treatment.date || treatment.start_date)}</span>
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{formatTimeLabel(treatment.time)}</span>
                          {treatment.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{treatment.location}</span>}
                          {treatment.doctor && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{treatment.doctor}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Upcoming reminders</h2>
              <span className="rounded-full bg-teal-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-700">{reminderCount}</span>
            </div>

            <div className="mt-4 space-y-3">
              {upcomingTreatments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No active reminders right now.</div>
              ) : (
                upcomingTreatments.map((treatment) => {
                  const meta = typeMeta(treatment.type);
                  const Icon = meta.icon;
                  return (
                    <div key={treatment.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-500 text-white"><Icon className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900">{treatment.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{meta.label} • {formatDateLabel(treatment.date || treatment.start_date)} • {formatTimeLabel(treatment.time)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">Your Treatments</h2>
            {loading ? (
              <div className="mt-4 space-y-3">{[0, 1, 2].map((index) => <TreatmentCardSkeleton key={index} />)}</div>
            ) : visibleTreatments.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">No treatments match the current filters.</div>
            ) : (
              <div className="mt-4 space-y-3">
                {visibleTreatments.map((treatment) => {
                  const meta = typeMeta(treatment.type);
                  const status = statusMeta(getTreatmentStatus(treatment));
                  const Icon = meta.icon;
                  return (
                    <motion.div key={treatment.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white"><Icon className="h-4 w-4" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-bold text-slate-900">{treatment.name}</p>
                              <p className="text-[11px] text-slate-500">{meta.label}</p>
                            </div>
                            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize', status.bg, status.text)}><span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />{getTreatmentStatus(treatment)}</span>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            {treatment.date && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDateLabel(treatment.date)}</span>}
                            {treatment.time && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{formatTimeLabel(treatment.time)}</span>}
                            {treatment.doctor && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{treatment.doctor}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500"><span>Progress</span><span>{treatment.progress || 0}%</span></div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500" style={{ width: `${treatment.progress || 0}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-1 pl-2">
                          <button type="button" onClick={() => openEditForm(treatment)} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700"><Pencil className="h-4 w-4" /></button>
                          <button type="button" onClick={() => handleDelete(treatment.id)} disabled={deletingId === treatment.id} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">{deletingId === treatment.id ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" /> : <Trash2 className="h-4 w-4" />}</button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TreatmentsPage() {
  return (
    <ProtectedRoute allowedRoles={PATIENT_CAREGIVER_ROLES}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <TreatmentTrackerContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
