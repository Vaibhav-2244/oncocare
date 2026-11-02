'use client';

import { useCallback, useEffect, useState } from 'react';
import { CreditCard, RefreshCw } from 'lucide-react';
import { DashboardLayout, PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES, commonNavItems } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { supabase } from '@/lib/supabase-client';

type PaymentRecord = {
  id: string;
  kind: string;
  status: string;
  amount_in_paise: number | string;
  currency: string;
  payment_mode: 'test' | 'live';
  is_demo: boolean;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  provider_refund_id: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

export default function PaymentHistoryPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error('Unable to verify your sign-in session.');
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in to view your payment history.');

      const response = await fetch('/api/payments/history', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to load payment history.');
      setPayments(Array.isArray(result.payments) ? result.payments : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load payment history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPayments(); }, [loadPayments]);

  return (
    <ProtectedRoute allowedRoles={PATIENT_CAREGIVER_ADVISOR_ADMIN_ROLES}>
      <DashboardLayout navItems={commonNavItems} dashboardTitle="Payment history">
        <main className="mx-auto max-w-5xl space-y-6 p-6">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <CreditCard className="mt-1 h-6 w-6 text-teal-700" />
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Payment history</h1>
                <p className="mt-1 text-sm text-slate-600">Your payment records, verified statuses, and Razorpay references.</p>
              </div>
            </div>
            <button type="button" onClick={() => void loadPayments()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </header>

          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
          {loading && <p role="status" className="text-sm text-slate-600">Loading your payment history…</p>}
          {!loading && !error && payments.length === 0 && (
            <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">No payment records found.</p>
          )}

          <div className="space-y-4">
            {payments.map((payment) => (
              <article key={payment.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold capitalize text-slate-900">{payment.kind.replaceAll('-', ' ')}</h2>
                    <p className="mt-1 text-xs text-slate-500">Order {payment.provider_order_id || 'being prepared'}</p>
                    {payment.provider_payment_id && <p className="mt-1 text-xs text-slate-500">Payment {payment.provider_payment_id}</p>}
                    {payment.provider_refund_id && <p className="mt-1 text-xs text-slate-500">Refund {payment.provider_refund_id}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-900">{payment.currency} {(Number(payment.amount_in_paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                    <p className="mt-1 text-sm font-semibold uppercase text-slate-700">{payment.status === 'paid' ? 'SUCCESS' : payment.status.replaceAll('_', ' ')}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{payment.payment_mode.toUpperCase()} MODE</span>
                  {payment.is_demo && <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-900">DEMO — no real service or charitable contribution</span>}
                  {payment.payment_mode === 'test' && !payment.is_demo && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-800">Test transaction — no real money was charged</span>}
                </div>
                {payment.failure_reason && <p className="mt-3 text-sm text-rose-700">{payment.failure_reason}</p>}
                <p className="mt-3 text-xs text-slate-500">Created {new Date(payment.created_at).toLocaleString()} · Updated {new Date(payment.updated_at).toLocaleString()}</p>
              </article>
            ))}
          </div>
        </main>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
