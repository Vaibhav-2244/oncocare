'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Activity, AlertCircle, TrendingUp, Pill, Calendar, FileText,
  Users, Clock, MessageCircle, Bell, Brain, Siren, User, Settings,
  Plus, X, Trash2, Download, Upload, FileImage, FileCheck, FileBadge,
  FlaskConical, Shield, Sparkles, FileType, type LucideIcon,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, PATIENT_ROLES, type NavItem } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';

const navItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: Activity },
  { label: 'Symptoms', href: '/dashboard/symptoms', icon: AlertCircle },
  { label: 'Treatments', href: '/dashboard/treatments', icon: TrendingUp },
  { label: 'Medications', href: '/dashboard/medications', icon: Pill },
  { label: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
  { label: 'Documents', href: '/dashboard/documents', icon: FileText },
  { label: 'Care Team', href: '/dashboard/care-team', icon: Users },
  { label: 'Timeline', href: '/dashboard/timeline', icon: Clock },
  { label: 'Community', href: '/dashboard/community', icon: MessageCircle },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'AI Engine', href: '/dashboard/ai-engine', icon: Brain },
  { label: 'Emergency', href: '/dashboard/emergency', icon: Siren },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

type DocumentCategory =
  | 'lab_report'
  | 'prescription'
  | 'scan'
  | 'discharge_summary'
  | 'insurance'
  | 'other';

interface DocumentRecord {
  id: string;
  user_id: string;
  title: string;
  file_url: string;
  file_type: string;
  file_size: number;
  category: DocumentCategory;
  created_at: string;
}

const CATEGORY_CONFIG: Record<DocumentCategory, { label: string; bg: string; text: string; icon: LucideIcon }> = {
  lab_report: { label: 'Lab Report', bg: 'bg-blue-50', text: 'text-blue-700', icon: FlaskConical },
  prescription: { label: 'Prescription', bg: 'bg-teal-50', text: 'text-teal-700', icon: FileCheck },
  scan: { label: 'Scan', bg: 'bg-purple-50', text: 'text-purple-700', icon: FileImage },
  discharge_summary: { label: 'Discharge Summary', bg: 'bg-amber-50', text: 'text-amber-700', icon: FileBadge },
  insurance: { label: 'Insurance', bg: 'bg-indigo-50', text: 'text-indigo-700', icon: Shield },
  other: { label: 'Other', bg: 'bg-slate-100', text: 'text-slate-700', icon: FileType },
};

function fileTypeIcon(fileType: string): LucideIcon {
  const ft = fileType.toLowerCase();
  if (ft.includes('pdf')) return FileText;
  if (ft.includes('image') || ft.includes('png') || ft.includes('jpg') || ft.includes('jpeg') || ft.includes('gif')) return FileImage;
  if (ft.includes('doc') || ft.includes('word')) return FileBadge;
  return FileType;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(size < 10 && unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function StatSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
      <div className="mt-3 h-7 w-16 animate-pulse rounded bg-slate-100" />
      <div className="mt-1 h-3 w-24 animate-pulse rounded bg-slate-50" />
    </div>
  );
}

function DocumentSkeleton() {
  return (
    <div className="rounded-xl border border-slate-100 p-5">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 animate-pulse rounded-xl bg-slate-100" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-slate-50" />
          <div className="h-3 w-1/4 animate-pulse rounded bg-slate-50" />
        </div>
      </div>
    </div>
  );
}

