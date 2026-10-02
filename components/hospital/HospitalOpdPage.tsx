'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Activity, CalendarPlus, ChevronRight, Play, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useHospital } from '@/lib/hospital/HospitalProvider';
import { callRpc } from '@/lib/hospital/api';
import { useLiveData } from '@/lib/hospital/useLive';
import { EmptyState, ErrorPanel, PageHeader, StatusChip } from '@/components/hospital/ui-kit';

type SessionCard = { session_id: string; doctor: string; department: string | null; room: string | null; status: string; serving_token: number | null; next_token: number | null; waiting: number; completed: number; delay_flag: boolean };
const TABLES = ['opd_sessions','queue_entries'];

export function HospitalOpdPage() {
  const t = useTranslations('hospitalOps');
  const { org, can } = useHospital();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const loadSessions = useCallback(() => org ? callRpc<SessionCard[]>('get_today_sessions',{p_hospital_id:org.id}) : Promise.resolve([]),[org]);
  const { data, loading, error, technicalDetails, refresh } = useLiveData(loadSessions,{hospitalId:org?.id ?? '',tables:TABLES});

  const mutate = async (name:string,args:Record<string,unknown>) => {
    setBusy(true); setActionError(null);
    try { await callRpc(name,args); await refresh(); }
    catch (caught) { setActionError(caught instanceof Error ? caught.message : t('operationFailed')); }
    finally { setBusy(false); }
  };
  const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:org?.timezone ?? 'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

  return <div className="space-y-5"><PageHeader title={t('opdTitle')} subtitle={today()} actions={<><button type="button" disabled={busy||!can('queue.manage')} onClick={()=>void mutate('generate_default_sessions',{p_hospital_id:org?.id,p_date:today()})} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 disabled:opacity-50"><CalendarPlus className="h-4 w-4"/>{t('generateSessions')}</button><button type="button" onClick={()=>void refresh()} className="grid h-11 w-11 place-items-center rounded-lg border border-slate-300 bg-white" aria-label={t('refresh')}><RefreshCw className="h-4 w-4"/></button></>} />
    {actionError&&<p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{actionError}</p>}
    {error&&!data&&<ErrorPanel message={t('loadQueueFailed')} technicalDetails={technicalDetails} onRetry={()=>void refresh()} retryLabel={t('retry')} detailsLabel={t('showTechnicalDetails')}/>}
    {loading&&!data?<div className="grid gap-3 md:grid-cols-2">{[0,1,2,3].map((n)=><div key={n} className="h-40 animate-pulse rounded-xl bg-slate-100"/>)}</div>:data?.length?<div className="grid gap-4 lg:grid-cols-2">{data.map((session)=><article key={session.session_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-lg font-semibold text-slate-950">{session.doctor}</h2><p className="mt-1 text-sm text-slate-600">{session.department} · {t('room')} {session.room ?? '—'}</p></div><StatusChip code={session.status}/></div><div className="mt-4 grid grid-cols-3 gap-2 border-y border-slate-100 py-3 text-center"><Metric label={t('currentlyServing')} value={session.serving_token?`#${session.serving_token}`:'—'}/><Metric label={t('nextToken')} value={session.next_token?`#${session.next_token}`:'—'}/><Metric label={t('waiting')} value={session.waiting}/></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">{t('completedCount',{count:session.completed})}</span><div className="flex flex-wrap gap-2">{can('queue.manage')&&<><button disabled={busy||session.status==='open'} onClick={()=>void mutate('set_session_status',{p_session_id:session.session_id,p_status:'open',p_note:null})} className="min-h-10 rounded-md border border-slate-300 px-3 text-xs font-semibold disabled:opacity-40">{t('startSession')}</button><button disabled={busy||session.status==='paused'} onClick={()=>void mutate('set_session_status',{p_session_id:session.session_id,p_status:'paused',p_note:session.delay_flag?t('sessionDelay'):null})} className="min-h-10 rounded-md border border-slate-300 px-3 text-xs font-semibold disabled:opacity-40">{t('pauseSession')}</button><button disabled={busy||session.status==='closed'} onClick={()=>void mutate('set_session_status',{p_session_id:session.session_id,p_status:'closed',p_note:null})} className="min-h-10 rounded-md border border-slate-300 px-3 text-xs font-semibold disabled:opacity-40">{t('closeSession')}</button><button disabled={busy||session.status!=='open'} onClick={()=>void mutate('call_next',{p_session_id:session.session_id})} className="inline-flex min-h-10 items-center gap-1 rounded-md bg-teal-800 px-3 text-xs font-semibold text-white disabled:opacity-40"><Play className="h-3.5 w-3.5"/>{t('callNext')}</button></>}</div></div><Link href={`/dashboard/hospital/opd/${session.session_id}`} className="mt-3 inline-flex min-h-10 w-full items-center justify-between rounded-lg bg-slate-50 px-3 text-sm font-semibold text-teal-900 hover:bg-teal-50">{t('openBoard')}<ChevronRight className="h-4 w-4"/></Link></article>)}</div>:<EmptyState icon={Activity} title={t('noSessions')} body={t('noSessionsBody')} action={can('queue.manage')?<button type="button" onClick={()=>void mutate('generate_default_sessions',{p_hospital_id:org?.id,p_date:today()})} className="min-h-11 rounded-lg bg-teal-800 px-4 text-sm font-semibold text-white">{t('generateSessions')}</button>:undefined}/>}</div>;
}

function Metric({label,value}:{label:string;value:string|number}) { return <div><p className="text-[11px] text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{value}</p></div>; }
