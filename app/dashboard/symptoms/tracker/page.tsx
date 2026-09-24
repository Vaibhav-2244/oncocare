'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, CalendarClock, CheckCircle2, Clock3, PlusCircle, TrendingUp } from 'lucide-react';
import { DashboardLayout, PATIENT_CAREGIVER_ROLES, caregiverNavItems, patientNavItems } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/lib/auth-context';
import { readStoredRecords, writeStoredRecords, type SideEffectRecord } from '@/lib/symptom-monitor';
import { supabase } from '@/lib/supabase-client';

const WHAT_HELPED = ['Rest', 'Food', 'Water', 'Walking', 'Relaxation', 'Medication'];

export default function SideEffectTrackerPage() {
  const { user } = useAuth();
  const navItems = user?.primaryRole === 'family_caregiver' ? caregiverNavItems : patientNavItems;
  const [records, setRecords] = useState<SideEffectRecord[]>([]);
  const [symptom, setSymptom] = useState('Nausea');
  const [severity, setSeverity] = useState(5);
  const [trend, setTrend] = useState<'Improving' | 'Stable' | 'Getting worse'>('Stable');
  const [duration, setDuration] = useState('Today');
  const [notes, setNotes] = useState('');
  const [whatHelped, setWhatHelped] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    if (!user) return;
    const local = readStoredRecords(user.id);
    if (local.length > 0) {
      setRecords(local);
    }

    const { data, error: queryError } = await supabase.from('side_effect_entries').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (!queryError && data) {
      const normalized = (data as Array<Record<string, any>>).map((item) => ({
        id: String(item.id ?? crypto.randomUUID()),
        name: String(item.name ?? 'Side effect'),
        severity: Number(item.severity ?? 5),
        trend: (item.trend as SideEffectRecord['trend']) ?? 'Stable',
        duration: String(item.duration ?? 'Today'),
        notes: String(item.notes ?? ''),
        whatHelped: Array.isArray(item.what_helped) ? item.what_helped.map(String) : [],
        recordedAt: String(item.recorded_at ?? item.recordedAt ?? new Date().toISOString()),
        followUpAt: item.follow_up_at ? String(item.follow_up_at) : null,
        followUpStatus: (item.follow_up_status as SideEffectRecord['followUpStatus']) ?? 'scheduled',
        followUpCompletedAt: item.follow_up_completed_at ? String(item.follow_up_completed_at) : undefined,
        user_id: item.user_id ? String(item.user_id) : user.id,
        source: String(item.source ?? 'dashboard'),
      }));
      setRecords(normalized);
      writeStoredRecords(normalized, user.id);
    }
  }, [user]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const dueRecords = useMemo(() => records.filter((record) => record.followUpStatus === 'due'), [records]);
  const weeklyAverage = useMemo(() => (records.length ? records.reduce((sum, item) => sum + item.severity, 0) / records.length : 0), [records]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);

    try {
      const nextRecord: SideEffectRecord = {
        id: crypto.randomUUID(),
        name: symptom,
        severity,
        trend,
        duration,
        notes,
        whatHelped,
        recordedAt: new Date().toISOString(),
        followUpAt: new Date(Date.now() + Math.max(2, 24 - severity * 2) * 60 * 60 * 1000).toISOString(),
        followUpStatus: 'scheduled',
        source: 'dashboard',
      };

      const { data, error: insertError } = await supabase.from('side_effect_entries').insert({
        user_id: user.id,
        name: nextRecord.name,
        severity: nextRecord.severity,
        trend: nextRecord.trend,
        duration: nextRecord.duration,
        notes: nextRecord.notes,
        what_helped: nextRecord.whatHelped,
        follow_up_at: nextRecord.followUpAt,
        follow_up_status: 'scheduled',
        recorded_at: nextRecord.recordedAt,
      }).select().single();

      if (insertError) throw insertError;

      const merged = [data ? ({ ...nextRecord, ...data } as SideEffectRecord) : nextRecord, ...records];
      setRecords(merged);
      writeStoredRecords(merged, user.id);
      setSymptom('Nausea');
      setSeverity(5);
      setTrend('Stable');
      setDuration('Today');
      setNotes('');
      setWhatHelped([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the side effect.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={PATIENT_CAREGIVER_ROLES}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Treatment tracking</p>
              <h1 className="text-2xl font-bold text-slate-900">Side Effect Tracker</h1>
            </div>
            <div className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              {records.length} tracked entries
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Avg severity</p>
              <div className="mt-2 text-3xl font-bold text-slate-900">{weeklyAverage.toFixed(1)}</div>
              <p className="mt-1 text-xs text-slate-500">Recent severity average</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Due follow-ups</p>
              <div className="mt-2 text-3xl font-bold text-amber-600">{dueRecords.length}</div>
              <p className="mt-1 text-xs text-slate-500">Needs a check-in</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Trend</p>
              <div className="mt-2 text-3xl font-bold text-emerald-600">{records.filter((item) => item.trend === 'Improving').length}</div>
              <p className="mt-1 text-xs text-slate-500">Improving this period</p>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
                <PlusCircle className="h-5 w-5 text-teal-600" />
                Log a side effect
              </div>
              <div className="space-y-4">
                <label className="block text-sm text-slate-700">
                  Symptom / side effect
                  <input value={symptom} onChange={(e) => setSymptom(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-300 focus:bg-white" />
                </label>

                <label className="block text-sm text-slate-700">
                  Severity: {severity}/10
                  <input type="range" min={1} max={10} value={severity} onChange={(e) => setSeverity(Number(e.target.value))} className="mt-2 w-full accent-teal-600" />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    Trend
                    <select value={trend} onChange={(e) => setTrend(e.target.value as 'Improving' | 'Stable' | 'Getting worse')} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-300 focus:bg-white">
                      <option>Stable</option>
                      <option>Improving</option>
                      <option>Getting worse</option>
                    </select>
                  </label>
                  <label className="block text-sm text-slate-700">
                    Duration
                    <input value={duration} onChange={(e) => setDuration(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-300 focus:bg-white" />
                  </label>
                </div>

                <div>
                  <p className="mb-2 text-sm text-slate-700">What helped?</p>
                  <div className="flex flex-wrap gap-2">
                    {WHAT_HELPED.map((item) => {
                      const selected = whatHelped.includes(item);
                      return (
                        <button type="button" key={item} onClick={() => setWhatHelped((prev) => selected ? prev.filter((v) => v !== item) : [...prev, item])} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${selected ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                          {item}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="block text-sm text-slate-700">
                  Notes
                  <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-300 focus:bg-white" placeholder="Describe symptoms, triggers, or impact on daily life." />
                </label>

                {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

                <button type="submit" disabled={saving || !user} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  <ArrowRight className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save & schedule follow-up'}
                </button>
              </div>
            </form>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
                <TrendingUp className="h-5 w-5 text-indigo-600" />
                Recent side effects
              </div>
              <div className="space-y-3">
                {records.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">No side effects logged yet.</div>
                ) : (
                  records.slice(0, 5).map((record) => (
                    <div key={record.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-slate-900">{record.name}</div>
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">{record.trend}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {record.severity}/10</span>
                        <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> {record.duration}</span>
                      </div>
                      {record.notes && <p className="mt-2 text-sm text-slate-600">{record.notes}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
