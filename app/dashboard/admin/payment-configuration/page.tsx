'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { ADMIN_ROLES, DashboardLayout } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';

type PaymentOffer = {
  id: string;
  kind: string;
  entity_id: string;
  offer_type: string;
  amount_in_paise: number;
  duration_days: number | null;
  included_usage: number | null;
  active: boolean;
  valid_from: string | null;
  valid_until: string | null;
};
type PaymentException = {
  id: string;
  kind: string;
  status: string;
  amount_in_paise: number;
  provider_order_id: string | null;
  failure_reason: string | null;
};
type WebhookException = { provider_event_id: string; event_type: string; status: string; attempts: number; last_error: string | null };
type RefundRequest = { id: string; order_id: string; amount_in_paise: number; reason: string; status: string; created_at: string };
type CommissionLedger = {
  id: string;
  order_id: string;
  seller_id: string;
  gross_amount_in_paise: number;
  delivery_fee_in_paise: number;
  commission_amount_in_paise: number;
  seller_payable_in_paise: number;
  policy_version: string;
  status: string;
};
type InsuranceApplication = {
  id: string;
  user_id: string;
  order_id: string;
  plan_id: string;
  issuance_status: string;
  review_notes: string | null;
};

function PaymentConfigurationContent() {
  const { user } = useAuth();
  const [offers, setOffers] = useState<PaymentOffer[]>([]);
  const [paymentExceptions, setPaymentExceptions] = useState<PaymentException[]>([]);
  const [webhookExceptions, setWebhookExceptions] = useState<WebhookException[]>([]);
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [commissionLedger, setCommissionLedger] = useState<CommissionLedger[]>([]);
  const [settlements, setSettlements] = useState<Array<{ commission_ledger_id: string; status: string; provider_reference: string | null }>>([]);
  const [donations, setDonations] = useState<Array<{ id: string; order_id: string; purpose: string; payment: { amount_in_paise: number; status: string } | null }>>([]);
  const [insuranceApplications, setInsuranceApplications] = useState<InsuranceApplication[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState('tele-oncology');
  const [entityId, setEntityId] = useState('default');
  const [offerType, setOfferType] = useState('one-time');
  const [amount, setAmount] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [includedUsage, setIncludedUsage] = useState('1');
  const [policyVersion, setPolicyVersion] = useState('');
  const [basisPoints, setBasisPoints] = useState('');

  const accessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const load = useCallback(async () => {
    const token = await accessToken();
    if (!token) return;
    const [offerResponse, commissionResponse, reconciliationResponse, refundResponse] = await Promise.all([
      fetch('/api/payments/admin/offers', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' }),
      fetch('/api/payments/admin/commissions', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' }),
      fetch('/api/payments/admin/reconciliation', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' }),
      fetch('/api/payments/admin/refunds', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' }),
    ]);
    const offerPayload = await offerResponse.json();
    const commissionPayload = await commissionResponse.json();
    const reconciliationPayload = await reconciliationResponse.json();
    const refundPayload = await refundResponse.json();
    const insuranceResponse = await fetch('/api/payments/insurance-applications', {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
    });
    const insurancePayload = await insuranceResponse.json();
    if (!offerResponse.ok || !commissionResponse.ok || !reconciliationResponse.ok || !refundResponse.ok) {
      setError(offerPayload.error || commissionPayload.error || reconciliationPayload.error || refundPayload.error || 'Unable to load payment configuration.');
      return;
    }
    if (!insuranceResponse.ok) {
      setError(insurancePayload.error || 'Unable to load insurance applications.');
      return;
    }
    setOffers(offerPayload.offers ?? []);
    setPaymentExceptions(reconciliationPayload.orders ?? []);
    setWebhookExceptions(reconciliationPayload.events ?? []);
    setRefunds(refundPayload.refunds ?? []);
    setCommissionLedger(commissionPayload.ledger ?? []);
    setSettlements(commissionPayload.settlements ?? []);
    setDonations(commissionPayload.donations ?? []);
    setInsuranceApplications(insurancePayload.applications ?? []);
    const activePolicy = commissionPayload.policies?.find((policy: { active: boolean }) => policy.active);
    if (activePolicy) {
      setPolicyVersion(activePolicy.policy_version);
      setBasisPoints(String(activePolicy.basis_points));
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const reconcile = async (orderId: string) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const token = await accessToken();
      const response = await fetch('/api/payments/admin/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ orderId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Payment reconciliation failed.');
      setNotice(`Reconciliation completed: ${payload.status}.`);
      await load();
    } catch (reconcileError) {
      setError(reconcileError instanceof Error ? reconcileError.message : 'Payment reconciliation failed.');
    } finally {
      setSaving(false);
    }
  };

  const processRefund = async (refundId: string) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const token = await accessToken();
      const response = await fetch('/api/payments/admin/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ refundId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Refund processing failed.');
      setNotice(`Refund status: ${payload.refund.status}.`);
      await load();
    } catch (refundError) {
      setError(refundError instanceof Error ? refundError.message : 'Refund processing failed.');
    } finally {
      setSaving(false);
    }
  };

  const retryWebhook = async (providerEventId: string) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const token = await accessToken();
      const response = await fetch('/api/payments/admin/webhooks/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ providerEventId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Webhook retry failed.');
      setNotice('Stored webhook event was processed successfully.');
      await load();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Webhook retry failed.');
    } finally {
      setSaving(false);
    }
  };

  const reviewInsuranceApplication = async (applicationId: string, status: 'under_review' | 'declined') => {
    const notes = reviewNotes[applicationId]?.trim() ?? '';
    if (status === 'declined' && !notes) {
      setError('Add a reason before declining an insurance application.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const token = await accessToken();
      const response = await fetch('/api/payments/insurance-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ applicationId, status, reviewNotes: notes || null }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to review insurance application.');
      setNotice(status === 'declined'
        ? 'Insurance application declined. This does not represent policy cancellation or issuance.'
        : 'Insurance application moved to insurer review. No policy was issued.');
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Unable to review insurance application.');
    } finally {
      setSaving(false);
    }
  };

  const saveOffer = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const token = await accessToken();
      const amountInPaise = Math.round(Number(amount) * 100);
      const usage = Number(includedUsage);
      if (!token || !/^\d+(\.\d{1,2})?$/.test(amount) || !Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) {
        setError('Enter a valid approved price and sign in again if needed.');
        return;
      }
      const response = await fetch('/api/payments/admin/offers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          kind,
          entityId: entityId.trim(),
          offerType,
          amountInPaise,
          durationDays: durationDays ? Number(durationDays) : null,
          includedUsage: kind === 'tele-oncology' && includedUsage ? usage : null,
          active: true,
          validFrom: null,
          validUntil: null,
          terms: {},
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not save this offer.');
      setNotice('Offer saved and audited.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this offer.');
    } finally {
      setSaving(false);
    }
  };

  const saveCommission = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const token = await accessToken();
      if (!token || !policyVersion.trim() || !Number.isInteger(Number(basisPoints))) {
        setError('Enter a policy version and an explicit commission in basis points.');
        return;
      }
      const response = await fetch('/api/payments/admin/commissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ policyVersion: policyVersion.trim(), basisPoints: Number(basisPoints), active: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not save the commission policy.');
      setNotice('Commission policy saved and audited.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the commission policy.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/dashboard/admin" className="inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:text-teal-900">
        <ArrowLeft className="h-4 w-4" /> Admin workspace
      </Link>
      <header>
        <p className="text-sm font-medium text-teal-700">Protected administration</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Payment configuration</h1>
        <p className="mt-2 text-sm text-slate-600">Prices and seller commission rules take effect only for new checkouts. Donation collection and external seller transfers remain disabled.</p>
      </header>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={saveOffer} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create or update an offer</h2>
          <label className="block text-sm font-medium text-slate-700">Service / product type
            <select value={kind} onChange={(event) => {
              const nextKind = event.target.value;
              setKind(nextKind);
              setEntityId(nextKind === 'tele-oncology' ? 'default' : '');
              setOfferType(nextKind === 'booking' ? 'daily' : 'one-time');
              setDurationDays(nextKind === 'tele-oncology' ? '' : '');
              setIncludedUsage('1');
            }} className="mt-1 block w-full rounded-lg border border-slate-300 p-2">
              <option value="tele-oncology">Tele-oncology</option>
              <option value="medicine">Medicine</option>
              <option value="insurance">Insurance</option>
              <option value="booking">Home-care booking</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">Catalog ID {kind === 'tele-oncology' ? '(fixed)' : ''}
            <input value={entityId} readOnly={kind === 'tele-oncology'} onChange={(event) => setEntityId(event.target.value)} required className="mt-1 block w-full rounded-lg border border-slate-300 p-2" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Offer type
            <select value={offerType} onChange={(event) => {
              setOfferType(event.target.value);
              if (kind === 'tele-oncology') {
                setIncludedUsage(event.target.value === 'monthly' ? '35' : '1');
                setDurationDays(event.target.value === 'monthly' ? '30' : '');
              }
            }} className="mt-1 block w-full rounded-lg border border-slate-300 p-2">
              {(kind === 'tele-oncology' ? ['one-time', 'monthly']
                : kind === 'medicine' ? ['one-time']
                  : kind === 'insurance' ? ['one-time'] : ['daily', 'monthly'])
                .map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">Price (INR)
            <input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required className="mt-1 block w-full rounded-lg border border-slate-300 p-2" />
          </label>
          <div className={`grid gap-4 ${kind === 'tele-oncology' ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
            <label className="block text-sm font-medium text-slate-700">Duration (days)
              <input type="number" min="1" value={durationDays} disabled={kind === 'tele-oncology'} onChange={(event) => setDurationDays(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 p-2 disabled:bg-slate-100" />
            </label>
            {kind === 'tele-oncology' && <label className="block text-sm font-medium text-slate-700">Included consultations
              <input type="number" min="1" value={includedUsage} onChange={(event) => setIncludedUsage(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" />
            </label>}
          </div>
          {kind === 'booking' && <p className="text-xs text-slate-500">Home-care prices are single upfront payments for a configured date range; they do not create recurring billing or unlimited visits.</p>}
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save offer
          </button>
        </form>

        <div className="space-y-6">
          <form onSubmit={saveCommission} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Seller commission policy</h2>
            <p className="text-sm text-slate-600">No default commission is assumed. Medicine checkout remains blocked until an administrator configures a policy.</p>
            <label className="block text-sm font-medium text-slate-700">Policy version
              <input value={policyVersion} onChange={(event) => setPolicyVersion(event.target.value)} required className="mt-1 block w-full rounded-lg border border-slate-300 p-2" placeholder="e.g. 2026-01-approved" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Commission (basis points; 100 = 1%)
              <input type="number" min="0" max="10000" value={basisPoints} onChange={(event) => setBasisPoints(event.target.value)} required className="mt-1 block w-full rounded-lg border border-slate-300 p-2" />
            </label>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save policy
            </button>
          </form>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-5 py-4 font-semibold text-slate-900">Configured offers</h2>
            <div className="max-h-[28rem] divide-y divide-slate-100 overflow-auto">
              {offers.length ? offers.map((offer) => (
                <div key={offer.id} className="px-5 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="capitalize text-slate-800">{offer.kind} · {offer.offer_type}</strong>
                    <span className={offer.active ? 'text-emerald-700' : 'text-slate-500'}>{offer.active ? 'Active' : 'Inactive'}</span>
                  </div>
                  <p className="mt-1 text-slate-600">ID: {offer.entity_id} · ₹{(Number(offer.amount_in_paise) / 100).toLocaleString('en-IN')} · {offer.duration_days ? `${offer.duration_days} days` : 'no expiry'} · {offer.included_usage ? `${offer.included_usage} consultations included` : 'usage not configured'}</p>
                </div>
              )) : <p className="px-5 py-8 text-sm text-slate-500">No offers configured.</p>}
            </div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-5 py-4 font-semibold text-slate-900">Payment exceptions</h2>
            <div className="max-h-80 divide-y divide-slate-100 overflow-auto">
              {paymentExceptions.length ? paymentExceptions.map((order) => (
                <div key={order.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <strong className="capitalize text-slate-800">{order.kind} · {order.status}</strong>
                    <p className="truncate text-slate-600">{order.id} · ₹{(Number(order.amount_in_paise) / 100).toLocaleString('en-IN')}</p>
                    {order.failure_reason && <p className="text-xs text-rose-700">{order.failure_reason}</p>}
                  </div>
                  <button type="button" disabled={saving || !order.provider_order_id} onClick={() => void reconcile(order.id)} className="rounded-lg border border-teal-200 px-3 py-1.5 font-semibold text-teal-800 disabled:opacity-40">Reconcile</button>
                </div>
              )) : <p className="px-5 py-6 text-sm text-slate-500">No payment exceptions.</p>}
            </div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-5 py-4 font-semibold text-slate-900">Webhook recovery queue</h2>
            <div className="max-h-64 divide-y divide-slate-100 overflow-auto">
              {webhookExceptions.length ? webhookExceptions.map((event) => (
                <div key={event.provider_event_id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <strong className="text-slate-800">{event.event_type} · {event.status}</strong>
                    <p className="truncate text-slate-600">{event.provider_event_id} · attempts {event.attempts}</p>
                    {event.last_error && <p className="text-xs text-rose-700">{event.last_error}</p>}
                  </div>
                  <button type="button" disabled={saving} onClick={() => void retryWebhook(event.provider_event_id)} className="rounded-lg border border-teal-200 px-3 py-1.5 font-semibold text-teal-800 disabled:opacity-40">Retry event</button>
                </div>
              )) : <p className="px-5 py-6 text-sm text-slate-500">No webhook retries pending.</p>}
            </div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-5 py-4 font-semibold text-slate-900">Refund review queue</h2>
            <div className="max-h-80 divide-y divide-slate-100 overflow-auto">
              {refunds.length ? refunds.map((refund) => (
                <div key={refund.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <strong className="text-slate-800">₹{(Number(refund.amount_in_paise) / 100).toLocaleString('en-IN')} · {refund.status}</strong>
                    <p className="truncate text-slate-600">{refund.order_id} · {refund.reason}</p>
                  </div>
                  <button type="button" disabled={saving || refund.status === 'processed'} onClick={() => void processRefund(refund.id)} className="rounded-lg border border-amber-200 px-3 py-1.5 font-semibold text-amber-800 disabled:opacity-40">Approve / retry</button>
                </div>
              )) : <p className="px-5 py-6 text-sm text-slate-500">No refund requests require review.</p>}
            </div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-5 py-4 font-semibold text-slate-900">Internal commission ledger and seller settlements</h2>
            <p className="px-5 py-3 text-xs text-amber-800">Seller transfers are blocked. These rows are internal accounting records; no payout is initiated from this screen.</p>
            <div className="max-h-80 divide-y divide-slate-100 overflow-auto">
              {commissionLedger.length ? commissionLedger.map((entry) => {
                const settlement = settlements.find((row) => row.commission_ledger_id === entry.id);
                return (
                  <div key={entry.id} className="px-5 py-3 text-sm">
                    <strong className="text-slate-800">Seller {entry.seller_id} · {settlement?.status ?? entry.status}</strong>
                    <p className="text-slate-600">Order {entry.order_id} · gross ₹{(entry.gross_amount_in_paise / 100).toLocaleString('en-IN')} · delivery ₹{(entry.delivery_fee_in_paise / 100).toLocaleString('en-IN')} · commission ₹{(entry.commission_amount_in_paise / 100).toLocaleString('en-IN')} · payable ₹{(entry.seller_payable_in_paise / 100).toLocaleString('en-IN')}</p>
                    <p className="text-xs text-slate-500">Policy {entry.policy_version} · ledger {entry.status}{settlement?.provider_reference ? ` · reference ${settlement.provider_reference}` : ''}</p>
                  </div>
                );
              }) : <p className="px-5 py-6 text-sm text-slate-500">No internal seller commission entries.</p>}
            </div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-5 py-4 font-semibold text-slate-900">Insurance application review</h2>
            <p className="px-5 py-3 text-xs text-slate-600">Review records only; policy issuance remains with the insurer and is not represented by payment.</p>
            <div className="max-h-96 divide-y divide-slate-100 overflow-auto">
              {insuranceApplications.length ? insuranceApplications.map((application) => (
                <div key={application.id} className="space-y-2 px-5 py-3 text-sm">
                  <strong className="text-slate-800">{application.issuance_status.replaceAll('_', ' ')}</strong>
                  <p className="truncate text-slate-600">Applicant {application.user_id} · plan {application.plan_id} · order {application.order_id}</p>
                  {application.review_notes && <p className="text-xs text-slate-500">Review note: {application.review_notes}</p>}
                  {['pending_issuance', 'under_review'].includes(application.issuance_status) && (
                    <>
                      <input
                        value={reviewNotes[application.id] ?? ''}
                        onChange={(event) => setReviewNotes((current) => ({ ...current, [application.id]: event.target.value }))}
                        maxLength={1000}
                        placeholder="Review note (required to decline)"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={saving} onClick={() => void reviewInsuranceApplication(application.id, 'under_review')} className="rounded-lg border border-teal-200 px-3 py-1.5 font-semibold text-teal-800 disabled:opacity-40">Mark under review</button>
                        <button type="button" disabled={saving} onClick={() => void reviewInsuranceApplication(application.id, 'declined')} className="rounded-lg border border-rose-200 px-3 py-1.5 font-semibold text-rose-800 disabled:opacity-40">Decline</button>
                      </div>
                    </>
                  )}
                </div>
              )) : <p className="px-5 py-6 text-sm text-slate-500">No payment-backed insurance applications.</p>}
            </div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-5 py-4 font-semibold text-slate-900">Donation payment records</h2>
            <p className="px-5 py-3 text-xs text-amber-800">Live donation checkout remains disabled until its approvals and operating configuration are in place.</p>
            <div className="max-h-64 divide-y divide-slate-100 overflow-auto">
              {donations.length ? donations.map((donation) => (
                <div key={donation.id} className="px-5 py-3 text-sm">
                  <strong className="text-slate-800">{donation.purpose}</strong>
                  <p className="text-slate-600">Order {donation.order_id} · {donation.payment?.status ?? 'payment unknown'} · {donation.payment ? `₹${(donation.payment.amount_in_paise / 100).toLocaleString('en-IN')}` : 'amount unavailable'}</p>
                </div>
              )) : <p className="px-5 py-6 text-sm text-slate-500">No Razorpay donation records.</p>}
            </div>
          </section>
        </div>
      </section>
      <p className="text-xs text-slate-500">Signed in as {user?.email || 'administrator'}. Adjustments are server-authorized and written to the payment audit log.</p>
    </div>
  );
}

export default function PaymentConfigurationPage() {
  return <ProtectedRoute allowedRoles={ADMIN_ROLES}><DashboardLayout dashboardTitle="Payment configuration"><PaymentConfigurationContent /></DashboardLayout></ProtectedRoute>;
}
