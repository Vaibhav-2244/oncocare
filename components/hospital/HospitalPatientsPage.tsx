'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, FilePlus2, Search, Upload, UserPlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useHospital } from '@/lib/hospital/HospitalProvider';
import { supabase } from '@/lib/supabase-client';
import { callRpc } from '@/lib/hospital/api';
import { calculateAge, maskMobile } from '@/lib/hospital/format';
import { DataTable, ErrorPanel, StatusChip } from '@/components/hospital/ui-kit';
import { registerHospitalPatientSchema } from '@/lib/validation/hospital';

type PatientRow = { id: string; patient_identifier: string; name: string; mobile: string | null; age: number | null; gender: string | null; patient_user_id: string | null; is_demo: boolean; created_at: string; today_status: string | null };
type ImportRow = { identifier: string; name: string; mobile?: string; dob?: string; age?: string; gender?: string };
const PAGE_SIZE = 25;

export function HospitalPatientsPage() {
  const t = useTranslations('hospitalOps');
  const { org, can } = useHospital();
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [technical, setTechnical] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<'register' | 'import' | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ identifier: '', name: '', mobile: '', dob: '', age: '', gender: '' });
  const [nextIdentifier, setNextIdentifier] = useState('');
  const [duplicates, setDuplicates] = useState<Array<{ identifier: string; name: string }>>([]);
  const [csvText, setCsvText] = useState('');
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importPreview, setImportPreview] = useState<Array<{ row: ImportRow; status: string; message: string }>>([]);

  const load = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    setError(null);
    try {
      let patientRows: PatientRow[] = [];
      let resultCount = 0;
      if (query.trim()) {
        const matches = await callRpc<{ patients: Array<{ id: string }> }>('search_hospital_patients', { p_hospital_id: org.id, p_query: query.trim(), p_limit: 50 });
        const ids = (matches.patients ?? []).map((patient) => patient.id);
        if (ids.length) {
          const { data, error: queryError } = await supabase.from('hospital_patients').select('id,patient_identifier,name,mobile,age,gender,patient_user_id,is_demo,created_at').eq('hospital_id', org.id).in('id', ids);
          if (queryError) throw queryError;
          const byId = new Map(((data ?? []) as PatientRow[]).map((patient) => [patient.id, patient]));
          patientRows = ids.map((id) => byId.get(id)).filter((patient): patient is PatientRow => Boolean(patient));
        }
        resultCount = patientRows.length;
      } else {
        const { data, error: queryError, count } = await supabase.from('hospital_patients').select('id,patient_identifier,name,mobile,age,gender,patient_user_id,is_demo,created_at', { count: 'exact' }).eq('hospital_id', org.id).order('created_at', { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        if (queryError) throw queryError;
        patientRows = (data ?? []) as PatientRow[];
        resultCount = count ?? 0;
      }
      const patientIds = patientRows.map((patient) => patient.id);
      const queueResult = patientIds.length ? await supabase.from('queue_entries').select('patient_id,status,created_at').eq('hospital_id', org.id).in('patient_id', patientIds).in('status', ['waiting','called','in_consultation','completed']).order('created_at', { ascending: false }) : { data: [], error: null };
      if (queueResult.error) throw queueResult.error;
      const statusByPatient = new Map<string, string>();
      for (const entry of queueResult.data ?? []) if (!statusByPatient.has(entry.patient_id)) statusByPatient.set(entry.patient_id, entry.status);
      setRows(patientRows.map((patient) => ({ ...patient, today_status: statusByPatient.get(patient.id) ?? null })));
      setTotal(resultCount);
      setTechnical(null);
    } catch (caught) {
      setError(t('loadPatientsFailed'));
      setTechnical(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [org, page, query, t]);

  useEffect(() => { void load(); }, [load]);

  const checkDuplicates = async () => {
    if (!org || !form.name.trim()) return;
    const found = await callRpc<Array<{ identifier: string; name: string }>>('find_possible_duplicates', { p_hospital_id: org.id, p_name: form.name, p_mobile: form.mobile || null, p_dob: form.dob || null });
    setDuplicates(found ?? []);
  };

  const openRegisterModal = async () => {
    if (!org) return;
    setModal('register');
    try {
      const identifier = await callRpc<string>('next_hospital_patient_identifier', { p_hospital_id: org.id });
      setNextIdentifier(identifier);
      setForm((current) => ({ ...current, identifier }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('registerFailed'));
    }
  };

  const registerPatient = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!org) return;
    if (form.dob > todayValue) {
      setError(t('futureDob'));
      return;
    }
    const parsed = registerHospitalPatientSchema.safeParse({ ...form, age: form.age || undefined });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('registerFailed'));
      return;
    }
    setBusy(true);
    try {
      // The string "0" is truthy, so infants retain age 0 when submitted.
      await callRpc('register_hospital_patient', { p_hospital_id: org.id, p_identifier: '', p_name: form.name, p_mobile: form.mobile || null, p_dob: form.dob || null, p_age: form.age ? Number(form.age) : null, p_gender: form.gender || null });
      setModal(null);
      setForm({ identifier: '', name: '', mobile: '', dob: '', age: '', gender: '' });
      setNextIdentifier('');
      setDuplicates([]);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('registerFailed'));
    } finally { setBusy(false); }
  };

  const parseCsv = (source: string): ImportRow[] => {
    const lines = source.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const split = (line: string) => line.match(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)?.map((cell) => cell.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')) ?? [];
    const headers = split(lines[0]).map((value) => value.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const values = split(line);
      const row: Record<string, string> = {};
      headers.forEach((key, index) => { row[key] = (values[index] ?? '').trim(); });
      return { identifier: row.identifier ?? row.patient_id ?? '', name: row.name ?? '', mobile: row.mobile ?? '', dob: row.dob ?? '', age: row.age ?? '', gender: row.gender ?? '' };
    });
  };

  const previewImport = async () => {
    if (!org) return;
    const parsed = parseCsv(csvText);
    setImportRows(parsed);
    const result = await callRpc<{ rows: Array<{ row: ImportRow; status: string; message: string }> }>('import_hospital_patients', { p_hospital_id: org.id, p_rows: parsed, p_dry_run: true });
    setImportPreview(result.rows ?? []);
  };

  const confirmImport = async () => {
    if (!org) return;
    setBusy(true);
    try {
      await callRpc('import_hospital_patients', { p_hospital_id: org.id, p_rows: importRows, p_dry_run: false });
      setModal(null);
      setCsvText('');
      setImportPreview([]);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('importFailed')); }
    finally { setBusy(false); }
  };

  const exportCsv = async () => {
    if (!org) return;
    setBusy(true);
    try {
      const exported = await callRpc<Array<Record<string, unknown>>>('export_hospital_patients', { p_hospital_id: org.id });
      const columns = ['identifier', 'name', 'mobile', 'dob', 'age', 'gender', 'is_demo'];
      const csv = [columns.join(','), ...(exported ?? []).map((record) => columns.map((column) => JSON.stringify(record[column] ?? '')).join(','))].join('\r\n');
      const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = href; anchor.download = 'hospital-patients.csv'; anchor.click(); URL.revokeObjectURL(href);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('exportFailed')); }
    finally { setBusy(false); }
  };

  const canRegister = can('patients.register');
  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const visibleRows = rows;
  if (!org) return null;
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold text-slate-950">{t('patientDirectory')}</h1><p className="mt-1 text-sm text-slate-600">{total} {t('patients').toLowerCase()}</p></div><div className="flex flex-wrap gap-2">{canRegister && <button type="button" onClick={() => void openRegisterModal()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900"><UserPlus className="h-4 w-4" />{t('registerPatient')}</button>}<button type="button" onClick={() => setModal('import')} disabled={!canRegister} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 disabled:opacity-50"><Upload className="h-4 w-4" />{t('importCsv')}</button><button type="button" onClick={() => void exportCsv()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 disabled:opacity-50"><Download className="h-4 w-4" />{t('exportCsv')}</button></div></header>
    <label className="relative block max-w-lg"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => { setPage(0); setQuery(event.target.value); }} placeholder={t('searchPatients')} className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700" /></label>
    {error && <ErrorPanel message={error} technicalDetails={technical} onRetry={() => void load()} retryLabel={t('retry')} detailsLabel={t('showTechnicalDetails')} />}
    {loading ? <div className="grid gap-2" role="status">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}</div> : visibleRows.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">{t('noPatients')}</div> : <>
      <div className="hidden md:block"><DataTable><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-600"><tr>{[t('patientId'),t('name'),t('ageSex'),t('mobile'),t('linkStatus'),t('todayStatus')].map((label)=><th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{visibleRows.map((patient)=><tr key={patient.id} className="hover:bg-slate-50"><td className="px-4 py-3"><Link href={`/dashboard/hospital/patients/${encodeURIComponent(patient.patient_identifier)}`} className="font-semibold text-teal-800 underline-offset-4 hover:underline">{patient.patient_identifier}</Link>{patient.is_demo && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">{t('demo')}</span>}</td><td className="px-4 py-3 font-medium text-slate-900">{patient.name}</td><td className="px-4 py-3 text-slate-700">{patient.age ?? '—'} / {patient.gender ?? '—'}</td><td className="px-4 py-3 text-slate-700">{maskMobile(patient.mobile)}</td><td className="px-4 py-3"><StatusChip code={patient.patient_user_id ? 'accepted' : 'pending'} /></td><td className="px-4 py-3"><StatusChip code={patient.today_status ?? 'pending'} /></td></tr>)}</tbody></DataTable></div>
      <div className="grid gap-3 md:hidden">{visibleRows.map((patient)=><article key={patient.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><div><Link href={`/dashboard/hospital/patients/${encodeURIComponent(patient.patient_identifier)}`} className="font-semibold text-teal-800 underline-offset-4 hover:underline">{patient.patient_identifier}</Link><h2 className="mt-1 font-semibold text-slate-950">{patient.name}</h2></div>{patient.is_demo && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-900">{t('demo')}</span>}</div><p className="mt-3 text-sm text-slate-600">{patient.age ?? '—'} / {patient.gender ?? '—'} · {maskMobile(patient.mobile)}</p><div className="mt-3 flex flex-wrap gap-2"><StatusChip code={patient.patient_user_id ? 'accepted' : 'pending'} /><StatusChip code={patient.today_status ?? 'pending'} /></div></article>)}</div>
      <div className="flex items-center justify-between"><span className="text-sm text-slate-600">{page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE,total)} / {total}</span><div className="flex gap-2"><button type="button" disabled={page===0} onClick={()=>setPage((value)=>value-1)} className="min-h-10 rounded-md border border-slate-300 px-3 text-sm disabled:opacity-40">‹</button><button type="button" disabled={(page+1)*PAGE_SIZE>=total} onClick={()=>setPage((value)=>value+1)} className="min-h-10 rounded-md border border-slate-300 px-3 text-sm disabled:opacity-40">›</button></div></div>
    </>}
    {modal==='register' && <Modal title={t('registerPatient')} onClose={()=>setModal(null)}><form onSubmit={registerPatient} className="space-y-3"><Field label={t('identifier')} value={nextIdentifier} onChange={()=>undefined} readOnly hint={t('identifierAutoGenerated')} /><Field label={t('fullName')} value={form.name} onChange={(name)=>setForm({...form,name})} required /><Field label={t('mobile')} value={form.mobile} onChange={(mobile)=>setForm({...form,mobile})} /><div className="grid grid-cols-2 gap-3"><Field label={t('dateOfBirth')} type="date" value={form.dob} max={todayValue} hint={form.dob > todayValue ? t('futureDob') : undefined} onChange={(dob)=>{const calculated = calculateAge(dob); setForm((current)=>({...current,dob,age:calculated !== null ? String(calculated) : current.age}));}} /><Field label={t('age')} type="number" value={form.age} readOnly={Boolean(form.dob)} hint={form.dob ? t('ageAutoCalculated') : undefined} onChange={(age)=>setForm({...form,age})} /></div><label className="block text-sm font-medium text-slate-700">{t('gender')}<select value={form.gender} onChange={(event)=>setForm({...form,gender:event.target.value})} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"><option value="">—</option><option value="male">{t('male')}</option><option value="female">{t('female')}</option><option value="other">{t('other')}</option><option value="prefer_not_to_say">{t('preferNotToSay')}</option></select></label><button type="button" onClick={()=>void checkDuplicates()} className="min-h-10 text-sm font-medium text-teal-800 underline">{t('checkDuplicates')}</button>{duplicates.length>0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">{t('possibleDuplicates')}</p>{duplicates.map((item)=><p key={item.identifier}>{item.name} · {item.identifier}</p>)}</div>}<div className="flex justify-end gap-2"><button type="button" onClick={()=>setModal(null)} className="min-h-10 rounded-md border px-3 text-sm">{t('cancel')}</button><button disabled={busy||!canRegister} className="min-h-10 rounded-md bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50">{t('savePatient')}</button></div></form></Modal>}
    {modal==='import' && <Modal title={t('importCsv')} onClose={()=>setModal(null)}><div className="space-y-3"><textarea rows={7} value={csvText} onChange={(event)=>setCsvText(event.target.value)} placeholder="identifier,name,mobile,dob,age,gender" className="w-full rounded-lg border border-slate-300 p-3 text-sm" /><button type="button" onClick={()=>void previewImport()} className="min-h-10 rounded-md bg-teal-800 px-4 text-sm font-semibold text-white"><FilePlus2 className="mr-2 inline h-4 w-4" />{t('previewImport')}</button>{importPreview.length>0 && <div className="max-h-52 overflow-auto rounded-lg border border-slate-200">{importPreview.map((item,index)=><div key={index} className="flex justify-between gap-3 border-b px-3 py-2 text-sm"><span>{item.row.identifier} · {item.row.name}</span><span className={item.status==='new'?'text-emerald-800':'text-amber-900'}>{item.status}: {item.message}</span></div>)}</div>}<div className="flex justify-end gap-2"><button onClick={()=>setModal(null)} className="min-h-10 rounded-md border px-3 text-sm">{t('cancel')}</button><button disabled={busy||!importPreview.some((item)=>item.status==='new')} onClick={()=>void confirmImport()} className="min-h-10 rounded-md bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50">{t('confirmImport')}</button></div></div></Modal>}
  </div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-3" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full max-w-xl overflow-auto rounded-xl bg-white p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-950">{title}</h2><button onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-md hover:bg-slate-100"><X className="h-4 w-4" /></button></div>{children}</section></div>;
}
function Field({ label, value, onChange, type = 'text', required = false, readOnly = false, max, hint }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; readOnly?: boolean; max?: string; hint?: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input required={required} type={type} value={value} max={max} readOnly={readOnly} onChange={(event)=>onChange(event.target.value)} className={`mt-1 h-10 w-full rounded-md border border-slate-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 ${readOnly ? 'bg-slate-100 text-slate-600' : ''}`} />{hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}</label>;
}
