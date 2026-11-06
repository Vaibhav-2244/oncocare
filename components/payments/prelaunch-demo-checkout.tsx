'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { PRELAUNCH_PILOT_MERCHANT_LABEL } from '@/lib/payments/constants';
import { PaymentCheckoutButton } from '@/components/payments/checkout-button';

type DemoKind = 'caregiver' | 'booking' | 'tele-oncology' | 'medicine' | 'insurance';
type DemoEntry = {
  id: string;
  kind: DemoKind;
  provider_label: string;
  service_name: string;
  description: string;
  amount_in_paise: number;
  pricing_unit: string;
  available_weekdays: number[];
  daily_start_time: string;
  daily_end_time: string;
};
type DemoBooking = {
  id: string;
  kind: string;
  provider_label: string;
  service_name: string;
  requested_date: string | null;
  requested_start_time: string | null;
  requested_end_time: string | null;
  amount_in_paise: number;
  payment_mode: 'test' | 'live';
  status: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function PrelaunchDemoCheckout({ kind, title }: { kind: DemoKind; title: string }) {
  const [entries, setEntries] = useState<DemoEntry[]>([]);
  const [bookings, setBookings] = useState<DemoBooking[]>([]);
  const [mode, setMode] = useState<'test' | 'live' | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const [liveConsent, setLiveConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sign in to use the pre-launch checkout.');
      const [catalogResponse, bookingsResponse] = await Promise.all([
        fetch(`/api/payments/demo-catalog?kind=${encodeURIComponent(kind)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
        fetch('/api/payments/demo-bookings', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
      ]);
      const [catalog, bookingPayload] = await Promise.all([
        catalogResponse.json().catch(() => ({})),
        bookingsResponse.json().catch(() => ({})),
      ]);
      if (!catalogResponse.ok) throw new Error(catalog.error || 'Unable to load demo items.');
      if (!bookingsResponse.ok) throw new Error(bookingPayload.error || 'Unable to load demo payment history.');
      setEntries(catalog.entries ?? []);
      setBookings((bookingPayload.bookings ?? []).filter((item: DemoBooking) => item.kind === kind));
      setMode(catalog.mode);
      setSelectedId((current) => current && (catalog.entries ?? []).some((item: DemoEntry) => item.id === current)
        ? current
        : catalog.entries?.[0]?.id ?? '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load demo checkout.');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const selected = entries.find((entry) => entry.id === selectedId);
  const requiresAppointment = kind === 'caregiver' || kind === 'booking' || kind === 'tele-oncology';
  const amount = selected ? (selected.amount_in_paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : null;

  return (
    <section className="mx-auto my-6 max-w-6xl rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm" aria-label={`${title} pre-launch demo checkout`}>
      <p className="text-xs font-bold uppercase tracking-wide text-amber-900">DEMO / PRE-LAUNCH ONLY</p>
      <h2 className="mt-1 text-xl font-bold text-slate-900">{title} payment simulation</h2>
      {mode === 'test' ? (
        <p className="mt-2 text-sm text-slate-700">Razorpay Test Mode only. This simulates checkout and does not collect real money or provide the displayed service or goods.</p>
      ) : (
        <p className="mt-2 text-sm font-semibold text-rose-800">LIVE PRE-LAUNCH PILOT: A successful payment charges the shown amount to the registered OncoCare+ merchant. No real-world service or goods are provided.</p>
      )}
      {loading && <p className="mt-3 text-sm text-slate-600">Loading demo items…</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-white p-3 text-sm text-rose-700">{error}</p>}
      {!loading && !error && entries.length === 0 && <p className="mt-3 text-sm text-slate-700">No active DEMO items are configured for this category.</p>}
      {selected && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-800">
              DEMO provider / offer
              <select value={selected.id} onChange={(event) => {
                setSelectedId(event.target.value);
                setDisclosureAccepted(false);
                setLiveConsent(false);
              }} className="mt-1 block w-full rounded-lg border border-amber-400 bg-white p-2">
                {entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.provider_label} — {entry.service_name}</option>)}
              </select>
            </label>
            <p className="text-sm text-slate-700">{selected.description}</p>
            <p className="text-lg font-bold text-slate-900">Demo amount: ₹{amount}</p>
            {requiresAppointment && (
              <>
                <label className="block text-sm font-medium text-slate-800">
                  Demo date
                  <input type="date" min={today()} value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-amber-400 bg-white p-2" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium text-slate-800">
                    Start time
                    <input type="time" value={startTime} min={selected.daily_start_time.slice(0, 5)} max={selected.daily_end_time.slice(0, 5)} onChange={(event) => setStartTime(event.target.value)} className="mt-1 block w-full rounded-lg border border-amber-400 bg-white p-2" />
                  </label>
                  <label className="block text-sm font-medium text-slate-800">
                    End time
                    <input type="time" value={endTime} min={selected.daily_start_time.slice(0, 5)} max={selected.daily_end_time.slice(0, 5)} onChange={(event) => setEndTime(event.target.value)} className="mt-1 block w-full rounded-lg border border-amber-400 bg-white p-2" />
                  </label>
                </div>
                <label className="block text-sm font-medium text-slate-800">
                  Demo location
                  <input maxLength={240} value={location} onChange={(event) => setLocation(event.target.value)} className="mt-1 block w-full rounded-lg border border-amber-400 bg-white p-2" placeholder="Demo location only" />
                </label>
              </>
            )}
          </div>
          <div className="space-y-3 rounded-xl border border-amber-300 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">Please read before continuing</p>
            <p className="text-sm text-slate-700">This pre-launch pilot payment is an internal merchant payment only. It does not guarantee or purchase any real-world service, charitable donation, insurance coverage, medical consultation, medicine, or other fulfilment. Demo listings are fictional and are not verified providers or products.</p>
            <label className="flex items-start gap-2 text-sm text-slate-800">
              <input type="checkbox" checked={disclosureAccepted} onChange={(event) => {
                setDisclosureAccepted(event.target.checked);
                if (!event.target.checked) setLiveConsent(false);
              }} />
              <span>I understand this is an internal pre-launch pilot payment, not a real service, donation, insurance policy, consultation, medicine order, or fulfilment.</span>
            </label>
            {mode === 'live' && (
              <label className="flex items-start gap-2 text-sm font-semibold text-rose-800">
                <input type="checkbox" checked={liveConsent} onChange={(event) => setLiveConsent(event.target.checked)} />
                <span>I explicitly authorize a LIVE pre-launch pilot charge of ₹{amount} to {PRELAUNCH_PILOT_MERCHANT_LABEL}. This is an internal merchant payment only and does not guarantee or purchase a real-world service, donation, insurance, consultation, medicine, or other fulfilment.</span>
              </label>
            )}
            <PaymentCheckoutButton
              payload={{
                kind,
                demoCatalogId: selected.id,
                demoDisclosureAccepted: disclosureAccepted,
                liveDemoConsent: mode === 'live' && liveConsent,
                ...(requiresAppointment ? { bookingDate, startTime, endTime, location: location.trim() } : {}),
              }}
              description={`${selected.service_name} (pre-launch demo)`}
              disabled={!disclosureAccepted || (mode === 'live' && !liveConsent) || (requiresAppointment && (!bookingDate || !startTime || !endTime || !location.trim()))}
              onPaymentComplete={() => setRefreshKey((value) => value + 1)}
            />
          </div>
        </div>
      )}
      {bookings.length > 0 && (
        <div className="mt-5">
          <h3 className="font-semibold text-slate-900">Your demo payment records</h3>
          <ul className="mt-2 space-y-2">
            {bookings.map((booking) => (
              <li key={booking.id} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
                <span className="font-semibold">{booking.service_name}</span>
                {' — '}₹{(booking.amount_in_paise / 100).toFixed(2)}
                {' — '}{booking.payment_mode.toUpperCase()} / {booking.status.replaceAll('_', ' ')}
                {booking.requested_date ? ` — ${booking.requested_date} ${booking.requested_start_time ?? ''}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function PrelaunchDemoDonation() {
  const [amount, setAmount] = useState('500');
  const [acknowledged, setAcknowledged] = useState(false);
  const [testModeAvailable, setTestModeAvailable] = useState(false);
  const [mode, setMode] = useState<'test' | 'live' | null>(null);
  const [livePilotAvailable, setLivePilotAvailable] = useState(false);
  const [pilotMissingSettings, setPilotMissingSettings] = useState<string[]>([]);
  const [checkoutError, setCheckoutError] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch('/api/payments/config', { cache: 'no-store' })
      .then(async (response) => {
        const config = await response.json().catch(() => ({}));
        if (active) {
          setMode(config.mode === 'test' || config.mode === 'live' ? config.mode : null);
          setTestModeAvailable(response.ok && config.enabled === true && config.mode === 'test' && config.demoPaymentsEnabled === true);
          setLivePilotAvailable(response.ok && config.enabled === true && config.liveDemoPaymentsEnabled === true);
          setPilotMissingSettings(config.configuration?.prelaunchDemoMissingVariables ?? []);
          setCheckoutError(config.prelaunchDemoConfigurationError ?? config.configurationError ?? '');
        }
      })
      .catch(() => {
        if (active) setTestModeAvailable(false);
      })
      .finally(() => {
        if (active) setConfigLoaded(true);
      });
    return () => { active = false; };
  }, []);
  const paise = /^\d{1,6}(\.\d{1,2})?$/.test(amount) ? Math.round(Number(amount) * 100) : 0;
  const valid = Number.isSafeInteger(paise) && paise >= 100 && paise <= 100000000;
  return (
    <section className="mx-auto my-6 max-w-6xl rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-amber-900">TEST MODE SIMULATION ONLY</p>
      <h2 className="mt-1 text-xl font-bold text-slate-900">Simulate a donation checkout</h2>
      <p className="mt-2 text-sm text-slate-700">No beneficiary or campaign receives funds. Test Mode only: this is not a charitable contribution and no real money is collected. Fictional patient profiles below cannot receive payments.</p>
      {configLoaded && mode === 'live' ? (
        <div role="status" className="mt-3 rounded-lg border border-amber-300 bg-white p-3 text-sm text-slate-800">
          This no-beneficiary donation simulation is intentionally Test Mode only. {livePilotAvailable
            ? <>For a disclosed ₹100 Live internal pilot charge (not a donation or service purchase), open <Link className="font-semibold text-teal-800 underline" href="/medicine-finder">Medicine Finder</Link> and choose the DEMO checkout.</>
            : <>The Live pilot is not ready. {pilotMissingSettings.length ? `Configure or enable: ${pilotMissingSettings.join(', ')}.` : 'Check the Live pilot flags and sign in to an OncoCare+ account.'}</>}
        </div>
      ) : (
        <>
          {configLoaded && !testModeAvailable && (
            <p role="status" className="mt-2 text-sm font-medium text-amber-900">
              {checkoutError || 'Test Mode simulation is unavailable. Check PAYMENTS_ENABLED, matching Test Mode Razorpay credentials and webhook secret, Supabase server configuration, PRELAUNCH_DEMO_MODE, and DEMO_PAYMENTS_ENABLED.'}
            </p>
          )}
          <label className="mt-3 block max-w-xs text-sm font-medium text-slate-800">
            Test amount (₹)
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-amber-400 bg-white p-2" />
          </label>
          <label className="mt-3 flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
            <span>I understand this is a simulated Test Mode transaction with no charitable beneficiary.</span>
          </label>
          <PaymentCheckoutButton
            payload={{ kind: 'donation', donationAmountInPaise: paise, demoDisclosureAccepted: acknowledged }}
            description="Simulated donation - no beneficiary"
            disabled={!valid || !acknowledged || !testModeAvailable}
          />
        </>
      )}
    </section>
  );
}
