'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Database, RefreshCw, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getStatusPresentation } from '@/lib/hospital/status';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return <header className="flex flex-wrap items-end justify-between gap-4"><div className="min-w-0"><h1 className="text-2xl font-semibold text-slate-950">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}</div>{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}</header>;
}

export function KpiCard({ icon: Icon, label, value, hint, tone = 'teal' }: { icon: LucideIcon; label: string; value: ReactNode; hint?: string; tone?: 'teal' | 'amber' | 'rose' | 'blue' }) {
  const tones = { teal: 'text-teal-800 bg-teal-50', amber: 'text-amber-800 bg-amber-50', rose: 'text-rose-800 bg-rose-50', blue: 'text-sky-800 bg-sky-50' };
  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-slate-600">{label}</p><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tones[tone]}`}><Icon className="h-4 w-4" aria-hidden="true" /></span></div><p className="mt-3 text-2xl font-semibold tabular-nums text-slate-950">{value}</p>{hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}</section>;
}

export function StatusChip({ code }: { code: string }) {
  const t = useTranslations('hospitalOps.status');
  const status = getStatusPresentation(code);
  const Icon = status.icon;
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${status.tone}`}><Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{t(code)}</span></span>;
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return <div className="grid min-h-44 place-items-center rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center"><div><Icon className="mx-auto h-8 w-8 text-teal-800" aria-hidden="true" /><h2 className="mt-3 text-base font-semibold text-slate-900">{title}</h2><p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{body}</p>{action && <div className="mt-4">{action}</div>}</div></div>;
}

export function ErrorPanel({ message, technicalDetails, onRetry, retryLabel = 'Retry', detailsLabel = 'Show technical details' }: { message: string; technicalDetails?: string | null; onRetry: () => void; retryLabel?: string; detailsLabel?: string }) {
  return <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900" role="alert"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div className="min-w-0"><p className="text-sm font-medium">{message}</p><button type="button" onClick={onRetry} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 text-sm font-semibold"><RefreshCw className="h-4 w-4" />{retryLabel}</button>{technicalDetails && <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold">{detailsLabel}</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-white p-3">{technicalDetails}</pre></details>}</div></div></section>;
}

export function SampleDataBanner({ onRemove, onReset, busy = false, label = 'Sample data is on', removeLabel = 'Remove', resetLabel = 'Reset' }: { onRemove?: () => void; onReset?: () => void; busy?: boolean; label?: string; removeLabel?: string; resetLabel?: string }) {
  return <aside className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><span className="inline-flex items-center gap-2 font-medium"><Database className="h-4 w-4" />{label}</span><span className="flex gap-2">{onReset && <button type="button" disabled={busy} onClick={onReset} className="min-h-10 rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold disabled:opacity-50">{resetLabel}</button>}{onRemove && <button type="button" disabled={busy} onClick={onRemove} className="min-h-10 rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold disabled:opacity-50">{removeLabel}</button>}</span></aside>;
}

export function DataTable({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}><table className="w-full border-collapse text-left text-sm">{children}</table></div>;
}
