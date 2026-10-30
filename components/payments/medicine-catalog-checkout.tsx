'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { PaymentCheckoutButton } from '@/components/payments/checkout-button';

type CatalogProduct = {
  id: string;
  pharmacyId: string;
  pharmacyName: string;
  deliveryFeeInPaise: number;
  name: string;
  strength: string | null;
  form: string | null;
  sellingPrice: number;
  requiresPrescription: boolean;
};

type VerifiedPrescription = {
  id: string;
  pharmacy_id: string;
};

type PatientMedicineOrder = {
  id: string;
  payment_order_id: string;
  pharmacyName: string;
  amount_in_paise: number;
  delivery_fee_in_paise: number;
  delivery_address: string;
  status: string;
  tracking_reference: string | null;
  created_at: string;
  items: Array<{ description: string; quantity: number }>;
  refunds: Array<{ status: string; amount_in_paise: number }>;
};

export function MedicineCatalogCheckout() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [prescriptions, setPrescriptions] = useState<VerifiedPrescription[]>([]);
  const [prescriptionError, setPrescriptionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedPrescriptions, setSelectedPrescriptions] = useState<Record<string, string>>({});
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [patientOrders, setPatientOrders] = useState<PatientMedicineOrder[]>([]);
  const [orderError, setOrderError] = useState('');
  const [orderNotice, setOrderNotice] = useState('');
  const [cancelingOrder, setCancelingOrder] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch('/api/payments/medicine-orders', {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load your medicine orders.');
      setPatientOrders(payload.orders ?? []);
      setOrderError('');
    } catch (caught) {
      setOrderError(caught instanceof Error ? caught.message : 'Unable to load your medicine orders.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadCatalog() {
      try {
        const [catalogResponse, { data: userData }] = await Promise.all([
          fetch('/api/payments/medicine-catalog', { cache: 'no-store' }),
          supabase.auth.getUser(),
        ]);
        const catalog = await catalogResponse.json();
        if (!catalogResponse.ok) throw new Error(catalog.error || 'Unable to load medicine listings.');
        if (!active) return;
        setProducts(catalog.products ?? []);

        if (userData.user) {
          const { data, error: loadError } = await supabase.from('pharmacy_prescriptions')
            .select('id, pharmacy_id')
            .eq('patient_id', userData.user.id)
            .eq('status', 'verified');
          if (loadError) throw loadError;
          if (active) setPrescriptions(data ?? []);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load medicine listings.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadCatalog();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const cancelOrder = async (order: PatientMedicineOrder) => {
    if (!window.confirm('Request cancellation and a full refund review for this order?')) return;
    setCancelingOrder(order.payment_order_id);
    setOrderError('');
    setOrderNotice('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again before requesting cancellation.');
      const response = await fetch('/api/payments/medicine-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ paymentOrderId: order.payment_order_id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to request cancellation.');
      setOrderNotice('Cancellation and full-refund request submitted for administrator review.');
      setPatientOrders((current) => current.map((item) => item.payment_order_id === order.payment_order_id
        ? { ...item, status: 'cancellation_requested', refunds: [{ status: 'requested', amount_in_paise: item.amount_in_paise }] }
        : item));
    } catch (caught) {
      setOrderError(caught instanceof Error ? caught.message : 'Unable to request cancellation.');
    } finally {
      setCancelingOrder(null);
    }
  };

  return (
    <>
    <section className="mx-auto mt-10 max-w-6xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold text-slate-900">Order from approved pharmacies</h2>
      <p className="mt-1 text-sm text-slate-600">Prices, configured delivery fees, stock, and prescription requirements are revalidated by the server before checkout.</p>
      {products.length > 0 && (
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Delivery address
          <textarea
            className="mt-1 block w-full rounded-lg border border-slate-300 p-3 text-sm"
            rows={2}
            maxLength={500}
            minLength={10}
            value={deliveryAddress}
            onChange={(event) => setDeliveryAddress(event.target.value)}
            placeholder="Enter the complete address for pharmacy delivery"
          />
        </label>
      )}
      {loading && <p className="mt-4 text-sm text-slate-500">Loading available products…</p>}
      {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
      {prescriptionError && <p role="alert" className="mt-4 text-sm text-rose-700">{prescriptionError}</p>}
      {!loading && !error && products.length === 0 && <p className="mt-4 text-sm text-slate-500">No approved in-stock products are available for online checkout.</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {products.map((product) => {
          const matchingPrescriptions = prescriptions.filter((item) => item.pharmacy_id === product.pharmacyId);
          const selectedPrescriptionId = selectedPrescriptions[product.id];
          const quantity = quantities[product.id] ?? 1;
          return (
            <article key={product.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{product.name}{product.strength ? ` ${product.strength}` : ''}</h3>
                  <p className="text-sm text-slate-500">{[product.form, product.pharmacyName].filter(Boolean).join(' · ')}</p>
                  <p className="mt-2 text-lg font-bold text-teal-700">
                    ₹{((product.sellingPrice * quantity) + product.deliveryFeeInPaise / 100).toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs text-slate-500">
                    Items ₹{(product.sellingPrice * quantity).toLocaleString('en-IN')} · delivery ₹{(product.deliveryFeeInPaise / 100).toLocaleString('en-IN')}
                  </p>
                </div>
                <label className="text-xs text-slate-600">
                  Quantity
                  <input
                    className="mt-1 block w-20 rounded border border-slate-300 p-2 text-sm"
                    type="number"
                    min={1}
                    max={20}
                    value={quantity}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      setQuantities((current) => ({ ...current, [product.id]: Math.max(1, Math.min(20, parsed || 1)) }));
                    }}
                  />
                </label>
              </div>
              {product.requiresPrescription && (
                <label className="mt-3 block text-xs text-slate-600">
                  Verified prescription
                  <select
                    className="mt-1 block w-full rounded border border-slate-300 p-2 text-sm"
                    value={selectedPrescriptions[product.id] ?? ''}
                    onChange={(event) => setSelectedPrescriptions((current) => ({ ...current, [product.id]: event.target.value }))}
                  >
                    <option value="">Select a prescription</option>
                    {matchingPrescriptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.id}</option>
                    ))}
                  </select>
                </label>
              )}
              {product.requiresPrescription && matchingPrescriptions.length === 0 && (
                <p className="mt-2 text-xs text-amber-700">A verified prescription for this pharmacy is required.</p>
              )}
              <div className="mt-3">
                <PaymentCheckoutButton
                  payload={{
                    kind: 'medicine',
                    productId: product.id,
                    pharmacyId: product.pharmacyId,
                    quantity,
                    prescriptionId: selectedPrescriptionId,
                    deliveryAddress,
                  }}
                  description={`${product.name} from ${product.pharmacyName}`}
                  disabled={deliveryAddress.trim().length < 10 || (product.requiresPrescription && !selectedPrescriptionId)}
                  onPaymentComplete={() => { void loadOrders(); }}
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
    <section className="mx-auto mt-6 max-w-6xl space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Your pharmacy orders</h2>
        <p className="mt-1 text-sm text-slate-600">Orders awaiting pharmacy review can be submitted for cancellation and administrator-reviewed refund.</p>
      </div>
      {orderError && <p role="alert" className="text-sm text-rose-700">{orderError}</p>}
      {orderNotice && <p role="status" className="text-sm text-emerald-700">{orderNotice}</p>}
      {!patientOrders.length && <p className="text-sm text-slate-500">Sign in to see current medicine orders. New orders will appear here after payment confirmation.</p>}
      {patientOrders.map((order) => (
        <article key={order.payment_order_id} className="space-y-2 rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <strong className="text-slate-900">{order.pharmacyName} · {order.status.replaceAll('_', ' ')}</strong>
            <span className="font-semibold text-teal-800">₹{(order.amount_in_paise / 100).toLocaleString('en-IN')}</span>
          </div>
          <p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleString()}</p>
          {order.items.map((item, index) => <p key={`${item.description}-${index}`} className="text-sm text-slate-700">{item.description} × {item.quantity}</p>)}
          {order.tracking_reference && <p className="text-sm text-slate-600">Tracking: {order.tracking_reference}</p>}
          {order.refunds.map((refund, index) => (
            <p key={`${refund.status}-${index}`} className="text-xs text-amber-700">Refund: {refund.status}</p>
          ))}
          {order.status === 'pharmacy_review' && (
            <button type="button" disabled={cancelingOrder === order.payment_order_id} onClick={() => void cancelOrder(order)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-semibold text-rose-700 disabled:opacity-50">
              {cancelingOrder === order.payment_order_id ? 'Submitting…' : 'Request cancellation'}
            </button>
          )}
        </article>
      ))}
    </section>
    </>
  );
}
