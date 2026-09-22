'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowLeft, BookOpen, Check, ExternalLink, Heart, Loader2, Search, ShieldCheck } from 'lucide-react';
import { DashboardLayout, PATIENT_CAREGIVER_ROLES, caregiverNavItems, patientNavItems } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { supabase } from '@/lib/supabase-client';
import { useAuth } from '@/lib/auth-context';

type Source = { id: string; title: string; publisher: string; publication_year: number | null; url: string };
type Protocol = { id: string; side_effect: string; title: string; practice: string; evidence_level: string; summary: string; evidence_summary: string; use_notes: string; safety_notes: string; clinical_review_status: string; references: Source[] };
type SafetyItem = { item: string; severity: string; message: string };
type CheckIn = { id: string; symptom: string; severity: number; note: string | null; created_at: string };

const sideEffects = ['All', 'Nausea / vomiting', 'Fatigue', 'Sleep / stress', 'Mouth discomfort', 'Neuropathy', 'General safety'];
const evidenceLevels = ['All', 'higher', 'limited', 'insufficient'];

function AyurvedaContent() {
  const { user } = useAuth();
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [safety, setSafety] = useState<SafetyItem[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [sideEffect, setSideEffect] = useState('All');
  const [evidence, setEvidence] = useState('All');
  const [selected, setSelected] = useState<Protocol | null>(null);
  const [safetyQuery, setSafetyQuery] = useState('');
  const [symptom, setSymptom] = useState('');
  const [severity, setSeverity] = useState(0);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const [protocolResult, sourceResult, linkResult, savedResult, checkInResult, safetyResult] = await Promise.all([
        supabase.from('ayurveda_protocols').select('*').order('created_at', { ascending: true }),
        supabase.from('ayurveda_sources').select('*').order('publisher', { ascending: true }),
        supabase.from('ayurveda_protocol_sources').select('protocol_id, source_id'),
        supabase.from('ayurveda_saved_protocols').select('protocol_id'),
        supabase.from('ayurveda_symptom_check_ins').select('id, symptom, severity, note, created_at').order('created_at', { ascending: false }).limit(30),
        supabase.from('ayurveda_safety_items').select('item, severity, message'),
      ]);
      if (protocolResult.error) throw protocolResult.error;
      if (sourceResult.error) throw sourceResult.error;
      if (linkResult.error) throw linkResult.error;
      if (savedResult.error) throw savedResult.error;
      if (checkInResult.error) throw checkInResult.error;
      if (safetyResult.error) throw safetyResult.error;
      const sourceRows = (sourceResult.data || []) as Source[];
      const sourceMap = new Map(sourceRows.map((source) => [source.id, source]));
      const links = (linkResult.data || []) as Array<{ protocol_id: string; source_id: string }>;
      setSources(sourceRows);
      setProtocols(((protocolResult.data || []) as Omit<Protocol, 'references'>[]).map((protocol) => ({ ...protocol, references: links.filter((link) => link.protocol_id === protocol.id).map((link) => sourceMap.get(link.source_id)).filter((source): source is Source => Boolean(source)) })));
      setSavedIds(new Set((savedResult.data || []).map((row) => row.protocol_id)));
      setCheckIns((checkInResult.data || []) as CheckIn[]);
      setSafety((safetyResult.data || []) as SafetyItem[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Ayurveda support.');
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const filteredProtocols = useMemo(() => protocols.filter((protocol) => {
    const text = [protocol.title, protocol.side_effect, protocol.practice, protocol.summary, protocol.safety_notes].join(' ').toLowerCase();
    return (!query.trim() || text.includes(query.trim().toLowerCase())) && (sideEffect === 'All' || protocol.side_effect === sideEffect) && (evidence === 'All' || protocol.evidence_level === evidence);
  }), [protocols, query, sideEffect, evidence]);

  const safetyMatches = useMemo(() => safety.filter((item) => safetyQuery.trim() && (item.item.includes(safetyQuery.trim().toLowerCase()) || safetyQuery.trim().toLowerCase().includes(item.item))), [safety, safetyQuery]);

  const toggleSave = async (protocol: Protocol) => {
    setActionId(protocol.id); setError(null);
    try {
      if (savedIds.has(protocol.id)) {
        const { error: deleteError } = await supabase.from('ayurveda_saved_protocols').delete().eq('protocol_id', protocol.id);
        if (deleteError) throw deleteError;
        setSavedIds((current) => { const next = new Set(current); next.delete(protocol.id); return next; });
      } else {
        const { error: insertError } = await supabase.from('ayurveda_saved_protocols').insert({ protocol_id: protocol.id });
        if (insertError) throw insertError;
        setSavedIds((current) => new Set(current).add(protocol.id));
      }
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : 'Unable to update saved protocols.'); }
    finally { setActionId(null); }
  };

  const submitCheckIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!symptom.trim()) { setError('Enter a symptom before saving the check-in.'); return; }
    setSaving(true); setError(null);
    try {
      const { data, error: insertError } = await supabase.from('ayurveda_symptom_check_ins').insert({ symptom: symptom.trim(), severity, note: note.trim() || null }).select('id, symptom, severity, note, created_at').single();
      if (insertError) throw insertError;
      setCheckIns((current) => [data as CheckIn, ...current]); setSymptom(''); setSeverity(0); setNote('');
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Unable to save symptom check-in.'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-teal-600" /></div>;

  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex items-start gap-3"><a href="/dashboard/caregiver-support" aria-label="Back to caregiver support" className="mt-1 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-teal-700"><ArrowLeft className="h-5 w-5" /></a><div><p className="text-sm font-semibold text-teal-700">Supportive care and discussion aid</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Ayurveda Support</h1><p className="mt-1 max-w-3xl text-sm text-slate-500">Evidence-informed protocols, safety checks and symptom tracking to help you prepare questions for your oncology team.</p></div></div>
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><strong>Important safety note.</strong> Ayurveda, herbs and supplements in this library do not cure or treat cancer, replace chemotherapy, radiation, surgery or prescribed medicines, or guarantee outcomes. Concentrated products may interact with treatment or vary in quality. Discuss the exact product with your oncology team or pharmacist before use.</div></div></div>
    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-4"><div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search protocols" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-400" /></div><select value={sideEffect} onChange={(event) => setSideEffect(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{sideEffects.map((item) => <option key={item}>{item}</option>)}</select><select value={evidence} onChange={(event) => setEvidence(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{evidenceLevels.map((item) => <option key={item}>{item}</option>)}</select></div><div className="grid gap-4 lg:grid-cols-2">{filteredProtocols.map((protocol) => <article key={protocol.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700">{protocol.side_effect}</span><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">Evidence: {protocol.evidence_level}</span></div><button onClick={() => void toggleSave(protocol)} disabled={actionId === protocol.id} aria-label={savedIds.has(protocol.id) ? 'Unsave protocol' : 'Save protocol'} className="text-teal-700">{actionId === protocol.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className={`h-4 w-4 ${savedIds.has(protocol.id) ? 'fill-current' : ''}`} />}</button></div><h2 className="mt-4 font-bold text-slate-900">{protocol.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{protocol.summary}</p><div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500"><span>{protocol.references.length} sources · Review: {protocol.clinical_review_status}</span><button onClick={() => setSelected(protocol)} className="font-semibold text-teal-700">View details</button></div></article>)}{filteredProtocols.length === 0 && <div className="lg:col-span-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">No protocols match these filters.</div>}</div></section>
      <aside className="space-y-4"><form onSubmit={submitCheckIn} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-teal-600" /><h2 className="font-bold text-slate-900">Symptom check-in</h2></div><p className="mt-1 text-xs text-slate-500">Track symptoms for discussion with your care team.</p><input value={symptom} onChange={(event) => setSymptom(event.target.value)} placeholder="Symptom" className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" /><label className="mt-4 block text-sm text-slate-700">Severity: {severity}/10<input type="range" min="0" max="10" value={severity} onChange={(event) => setSeverity(Number(event.target.value))} className="mt-2 w-full accent-teal-600" /></label><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1000} placeholder="Notes" className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" /><button disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save check-in</button></form><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Supplement safety checker</h2><p className="mt-1 text-xs leading-5 text-slate-500">Enter a herb or supplement name. This is a prompt for clinician review, not a clearance.</p><input value={safetyQuery} onChange={(event) => setSafetyQuery(event.target.value)} placeholder="e.g. ginger" className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400" />{safetyQuery && <div className="mt-3 space-y-2">{safetyMatches.length ? safetyMatches.map((item) => <div key={item.item} className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800"><div className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" />{item.item}</div><p className="mt-1">{item.message}</p></div>) : <p className="text-xs text-slate-500">No matching safety record. Lack of a match does not mean a product is safe.</p>}</div>}</section></aside>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Symptom history</h2><p className="text-xs text-slate-500">{checkIns.length} private check-in{checkIns.length === 1 ? '' : 's'}</p></div><BookOpen className="h-5 w-5 text-teal-600" /></div><div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{checkIns.slice(0, 6).map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3"><div className="flex justify-between gap-2 text-sm font-semibold text-slate-800"><span>{item.symptom}</span><span>{item.severity}/10</span></div><p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleDateString('en-IN')}</p>{item.note && <p className="mt-2 text-sm text-slate-600">{item.note}</p>}</div>)}{checkIns.length === 0 && <p className="text-sm text-slate-500">No Ayurveda symptom check-ins yet.</p>}</div></section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-teal-600" /><h2 className="font-bold text-slate-900">Evidence and review notes</h2></div><p className="mt-2 text-sm leading-6 text-slate-600">The evidence library is descriptive and source-linked. Every protocol currently shows pending clinical review because no verified reviewer record exists in this application.</p><div className="mt-4 flex flex-wrap gap-2">{sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50">{source.publisher} <ExternalLink className="h-3 w-3" /></a>)}</div></section>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{selected.side_effect} · {selected.practice}</p><h2 className="mt-1 text-xl font-bold text-slate-900">{selected.title}</h2></div><button onClick={() => setSelected(null)} aria-label="Close protocol details" className="text-2xl text-slate-400">×</button></div><div className="mt-5 grid gap-5 md:grid-cols-2"><Detail title="What the evidence says" text={selected.evidence_summary} /><Detail title="How to use this page" text={selected.use_notes} /><Detail title="Safety notes" text={selected.safety_notes} /><Detail title="Clinical review" text={`Status: ${selected.clinical_review_status}. This protocol has not been clinically approved in OncoCare+.`} /></div><div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-bold text-slate-900">References</h3><div className="mt-2 space-y-2">{selected.references.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-teal-700 hover:underline"><ExternalLink className="h-3.5 w-3.5" />{source.title} ({source.publisher})</a>)}</div></div></div></div>}
  </div>;
}

function Detail({ title, text }: { title: string; text: string }) { return <div><h3 className="text-sm font-bold text-slate-900">{title}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{text}</p></div>; }

function AyurvedaSupportShell() {
  const { user } = useAuth();
  const isCaregiver = user?.primaryRole === 'family_caregiver';
  return <DashboardLayout navItems={isCaregiver ? caregiverNavItems : patientNavItems} dashboardTitle={isCaregiver ? 'Caregiver Dashboard' : 'Patient Dashboard'}><AyurvedaContent /></DashboardLayout>;
}

export default function AyurvedaSupportPage() { return <ProtectedRoute allowedRoles={PATIENT_CAREGIVER_ROLES}><AyurvedaSupportShell /></ProtectedRoute>; }