'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, CalendarDays, ClipboardPlus, FileText, UserRound, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useHospital } from '@/lib/hospital/HospitalProvider';
import { callRpc } from '@/lib/hospital/api';
import { formatHospitalDate, formatHospitalTime } from '@/lib/hospital/format';
import { ErrorPanel, KpiCard, StatusChip } from '@/components/hospital/ui-kit';

type RecordData = {
  patient: { id: string; identifier: string; name: string; age: number | null; gender: string | null; mobile: string | null; dob: string | null; linked: boolean };
  today: { visit: { checked_in_at: string } | null; queue_entry: { token_number: number; status: string; est_wait_low_min: number | null; est_wait_high_min: number | null } | null };
  appointments: Array<{ id: string; scheduled_at: string; status: string; kind: string; doctor: string | null; department: string | null }>;
  orders: Array<{ id: string; type: string; status: string; priority: string; scheduled_for: string | null; expected_report_from: string | null; expected_report_to: string | null }>;
  consultations: Array<{ id: string; status: string; complaint: string | null; assessment: string | null; plan: string | null; advice: string | null; version: number; created_at: string }>;
  prescriptions: Array<{ id: string; notes: string | null; created_at: string; items: Array<{ medicine_name: string; dose: string | null; frequency: string | null; duration: string | null; instructions: string | null }> }>;
  admissions: Array<{ id: string; ward: string; bed: string; status: string; admitted_at: string }>;
  timeline: Array<{ event_type: string; details: Record<string, unknown>; created_at: string; visible_to_patient: boolean }>;
  clinical_restricted: boolean;
};

