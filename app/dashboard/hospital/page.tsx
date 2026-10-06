'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, BedDouble, CalendarCheck, ClipboardCheck, Clock3, FileText, FlaskConical, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KpiCard, PageHeader, StatusChip, ErrorPanel, EmptyState } from '@/components/hospital/ui-kit';
import { useHospital } from '@/lib/hospital/HospitalProvider';
import { callRpc } from '@/lib/hospital/api';
import { useLiveData } from '@/lib/hospital/useLive';
import { formatHospitalDate, formatHospitalTime } from '@/lib/hospital/format';
import type { HospitalCommandCenter } from '@/types/hospital';

const LIVE_TABLES = ['hospital_visits', 'queue_entries', 'opd_sessions', 'investigation_orders', 'hospital_admissions', 'patient_journey_events'];
const EMPTY_COMMAND_CENTER: HospitalCommandCenter = {
  kpis: { opd_patients_today: 0, checked_in: 0, waiting: 0, in_consultation: 0, pending_reports: 0, admissions_today: 0 },
  queues: [], action_required: [], checkins_by_hour: [], opd_14_days: [], recent_events: [],
};

export default function HospitalDashboardPage() {
  const t = useTranslations('hospitalOps');
  const legacy = useTranslations('hospital');
  const { org, can, refresh: refreshWorkspace } = useHospital();
  const [busy, setBusy] = useState(false);
  const [hospitalName, setHospitalName] = useState(org?.name ?? '');
  const [actionError, setActionError] = useState<string | null>(null);
  const fetchCommandCenter = useCallback(() => org ? callRpc<HospitalCommandCenter>('hospital_command_center', { p_hospital_id: org.id }) : Promise.reject(new Error('Hospital workspace unavailable')), [org]);
  const { data, loading, error, technicalDetails, refresh, lastUpdated, status } = useLiveData(fetchCommandCenter, { hospitalId: org?.id ?? '', tables: LIVE_TABLES });
  const safe: HospitalCommandCenter = {
    ...EMPTY_COMMAND_CENTER,
    ...data,
    kpis: { ...EMPTY_COMMAND_CENTER.kpis, ...(data?.kpis ?? {}) },
    queues: data?.queues ?? [],
    action_required: data?.action_required ?? [],
    recent_events: data?.recent_events ?? [],
    checkins_by_hour: data?.checkins_by_hour ?? [],
    opd_14_days: data?.opd_14_days ?? [],
  };
  const { kpis } = safe;
  const hasOperations = Boolean(kpis && Object.values(kpis).some((value) => value > 0));

  const runSample = async () => {
    if (!org) return;
    setBusy(true);
    setActionError(null);
    try {
      await callRpc('load_demo_data', { p_hospital_id: org.id });
      await refreshWorkspace();
      await refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : t('sampleDataFailed'));
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    if (!org || !hospitalName.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await callRpc('update_hospital_org', {
        p_hospital_id: org.id,
        p_name: hospitalName.trim(),
        p_timezone: org.timezone,
        p_patient_id_label: org.patient_id_label,
        p_patient_id_prefix: org.patient_id_prefix,
        p_settings: org.settings ?? {},
      });
      await refreshWorkspace();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : legacy('workspaceDataError'));
    } finally {
      setBusy(false);
    }
  };

  if (!org) return null;
  if (error && !data) return <ErrorPanel message={legacy('workspaceDataError')} technicalDetails={technicalDetails} onRetry={() => void refresh()} retryLabel={t('retry')} detailsLabel={t('showTechnicalDetails')} />;

  if (!loading && !hasOperations) {
    return <div className="space-y-6"><PageHeader title={t('commandCenter')} subtitle={`${org.name} · ${formatHospitalDate(new Date(), org.timezone)}`} />
      <section className="grid gap-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_0.85fr] lg:p-8">
        <div className="flex flex-col justify-center"><span className="text-xs font-semibold uppercase tracking-wide text-teal-800">{t('noOperationalData')}</span><h2 className="mt-3 max-w-xl text-3xl font-semibold text-slate-950">{t('firstRunTitle')}</h2><p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">{t('firstRunBody')}</p>
          <div className="mt-6 flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50" href="/dashboard/hospital/settings">{t('setUpHospital')}</Link></div>
        </div>
        <div className="rounded-lg bg-slate-50 p-4 sm:p-5"><label htmlFor="hospital-name" className="text-sm font-semibold text-slate-900">{t('renameHospital')}</label><div className="mt-2 flex gap-2"><Input id="hospital-name" value={hospitalName} onChange={(event) => setHospitalName(event.target.value)} maxLength={200} /><Button onClick={() => void saveName()} disabled={busy || !can('config.manage')}>{t('saveName')}</Button></div>{actionError && <p role="alert" className="mt-3 text-sm text-rose-800">{actionError}</p>}</div>
      </section>
    </div>;
  }

  const cards = [
    { label: t('todayOpdPatients'), value: kpis?.opd_patients_today ?? 0, icon: Users },
    { label: t('checkedIn'), value: kpis?.checked_in ?? 0, icon: CalendarCheck },
    { label: t('currentlyWaiting'), value: kpis?.waiting ?? 0, icon: Clock3, tone: 'amber' as const },
    { label: t('inConsultation'), value: kpis?.in_consultation ?? 0, icon: Activity },
    { label: t('pendingReports'), value: kpis?.pending_reports ?? 0, icon: FileText, tone: 'blue' as const },
    { label: t('todayAdmissions'), value: kpis?.admissions_today ?? 0, icon: BedDouble },
  ];

  return <div className="space-y-6">
    <PageHeader title={t('commandCenter')} subtitle={`${org.name} · ${formatHospitalDate(new Date(), org.timezone)}`} actions={<span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600"><span className={`h-2 w-2 rounded-full ${status === 'live' ? 'bg-emerald-600' : 'bg-amber-500'}`} />{status === 'live' && lastUpdated ? t('liveUpdated', { time: formatHospitalTime(lastUpdated, org.timezone) }) : status === 'polling' ? t('polling') : t('reconnecting')}</span>} />
    {actionError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{actionError}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards.map((card) => <KpiCard key={card.label} icon={card.icon} label={card.label} value={loading ? '—' : card.value} tone={card.tone} />)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.8fr]">
      <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-950">{t('liveQueues')}</h2><Link className="text-sm font-semibold text-teal-800 underline underline-offset-4" href="/dashboard/hospital/opd">{legacy('scheduleToday')}</Link></div>{safe.queues?.length ? <div className="grid gap-3 lg:grid-cols-2">{safe.queues?.map((queue) => <Link href={`/dashboard/hospital/opd/${queue.session_id}`} key={queue.session_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold text-slate-950">{queue.doctor}</h3><p className="mt-1 truncate text-sm text-slate-600">{queue.department}</p></div><StatusChip code={queue.status} /></div><div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center"><div><p className="text-[11px] text-slate-500">{t('currentlyServing')}</p><p className="mt-1 text-lg font-semibold tabular-nums">{queue.serving_token ? `#${queue.serving_token}` : '—'}</p></div><div><p className="text-[11px] text-slate-500">{t('nextToken')}</p><p className="mt-1 text-lg font-semibold tabular-nums">{queue.next_token ? `#${queue.next_token}` : '—'}</p></div><div><p className="text-[11px] text-slate-500">{t('waiting')}</p><p className="mt-1 text-lg font-semibold tabular-nums">{queue.waiting}</p></div></div><p className="mt-3 text-xs text-slate-500">{t('room')}: {queue.room ?? '—'} · {queue.completed} {legacy('completed')}</p>{queue.delay_flag && <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-amber-800"><AlertTriangle className="h-3.5 w-3.5" />{t('sessionDelay')}</p>}</Link>)}</div> : <EmptyState icon={Activity} title={t('liveQueues')} body={t('noOperationalData')} />}</section>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-950">{t('actionRequired')}</h2><ClipboardCheck className="h-5 w-5 text-teal-800" /></div>{safe.action_required?.length ? <ul className="mt-3 divide-y divide-slate-100">{safe.action_required?.map((item) => <li key={item.key} className="flex items-center gap-3 py-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${item.severity === 'critical' ? 'bg-rose-100 text-rose-800' : item.severity === 'warning' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-800'}`}><AlertTriangle className="h-4 w-4" /></span><Link href={item.href} className="min-w-0 flex-1 text-sm font-medium text-slate-800 underline-offset-4 hover:underline">{t(item.key as 'reportsReadyForReview' | 'waitingBeyondEstimate' | 'sessionDelay' | 'notCheckedIn' | 'pendingInvestigations')}</Link><span className="text-lg font-semibold tabular-nums">{item.count}</span></li>)}</ul> : <div className="mt-4 rounded-lg bg-emerald-50 px-3 py-4 text-sm font-medium text-emerald-900">{t('allClear')}</div>}</section>
    </div>
    <div className="grid gap-5 xl:grid-cols-2"><ChartPanel title={t('checkinsByHour')}><ResponsiveContainer width="100%" height={220}><BarChart data={safe.checkins_by_hour ?? []}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></ChartPanel><ChartPanel title={t('opdLast14Days')}><ResponsiveContainer width="100%" height={220}><AreaChart data={safe.opd_14_days ?? []}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} /><Tooltip /><Area dataKey="count" stroke="#0f766e" fill="#ccfbf1" strokeWidth={2} /></AreaChart></ResponsiveContainer></ChartPanel></div>
    <div className="grid gap-5 xl:grid-cols-[1fr_1fr]"><section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">{t('investigationCapacity')}</h2><p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><FlaskConical className="h-4 w-4 text-teal-800" />{kpis.pending_reports} {t('pendingReports').toLowerCase()}</p><Link className="mt-3 inline-block text-sm font-semibold text-teal-800 underline underline-offset-4" href="/dashboard/hospital/investigations">{legacy('investigations')}</Link></section><section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">{t('recentActivity')}</h2>{safe.recent_events?.length ? <ul className="mt-3 divide-y divide-slate-100">{safe.recent_events?.slice(0,6).map((event,index)=><li key={`${event.created_at}-${index}`} className="py-2"><p className="text-sm font-medium text-slate-800">{event.event_type}</p><p className="mt-0.5 text-xs text-slate-500">{event.patient} · {formatHospitalTime(event.created_at,org.timezone)}</p></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">{t('noOperationalData')}</p>}</section></div>
  </div>;
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="mb-3 text-base font-semibold text-slate-950">{title}</h2>{children}</section>;
}

function DatabaseIcon() {
  return <span className="mr-2 inline-flex"><FlaskConical className="h-4 w-4" /></span>;
}
