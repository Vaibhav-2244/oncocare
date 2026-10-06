'use client';

import { useEffect, useState } from 'react';
import { Activity, Bell, Calendar, CheckCircle2, ClipboardList, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getCaregiverDashboardStats } from '@/lib/caregiver';

export default function CaregiverDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ totalPatients: 0, activePatients: 0, pendingLinks: 0, notifications: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await getCaregiverDashboardStats();
        if (active) {
          setStats(next);
          setError(null);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load caregiver data.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, []);

  const firstName = user?.profile?.full_name?.split(' ')[0] || 'Caregiver';
  const cards = [
    { label: 'Patients', value: stats.totalPatients, icon: Users, color: 'bg-teal-500/10 text-teal-700' },
    { label: 'Active links', value: stats.activePatients, icon: CheckCircle2, color: 'bg-emerald-500/10 text-emerald-700' },
    { label: 'Pending links', value: stats.pendingLinks, icon: ClipboardList, color: 'bg-amber-500/10 text-amber-700' },
    { label: 'Unread alerts', value: stats.notifications, icon: Bell, color: 'bg-rose-500/10 text-rose-700' },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-teal-700">Welcome back</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">{firstName}</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Track patient care, medication adherence, appointments, and support tasks from a single view.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
            {error && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                {error}
              </div>
            )}
            <div className="mt-4 text-3xl font-bold text-slate-900">{loading ? '—' : value}</div>
            <div className="text-sm text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Care summary</h2>
            <Activity className="h-5 w-5 text-teal-600" />
          </div>
          <div className="mt-5 space-y-4">
            {[
              { label: 'Medication adherence', value: stats.activePatients ? 'Live patient data' : 'No active patients yet', tone: 'text-emerald-600' },
              { label: 'Follow-up queue', value: `${stats.pendingLinks} pending`, tone: 'text-amber-600' },
              { label: 'Check-ins', value: 'Syncs from caregiver links', tone: 'text-sky-600' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <span className="text-sm text-slate-600">{item.label}</span>
                <span className={`text-sm font-semibold ${item.tone}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Action required</h2>
            <Calendar className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-5 space-y-3">
            {stats.pendingLinks > 0 ? (
              <div className="flex items-start gap-3 rounded-xl border border-slate-100 p-3">
                <div className="mt-1 h-2.5 w-2.5 rounded-full bg-amber-500" />
                <p className="text-sm text-slate-700">Review {stats.pendingLinks} pending caregiver link{stats.pendingLinks === 1 ? '' : 's'}.</p>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-slate-100 p-3">
                <div className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <p className="text-sm text-slate-700">No action needed. All linked patients are current.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