export function HospitalPatientRecordPage({ identifier }: { identifier: string }) {
  const t = useTranslations('hospitalOps');
  const { org } = useHospital();
  const [record, setRecord] = useState<RecordData | null>(null);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [technical, setTechnical] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    setError(null);
    try {
      setRecord(await callRpc<RecordData>('get_hospital_patient_record', { p_hospital_id: org.id, p_identifier: decodeURIComponent(identifier) }));
      setTechnical(null);
    } catch (caught) {
      setError(t('patientRecordFailed'));
      setTechnical(caught instanceof Error ? caught.message : String(caught));
    } finally { setLoading(false); }
  }, [org, identifier, t]);
  useEffect(() => { void load(); }, [load]);

  const checkIn = async () => {
    if (!org || !record) return;
    setBusy(true);
    try {
      await callRpc('hospital_check_in', { p_hospital_id: org.id, p_patient_id: record.patient.id, p_appointment_id: null });
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('checkInFailed')); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="grid gap-3" role="status"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /><div className="h-64 animate-pulse rounded-xl bg-slate-100" /></div>;
  if (error || !record) return <ErrorPanel message={error ?? t('patientRecordFailed')} technicalDetails={technical} onRetry={() => void load()} retryLabel={t('retry')} detailsLabel={t('showTechnicalDetails')} />;
  const patient = record.patient;
  const tabs = ['overview','timeline','appointments','investigations','consultations','admissions'];

  return <div className="space-y-5">
    <Link href="/dashboard/hospital/patients" className="text-sm font-medium text-teal-800 underline underline-offset-4">{t('backToPatients')}</Link>
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex min-w-0 items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal-50 text-teal-800"><UserRound className="h-5 w-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold text-slate-950">{patient.name}</h1><span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">{patient.identifier}</span></div><p className="mt-1 text-sm text-slate-600">{patient.age ?? '—'} · {patient.gender ?? '—'} · {patient.mobile ?? '—'}</p></div></div><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>void checkIn()} className="min-h-11 rounded-lg bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50">{t('checkIn')}</button><button disabled={!org || record.clinical_restricted} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50">{t('bookAppointment')}</button><button disabled={!org || record.clinical_restricted} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50">{t('orderInvestigation')}</button></div></header>
    <div className="grid gap-3 sm:grid-cols-3"><KpiCard icon={CalendarDays} label={t('todayVisit')} value={record.today.visit ? formatHospitalTime(record.today.visit.checked_in_at,org?.timezone ?? 'Asia/Kolkata') : t('notCheckedIn')} /><KpiCard icon={Activity} label={t('queueToken')} value={record.today.queue_entry ? `#${record.today.queue_entry.token_number}` : '—'} /><KpiCard icon={ClipboardPlus} label={t('appointments')} value={record.appointments.length} /></div>
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label={t('patientRecordTabs')}>{tabs.map((item)=><button key={item} onClick={()=>setTab(item)} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium ${tab===item?'border-teal-800 text-teal-900':'border-transparent text-slate-600 hover:text-slate-950'}`}>{t(`tab_${item}` as 'tab_overview')}</button>)}</nav>
    {tab==='overview' && <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold text-slate-950">{t('todayVisit')}</h2>{record.today.queue_entry ? <div className="mt-3 flex items-center justify-between gap-3"><p className="text-sm text-slate-700">{t('queueToken')} #{record.today.queue_entry.token_number}</p><StatusChip code={record.today.queue_entry.status} /></div> : <p className="mt-2 text-sm text-slate-600">{t('noVisitToday')}</p>}</section><section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold text-slate-950">{t('upcomingAppointments')}</h2>{record.appointments.slice(0,4).map((appointment)=><div key={appointment.id} className="flex justify-between gap-3 border-b py-3 text-sm"><span>{appointment.doctor ?? t('doctorNotAssigned')} · {formatHospitalDate(appointment.scheduled_at,org?.timezone ?? 'Asia/Kolkata')}</span><StatusChip code={appointment.status} /></div>)}</section></div>}
    {tab==='timeline' && <Timeline events={record.timeline} timezone={org?.timezone ?? 'Asia/Kolkata'} />}
    {tab==='appointments' && <List>{record.appointments.map((item)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm"><div><p className="font-medium text-slate-900">{item.doctor ?? t('doctorNotAssigned')}</p><p className="text-slate-600">{formatHospitalDate(item.scheduled_at,org?.timezone ?? 'Asia/Kolkata')} · {item.kind}</p></div><StatusChip code={item.status} /></div>)}</List>}
    {tab==='investigations' && <List>{record.orders.map((item)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm"><div><p className="font-medium text-slate-900">{item.type}</p><p className="text-slate-600">{item.expected_report_from && item.expected_report_to ? `${item.expected_report_from} – ${item.expected_report_to}` : t('reportWindowPending')}</p></div><StatusChip code={item.status} /></div>)}</List>}
    {tab==='consultations' && <List>{record.clinical_restricted ? <p className="py-5 text-sm text-slate-600">{t('clinicalRestricted')}</p> : <>{record.consultations.map((item)=><article key={item.id} className="border-b py-3"><div className="flex justify-between gap-2"><p className="font-medium text-slate-900">{t('consultationVersion', { version: item.version })}</p><StatusChip code={item.status} /></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.assessment ?? item.complaint ?? '—'}</p></article>)}{record.prescriptions.map((prescription)=><article key={prescription.id} className="border-b py-3"><h3 className="font-semibold text-slate-900">{t('prescription')}</h3>{prescription.items.map((item,index)=><p key={`${prescription.id}-${index}`} className="mt-1 text-sm text-slate-700">{item.medicine_name} · {item.dose} · {item.frequency} · {item.duration}</p>)}{prescription.notes&&<p className="mt-2 text-sm text-slate-600">{prescription.notes}</p>}</article>)}</>}</List>}
    {tab==='admissions' && <List>{record.admissions.map((item)=><div key={item.id} className="flex justify-between gap-3 border-b py-3 text-sm"><span>{item.ward} · {item.bed} · {formatHospitalDate(item.admitted_at,org?.timezone ?? 'Asia/Kolkata')}</span><StatusChip code={item.status} /></div>)}</List>}
  </div>;
}

function Timeline({ events, timezone }: { events: RecordData['timeline']; timezone: string }) {
  return <ol className="space-y-3">{events.map((event,index)=><li key={`${event.created_at}-${index}`} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-teal-700" /><div><p className="text-sm font-semibold text-slate-900">{event.event_type}</p><time className="mt-1 block text-xs text-slate-500">{formatHospitalDate(event.created_at,timezone,{dateStyle:'medium',timeStyle:'short'})}</time></div></li>)}</ol>;
}
function List({ children }: { children: React.ReactNode }) { return <section className="rounded-xl border border-slate-200 bg-white px-4 shadow-sm">{children}</section>; }
