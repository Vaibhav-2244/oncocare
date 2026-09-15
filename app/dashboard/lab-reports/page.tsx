'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertCircle, ArrowRight, CalendarDays, Download, FileText, FlaskConical, Search, ShieldCheck, Sparkles, Trash2, Upload } from 'lucide-react';
import { DashboardLayout, type NavItem, commonNavItems } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/lib/auth-context';
import {
  extractTextFromUploadedFile,
  parseLabValuesFromText,
  sanitizeFileName,
  sha256Hash,
  validateLabFile,
  validateFileContentSignature,
  type LabReportRow,
} from '@/lib/lab-reports';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';

const navItems: NavItem[] = [...commonNavItems.filter((item) => item.href !== '/dashboard/documents'), { label: 'Lab Reports', href: '/dashboard/lab-reports', icon: FlaskConical }];

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function LabReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<LabReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [labName, setLabName] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const loadReports = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('lab_reports')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (queryError) {
      setError(queryError.message || 'Failed to load lab reports');
      setReports([]);
      setLoading(false);
      return;
    }

    setReports((data || []) as LabReportRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      void loadReports();
    }
  }, [user]);

  const summary = useMemo(() => ({
    total: reports.length,
    complete: reports.filter((report) => report.extraction_status === 'completed').length,
    pending: reports.filter((report) => report.extraction_status === 'pending').length,
    failed: reports.filter((report) => report.extraction_status === 'failed').length,
  }), [reports]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected || !user) return;

    setError(null);
    const validation = validateLabFile(selected);
    if (!validation.ok) {
      setError(validation.error);
      event.target.value = '';
      return;
    }

    const signatureValid = await validateFileContentSignature(selected);
    if (!signatureValid.ok) {
      setError(signatureValid.error || 'The file signature is invalid for this file type.');
      event.target.value = '';
      return;
    }

    const hash = await sha256Hash(selected);
    const duplicateCheck = await supabase
      .from('lab_reports')
      .select('id')
      .eq('user_id', user.id)
      .eq('sha256', hash)
      .maybeSingle();

    if (duplicateCheck.data) {
      setError('This report was already uploaded for your account.');
      event.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const safeName = sanitizeFileName(selected.name);
      const storagePath = `${user.id}/${Date.now()}-${safeName}`;
      const uploadResult = await supabase.storage.from('lab-reports').upload(storagePath, selected, {
        cacheControl: '3600',
        upsert: false,
        contentType: selected.type || 'application/octet-stream',
      });

      if (uploadResult.error) throw uploadResult.error;

      const reportDate = new Date().toISOString();
      const reportPayload = {
        user_id: user.id,
        report_date: reportDate,
        laboratory_name: labName.trim() || 'Uploaded laboratory',
        report_title: title.trim() || `Lab Report ${new Date().toLocaleDateString('en-IN')}`,
        file_name: selected.name,
        file_type: validation.mimeType,
        file_size: selected.size,
        sha256: hash,
        storage_path: storagePath,
        extraction_status: 'pending',
        review_status: 'pending',
        notes: 'Uploaded through OncoCare patient portal.',
      };

      const insertResult = await supabase.from('lab_reports').insert(reportPayload).select().single();
      if (insertResult.error) throw insertResult.error;

      const createdReport = insertResult.data as LabReportRow;
      const extraction = await extractTextFromUploadedFile(selected);
      const parsedValues = parseLabValuesFromText(extraction.text, reportDate);
      const nextStatus = extraction.status === 'completed' && parsedValues.length > 0 ? 'completed' : 'failed';

      await supabase
        .from('lab_reports')
        .update({
          extraction_status: nextStatus,
          review_status: nextStatus === 'completed' ? 'pending' : 'rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', createdReport.id);

      if (parsedValues.length > 0) {
        const rows = parsedValues.map((value) => ({
          report_id: createdReport.id,
          test_date: value.test_date,
          test_name: value.test_name,
          canonical_name: value.canonical_name,
          original_value: value.original_value,
          numeric_value: value.numeric_value,
          normalized_value: value.numeric_value,
          unit: value.unit,
          original_unit: value.original_unit,
          normalized_unit: value.normalized_unit,
          reference_low: value.reference_low,
          reference_high: value.reference_high,
          reference_text: value.reference_text,
          source: value.source,
          extraction_confidence: value.extraction_confidence,
          notes: value.notes,
          reviewed_state: 'pending',
          corrected_state: false,
          rejected_state: false,
          reviewer: null,
          reviewed_at: null,
        }));

        const valuesResult = await supabase.from('lab_values').insert(rows);
        if (valuesResult.error) throw valuesResult.error;
      }

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        report_id: createdReport.id,
        event_type: 'upload',
        message: 'Lab report uploaded and processed.',
        metadata: { extractedCount: parsedValues.length, source: extraction.source },
        performed_by: user.id,
      });

      setTitle('');
      setLabName('');
      setFile(null);
      event.target.value = '';
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (reportId: string, storagePath: string) => {
    if (!user) return;
    try {
      const { error: storageError } = await supabase.storage.from('lab-reports').remove([storagePath]);
      if (storageError) throw storageError;
      const { error: deleteError } = await supabase.from('lab_reports').delete().eq('id', reportId).eq('user_id', user.id);
      if (deleteError) throw deleteError;
      await supabase.from('lab_values').delete().eq('report_id', reportId);
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete the report.');
    }
  };

  return (
    <ProtectedRoute allowedRoles={['patient', 'family_caregiver', 'medical_advisor']}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <div className="space-y-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-600">Care records</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">Lab Reports</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/dashboard/lab-reports/trends" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <Activity className="h-4 w-4" /> Trends
              </Link>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
          )}

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-slate-500">Reports</span>
                <FileText className="h-4 w-4 text-teal-600" />
              </div>
              <div className="mt-3 text-2xl font-bold text-slate-900">{summary.total}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-slate-500">Processed</span>
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-3 text-2xl font-bold text-slate-900">{summary.complete}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-slate-500">Pending</span>
                <CalendarDays className="h-4 w-4 text-amber-600" />
              </div>
              <div className="mt-3 text-2xl font-bold text-slate-900">{summary.pending}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-slate-500">Failed</span>
                <AlertCircle className="h-4 w-4 text-rose-600" />
              </div>
              <div className="mt-3 text-2xl font-bold text-slate-900">{summary.failed}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Upload className="h-4 w-4 text-teal-600" /> Upload report
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-600">
                Report title
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CBC — Jan 2026" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none ring-0 transition focus:border-teal-300 focus:bg-white" />
              </label>
              <label className="block text-sm text-slate-600">
                Laboratory name
                <input value={labName} onChange={(e) => setLabName(e.target.value)} placeholder="e.g. Max Super Speciality" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none ring-0 transition focus:border-teal-300 focus:bg-white" />
              </label>
            </div>
            <div className="mt-4 rounded-xl border-2 border-dashed border-slate-200 p-4">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-3 text-center text-sm text-slate-600">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-600"><Sparkles className="h-5 w-5" /></div>
                <span>{file ? file.name : 'Choose a PDF, JPG, JPEG, or PNG file'}</span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,image/png,image/jpeg,application/pdf" onChange={handleUpload} className="hidden" />
              </label>
            </div>
            {uploading && <div className="mt-3 text-sm text-slate-500">Processing and extracting values…</div>}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Search className="h-4 w-4 text-teal-600" /> Recent reports
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[0,1,2].map((row) => (
                  <div key={row} className="h-20 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : reports.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                No lab reports uploaded yet. Add a PDF or image report to begin tracking your biomarker trends.
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((report) => (
                  <div key={report.id} className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                        <FlaskConical className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{report.report_title}</div>
                        <div className="mt-1 text-sm text-slate-500">{report.laboratory_name || 'Uploaded laboratory'} · {report.file_type} · {formatBytes(report.file_size)}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="rounded-full bg-white px-2 py-1">{report.extraction_status}</span>
                          <span className="rounded-full bg-white px-2 py-1">{report.review_status}</span>
                          <span>{formatDate(report.report_date)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/dashboard/lab-reports/${report.id}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        View details <ArrowRight className="h-4 w-4" />
                      </Link>
                      <button onClick={() => handleDelete(report.id, report.storage_path)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-100">
                        <Trash2 className="h-4 w-4" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
