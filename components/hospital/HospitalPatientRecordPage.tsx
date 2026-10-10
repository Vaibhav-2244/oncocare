'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, CalendarDays, ClipboardPlus, FileText, UserRound, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useHospital } from '@/lib/hospital/HospitalProvider';
import { callRpc } from '@/lib/hospital/api';
import { supabase } from '@/lib/supabase-client';
import { formatHospitalDate, formatHospitalTime } from '@/lib/hospital/format';
import { ErrorPanel, KpiCard, StatusChip } from '@/components/hospital/ui-kit';

type RecordData = {
  patient: { id: string; identifier: string; name: string; age: number | null; gender: string | null; mobile: string | null; dob: string | null; linked: boolean };
  today: { visit: { checked_in_at: string } | null; queue_entry: { token_number: number; status: string; session_id: string; est_wait_low_min: number | null; est_wait_high_min: number | null } | null };
  appointments: Array<{ id: string; scheduled_at: string; status: string; kind: string; doctor: string | null; department: string | null }>;
  orders: Array<{ id: string; type: string; status: string; priority: string; scheduled_for: string | null; expected_report_from: string | null; expected_report_to: string | null }>;
  consultations: Array<{ id: string; status: string; complaint: string | null; assessment: string | null; plan: string | null; advice: string | null; version: number; created_at: string }>;
  prescriptions: Array<{ id: string; notes: string | null; created_at: string; items: Array<{ medicine_name: string; dose: string | null; frequency: string | null; duration: string | null; instructions: string | null }> }>;
  admissions: Array<{ id: string; ward: string; bed: string; status: string; admitted_at: string }>;
  timeline: Array<{ event_type: string; details: Record<string, unknown>; created_at: string; visible_to_patient: boolean }>;
  clinical_restricted: boolean;
};
type SessionOption = { session_id: string; doctor: string; department: string | null; room: string | null; status: string };
type DoctorOption = { id: string; doctor_name: string; specialty: string | null };
type InvestigationType = { id: string; name: string; is_active: boolean };

