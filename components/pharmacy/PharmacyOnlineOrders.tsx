'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, PackageCheck, Truck } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { usePharmacy } from '@/lib/pharmacy/PharmacyProvider';

type OnlineOrder = {
  id: string;
  payment_order_id: string;
  pharmacy_id: string;
  amount_in_paise: number;
  delivery_fee_in_paise: number;
  delivery_address: string;
  status: string;
  tracking_reference: string | null;
  created_at: string;
  items: Array<{ description: string; quantity: number; total_amount_in_paise: number }>;
  refunds: Array<{ amount_in_paise: number; status: string }>;
};

const NEXT_ACTIONS: Record<string, Array<{ status: string; label: string }>> = {
  pharmacy_review: [
    { status: 'accepted', label: 'Accept order' },
    { status: 'refund_pending', label: 'Reject and request refund' },
  ],
  accepted: [{ status: 'preparing', label: 'Start preparing' }],
  preparing: [{ status: 'dispatched', label: 'Dispatch order' }],
  dispatched: [{ status: 'delivered', label: 'Mark delivered' }],
};

export function PharmacyOnlineOrders() {
  const { can, loading: pharmacyLoading } = usePharmacy();
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sign in before loading pharmacy orders.');
    const response = await fetch('/api/payments/pharmacy/orders', {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to load online pharmacy orders.');
    setOrders(payload.orders ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load()
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load online pharmacy orders.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  const transition = async (order: OnlineOrder, status: string) => {
    if (status === 'refund_pending' && !window.confirm('Reject this order and submit a full refund request for administrator review?')) return;
    const trackingReference = tracking[order.id]?.trim() ?? '';
    if (status === 'dispatched' && !trackingReference) {
      setError('Enter the shipment or delivery tracking reference before dispatch.');
      return;
    }
    setBusyOrder(order.id);
    setError('');
    setNotice('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again before updating the pharmacy order.');
      const response = await fetch('/api/payments/pharmacy/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          paymentOrderId: order.payment_order_id,
          status,
          trackingReference: status === 'dispatched' ? trackingReference : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update the pharmacy order.');
      setNotice(status === 'refund_pending'
        ? 'The order was rejected and a full refund request was submitted for administrator review.'
        : 'Pharmacy order status updated.');
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to update the pharmacy order.');
    } finally {
      setBusyOrder(null);
    }
  };

  if (pharmacyLoading || loading) return <p className="text-sm text-slate-500">Loading pharmacy orders…</p>;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold text-slate-950">Online medicine orders</h2>
        <p className="mt-1 text-sm text-slate-600">Captured orders remain reserved until dispatch. Inventory is deducted when the shipment is dispatched.</p>
      </header>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {!orders.length && !error && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No online medicine orders are available for this pharmacy.
        </div>
      )}
      {orders.map((order) => {
        const actions = NEXT_ACTIONS[order.status] ?? [];
        return (
          <article key={order.id} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">Order {order.payment_order_id.slice(0, 8).toUpperCase()}</h3>
                <p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleString()} · {order.status.replaceAll('_', ' ')}</p>
              </div>
              <p className="font-semibold text-teal-800">₹{(order.amount_in_paise / 100).toLocaleString('en-IN')}</p>
            </div>
            <div className="space-y-1 text-sm text-slate-700">
              {order.items.map((item, index) => (
                <p key={`${item.description}-${index}`}>{item.description} × {item.quantity}</p>
              ))}
              <p className="text-xs text-slate-500">Delivery fee: ₹{(order.delivery_fee_in_paise / 100).toLocaleString('en-IN')}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <span className="font-semibold">Delivery address: </span>{order.delivery_address}
            </div>
            {order.tracking_reference && <p className="text-sm text-slate-600">Tracking: {order.tracking_reference}</p>}
            {order.refunds.length > 0 && (
              <p className="text-xs text-amber-700">
                Refund request: {order.refunds.map((refund) => `${refund.status} (₹${(refund.amount_in_paise / 100).toLocaleString('en-IN')})`).join(', ')}
              </p>
            )}
            {actions.length > 0 && (can('orders.progress') || can('deliveries.manage')) && (
              <div className="flex flex-wrap items-end gap-2">
                {order.status === 'preparing' && (
                  <label className="min-w-60 flex-1 text-xs text-slate-600">
                    Tracking reference (required for dispatch)
                    <input
                      value={tracking[order.id] ?? ''}
                      maxLength={200}
                      onChange={(event) => setTracking((current) => ({ ...current, [order.id]: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                )}
                {actions.map((action) => (
                  <button
                    key={action.status}
                    type="button"
                    disabled={busyOrder === order.id}
                    onClick={() => void transition(order, action.status)}
                    className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                  >
                    {busyOrder === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : action.status === 'dispatched' ? <Truck className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
