'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, FileText, FlaskConical, PencilLine, ShieldCheck, Trash2, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { DashboardLayout, PATIENT_ROLES, caregiverNavItems, patientNavItems } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import type { LabReportRow, LabValueRow } from '@/lib/lab-reports';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export default function LabReportDetailPage() {
  const params = useParams();
  const reportId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const { user } = useAuth();
  const navItems = user?.primaryRole === 'family_caregiver' ? caregiverNavItems : patientNavItems;
  const [report, setReport] = useState<LabReportRow | null>(null);
  const [values, setValues] = useState<LabValueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async () => {
    if (!user || !reportId) return;
    setLoading(true);
    const [reportResult, valuesResult] = await Promise.all([
      supabase.from('lab_reports').select('*').eq('id', reportId).eq('user_id', user.id).maybeSingle(),
      supabase.from('lab_values').select('*').eq('report_id', reportId).order('created_at', { ascending: true }),
    ]);

    if (reportResult.error) {
      setError(reportResult.error.message || 'Failed to load this report.');
      setLoading(false);
      return;
    }

    if (!reportResult.data) {
      setError('This lab report could not be found or you do not have access.');
      setLoading(false);
      return;
    }

    setReport(reportResult.data as LabReportRow);
    setValues((valuesResult.data || []) as LabValueRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (user && reportId) {
      void loadReport();
    }
  }, [user, reportId]);

  const updateValueState = async (valueId: string, updates: Partial<LabValueRow>) => {
    if (!user || !reportId) return;
    const { error: updateError } = await supabase.from('lab_values').update({
      ...updates,
      updated_at: new Date().toISOString(),
    }).eq('id', valueId).eq('report_id', reportId);

    if (updateError) {
      setError(updateError.message || 'Unable to update the lab value.');
      return;
    }

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      report_id: reportId,
      event_type: 'review',
      message: `Lab value review updated for report ${reportId}.`,
      metadata: { valueId, action: updates.reviewed_state || 'updated' },
      performed_by: user.id,
    });

    await loadReport();
  };

  const markReviewed = async (value: LabValueRow, state: 'confirmed' | 'rejected', notes?: string) => {
    const payload: Partial<LabValueRow> = {
      reviewed_state: state,
      corrected_state: state === 'confirmed' && notes ? true : false,
      rejected_state: state === 'rejected',
      reviewer: user?.id || null,
      reviewed_at: new Date().toISOString(),
      notes: notes || value.notes || 'Reviewed by patient',
    };

    await updateValueState(value.id, payload);
  };

  return (
    <ProtectedRoute allowedRoles={PATIENT_ROLES}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard/lab-reports" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" /> Back to lab reports
            </Link>
          </div>

          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

          {loading || !report ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading report…</div>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                      <FlaskConical className="h-5 w-5" />
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold text-slate-900">{report.report_title}</h1>
                      <p className="text-sm text-slate-500">{report.laboratory_name || 'Uploaded laboratory'} · {report.file_type}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 text-xs font-medium text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2 py-1">{report.extraction_status}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1">{report.review_status}</span>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs uppercase tracking-wide text-slate-500">Report date</div><div className="mt-2 text-sm font-semibold text-slate-800">{formatDate(report.report_date)}</div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs uppercase tracking-wide text-slate-500">Uploaded</div><div className="mt-2 text-sm font-semibold text-slate-800">{formatDate(report.created_at)}</div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs uppercase tracking-wide text-slate-500">File name</div><div className="mt-2 text-sm font-semibold text-slate-800">{report.file_name}</div></div>
                  <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs uppercase tracking-wide text-slate-500">Storage path</div><div className="mt-2 text-sm font-semibold text-slate-800">{report.storage_path}</div></div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <FileText className="h-4 w-4 text-teal-600" /> Extracted lab values
                </div>

                {values.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                    No values were extracted from this report. Please review the upload and try again.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {values.map((value) => (
                      <div key={value.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-base font-semibold text-slate-900">{value.test_name}</div>
                            <div className="text-sm text-slate-500">{value.canonical_name} · {value.unit || 'unit not specified'}</div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <button onClick={() => markReviewed(value, 'confirmed')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-emerald-700"><Check className="h-3.5 w-3.5" /> Confirm</button>
                            <button onClick={() => markReviewed(value, 'rejected')} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1.5 text-rose-700"><X className="h-3.5 w-3.5" /> Reject</button>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-5">
                          <div><div className="text-[11px] uppercase tracking-wide text-slate-500">Value</div><div className="mt-1 text-sm font-medium text-slate-800">{value.original_value || '—'}</div></div>
                          <div><div className="text-[11px] uppercase tracking-wide text-slate-500">Numeric</div><div className="mt-1 text-sm font-medium text-slate-800">{value.numeric_value ?? '—'}</div></div>
                          <div><div className="text-[11px] uppercase tracking-wide text-slate-500">Reference</div><div className="mt-1 text-sm font-medium text-slate-800">{value.reference_text || '—'}</div></div>
                          <div><div className="text-[11px] uppercase tracking-wide text-slate-500">Confidence</div><div className="mt-1 text-sm font-medium text-slate-800">{value.extraction_confidence ? `${(value.extraction_confidence * 100).toFixed(0)}%` : '—'}</div></div>
                          <div><div className="text-[11px] uppercase tracking-wide text-slate-500">Reviewed</div><div className="mt-1 text-sm font-medium text-slate-800">{value.reviewed_state || 'pending'}</div></div>
                        </div>

                        <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center">
                          <label className="flex-1 text-xs font-medium text-slate-600">
                            Notes
                            <input defaultValue={value.notes || ''} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-teal-300" onBlur={async (event) => {
                              await updateValueState(value.id, { notes: event.target.value || value.notes || 'Reviewed by patient' });
                            }} />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
