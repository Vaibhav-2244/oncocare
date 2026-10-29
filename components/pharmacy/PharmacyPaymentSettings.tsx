'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';

type PharmacyPaymentSetting = {
  id: string;
  name: string;
  verification_status: string;
  home_delivery: boolean;
  online_delivery_fee_in_paise: number | null;
  canManageFee: boolean;
};

export function PharmacyPaymentSettings() {
  const [pharmacies, setPharmacies] = useState<PharmacyPaymentSetting[]>([]);
  const [pharmacyId, setPharmacyId] = useState('');
  const [fee, setFee] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Sign in before loading pharmacy payment settings.');
    const response = await fetch('/api/payments/pharmacy/settings', {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to load pharmacy payment settings.');
    setPharmacies(payload.pharmacies ?? []);
    const selected = (payload.pharmacies ?? []).find((pharmacy: PharmacyPaymentSetting) => pharmacy.canManageFee);
    if (selected) {
      setPharmacyId(selected.id);
      setFee(selected.online_delivery_fee_in_paise === null ? '' : String(selected.online_delivery_fee_in_paise / 100));
    }
  }, []);

  useEffect(() => {
    let active = true;
    void load()
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load pharmacy payment settings.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  const selected = pharmacies.find((pharmacy) => pharmacy.id === pharmacyId);
  const save = async () => {
    const feeInPaise = Math.round(Number(fee) * 100);
    if (!selected?.canManageFee || !Number.isSafeInteger(feeInPaise) || feeInPaise < 0) {
      setError('Enter a non-negative delivery fee in rupees and use a pharmacy administrator account.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in again before updating delivery pricing.');
      const response = await fetch('/api/payments/pharmacy/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ pharmacyId, deliveryFeeInPaise: feeInPaise }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save delivery pricing.');
      setNotice(`Delivery fee saved at ₹${(payload.deliveryFeeInPaise / 100).toLocaleString('en-IN')}.`);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save delivery pricing.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading payment settings…</p>;
  return (
    <section className="max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">Online delivery pricing</h2>
        <p className="mt-1 text-sm text-slate-600">The fee is added to the server-calculated medicine total. Leave it unconfigured until your pharmacy approves a rate.</p>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
      {!pharmacies.length && <p className="text-sm text-slate-500">No active pharmacy membership is available.</p>}
      {pharmacies.length > 0 && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Pharmacy
            <select
              value={pharmacyId}
              onChange={(event) => {
                const next = pharmacies.find((pharmacy) => pharmacy.id === event.target.value);
                setPharmacyId(event.target.value);
                setFee(next?.online_delivery_fee_in_paise === null || next?.online_delivery_fee_in_paise === undefined
                  ? '' : String(next.online_delivery_fee_in_paise / 100));
              }}
              className="mt-1 block w-full rounded-lg border border-slate-300 p-2"
            >
              {pharmacies.map((pharmacy) => (
                <option key={pharmacy.id} value={pharmacy.id}>
                  {pharmacy.name}{pharmacy.canManageFee ? '' : ' (read-only)'}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <p className="text-xs text-slate-500">
              Verification: {selected.verification_status}; home delivery: {selected.home_delivery ? 'enabled' : 'disabled'}.
            </p>
          )}
          <label className="block text-sm font-medium text-slate-700">
            Approved delivery fee (₹)
            <input
              type="number"
              min="0"
              step="0.01"
              value={fee}
              onChange={(event) => setFee(event.target.value)}
              disabled={!selected?.canManageFee}
              className="mt-1 block w-full rounded-lg border border-slate-300 p-2 disabled:bg-slate-100"
            />
          </label>
          <button type="button" onClick={() => void save()} disabled={saving || !selected?.canManageFee} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save approved fee
          </button>
        </div>
      )}
    </section>
  );
}