function DocumentsContent() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterCategory, setFilterCategory] = useState<DocumentCategory | 'all'>('all');
  const [actionId, setActionId] = useState<string | null>(null);

  // form state
  const [title, setTitle] = useState<string>('');
  const [category, setCategory] = useState<DocumentCategory>('lab_report');
  const [file, setFile] = useState<File | null>(null);

  const loadDocuments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;
      setDocuments((data || []) as DocumentRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadDocuments();
  }, [user, loadDocuments]);

  const resetForm = () => {
    setTitle('');
    setCategory('lab_report');
    setFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !file || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const fileExt = file.name.split('.').pop() || '';
      const fileName = `${user.id}/${Date.now()}-${file.name.replace(/\s/g, '-')}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);

      const payload = {
        user_id: user.id,
        title: title.trim(),
        file_url: urlData.publicUrl,
        file_type: file.type || fileExt,
        file_size: file.size,
        category,
      };
      const { data, error: insertError } = await supabase
        .from('documents')
        .insert(payload)
        .select()
        .single();
      if (insertError) throw insertError;
      setDocuments((prev) => [data as DocumentRecord, ...prev]);
      resetForm();
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (doc: DocumentRecord) => {
    try {
      const filePath = doc.file_url.split('/documents/')[1];
      if (filePath) {
        const { data, error: downloadError } = await supabase.storage
          .from('documents')
          .download(filePath);
        if (downloadError) throw downloadError;
        const url = URL.createObjectURL(data);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = doc.title || 'document';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        window.open(doc.file_url, '_blank');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download document');
    }
  };

  const handleDelete = async (doc: DocumentRecord) => {
    setActionId(doc.id);
    try {
      const filePath = doc.file_url.split('/documents/')[1];
      if (filePath) {
        await supabase.storage.from('documents').remove([filePath]);
      }
      const { error: deleteError } = await supabase.from('documents').delete().eq('id', doc.id);
      if (deleteError) throw deleteError;
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    } finally {
      setActionId(null);
    }
  };

  // stats
  const totalDocs = documents.length;
  const labReports = documents.filter((d) => d.category === 'lab_report').length;
  const prescriptions = documents.filter((d) => d.category === 'prescription').length;
  const scans = documents.filter((d) => d.category === 'scan').length;

  const statCards = [
    { label: 'Total Documents', value: totalDocs, icon: FileText, color: 'from-teal-500 to-emerald-500' },
    { label: 'Lab Reports', value: labReports, icon: FlaskConical, color: 'from-blue-500 to-indigo-500' },
    { label: 'Prescriptions', value: prescriptions, icon: FileCheck, color: 'from-amber-500 to-orange-500' },
    { label: 'Scans', value: scans, icon: FileImage, color: 'from-purple-500 to-fuchsia-500' },
  ];

  const filteredDocuments =
    filterCategory === 'all'
      ? documents
      : documents.filter((d) => d.category === filterCategory);

  const categoryFilters: { key: DocumentCategory | 'all'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'lab_report', label: 'Lab Reports' },
    { key: 'prescription', label: 'Prescriptions' },
    { key: 'scan', label: 'Scans' },
    { key: 'discharge_summary', label: 'Discharge' },
    { key: 'insurance', label: 'Insurance' },
    { key: 'other', label: 'Other' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Documents &amp; Medical Records</h1>
          <p className="mt-1 text-sm text-slate-500">Upload, organize, and analyze your health documents</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md hover:from-teal-700 hover:to-emerald-700"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Cancel' : 'Upload Document'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? [0, 1, 2, 3].map((i) => <StatSkeleton key={i} />)
          : statCards.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm"
              >
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md',
                    stat.color,
                  )}
                >
                  <stat.icon className="h-5 w-5" />
                </div>
                <div className="mt-3 text-2xl font-bold text-slate-900">{stat.value}</div>
                <div className="text-xs text-slate-500">{stat.label}</div>
              </motion.div>
            ))}
      </div>

      {/* Upload form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm"
            >
              <h2 className="text-base font-bold text-slate-900">Upload a New Document</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Blood Test Report — Jan 2024"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  >
                    <option value="lab_report">Lab Report</option>
                    <option value="prescription">Prescription</option>
                    <option value="scan">Scan</option>
                    <option value="discharge_summary">Discharge Summary</option>
                    <option value="insurance">Insurance</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">File</label>
                <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center transition-colors hover:border-teal-300 hover:bg-teal-50/30">
                  <Upload className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-2 text-sm text-slate-500">
                    {file ? file.name : 'Click to select or drag and drop a file'}
                  </p>
                  <input
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    required
                    className="mt-3 text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-teal-700 hover:file:bg-teal-100"
                  />
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-60"
                >
                  {submitting ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category filters */}
      <div className="flex flex-wrap items-center gap-2">
        {categoryFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilterCategory(f.key)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
              filterCategory === f.key
                ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Document grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <DocumentSkeleton key={i} />)}
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-slate-200/60 bg-white py-12 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
            <FileText className="h-7 w-7" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-700">
            {filterCategory === 'all' ? 'No documents uploaded yet' : 'No documents in this category'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Upload lab reports, prescriptions, scans, and more to keep your records organized.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md"
          >
            <Plus className="h-4 w-4" /> Upload your first document
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence initial={false}>
            {filteredDocuments.map((doc, i) => {
              const catConfig = CATEGORY_CONFIG[doc.category] || CATEGORY_CONFIG.other;
              const FileIcon = fileTypeIcon(doc.file_type);
              return (
                <motion.div
                  key={doc.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.03 }}
                  className="group rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm transition-colors hover:border-slate-300"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                        catConfig.bg,
                        catConfig.text,
                      )}
                    >
                      <FileIcon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{doc.title}</p>
                      <span
                        className={cn(
                          'mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold',
                          catConfig.bg,
                          catConfig.text,
                        )}
                      >
                        {catConfig.label}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                    <span>{formatFileSize(doc.file_size)}</span>
                    <span className="text-slate-300">·</span>
                    <span>{formatDate(doc.created_at)}</span>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => handleDownload(doc)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </button>
                    <Link
                      href="/dashboard/ai-engine"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-100"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Analyze with AI
                    </Link>
                    <button
                      onClick={() => handleDelete(doc)}
                      disabled={actionId === doc.id}
                      className="ml-auto rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50"
                      aria-label="Delete document"
                    >
                      {actionId === doc.id ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <ProtectedRoute allowedRoles={PATIENT_ROLES}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <DocumentsContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
