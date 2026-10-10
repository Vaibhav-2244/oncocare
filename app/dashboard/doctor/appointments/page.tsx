'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import {
  ensureDoctorWorkspace,
  listDoctorPatients,
  loadDoctorHospitalDashboard,
  updateDoctorAppointmentStatus,
  type DoctorAppointment,
  type DoctorHospitalAppointment,
  type DoctorHospitalPatient,
  type DoctorPatient,
} from '@/lib/doctor/api';
import { supabase } from '@/lib/supabase-client';

type Appointment = DoctorAppointment;

function AppointmentsContent() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [hospitalAppointments, setHospitalAppointments] = useState<DoctorHospitalAppointment[]>([]);
  const [hospitalPatients, setHospitalPatients] = useState<DoctorHospitalPatient[]>([]);
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [reason, setReason] = useState('');
  const [hospitalPatientId, setHospitalPatientId] = useState('');
  const [hospitalStartsAt, setHospitalStartsAt] = useState('');
  const [hospitalKind, setHospitalKind] = useState('opd');
  const [hospitalReason, setHospitalReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      await ensureDoctorWorkspace();
      const [appointmentsResult, patientsResult, hospitalCare] = await Promise.all([
        supabase.rpc('doctor_list_appointments', { p_from: new Date().toISOString(), p_to: new Date(Date.now() + 30 * 86400000).toISOString() }),
        listDoctorPatients(),
        loadDoctorHospitalDashboard(),
      ]);
      if (appointmentsResult.error) throw new Error(appointmentsResult.error.message);
      setAppointments((appointmentsResult.data || []) as Appointment[]);
      setPatients(patientsResult.rows);
      setHospitalPatients(hospitalCare.patients);
      setHospitalAppointments(hospitalCare.appointments);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load appointments.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('doctor_create_appointment', { p_patient_id: patientId, p_at: new Date(startsAt).toISOString(), p_visit_type: 'follow_up', p_reason: reason || null, p_duration: 30 });
      if (rpcError) throw new Error(rpcError.message);
      setAppointments((current) => [...current, data as Appointment].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      setPatientId(''); setStartsAt(''); setReason('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create appointment.'); }
  };

  const submitHospitalAppointment = async (event: FormEvent) => {
    event.preventDefault();
    const patient = hospitalPatients.find((item) => item.id === hospitalPatientId);
    if (!patient) {
      setError('Select a patient assigned to you by your hospital.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('doctor_create_hospital_appointment', {
        p_hospital_id: patient.hospital_id,
        p_patient_id: patient.id,
        p_scheduled_at: new Date(hospitalStartsAt).toISOString(),
        p_kind: hospitalKind,
        p_reason: hospitalReason.trim() || null,
      });
      if (rpcError) throw new Error(rpcError.message);
      setHospitalPatientId('');
      setHospitalStartsAt('');
      setHospitalKind('opd');
      setHospitalReason('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create hospital appointment.');
    } finally {
      setBusy(false);
    }
  };

  const updateAppointmentStatus = async (appointment: Appointment, status: Appointment['status']) => {
    setUpdatingAppointmentId(appointment.id);
    setError(null);
    try {
      const updated = await updateDoctorAppointmentStatus(appointment.id, status);
      setAppointments((current) => current.map((row) => row.id === updated.id ? updated : row));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update appointment.');
    } finally {
      setUpdatingAppointmentId(null);
    }
  };

  const patientName = (id: string) => patients.find((patient) => patient.id === id)?.full_name || 'Patient';

  return <div className="space-y-6"><div><p className="text-sm font-medium text-teal-700">Schedule</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Appointments</h1><p className="mt-1 text-sm text-slate-500">Create and review visits from your available roster.</p></div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
    <section className="overflow-hidden rounded-2xl border border-teal-100 bg-white shadow-sm">
      <div className="border-b border-teal-100 bg-teal-50/60 px-5 py-4">
        <h2 className="font-semibold text-slate-900">Hospital-assigned appointments</h2>
        <p className="mt-1 text-sm text-slate-600">Appointments scheduled for you by your hospital.</p>
      </div>
      {hospitalAppointments.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">No upcoming hospital appointments.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {hospitalAppointments.map((appointment) => (
            <article key={appointment.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><CalendarDays className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">{appointment.patient_name} <span className="font-normal text-slate-500">({appointment.patient_identifier})</span></p>
                <p className="text-sm text-slate-500">{new Date(appointment.scheduled_at).toLocaleString()} · {appointment.hospital_name} · {appointment.kind.replaceAll('_', ' ')}</p>
                {appointment.reason && <p className="mt-1 text-sm text-slate-600">{appointment.reason}</p>}
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{appointment.status.replaceAll('_', ' ')}</span>
            </article>
          ))}
        </div>
      )}
    </section>
    <section className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">Book hospital appointment</h2>
      <p className="mt-1 text-sm text-slate-600">Choose an assigned hospital patient. The hospital schedule and your active shift are checked before booking.</p>
      {hospitalPatients.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">You do not have any patients assigned by a verified hospital yet.</p> : (
        <form onSubmit={submitHospitalAppointment} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm font-medium text-slate-700">Patient<select required value={hospitalPatientId} onChange={(event) => setHospitalPatientId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal"><option value="">Select assigned patient</option>{hospitalPatients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name} ({patient.identifier}) · {patient.hospital_name}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Date &amp; time<input required type="datetime-local" value={hospitalStartsAt} onChange={(event) => setHospitalStartsAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
          <label className="text-sm font-medium text-slate-700">Visit type<select value={hospitalKind} onChange={(event) => setHospitalKind(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal"><option value="opd">OPD</option><option value="follow_up">Follow-up</option><option value="referral">Referral</option></select></label>
          <label className="text-sm font-medium text-slate-700">Reason<input value={hospitalReason} onChange={(event) => setHospitalReason(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label>
          <div className="flex items-end"><button type="submit" disabled={busy} className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? 'Booking…' : 'Book hospital visit'}</button></div>
        </form>
      )}
    </section>
    <section className="space-y-3">
      <div><h2 className="font-semibold text-slate-900">Standalone patient appointments</h2><p className="mt-1 text-sm text-slate-600">These are personal roster visits and do not appear in a hospital schedule.</p></div>
      <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-4"><label className="text-sm font-medium text-slate-700">Patient<select required value={patientId} onChange={(event) => setPatientId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal"><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} ({patient.patient_code})</option>)}</select></label><label className="text-sm font-medium text-slate-700">Date &amp; time<input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label><label className="text-sm font-medium text-slate-700">Reason<input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label><div className="flex items-end"><button type="submit" className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">Book visit</button></div></form>
    </section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="divide-y divide-slate-100">{appointments.length === 0 ? <p className="px-5 py-12 text-center text-sm text-slate-500">No appointments in the next 30 days.</p> : appointments.map((appointment) => {
      const nextStatuses: Appointment['status'][] = appointment.status === 'pending'
        ? ['confirmed', 'cancelled']
        : appointment.status === 'confirmed'
          ? ['completed', 'no_show', 'cancelled']
          : [];
      return <div key={appointment.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><CalendarDays className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{patientName(appointment.doctor_patient_id)}</p><p className="text-sm text-slate-500">{new Date(appointment.starts_at).toLocaleString()} · {appointment.reason || 'Follow-up visit'}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{appointment.status.replaceAll('_', ' ')}</span>{nextStatuses.map((status) => <button key={status} type="button" disabled={updatingAppointmentId === appointment.id} onClick={() => void updateAppointmentStatus(appointment, status)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold capitalize text-slate-700 hover:bg-slate-50 disabled:opacity-50">{updatingAppointmentId === appointment.id ? 'Saving…' : status.replaceAll('_', ' ')}</button>)}</div>;
    })}</div></section>
  </div>;
}

export default function DoctorAppointmentsPage() { return <ProtectedRoute allowedRoles={DOCTOR_ROLES}><DashboardLayout dashboardTitle="Appointments"><AppointmentsContent /></DashboardLayout></ProtectedRoute>; }
