'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';

type DemoKind = 'caregiver' | 'booking' | 'tele-oncology' | 'medicine' | 'insurance';
type DemoEntry = {
  id: string;
  slug: string;
  kind: DemoKind;
  provider_label: string;
  service_name: string;
  description: string;
  amount_in_paise: number;
  pricing_unit: string;
  available_weekdays: number[];
  daily_start_time: string;
  daily_end_time: string;
  active: boolean;
};

const blank = {
  slug: '',
  kind: 'caregiver' as DemoKind,
  providerLabel: 'DEMO: Training Provider',
  serviceName: 'DEMO: Booking simulation',
  description: 'Pre-launch demonstration only. No real service or goods are provided.',
  amount: '100',
  pricingUnit: 'per demo booking',
  availableWeekdays: [0, 1, 2, 3, 4, 5, 6],
  dailyStartTime: '00:00',
  dailyEndTime: '23:59',
  active: true,
};

export function PrelaunchDemoAdmin() {
  const [entries, setEntries] = useState<DemoEntry[]>([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const accessToken = await token();
      if (!accessToken) throw new Error('Sign in again to manage demo items.');
      const response = await fetch('/api/payments/admin/demo-catalog', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load demo items.');
      setEntries(payload.entries ?? []);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load demo items.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const edit = (entry: DemoEntry) => {
    setEditingId(entry.id);
    setForm({
      slug: entry.slug,
      kind: entry.kind,
      providerLabel: entry.provider_label,
      serviceName: entry.service_name,
      description: entry.description,
      amount: (entry.amount_in_paise / 100).toFixed(2),
      pricingUnit: entry.pricing_unit,
      availableWeekdays: entry.available_weekdays,
      dailyStartTime: entry.daily_start_time.slice(0, 5),
      dailyEndTime: entry.daily_end_time.slice(0, 5),
      active: entry.active,
    });
    setNotice('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const accessToken = await token();
      const amountInPaise = Math.round(Number(form.amount) * 100);
      if (!accessToken || !Number.isSafeInteger(amountInPaise) || amountInPaise < 100) {
        throw new Error('Enter a demo amount of at least ₹1 and sign in again if required.');
      }
      const response = await fetch('/api/payments/admin/demo-catalog', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          slug: form.slug,
          kind: form.kind,
          providerLabel: form.providerLabel,
          serviceName: form.serviceName,
          description: form.description,
          amountInPaise,
          pricingUnit: form.pricingUnit,
          availableWeekdays: form.availableWeekdays,
          dailyStartTime: form.dailyStartTime,
          dailyEndTime: form.dailyEndTime,
          active: form.active,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to save demo item.');
      setNotice(editingId ? 'Demo item updated.' : 'Demo item created.');
      setForm(blank);
      setEditingId('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save demo item.');
    } finally {
      setSaving(false);
    }
  };

  const updateForm = <K extends keyof typeof blank>(key: K, value: (typeof blank)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="space-y-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5" aria-label="Pre-launch demo catalogue administration">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-amber-900">DEMO ONLY</p>
        <h2 className="text-lg font-semibold text-slate-900">Pre-launch demo catalogue</h2>
        <p className="mt-1 text-sm text-slate-700">Only administrator-managed items labelled DEMO are accepted. Live purchases require server configuration, tester allowlisting, per-payment consent and a registered merchant account. This form cannot enable Live Mode.</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-white p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-white p-3 text-sm text-emerald-700">{notice}</p>}
      <form onSubmit={(event) => void submit(event)} className="grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium">Demo category
          <select value={form.kind} onChange={(event) => updateForm('kind', event.target.value as DemoKind)} className="mt-1 block w-full rounded-lg border p-2">
            <option value="caregiver">Caregiver</option>
            <option value="booking">Cook / maid</option>
            <option value="tele-oncology">Consultation simulation</option>
            <option value="medicine">Medicine simulation</option>
            <option value="insurance">Insurance simulation</option>
          </select>
        </label>
        <label className="text-sm font-medium">Unique slug
          <input required pattern="[a-z0-9-]{3,80}" value={form.slug} onChange={(event) => updateForm('slug', event.target.value)} className="mt-1 block w-full rounded-lg border p-2" />
        </label>
        <label className="text-sm font-medium">Provider label (must start DEMO:)
          <input required value={form.providerLabel} onChange={(event) => updateForm('providerLabel', event.target.value)} className="mt-1 block w-full rounded-lg border p-2" />
        </label>
        <label className="text-sm font-medium">Service label (must start DEMO:)
          <input required value={form.serviceName} onChange={(event) => updateForm('serviceName', event.target.value)} className="mt-1 block w-full rounded-lg border p-2" />
        </label>
        <label className="text-sm font-medium">Amount (INR)
          <input required type="number" min="1" max="1000000" step="0.01" value={form.amount} onChange={(event) => updateForm('amount', event.target.value)} className="mt-1 block w-full rounded-lg border p-2" />
        </label>
        <label className="text-sm font-medium">Price unit
          <input required maxLength={40} value={form.pricingUnit} onChange={(event) => updateForm('pricingUnit', event.target.value)} className="mt-1 block w-full rounded-lg border p-2" />
        </label>
        <fieldset className="md:col-span-2">
          <legend className="text-sm font-medium">Available demo days</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {[['Sun', 0], ['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6]].map(([label, day]) => (
              <label key={day} className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.availableWeekdays.includes(Number(day))}
                  onChange={(event) => updateForm(
                    'availableWeekdays',
                    event.target.checked
                      ? [...form.availableWeekdays, Number(day)].sort()
                      : form.availableWeekdays.filter((value) => value !== Number(day)),
                  )}
                />
                {label}
              </label>
            ))}
          </div>
          {form.availableWeekdays.length === 0 && <p className="mt-1 text-sm text-rose-700">Select at least one available day.</p>}
        </fieldset>
        <label className="text-sm font-medium">Daily start time
          <input type="time" required value={form.dailyStartTime} onChange={(event) => updateForm('dailyStartTime', event.target.value)} className="mt-1 block w-full rounded-lg border p-2" />
        </label>
        <label className="text-sm font-medium">Daily end time
          <input type="time" required value={form.dailyEndTime} onChange={(event) => updateForm('dailyEndTime', event.target.value)} className="mt-1 block w-full rounded-lg border p-2" />
        </label>
        <label className="text-sm font-medium md:col-span-2">Disclosure
          <textarea maxLength={1000} value={form.description} onChange={(event) => updateForm('description', event.target.value)} className="mt-1 block w-full rounded-lg border p-2" rows={2} />
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(event) => updateForm('active', event.target.checked)} /> Active for authorized demo testers</label>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-amber-800 px-4 py-2 font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {editingId ? 'Save demo item' : 'Create demo item'}
          </button>
          {editingId && <button type="button" onClick={() => { setEditingId(''); setForm(blank); }} className="rounded-lg border px-4 py-2">Cancel</button>}
        </div>
      </form>
      {loading ? <p className="text-sm">Loading demo catalogue…</p> : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <article key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3 text-sm">
              <div>
                <p className="font-semibold">{entry.provider_label} · {entry.service_name}</p>
                <p>{entry.kind} · ₹{(entry.amount_in_paise / 100).toFixed(2)} · {entry.active ? 'active' : 'inactive'} · {entry.available_weekdays.map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]).join(', ')}</p>
              </div>
              <button type="button" onClick={() => edit(entry)} className="rounded-lg border px-3 py-1.5 font-medium">Edit / disable</button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
