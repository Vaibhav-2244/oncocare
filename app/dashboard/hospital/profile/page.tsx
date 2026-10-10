'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useHospital } from '@/lib/hospital/HospitalProvider';
import { callRpc } from '@/lib/hospital/api';

type HospitalProfile = {
  registration_number: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  emergency_phone: string;
};

const EMPTY_PROFILE: HospitalProfile = {
  registration_number: '',
  phone: '',
  email: '',
  website: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  emergency_phone: '',
};

const PROFILE_FIELDS: Array<{ key: keyof HospitalProfile; label: string; type?: string }> = [
  { key: 'registration_number', label: 'Hospital registration number' },
  { key: 'phone', label: 'Main contact phone', type: 'tel' },
  { key: 'email', label: 'Official email', type: 'email' },
  { key: 'website', label: 'Website', type: 'url' },
  { key: 'address', label: 'Street address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'pincode', label: 'PIN code' },
  { key: 'emergency_phone', label: 'Emergency contact phone', type: 'tel' },
];

export default function HospitalProfilePage() {
  const t = useTranslations('hospitalOps');
  const { org, can, refresh } = useHospital();
  const [profile, setProfile] = useState<HospitalProfile>(EMPTY_PROFILE);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!org) return;
    setName(org.name);
    setProfile({ ...EMPTY_PROFILE, ...org.settings?.hospital_profile as Partial<HospitalProfile> });
  }, [org]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!org) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await callRpc('update_hospital_org', {
        p_hospital_id: org.id,
        p_name: name,
        p_timezone: org.timezone,
        p_patient_id_label: org.patient_id_label,
        p_patient_id_prefix: org.patient_id_prefix,
        p_settings: {
          ...(org.settings ?? {}),
          hospital_profile: profile,
        },
      });
      await refresh();
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('operationFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (!org) return null;

  return (
    <section className="max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-950">Hospital profile</h1>
        <p className="mt-1 text-sm text-slate-600">Maintain your facility identity and official contact details.</p>
      </header>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {saved && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Hospital profile saved.</p>}
      <form onSubmit={(event) => void save(event)} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">
          Hospital name
          <input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          {PROFILE_FIELDS.map(({ key, label, type = 'text' }) => (
            <label key={key} className="block text-sm font-medium text-slate-700">
              {label}
              <input
                type={type}
                value={profile[key]}
                onChange={(event) => setProfile((current) => ({ ...current, [key]: event.target.value }))}
                className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3"
              />
            </label>
          ))}
        </div>
        <button type="submit" disabled={busy || !can('config.manage')} className="min-h-11 rounded-md bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Saving…' : t('saveSettings')}
        </button>
      </form>
    </section>
  );
}
