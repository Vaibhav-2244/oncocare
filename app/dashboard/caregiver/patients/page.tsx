'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, UserPlus, Users } from 'lucide-react';
import { getCaregiverPatients, type CaregiverPatient } from '@/lib/caregiver';

export default function CaregiverPatientsPage() {
  const [patients, setPatients] = useState<CaregiverPatient[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await getCaregiverPatients();
        if (active) setPatients(data);
      } catch {
        if (active) setPatients([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, []);

  const filteredPatients = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter((patient) =>
      patient.patient_name.toLowerCase().includes(term) ||
      patient.relationship.toLowerCase().includes(term) ||
      (patient.patient_email || '').toLowerCase().includes(term),
    );
  }, [patients, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-700">Patients</p>
          <h1 className="text-2xl font-bold text-slate-900">My Patients</h1>
        </div>
        <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
          <UserPlus className="h-4 w-4" />
          Link a patient
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-500">
          <Search className="h-4 w-4" />
          <input
            aria-label="Search patients"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Search patient or relation"
          />
        </div>
      </div>

      <div className="grid gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          ))
        ) : filteredPatients.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
            No active or pending patient links were found for this caregiver account.
          </div>
        ) : (
          filteredPatients.map((patient) => (
            <div key={patient.relationship_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{patient.patient_name}</h2>
                    <p className="text-sm text-slate-500">{patient.patient_email || patient.patient_phone || patient.relationship}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${patient.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {patient.status}
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                <span>{patient.relationship}</span>
                <Link href={`/dashboard/caregiver/patients/${encodeURIComponent(patient.patient_id)}`} className="font-semibold text-teal-700 hover:text-teal-800">
                  Open patient
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