export function HospitalPatientRecordPage({ identifier }: { identifier: string }) {
  const t = useTranslations('hospitalOps');
  const { org, can } = useHospital();
  const [record, setRecord] = useState<RecordData | null>(null);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [investigationTypes, setInvestigationTypes] = useState<InvestigationType[]>([]);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [technical, setTechnical] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [investigationOpen, setInvestigationOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [appointmentKind, setAppointmentKind] = useState('opd');
  const [appointmentReason, setAppointmentReason] = useState('');
  const [selectedInvestigation, setSelectedInvestigation] = useState('');
  const [investigationPriority, setInvestigationPriority] = useState('routine');

  const load = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    setError(null);
    try {
      const nextRecord = await callRpc<RecordData>('get_hospital_patient_record', { p_hospital_id: org.id, p_identifier: identifier });
      setRecord(nextRecord);
      setTechnical(null);
      const [sessionResult, doctorResult, typeResult] = await Promise.all([
        can('queue.manage')
          ? callRpc<SessionOption[]>('get_today_sessions', { p_hospital_id: org.id })
          : Promise.resolve([]),
        can('queue.manage') || can('patients.register')
          ? supabase.from('hospital_doctors').select('id,doctor_name,specialty').eq('hospital_id', org.id).eq('is_active', true).eq('employment_status', 'active').order('doctor_name')
          : Promise.resolve({ data: [], error: null }),
        can('orders.create')
          ? supabase.from('investigation_types').select('id,name,is_active').eq('hospital_id', org.id).eq('is_active', true).order('name')
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (doctorResult.error) throw doctorResult.error;
      if (typeResult.error) throw typeResult.error;
      setSessions((sessionResult ?? []).filter((session) => session.status === 'open'));
      setDoctors((doctorResult.data ?? []) as DoctorOption[]);
      setInvestigationTypes((typeResult.data ?? []) as InvestigationType[]);
      setActionError(null);
    } catch (caught) {
      setError(t('patientRecordFailed'));
      setTechnical(caught instanceof Error ? caught.message : String(caught));
    } finally { setLoading(false); }
  }, [can, org, identifier, t]);
  useEffect(() => { void load(); }, [load]);

  const checkIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!org || !record) return;
    setBusy(true);
    setActionError(null);
    try {
      await callRpc('check_in_and_queue', {
        p_hospital_id: org.id,
        p_patient_id: record.patient.id,
        p_session_id: selectedSession,
        p_appointment_id: null,
        p_priority: 3,
        p_reason: null,
      });
      setCheckInOpen(false);
      setSelectedSession('');
      await load();
    } catch (caught) { setActionError(caught instanceof Error ? caught.message : t('checkInFailed')); }
    finally { setBusy(false); }
  };

  const bookAppointment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!org || !record) return;
    setBusy(true);
    setActionError(null);
    try {
      await callRpc('hospital_staff_book_appointment', {
        p_hospital_id: org.id,
        p_patient_id: record.patient.id,
        p_doctor_id: selectedDoctor,
        p_scheduled_at: hospitalLocalDateTimeToIso(scheduledAt, org.timezone),
        p_kind: appointmentKind,
        p_reason: appointmentReason || null,
      });
      setAppointmentOpen(false);
      setAppointmentReason('');
      await load();
    } catch (caught) { setActionError(caught instanceof Error ? caught.message : t('operationFailed')); }
    finally { setBusy(false); }
  };

  const orderInvestigation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!org || !record || !can('orders.create')) return;
    setBusy(true);
    setActionError(null);
    try {
      await callRpc('order_investigation', {
        p_hospital_id: org.id,
        p_patient_id: record.patient.id,
        p_type_id: selectedInvestigation,
        p_doctor_id: null,
        p_priority: investigationPriority,
        p_consultation_id: null,
      });
      setInvestigationOpen(false);
      await load();
    } catch (caught) { setActionError(caught instanceof Error ? caught.message : t('operationFailed')); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="grid gap-3" role="status"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /><div className="h-64 animate-pulse rounded-xl bg-slate-100" /></div>;
  if (error || !record) return <ErrorPanel message={error ?? t('patientRecordFailed')} technicalDetails={technical} onRetry={() => void load()} retryLabel={t('retry')} detailsLabel={t('showTechnicalDetails')} />;
  const patient = record.patient;
  const tabs = ['overview','timeline','appointments','investigations','consultations','admissions'];

  return <div className="space-y-5">
    <Link href="/dashboard/hospital/patients" className="text-sm font-medium text-teal-800 underline underline-offset-4">{t('backToPatients')}</Link>
    {actionError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{actionError}</p>}
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex min-w-0 items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal-50 text-teal-800"><UserRound className="h-5 w-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold text-slate-950">{patient.name}</h1><span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">{patient.identifier}</span></div><p className="mt-1 text-sm text-slate-600">{patient.age ?? '—'} · {patient.gender ?? '—'} · {patient.mobile ?? '—'}</p></div></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !can('queue.manage') || Boolean(record.today.queue_entry && ['waiting','called','in_consultation'].includes(record.today.queue_entry.status))} onClick={()=>setCheckInOpen(true)} className="min-h-11 rounded-lg bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50">{record.today.queue_entry && ['waiting','called','in_consultation'].includes(record.today.queue_entry.status) ? t('alreadyInQueue') : t('checkIn')}</button><button type="button" disabled={busy || !(can('patients.register') || can('queue.manage'))} onClick={()=>{setScheduledAt(defaultHospitalAppointmentTime(org?.timezone ?? 'Asia/Kolkata'));setAppointmentOpen(true);}} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50">{t('bookAppointment')}</button><button type="button" onClick={()=>setInvestigationOpen(true)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700">{t('orderInvestigation')}</button></div></header>
    <div className="grid gap-3 sm:grid-cols-3"><KpiCard icon={CalendarDays} label={t('todayVisit')} value={record.today.visit ? formatHospitalTime(record.today.visit.checked_in_at,org?.timezone ?? 'Asia/Kolkata') : t('patientNotCheckedIn')} /><KpiCard icon={Activity} label={t('queueToken')} value={record.today.queue_entry ? `#${record.today.queue_entry.token_number}` : '—'} /><KpiCard icon={ClipboardPlus} label={t('appointments')} value={record.appointments.length} /></div>
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label={t('patientRecordTabs')}>{tabs.map((item)=><button key={item} onClick={()=>setTab(item)} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium ${tab===item?'border-teal-800 text-teal-900':'border-transparent text-slate-600 hover:text-slate-950'}`}>{t(`tab_${item}` as 'tab_overview')}</button>)}</nav>
    {tab==='overview' && <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold text-slate-950">{t('todayVisit')}</h2>{record.today.queue_entry ? <div className="mt-3 flex items-center justify-between gap-3"><p className="text-sm text-slate-700">{t('queueToken')} #{record.today.queue_entry.token_number}</p><StatusChip code={record.today.queue_entry.status} /></div> : <p className="mt-2 text-sm text-slate-600">{t('noVisitToday')}</p>}</section><section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold text-slate-950">{t('upcomingAppointments')}</h2>{record.appointments.slice(0,4).map((appointment)=><div key={appointment.id} className="flex justify-between gap-3 border-b py-3 text-sm"><span>{appointment.doctor ?? t('doctorNotAssigned')} · {formatHospitalDate(appointment.scheduled_at,org?.timezone ?? 'Asia/Kolkata')}</span><StatusChip code={appointment.status} /></div>)}</section></div>}
    {tab==='timeline' && <Timeline events={record.timeline} timezone={org?.timezone ?? 'Asia/Kolkata'} />}
    {tab==='appointments' && <List>{record.appointments.map((item)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm"><div><p className="font-medium text-slate-900">{item.doctor ?? t('doctorNotAssigned')}</p><p className="text-slate-600">{formatHospitalDate(item.scheduled_at,org?.timezone ?? 'Asia/Kolkata')} · {item.kind}</p></div><StatusChip code={item.status} /></div>)}</List>}
    {tab==='investigations' && <List>{record.orders.map((item)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm"><div><p className="font-medium text-slate-900">{item.type}</p><p className="text-slate-600">{item.expected_report_from && item.expected_report_to ? `${item.expected_report_from} – ${item.expected_report_to}` : t('reportWindowPending')}</p></div><StatusChip code={item.status} /></div>)}</List>}
    {tab==='consultations' && <List>{record.clinical_restricted ? <p className="py-5 text-sm text-slate-600">{t('clinicalRestricted')}</p> : <>{record.consultations.map((item)=><article key={item.id} className="border-b py-3"><div className="flex justify-between gap-2"><p className="font-medium text-slate-900">{t('consultationVersion', { version: item.version })}</p><StatusChip code={item.status} /></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.assessment ?? item.complaint ?? '—'}</p></article>)}{record.prescriptions.map((prescription)=><article key={prescription.id} className="border-b py-3"><h3 className="font-semibold text-slate-900">{t('prescription')}</h3>{prescription.items.map((item,index)=><p key={`${prescription.id}-${index}`} className="mt-1 text-sm text-slate-700">{item.medicine_name} · {item.dose} · {item.frequency} · {item.duration}</p>)}{prescription.notes&&<p className="mt-2 text-sm text-slate-600">{prescription.notes}</p>}</article>)}</>}</List>}
    {tab==='admissions' && <List>{record.admissions.map((item)=><div key={item.id} className="flex justify-between gap-3 border-b py-3 text-sm"><span>{item.ward} · {item.bed} · {formatHospitalDate(item.admitted_at,org?.timezone ?? 'Asia/Kolkata')}</span><StatusChip code={item.status} /></div>)}</List>}
    {checkInOpen && <Modal title={t('checkIn')} close={()=>setCheckInOpen(false)}><form onSubmit={(event)=>void checkIn(event)} className="space-y-3"><p className="text-sm text-slate-600">{t('selectOpenSession')}</p>{sessions.length ? <label className="block text-sm font-medium">{t('opdSession')}<select required value={selectedSession} onChange={(event)=>setSelectedSession(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3"><option value="">{t('selectOpenSession')}</option>{sessions.map((session)=><option key={session.session_id} value={session.session_id}>{session.doctor} · {session.department ?? t('opdTitle')} · {t(`status.${session.status}` as 'status.open')}</option>)}</select></label> : <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('noOpenSessions')} <Link href="/dashboard/hospital/opd" className="font-semibold underline">{t('opdTitle')}</Link></div>}<div className="flex justify-end gap-2"><button type="button" onClick={()=>setCheckInOpen(false)} className="min-h-10 rounded-md border px-3 text-sm">{t('cancel')}</button><button type="submit" disabled={busy || sessions.length===0 || !selectedSession} className="min-h-10 rounded-md bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50">{t('checkInAndQueue')}</button></div></form></Modal>}
    {appointmentOpen && <Modal title={t('bookAppointment')} close={()=>setAppointmentOpen(false)}><form onSubmit={(event)=>void bookAppointment(event)} className="space-y-3"><label className="block text-sm font-medium">{t('doctor')}<select required value={selectedDoctor} onChange={(event)=>setSelectedDoctor(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3"><option value="">{t('selectDoctor')}</option>{doctors.map((doctor)=><option key={doctor.id} value={doctor.id}>{doctor.doctor_name}{doctor.specialty ? ` · ${doctor.specialty}` : ''}</option>)}</select></label><label className="block text-sm font-medium">{t('appointmentDate')}<input required type="datetime-local" min={defaultHospitalAppointmentTime(org?.timezone ?? 'Asia/Kolkata')} value={scheduledAt} onChange={(event)=>setScheduledAt(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3"/></label><label className="block text-sm font-medium">{t('appointmentType')}<select value={appointmentKind} onChange={(event)=>setAppointmentKind(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3"><option value="opd">{t('kind.opd')}</option><option value="follow_up">{t('kind.follow_up')}</option><option value="referral">{t('kind.referral')}</option></select></label><label className="block text-sm font-medium">{t('reason')}<textarea value={appointmentReason} onChange={(event)=>setAppointmentReason(event.target.value)} rows={2} className="mt-1 w-full rounded-md border border-slate-300 p-3"/></label><div className="flex justify-end gap-2"><button type="button" onClick={()=>setAppointmentOpen(false)} className="min-h-10 rounded-md border px-3 text-sm">{t('cancel')}</button><button type="submit" disabled={busy || !selectedDoctor || !scheduledAt} className="min-h-10 rounded-md bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50">{t('bookAppointment')}</button></div></form></Modal>}
    {investigationOpen && <Modal title={t('orderInvestigation')} close={()=>setInvestigationOpen(false)}>{can('orders.create') ? <form onSubmit={(event)=>void orderInvestigation(event)} className="space-y-3"><p className="text-sm text-slate-600">{t('investigationOrderClinicianNotice')}</p><label className="block text-sm font-medium">{t('investigationType')}<select required value={selectedInvestigation} onChange={(event)=>setSelectedInvestigation(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3"><option value="">{t('selectInvestigation')}</option>{investigationTypes.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="block text-sm font-medium">{t('priority')}<select value={investigationPriority} onChange={(event)=>setInvestigationPriority(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3"><option value="routine">{t('status.routine')}</option><option value="urgent">{t('status.urgent')}</option><option value="emergency">{t('status.emergency')}</option></select></label>{investigationTypes.length===0 && <p role="status" className="text-sm text-amber-800">{t('noInvestigationTypes')}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={()=>setInvestigationOpen(false)} className="min-h-10 rounded-md border px-3 text-sm">{t('cancel')}</button><button type="submit" disabled={busy || !selectedInvestigation} className="min-h-10 rounded-md bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50">{t('orderInvestigation')}</button></div></form> : <div className="space-y-3"><p className="text-sm text-slate-700">{t('investigationOrderRequiresDoctor')}</p><div className="flex justify-end"><button type="button" onClick={()=>setInvestigationOpen(false)} className="min-h-10 rounded-md bg-teal-800 px-4 text-sm font-semibold text-white">{t('close')}</button></div></div>}</Modal>}
  </div>;
}

function Timeline({ events, timezone }: { events: RecordData['timeline']; timezone: string }) {
  return <ol className="space-y-3">{events.map((event,index)=><li key={`${event.created_at}-${index}`} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-teal-700" /><div><p className="text-sm font-semibold text-slate-900">{event.event_type}</p><time className="mt-1 block text-xs text-slate-500">{formatHospitalDate(event.created_at,timezone,{dateStyle:'medium',timeStyle:'short'})}</time></div></li>)}</ol>;
}
function List({ children }: { children: React.ReactNode }) { return <section className="rounded-xl border border-slate-200 bg-white px-4 shadow-sm">{children}</section>; }

function Modal({ title, children, close }: { title: string; children: React.ReactNode; close: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-3"><section role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-slate-950">{title}</h2><button type="button" onClick={close} aria-label={title} className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100">×</button></div>{children}</section></div>;
}

function hospitalLocalDateTimeToIso(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Select a valid appointment date and time.');
  const [, year, month, day, hour, minute] = match;
  const target = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  let timestamp = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
    const displayed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    timestamp += target - displayed;
  }
  return new Date(timestamp).toISOString();
}

function defaultHospitalAppointmentTime(timeZone: string) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const minutes = Number(parts.minute);
  const roundedMinutes = Math.ceil((minutes + 1) / 15) * 15;
  if (roundedMinutes < 60) return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${String(roundedMinutes).padStart(2, '0')}`;
  const target = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) + 1));
  const nextParts = Object.fromEntries(formatter.formatToParts(target).map((part) => [part.type, part.value]));
  return `${nextParts.year}-${nextParts.month}-${nextParts.day}T${nextParts.hour}:00`;
}
