'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Pill, Plus, Trash2, X, Pencil, Activity, CheckCircle2,
  Percent, CalendarClock, LayoutDashboard, User, Settings,
  Brain, Stethoscope, HeartPulse, Clock, Bell, type LucideIcon,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, PATIENT_CAREGIVER_ROLES, type NavItem } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';
import { analyzePrescription } from '@/lib/prescription-analyzer';

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

const FREQUENCIES = [
  { value: 'once daily', label: 'Once Daily', times: 1 },
  { value: 'twice daily', label: 'Twice Daily', times: 2 },
  { value: 'three times daily', label: 'Three Times Daily', times: 3 },
  { value: 'as needed', label: 'As Needed', times: 0 },
  { value: 'weekly', label: 'Weekly', times: 1 },
] as const;

function frequencyLabel(value: string): string {
  return FREQUENCIES.find((f) => f.value === value)?.label || value;
}

function frequencyTimes(value: string): number {
  return FREQUENCIES.find((f) => f.value === value)?.times ?? 1;
}

interface Medication {
  id: string;
  user_id: string;
  name: string;
  dosage: string;
  frequency: string;
  times: string[] | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  is_active: boolean | null;
  last_taken_at: string | null;
  created_at?: string;
}

interface MedLog {
  id: string;
  medication_id: string;
  user_id: string;
  taken_at: string;
  created_at?: string;
}

const emptyForm = {
  name: '',
  dosage: '',
  frequency: 'once daily' as string,
  times: ['09:00'] as string[],
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
  notes: '',
};

function MedicationCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 animate-pulse rounded-xl bg-slate-100" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-1/4 animate-pulse rounded bg-slate-50" />
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

