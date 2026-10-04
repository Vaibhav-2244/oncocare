'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Activity, Bell, FileText, ShieldCheck, Stethoscope, User } from 'lucide-react';
import { getCaregiverPatientById, type CaregiverPatient } from '@/lib/caregiver';

const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'medications', label: 'Medications' },
  { key: 'reports', label: 'Reports' },
  { key: 'timeline', label: 'Timeline' },
];

export default function CaregiverPatientDetailPage() {
  const params = useParams<{ patientId: string }>();
  const patientId = decodeURIComponent(params.patientId || '');
  const [patient, setPatient] = useState<CaregiverPatient | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await getCaregiverPatientById(patientId);
        if (active) setPatient(data);
      } catch {
        if (active) setPatient(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    if (patientId) {
      void load();
    }

    return () => { active = false; };
  }, [patientId]);

  const overviewCards = useMemo(() => [
    { label: 'Care relationship', value: patient?.relationship || 'Caregiver', icon: User },
    { label: 'Status', value: patient?.status || 'pending', icon: ShieldCheck },
    { label: 'Email', value: patient?.patient_email || 'Not provided', icon: FileText },
    { label: 'Phone', value: patient?.patient_phone || 'Not provided', icon: Bell },
  ], [patient]);

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Loading patient details…</div>;
  }

  if (!patient) {
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Patient not found</h1>
        <p className="text-sm text-slate-600">This patient is not linked to your caregiver account.</p>
        <Link href="/dashboard/caregiver/patients" className="inline-flex items-center text-sm font-semibold text-teal-700 hover:text-teal-800">
          Back to patients
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">Patient profile</p>
            <h1 className="text-2xl font-bold text-slate-900">{patient.patient_name}</h1>
          </div>
          <Link href="/dashboard/caregiver/patients" className="text-sm font-semibold text-teal-700 hover:text-teal-800">
            ← Back to patients
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700">
              <Icon className="h-5 w-5" />
            </div>
            <div className="mt-4 text-sm text-slate-500">{label}</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                activeTab === tab.key ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          {activeTab === 'overview' && (
            <div className="space-y-3">
              <p><strong className="text-slate-900">Relationship:</strong> {patient.relationship}</p>
              <p><strong className="text-slate-900">Notifications:</strong> {patient.notification_enabled ? 'Enabled' : 'Disabled'}</p>
              <p><strong className="text-slate-900">Linked since:</strong> {new Date(patient.created_at).toLocaleDateString()}</p>
            </div>
          )}

          {activeTab === 'medications' && (
            <div className="flex items-center gap-2 text-slate-700">
              <Stethoscope className="h-4 w-4 text-teal-600" />
              Medication tracking is available through the patient dashboard and medication workflows.
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="flex items-center gap-2 text-slate-700">
              <FileText className="h-4 w-4 text-teal-600" />
              Patient reports and lab records will appear here when connected to the patient record.
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="flex items-center gap-2 text-slate-700">
              <Activity className="h-4 w-4 text-teal-600" />
              Recent care activity and follow-up history can be surfaced here in a future integration pass.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
