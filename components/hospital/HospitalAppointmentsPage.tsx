'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useHospital } from '@/lib/hospital/HospitalProvider';
import { callRpc } from '@/lib/hospital/api';
import { supabase } from '@/lib/supabase-client';
import { formatHospitalDate, formatHospitalTime } from '@/lib/hospital/format';
import { DataTable, ErrorPanel, PageHeader, StatusChip } from '@/components/hospital/ui-kit';
import { hospitalAppointmentSchema } from '@/lib/validation/hospital';

type Appointment = { id:string; hospital_id:string; patient_id:string; doctor_id:string; scheduled_at:string; kind:string; status:string; reason:string|null; };
type Patient = {id:string;patient_identifier:string;name:string};
type Doctor = {id:string;doctor_name:string;department_id:string|null};

export function HospitalAppointmentsPage(){
  const t=useTranslations('hospitalOps');
  const {org,can}=useHospital();
  const [rows,setRows]=useState<Appointment[]>([]);
  const [patients,setPatients]=useState<Patient[]>([]);
  const [doctors,setDoctors]=useState<Doctor[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [technical,setTechnical]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [view,setView]=useState<'list'|'week'>('list');
  const [filterStatus,setFilterStatus]=useState('all');
  const [dialog,setDialog]=useState(false);
  const [patientId,setPatientId]=useState('');
  const [doctorId,setDoctorId]=useState('');
  const [scheduledAt,setScheduledAt]=useState('');
  const [kind,setKind]=useState('opd');
  const [reason,setReason]=useState('');

  const load=useCallback(async()=>{
    if(!org)return;setLoading(true);setError(null);
    try{
      const now=new Date();const end=new Date(now);end.setDate(end.getDate()+7);
      let query=supabase.from('hospital_appointments').select('*').eq('hospital_id',org.id).gte('scheduled_at',now.toISOString()).lte('scheduled_at',end.toISOString()).order('scheduled_at');
      if(filterStatus!=='all')query=query.eq('status',filterStatus);
      const [appointments,patientResult,doctorResult]=await Promise.all([query,supabase.from('hospital_patients').select('id,patient_identifier,name').eq('hospital_id',org.id).order('name').limit(200),supabase.from('hospital_doctors').select('id,doctor_name,department_id').eq('hospital_id',org.id).eq('is_active',true).order('doctor_name')]);
      if(appointments.error)throw appointments.error;if(patientResult.error)throw patientResult.error;if(doctorResult.error)throw doctorResult.error;
      setRows((appointments.data??[]) as Appointment[]);setPatients((patientResult.data??[]) as Patient[]);setDoctors((doctorResult.data??[]) as Doctor[]);setTechnical(null);
    }catch(caught){setError(t('appointmentsLoadFailed'));setTechnical(caught instanceof Error?caught.message:String(caught));}finally{setLoading(false);}
  },[org,filterStatus,t]);
  useEffect(()=>{void load();},[load]);
  const mutate=async(name:string,args:Record<string,unknown>)=>{setBusy(true);try{await callRpc(name,args);await load();}catch(caught){setError(caught instanceof Error?caught.message:t('operationFailed'));}finally{setBusy(false);}};
  const create=async(event:React.FormEvent)=>{event.preventDefault();if(!org)return;const parsed=hospitalAppointmentSchema.safeParse({patientId,doctorId,scheduledAt:new Date(scheduledAt).toISOString(),kind,reason});if(!parsed.success){setError(parsed.error.issues[0]?.message??t('appointmentInvalid'));return;}await mutate('create_hospital_appointment',{p_hospital_id:org.id,p_patient_id:parsed.data.patientId,p_doctor_id:parsed.data.doctorId,p_scheduled_at:parsed.data.scheduledAt,p_kind:parsed.data.kind,p_reason:parsed.data.reason||null});setDialog(false);};
  const patientById=new Map(patients.map((patient)=>[patient.id,patient]));const doctorById=new Map(doctors.map((doctor)=>[doctor.id,doctor]));
  const checkin=(appointment:Appointment)=>void mutate('hospital_check_in',{p_hospital_id:appointment.hospital_id,p_patient_id:appointment.patient_id,p_appointment_id:appointment.id});
  const cancel=(appointment:Appointment)=>{if(window.confirm(t('confirmCancelAppointment')))void mutate('cancel_hospital_appointment',{p_id:appointment.id,p_reason:t('cancelledByStaff')});};
  if(!org)return null;
  return <div className="space-y-5"><PageHeader title={t('appointments')} subtitle={t('appointmentWindow')} actions={<><button onClick={()=>setView('list')} className={`min-h-10 rounded-md px-3 text-sm font-semibold ${view==='list'?'bg-teal-800 text-white':'border border-slate-300 bg-white'}`}>{t('listView')}</button><button onClick={()=>setView('week')} className={`min-h-10 rounded-md px-3 text-sm font-semibold ${view==='week'?'bg-teal-800 text-white':'border border-slate-300 bg-white'}`}>{t('weekView')}</button><button onClick={()=>setDialog(true)} disabled={!can('patients.register')&&!can('queue.manage')} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-800 px-3 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>{t('bookAppointment')}</button></>}/>
    <div className="flex flex-wrap items-center gap-3"><label className="text-sm text-slate-700">{t('filterStatus')}<select value={filterStatus} onChange={(event)=>setFilterStatus(event.target.value)} className="ml-2 h-10 rounded-md border border-slate-300 bg-white px-2"><option value="all">{t('allStatuses')}</option>{['scheduled','confirmed','checked_in','completed','cancelled','no_show'].map((status)=><option key={status} value={status}>{t(`status.${status}` as 'status.scheduled')}</option>)}</select></label><button onClick={()=>void load()} className="min-h-10 rounded-md border border-slate-300 px-3 text-sm">{t('refresh')}</button></div>
    {error&&<ErrorPanel message={error} technicalDetails={technical} onRetry={()=>void load()} retryLabel={t('retry')} detailsLabel={t('showTechnicalDetails')}/>}
    {loading?<div className="h-64 animate-pulse rounded-xl bg-slate-100"/>:view==='list'?<DataTable><thead className="sticky top-0 bg-slate-50 text-xs text-slate-600"><tr>{['scheduledAt','patient','doctor','kind','status','actions'].map((key)=><th key={key} className="px-3 py-3">{t(key as 'status')}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((appointment)=><tr key={appointment.id}><td className="px-3 py-3">{formatHospitalDate(appointment.scheduled_at,org.timezone)} · {formatHospitalTime(appointment.scheduled_at,org.timezone)}</td><td className="px-3 py-3">{patientById.get(appointment.patient_id)?.name??'—'}<span className="block text-xs text-slate-500">{patientById.get(appointment.patient_id)?.patient_identifier}</span></td><td className="px-3 py-3">{doctorById.get(appointment.doctor_id)?.doctor_name??'—'}</td><td className="px-3 py-3">{t(`kind.${appointment.kind}` as 'kind.opd')}</td><td className="px-3 py-3"><StatusChip code={appointment.status}/></td><td className="px-3 py-3"><div className="flex gap-1">{['scheduled','confirmed'].includes(appointment.status)&&<button disabled={busy} onClick={()=>checkin(appointment)} className="min-h-9 rounded-md border px-2 text-xs">{t('checkIn')}</button>}<button disabled={busy||['cancelled','completed'].includes(appointment.status)} onClick={()=>cancel(appointment)} className="min-h-9 rounded-md border px-2 text-xs">{t('cancel')}</button></div></td></tr>)}</tbody></DataTable>:<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">{Array.from({length:7},(_,index)=>{const date=new Date();date.setDate(date.getDate()+index);const sameDay=rows.filter((row)=>new Date(row.scheduled_at).toLocaleDateString('en-CA',{timeZone:org.timezone})===date.toLocaleDateString('en-CA',{timeZone:org.timezone}));return <section key={index} className="min-h-44 rounded-xl border border-slate-200 bg-white p-3"><h2 className="text-sm font-semibold text-slate-900">{formatHospitalDate(date.toISOString(),org.timezone,{weekday:'short',day:'numeric',month:'short'})}</h2><div className="mt-3 space-y-2">{sameDay.map((item)=><article key={item.id} className="rounded-md border border-slate-200 p-2 text-xs"><p className="font-semibold">{formatHospitalTime(item.scheduled_at,org.timezone)} · #{patientById.get(item.patient_id)?.patient_identifier}</p><p className="mt-1 text-slate-600">{doctorById.get(item.doctor_id)?.doctor_name}</p><StatusChip code={item.status}/></article>)}</div></section>;})}</div>}
    {!loading&&rows.length===0&&<div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center"><CalendarDays className="mx-auto h-8 w-8 text-teal-800"/><p className="mt-2 text-sm text-slate-600">{t('noAppointments')}</p></div>}
    {dialog&&<div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-3"><form onSubmit={create} className="w-full max-w-lg space-y-3 rounded-xl bg-white p-5 shadow-xl"><h2 className="text-lg font-semibold">{t('bookAppointment')}</h2><SelectField label={t('patient')} value={patientId} change={setPatientId} options={patients.map((item)=>({id:item.id,label:`${item.name} · ${item.patient_identifier}`}))}/><SelectField label={t('doctor')} value={doctorId} change={setDoctorId} options={doctors.map((item)=>({id:item.id,label:item.doctor_name}))}/><label className="block text-sm">{t('scheduledAt')}<input required type="datetime-local" value={scheduledAt} onChange={(event)=>setScheduledAt(event.target.value)} className="mt-1 h-11 w-full rounded-md border px-3"/></label><SelectField label={t('kindLabel')} value={kind} change={setKind} options={['opd','follow_up','referral'].map((value)=>({id:value,label:t(`kind.${value}` as 'kind.opd')}))}/><label className="block text-sm">{t('reason')}<textarea value={reason} onChange={(event)=>setReason(event.target.value)} className="mt-1 w-full rounded-md border p-3" rows={2}/></label><div className="flex justify-end gap-2"><button type="button" onClick={()=>setDialog(false)} className="min-h-10 rounded-md border px-3">{t('cancel')}</button><button disabled={busy} className="min-h-10 rounded-md bg-teal-800 px-4 text-sm font-semibold text-white">{t('saveAppointment')}</button></div></form></div>}
  </div>;
}
function SelectField({label,value,change,options}:{label:string;value:string;change:(value:string)=>void;options:Array<{id:string;label:string}>}){return <label className="block text-sm">{label}<select required value={value} onChange={(event)=>change(event.target.value)} className="mt-1 h-11 w-full rounded-md border px-3"><option value="">—</option>{options.map((option)=><option value={option.id} key={option.id}>{option.label}</option>)}</select></label>}
