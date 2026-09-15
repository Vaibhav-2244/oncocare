'use client';

import { useState } from 'react';
import { CheckCircle, ChevronRight, FileText, ShieldCheck, Upload, X } from 'lucide-react';
import { DashboardLayout } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { supabase } from '@/lib/supabase-client';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

function formatSize(bytes: number) { return `${(bytes / 1024 / 1024).toFixed(2)} MB`; }

function AnalysisText({ analysis }: { analysis: string }) {
  return <div className="space-y-3 text-sm leading-7 text-slate-700">{analysis.split(/\r?\n/).map((line, index) => { const trimmed = line.trim(); if (!trimmed) return <div key={index} className="h-1" />; if (/^#{1,3} /.test(trimmed)) return <h3 key={index} className="pt-2 text-base font-bold text-slate-900">{trimmed.replace(/^#{1,3} /, '')}</h3>; if (/^\d+\. /.test(trimmed)) return <h3 key={index} className="pt-2 font-bold text-slate-900">{trimmed}</h3>; return <p key={index}>{trimmed.replace(/^[-*] /, '• ')}</p>; })}</div>;
}

function SecondOpinionContent() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState('Waiting for upload');
  const [message, setMessage] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [error, setError] = useState(false);

  const handleFile = (selected: File | undefined) => {
    if (!selected) return;
    setAnalysis(''); setError(false);
    if (!ALLOWED_TYPES.has(selected.type)) { setFile(null); setStatus('Invalid file'); setError(true); setMessage('Please upload a medical report in PDF, JPG, JPEG, or PNG format.'); return; }
    if (selected.size === 0) { setFile(null); setStatus('Invalid file'); setError(true); setMessage('The selected file is empty.'); return; }
    if (selected.size > MAX_FILE_SIZE) { setFile(null); setStatus('File too large'); setError(true); setMessage('The file is too large. Maximum allowed size is 10 MB.'); return; }
    setFile(selected); setStatus('Ready to upload'); setMessage('');
  };

  const removeFile = () => { setFile(null); setAnalysis(''); setMessage(''); setError(false); setStatus('Waiting for upload'); };

  const uploadReport = async () => {
    if (!file) return;
    setStatus('Uploading and analyzing...'); setMessage(''); setAnalysis(''); setError(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
      const formData = new FormData(); formData.append('report', file);
      const response = await fetch('/api/second-opinion', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: formData });
      const raw = await response.text(); let data: { message?: string; analysis?: string } = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error('The server returned an invalid response.'); }
      if (!response.ok) throw new Error(data.message || `Upload failed (${response.status}).`);
      setStatus('Analysis complete'); setMessage(data.message || 'Medical report analyzed successfully.'); setAnalysis(data.analysis || '');
    } catch (uploadError) { setStatus('Upload failed'); setError(true); setMessage(uploadError instanceof Error ? uploadError.message : 'Something went wrong while uploading.'); }
  };

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold text-teal-600">OncoCare+ / Second Opinion</p><h1 className="mt-1 text-2xl font-bold text-slate-900">AI Second Opinion Reports</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Upload a pathology or scan report for a structured, safety-focused AI explanation to discuss with your oncologist.</p></div><div className="inline-flex items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700"><ShieldCheck className="h-4 w-4" /> Secure and confidential</div></div>
    <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-7"><div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-bold text-slate-900">Upload your medical report</h2><p className="mt-1 text-sm text-slate-500">PDF, JPG, JPEG, or PNG. Maximum file size: 10 MB.</p></div><FileText className="h-7 w-7 text-teal-600" /></div><div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); handleFile(event.dataTransfer.files[0]); }} className={`mt-6 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-slate-50/70'}`}><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-700"><Upload className="h-6 w-6" /></div><h3 className="mt-4 text-sm font-bold text-slate-800">Drag and drop your report here</h3><p className="mt-1 text-xs text-slate-500">or choose a file from your computer</p><label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:shadow-md"><Upload className="h-4 w-4" /> Choose file<input hidden type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => { handleFile(event.target.files?.[0]); event.target.value = ''; }} /></label></div>{message && <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{!error && <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />}<span>{message}</span></div>}{file && <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex min-w-0 items-center gap-3"><FileText className="h-5 w-5 shrink-0 text-teal-600" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{file.name}</p><p className="text-xs text-slate-500">{formatSize(file.size)}</p></div></div><button type="button" onClick={removeFile} aria-label="Remove selected file" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button></div>}<button type="button" onClick={uploadReport} disabled={!file || status === 'Uploading and analyzing...'} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{status === 'Uploading and analyzing...' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Upload className="h-4 w-4" />}{status === 'Uploading and analyzing...' ? 'Analyzing...' : 'Submit for second opinion'}<ChevronRight className="h-4 w-4" /></button></section>
    {analysis && <section className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-slate-900">AI Second Opinion Analysis</h2><p className="mt-1 text-sm text-slate-500">AI-assisted interpretation of the uploaded medical report.</p></div><span className="w-fit rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700">AI analysis</span></div><div className="pt-5"><AnalysisText analysis={analysis} /></div><div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><strong>Medical disclaimer:</strong> This AI-generated information is for education and discussion only. It is not a diagnosis, treatment recommendation, or substitute for advice from a qualified healthcare professional. Please review this report with your oncologist.</div></section>}
  </div>;
}

export default function SecondOpinionPage() { return <ProtectedRoute allowedRoles={['patient', 'family_caregiver', 'medical_advisor']}><DashboardLayout dashboardTitle="Patient Dashboard"><SecondOpinionContent /></DashboardLayout></ProtectedRoute>; }