function MedicationsContent() {
  const { user } = useAuth();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [logs, setLogs] = useState<MedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [analyzingPrescription, setAnalyzingPrescription] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);

  const [form, setForm] = useState({ ...emptyForm });

  const handlePrescriptionUpload = async (file: File | undefined) => {
    if (!file) return;
    setAnalyzingPrescription(true);
    setAnalysisMessage(null);
    try {
      const extracted = await analyzePrescription(file);
      if (!extracted) {
        setAnalysisMessage('No medication details were detected. Please verify the file is clear and try again.');
        return;
      }
      setForm((current) => ({ ...current, ...extracted }));
      setAnalysisMessage('Details extracted. Review them carefully before saving.');
    } catch (err) {
      setAnalysisMessage(err instanceof Error ? err.message : 'Prescription analysis failed.');
    } finally {
      setAnalyzingPrescription(false);
    }
  };

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [medsRes, logsRes] = await Promise.all([
        supabase
          .from('medications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('medication_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('taken_at', { ascending: false }),
      ]);
      if (medsRes.error) throw medsRes.error;
      if (logsRes.error) throw logsRes.error;
      setMedications((medsRes.data || []) as Medication[]);
      setLogs((logsRes.data || []) as MedLog[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load medications');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  const openAddForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowForm(true);
  };

  const openEditForm = (m: Medication) => {
    setForm({
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      times: m.times && m.times.length > 0 ? m.times : ['09:00'],
      start_date: m.start_date ? m.start_date.slice(0, 10) : '',
      end_date: m.end_date ? m.end_date.slice(0, 10) : '',
      notes: m.notes || '',
    });
    setEditingId(m.id);
    setShowForm(true);
  };

  // sync number of time inputs with frequency
  useEffect(() => {
    setForm((f) => {
      const needed = frequencyTimes(f.frequency);
      let times = [...f.times];
      if (f.frequency === 'as needed') {
        times = [];
      } else {
        while (times.length < needed) times.push('09:00');
        if (times.length > needed) times = times.slice(0, needed);
      }
      return { ...f, times };
    });
  }, [form.frequency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        dosage: form.dosage.trim(),
        frequency: form.frequency,
        times: form.frequency === 'as needed' ? [] : form.times,
        start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
        end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
        notes: form.notes.trim() || null,
      };
      if (editingId) {
        const { error: updateError } = await supabase
          .from('medications')
          .update(payload)
          .eq('id', editingId);
        if (updateError) throw updateError;
        setMedications((prev) =>
          prev.map((m) => (m.id === editingId ? { ...m, ...payload } : m)),
        );
      } else {
        const { data, error: insertError } = await supabase
          .from('medications')
          .insert({ ...payload, is_active: true })
          .select()
          .single();
        if (insertError) throw insertError;
        setMedications((prev) => [data as Medication, ...prev]);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ ...emptyForm });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save medication');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error: deleteError } = await supabase.from('medications').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setMedications((prev) => prev.filter((m) => m.id !== id));
      setLogs((prev) => prev.filter((l) => l.medication_id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete medication');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (med: Medication) => {
    const next = !med.is_active;
    setMedications((prev) => prev.map((m) => (m.id === med.id ? { ...m, is_active: next } : m)));
    try {
      const { error: updateError } = await supabase
        .from('medications')
        .update({ is_active: next })
        .eq('id', med.id);
      if (updateError) throw updateError;
    } catch (err) {
      // revert on failure
      setMedications((prev) => prev.map((m) => (m.id === med.id ? { ...m, is_active: !next } : m)));
      setError(err instanceof Error ? err.message : 'Failed to update medication');
    }
  };

  const handleMarkTaken = async (med: Medication) => {
    if (!user) return;
    setMarkingId(med.id);
    const nowIso = new Date().toISOString();
    try {
      const { data, error: logError } = await supabase
        .from('medication_logs')
        .insert({
          medication_id: med.id,
          taken_at: nowIso,
        })
        .select()
        .single();
      if (logError) throw logError;
      setLogs((prev) => [data as MedLog, ...prev]);
      // update last_taken_at on the medication
      const { error: medUpdateError } = await supabase
        .from('medications')
        .update({ last_taken_at: nowIso })
        .eq('id', med.id);
      if (medUpdateError) throw medUpdateError;
      setMedications((prev) =>
        prev.map((m) => (m.id === med.id ? { ...m, last_taken_at: nowIso } : m)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log dose');
    } finally {
      setMarkingId(null);
    }
  };

  // stats
  const totalMeds = medications.length;
  const activeMeds = medications.filter((m) => m.is_active).length;
  const dosesToday = logs.filter((l) => {
    const d = new Date(l.taken_at);
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  }).length;

  // adherence: expected doses in last 30 days vs logged
  const adherenceRate = (() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeMedIds = medications.filter((m) => m.is_active).map((m) => m.id);
    if (activeMedIds.length === 0) return 0;
    let expected = 0;
    medications.forEach((m) => {
      if (!m.is_active) return;
      const perDay = m.frequency === 'weekly' ? 1 / 7 : frequencyTimes(m.frequency);
      const start = m.start_date ? new Date(m.start_date) : thirtyDaysAgo;
      const from = start > thirtyDaysAgo ? start : thirtyDaysAgo;
      const days = Math.max(0, Math.floor((Date.now() - from.getTime()) / (24 * 60 * 60 * 1000)));
      expected += perDay * days;
    });
    if (expected === 0) return 100;
    const actual = logs.filter(
      (l) => activeMedIds.includes(l.medication_id) && new Date(l.taken_at) >= thirtyDaysAgo,
    ).length;
    return Math.min(100, Math.round((actual / expected) * 100));
  })();

  const statCards = [
    { label: 'Active Medications', value: activeMeds, icon: Pill, color: 'from-teal-500 to-emerald-500' },
    { label: 'Total Medications', value: totalMeds, icon: Activity, color: 'from-blue-500 to-indigo-500' },
    { label: 'Adherence Rate', value: `${adherenceRate}%`, icon: Percent, color: 'from-amber-500 to-orange-500' },
    { label: 'Doses Today', value: dosesToday, icon: CheckCircle2, color: 'from-rose-500 to-pink-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Medication Reminders</h1>
          <p className="mt-1 text-sm text-slate-500">Track your medications and adherence</p>
        </div>
        <button
          onClick={() => (showForm ? setShowForm(false) : openAddForm())}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md hover:from-teal-700 hover:to-emerald-700"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Cancel' : 'Add Medication'}
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
                {editingId ? 'Edit Medication' : 'Add a New Medication'}
              </h2>
              {!editingId && (
                <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-teal-800">Analyze a prescription</p>
                      <p className="mt-1 text-xs text-teal-700">Upload an image or PDF to prefill this form. Nothing is saved automatically.</p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800">
                      {analyzingPrescription ? 'Analyzing...' : 'Choose file'}
                      <input type="file" accept="image/*,application/pdf" className="sr-only" disabled={analyzingPrescription} onChange={(event) => void handlePrescriptionUpload(event.target.files?.[0])} />
                    </label>
                  </div>
                  {analysisMessage && <p className="mt-3 text-xs font-medium text-teal-800">{analysisMessage}</p>}
                </div>
              )}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Name</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Ondansetron"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Dosage</label>
                  <input
                    type="text"
                    required
                    value={form.dosage}
                    onChange={(e) => setForm((f) => ({ ...f, dosage: e.target.value }))}
                    placeholder="e.g. 8 mg"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Frequency</label>
                  <select
                    value={form.frequency}
                    onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  >
                    {FREQUENCIES.map((fr) => (
                      <option key={fr.value} value={fr.value}>
                        {fr.label}
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

              {/* Times */}
              {form.frequency !== 'as needed' && form.times.length > 0 && (
                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Reminder Times</label>
                  <div className="flex flex-wrap gap-3">
                    {form.times.map((time, idx) => (
                      <input
                        key={idx}
                        type="time"
                        value={time}
                        onChange={(e) =>
                          setForm((f) => {
                            const times = [...f.times];
                            times[idx] = e.target.value;
                            return { ...f, times };
                          })
                        }
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder="e.g. Take with food, before bed..."
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
                  {editingId ? 'Update Medication' : 'Save Medication'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Medication cards */}
      <div>
        <h2 className="mb-3 text-base font-bold text-slate-900">Your Medications</h2>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <MedicationCardSkeleton key={i} />)}
          </div>
        ) : medications.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/60 bg-white p-12 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
                <Pill className="h-7 w-7" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">No medications added yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Add your medications to get reminders and track adherence.
              </p>
              <button
                onClick={openAddForm}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md"
              >
                <Plus className="h-4 w-4" /> Add a medication
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <AnimatePresence initial={false}>
              {medications.map((med, i) => {
                const isActive = med.is_active !== false;
                return (
                  <motion.div
                    key={med.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: i * 0.04 }}
                    className={cn(
                      'group rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md',
                      isActive ? 'border-slate-200/60' : 'border-slate-100 opacity-70',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm',
                          isActive
                            ? 'bg-gradient-to-br from-teal-500 to-emerald-500'
                            : 'bg-slate-300',
                        )}
                      >
                        <Pill className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900">{med.name}</h3>
                          <span className="text-xs font-semibold text-slate-500">{med.dosage}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">{frequencyLabel(med.frequency)}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => openEditForm(med)}
                          className="rounded-lg p-2 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                          aria-label="Edit medication"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(med.id)}
                          disabled={deletingId === med.id}
                          className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50"
                          aria-label="Delete medication"
                        >
                          {deletingId === med.id ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Times badges */}
                    {med.times && med.times.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {med.times.map((time, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700"
                          >
                            <Clock className="h-3 w-3" />
                            {time}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Last taken + active toggle */}
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <div className="text-xs text-slate-500">
                        {med.last_taken_at ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            Last taken:{' '}
                            {new Date(med.last_taken_at).toLocaleString('en-US', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                            Not taken yet
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleToggleActive(med)}
                        className={cn(
                          'relative h-5 w-9 rounded-full transition-colors',
                          isActive ? 'bg-teal-500' : 'bg-slate-300',
                        )}
                        aria-label="Toggle active"
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                            isActive ? 'left-4' : 'left-0.5',
                          )}
                        />
                      </button>
                    </div>

                    {med.notes && (
                      <p className="mt-3 text-sm text-slate-600">{med.notes}</p>
                    )}

                    {/* Mark as taken */}
                    <button
                      onClick={() => handleMarkTaken(med)}
                      disabled={markingId === med.id}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-700 transition-colors hover:bg-teal-100 disabled:opacity-60"
                    >
                      {markingId === med.id ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-200 border-t-teal-600" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Mark as Taken
                    </button>
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

export default function MedicationsPage() {
  return (
    <ProtectedRoute allowedRoles={PATIENT_CAREGIVER_ROLES}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <MedicationsContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
