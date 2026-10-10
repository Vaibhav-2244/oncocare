'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Building2, CalendarDays, ClipboardList, Loader2, RefreshCw, Users } from 'lucide-react';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import {
  ensureDoctorWorkspace,
  loadDoctorHospitalDashboard,
  loadDoctorHospitalProfile,
  loadDoctorSummary,
  type DoctorDashboardSummary,
  type DoctorHospitalDashboard,
  type DoctorHospitalProfile,
} from '@/lib/doctor/api';
import { supabase } from '@/lib/supabase-client';

function DoctorDashboardContent() {
  const [summary, setSummary] = useState<DoctorDashboardSummary | null>(null);
  const [hospitalCare, setHospitalCare] = useState<DoctorHospitalDashboard>({ patients: [], appointments: [] });
  const [hospitalProfiles, setHospitalProfiles] = useState<DoctorHospitalProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureDoctorWorkspace();
      const [dashboardSummary, affiliations, hospitalDashboard] = await Promise.all([
        loadDoctorSummary(),
        loadDoctorHospitalProfile(),
        loadDoctorHospitalDashboard(),
      ]);
      setSummary(dashboardSummary);
      setHospitalProfiles(affiliations);
      setHospitalCare(hospitalDashboard);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the doctor workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channels = hospitalProfiles.map((profile) => supabase
      .channel(`doctor-care-team-${profile.hospital_id}-${profile.doctor_row_id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'hospital_doctor_care_team_assignments',
        filter: `hospital_id=eq.${profile.hospital_id}`,
      }, () => { void loadDoctorHospitalProfile().then(setHospitalProfiles).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to refresh the care team.')); })
      .subscribe());
    return () => { channels.forEach((channel) => { void supabase.removeChannel(channel); }); };
  }, [hospitalProfiles]);

  useEffect(() => {
    let active = true;
    const channels = hospitalProfiles.map((profile) => supabase
      .channel(`doctor-hospital-appointments-${profile.hospital_id}-${profile.doctor_row_id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'hospital_appointments',
        filter: `hospital_id=eq.${profile.hospital_id}`,
      }, () => {
        void loadDoctorHospitalDashboard()
          .then((dashboard) => { if (active) setHospitalCare(dashboard); })
          .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to refresh hospital assignments.'); });
      })
      .subscribe());
    return () => {
      active = false;
      channels.forEach((channel) => { void supabase.removeChannel(channel); });
    };
  }, [hospitalProfiles]);

  const kpis = summary?.kpis;
  const cards = [
    { label: 'Active patients', value: kpis?.active_patients, icon: Users, href: '/dashboard/doctor/patients', tone: 'teal' },
    { label: 'Hospital patients', value: hospitalCare.patients.length, icon: Building2, href: '/dashboard/doctor/patients', tone: 'teal' },
    { label: 'Appointments today', value: kpis?.appointments_today, icon: CalendarDays, href: '/dashboard/doctor/appointments', tone: 'blue' },
    { label: 'Needs confirmation', value: kpis?.pending_confirmations, icon: ClipboardList, href: '/dashboard/doctor/appointments', tone: 'amber' },
    { label: 'High risk', value: kpis?.high_risk, icon: AlertTriangle, href: '/dashboard/doctor/patients?risk=high', tone: 'rose' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-teal-700">Doctor workspace</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Good to see you</h1>
          <p className="mt-1 text-sm text-slate-500">A secure overview of your roster and today{"'"}s priorities.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {hospitalProfiles.map((profile) => (
        <section key={profile.doctor_row_id} className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Building2 className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900">{profile.hospital_name}</h2>
              <p className="text-sm text-slate-600">{profile.designation ?? 'Doctor'} · {profile.department ?? profile.specialty ?? 'Department not set'}</p>
              <div className="mt-4 grid gap-x-6 gap-y-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                <p><span className="font-medium">Doctor ID:</span> {profile.doctor_identifier ?? '—'}</p>
                <p><span className="font-medium">Employee ID:</span> {profile.employee_id ?? '—'}</p>
                <p><span className="font-medium">Qualification:</span> {profile.qualifications ?? '—'}</p>
                <p><span className="font-medium">Specialty:</span> {[profile.specialty, profile.subspecialty].filter(Boolean).join(' · ') || '—'}</p>
                <p><span className="font-medium">Registration:</span> {[profile.registration_no, profile.registration_council].filter(Boolean).join(' · ') || '—'}</p>
                <p><span className="font-medium">Experience:</span> {profile.years_experience == null ? '—' : `${profile.years_experience} years`}</p>
                <p><span className="font-medium">Employment:</span> {[profile.employment_type?.replaceAll('_', ' '), profile.employment_status.replaceAll('_', ' ')].filter(Boolean).join(' · ')}</p>
                <p><span className="font-medium">Room:</span> {profile.opd_room ?? '—'}</p>
                <p><span className="font-medium">Joining date:</span> {profile.joining_date ?? '—'}</p>
                <p><span className="font-medium">Official contact:</span> {[profile.official_email, profile.official_phone].filter(Boolean).join(' · ') || '—'}</p>
                <p><span className="font-medium">Verification:</span> {profile.verification_status ?? 'pending'}</p>
                <p><span className="font-medium">Emergency / on-call:</span> {profile.emergency_available ? 'Available' : 'Not listed'}</p>
              </div>
              <p className="mt-3 text-sm"><span className="font-medium">Working schedule:</span> {profile.shift_schedule.length
                ? profile.shift_schedule.map((shift) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][shift.day]} ${shift.start}-${shift.end}`).join(', ')
                : 'Not specified'}</p>
              <div className="mt-4 border-t pt-3">
                <h3 className="text-sm font-semibold text-slate-800">Assigned care team</h3>
                {!profile.care_team.length && <p className="mt-1 text-sm text-slate-500">No staff assigned.</p>}
                <ul className="mt-2 flex flex-wrap gap-2">{profile.care_team.map((member) => (
                  <li key={member.assignment_id} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{member.name} · {member.role.replaceAll('_', ' ')}{member.department ? ` · ${member.department}` : ''}</li>
                ))}</ul>
              </div>
            </div>
          </div>
        </section>
      ))}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, href, tone }) => {
          const toneClasses = {
            teal: 'bg-teal-50 text-teal-600',
            blue: 'bg-blue-50 text-blue-600',
            amber: 'bg-amber-50 text-amber-600',
            rose: 'bg-rose-50 text-rose-600',
          }[tone];
          return (
          <Link key={label} href={href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClasses}`}>
              <Icon className="h-5 w-5" />
            </div>
            <p className="mt-4 text-2xl font-bold text-slate-900">{loading ? <Loader2 className="h-6 w-6 animate-spin" /> : value ?? 0}</p>
            <p className="mt-1 text-sm text-slate-500">{label}</p>
          </Link>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-2xl border border-teal-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-100 bg-teal-50/60 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">Hospital-assigned care</h2>
            <p className="mt-1 text-sm text-slate-600">Patients and appointments assigned to you by your hospital.</p>
          </div>
          <Link href="/dashboard/doctor/appointments" className="text-sm font-semibold text-teal-800 underline underline-offset-4">View appointments</Link>
        </div>
        {hospitalCare.patients.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No hospital assignments are linked to your account yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {hospitalCare.patients.slice(0, 5).map((patient) => {
              const appointment = hospitalCare.appointments.find((item) => item.patient_id === patient.id);
              return (
                <div key={`${patient.hospital_id}-${patient.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="font-semibold text-slate-800">{patient.name} <span className="font-normal text-slate-500">({patient.identifier})</span></p>
                    <p className="mt-1 text-xs text-slate-500">{patient.hospital_name}</p>
                  </div>
                  {appointment && <p className="text-sm text-slate-600">{new Date(appointment.scheduled_at).toLocaleString()} · {appointment.status.replaceAll('_', ' ')}</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Patients needing attention</h2>
              <p className="mt-1 text-sm text-slate-500">Review risk and follow-up items from your roster.</p>
            </div>
            <Link href="/dashboard/doctor/patients" className="text-sm font-semibold text-teal-700 hover:underline">View roster</Link>
          </div>
          <div className="mt-5 divide-y divide-slate-100">
            {!loading && summary?.attention.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No patients need attention yet.</p>}
            {summary?.attention.map((patient) => (
              <Link href={`/dashboard/doctor/patients/${patient.id}`} key={patient.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{patient.full_name}</p>
                  <p className="text-xs text-slate-500">{patient.patient_code} · {patient.cancer_type || 'Cancer care'}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${patient.risk === 'high' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{patient.risk}</span>
              </Link>
            ))}
          </div>
        </section>
        <section className="lg:col-span-2 rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
          <h2 className="font-semibold">Quick actions</h2>
          <div className="mt-4 grid gap-2">
            <Link href="/dashboard/doctor/patients?new=1" className="rounded-xl bg-white/10 px-4 py-3 text-sm font-medium transition hover:bg-white/20">Add a patient</Link>
            <Link href="/dashboard/doctor/appointments" className="rounded-xl bg-white/10 px-4 py-3 text-sm font-medium transition hover:bg-white/20">Review appointments</Link>
            <Link href="/dashboard/profile" className="rounded-xl bg-white/10 px-4 py-3 text-sm font-medium transition hover:bg-white/20">Complete professional profile</Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function DoctorDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={DOCTOR_ROLES}>
      <DashboardLayout dashboardTitle="Doctor workspace">
        <DoctorDashboardContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
