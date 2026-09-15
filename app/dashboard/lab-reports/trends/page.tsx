'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowLeft, BarChart3, FlaskConical } from 'lucide-react';
import { DashboardLayout, commonNavItems, type NavItem } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { calculateTrendSummary, normalizeUnit, type LabValueRow } from '@/lib/lab-reports';

const TrendChart = dynamic(async () => {
  const recharts = await import('recharts');

  return function ClientTrendChart({ data, selected }: { data: Array<{ date: string; value: number; unit: string | null }>; selected: string }) {
    return (
      <recharts.ResponsiveContainer width="100%" height="100%">
        <recharts.AreaChart data={data}>
          <defs>
            <linearGradient id="sensorFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.55} />
              <stop offset="95%" stopColor="#14B8A6" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <recharts.CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <recharts.XAxis dataKey="date" stroke="#64748b" fontSize={12} />
          <recharts.YAxis stroke="#64748b" fontSize={12} />
          <recharts.Tooltip formatter={(value: number | string) => [`${value}`, 'Value']} />
          <recharts.ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
          <recharts.Area type="monotone" dataKey="value" stroke="#0F766E" fill="url(#sensorFill)" strokeWidth={3} />
        </recharts.AreaChart>
      </recharts.ResponsiveContainer>
    );
  };
}, { ssr: false });

const navItems: NavItem[] = [...commonNavItems.filter((item) => item.href !== '/dashboard/documents'), { label: 'Lab Reports', href: '/dashboard/lab-reports', icon: FlaskConical }];

export default function LabReportsTrendsPage() {
  const { user } = useAuth();
  const [values, setValues] = useState<LabValueRow[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from('lab_values')
        .select('*')
        .order('updated_at', { ascending: false });

      if (queryError) {
        setError(queryError.message || 'Unable to load lab values.');
        setLoading(false);
        return;
      }

      const allValues = (data || []) as LabValueRow[];
      const approved = allValues.filter((item) => item.numeric_value !== null && item.canonical_name);
      setValues(approved);
      setSelected(approved[0]?.canonical_name || '');
      setLoading(false);
    };

    void load();
  }, [user]);

  const grouped = useMemo(() => {
    const map = new Map<string, LabValueRow[]>();
    values.forEach((value) => {
      const key = value.canonical_name || value.test_name;
      const list = map.get(key) || [];
      list.push(value);
      map.set(key, list);
    });
    return Array.from(map.entries()).map(([name, items]) => ({ name, items: [...items].sort((a, b) => new Date(a.test_date || a.created_at).getTime() - new Date(b.test_date || b.created_at).getTime()) }));
  }, [values]);

  const series = useMemo(() => {
    const selectedValues = grouped.find((item) => item.name === selected)?.items || [];
    return [...selectedValues]
      .sort((a, b) => new Date(a.test_date || a.created_at).getTime() - new Date(b.test_date || b.created_at).getTime())
      .map((value) => ({
        date: value.test_date ? new Date(value.test_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date(value.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        value: value.numeric_value ?? 0,
        unit: normalizeUnit(value.unit || value.normalized_unit),
      }));
  }, [grouped, selected]);

  const trendSummary = useMemo(() => calculateTrendSummary(series.map((point) => ({ date: point.date, value: point.value, unit: point.unit, label: selected || 'Biomarker' }))), [series, selected]);

  return (
    <ProtectedRoute allowedRoles={['patient', 'family_caregiver', 'medical_advisor']}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard/lab-reports" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" /> Back to reports
            </Link>
          </div>

          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <BarChart3 className="h-4 w-4 text-teal-600" /> Biomarker trend analysis
            </div>

            {loading ? (
              <div className="h-80 animate-pulse rounded-xl bg-slate-100" />
            ) : grouped.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No trend data is available yet. Upload a report with extractable values to generate a trend chart.</div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="text-sm font-medium text-slate-600">Biomarker</label>
                  <select value={selected} onChange={(e) => setSelected(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none">
                    {grouped.map((item) => (
                      <option key={item.name} value={item.name}>{item.name}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-4 grid gap-3 md:grid-cols-5">
                  <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] uppercase tracking-wide text-slate-500">Observations</div><div className="mt-1 text-lg font-bold text-slate-900">{trendSummary.count}</div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] uppercase tracking-wide text-slate-500">First value</div><div className="mt-1 text-lg font-bold text-slate-900">{trendSummary.firstValue ?? '—'}</div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] uppercase tracking-wide text-slate-500">Latest value</div><div className="mt-1 text-lg font-bold text-slate-900">{trendSummary.latestValue ?? '—'}</div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] uppercase tracking-wide text-slate-500">Change</div><div className="mt-1 text-lg font-bold text-slate-900">{trendSummary.absoluteChange !== null ? `${trendSummary.absoluteChange.toFixed(2)}` : '—'}</div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="text-[11px] uppercase tracking-wide text-slate-500">Direction</div><div className="mt-1 text-lg font-bold text-slate-900">{trendSummary.direction}</div></div>
                </div>

                <div className="h-80 w-full">
                  <TrendChart data={series} selected={selected} />
                </div>

                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  This trend is descriptive only. It tracks recorded values over time and does not diagnose disease progression or recommend treatment.
                </div>
              </>
            )}
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
