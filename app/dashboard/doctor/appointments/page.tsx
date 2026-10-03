'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ensureDoctorWorkspace, listDoctorPatients, type DoctorPatient } from '@/lib/doctor/api';
import { supabase } from '@/lib/supabase-client';

type Appointment = { id: string; doctor_patient_id: string; starts_at: string; visit_type: string; status: string; reason: string | null };

function AppointmentsContent() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      await ensureDoctorWorkspace();
      const [appointmentsResult, patientsResult] = await Promise.all([
        supabase.rpc('doctor_list_appointments', { p_from: new Date().toISOString(), p_to: new Date(Date.now() + 30 * 86400000).toISOString() }),
        listDoctorPatients(),
      ]);
      if (appointmentsResult.error) throw new Error(appointmentsResult.error.message);
      setAppointments((appointmentsResult.data || []) as Appointment[]);
      setPatients(patientsResult.rows);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load appointments.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const { data, error: rpcError } = await supabase.rpc('doctor_create_appointment', { p_patient_id: patientId, p_at: new Date(startsAt).toISOString(), p_visit_type: 'follow_up', p_reason: reason || null, p_duration: 30 });
      if (rpcError) throw new Error(rpcError.message);
      setAppointments((current) => [...current, data as Appointment].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      setPatientId(''); setStartsAt(''); setReason('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create appointment.'); }
  };
  const patientName = (id: string) => patients.find((patient) => patient.id === id)?.full_name || 'Patient';

  return <div className="space-y-6"><div><p className="text-sm font-medium text-teal-700">Schedule</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Appointments</h1><p className="mt-1 text-sm text-slate-500">Create and review visits from your available roster.</p></div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-4"><label className="text-sm font-medium text-slate-700">Patient<select required value={patientId} onChange={(event) => setPatientId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal"><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} ({patient.patient_code})</option>)}</select></label><label className="text-sm font-medium text-slate-700">Date & time<input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label><label className="text-sm font-medium text-slate-700">Reason<input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" /></label><div className="flex items-end"><button type="submit" className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">Book visit</button></div></form>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="divide-y divide-slate-100">{appointments.length === 0 ? <p className="px-5 py-12 text-center text-sm text-slate-500">No appointments in the next 30 days.</p> : appointments.map((appointment) => <div key={appointment.id} className="flex items-center gap-4 px-5 py-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><CalendarDays className="h-5 w-5" /></div><div className="flex-1"><p className="font-semibold text-slate-800">{patientName(appointment.doctor_patient_id)}</p><p className="text-sm text-slate-500">{new Date(appointment.starts_at).toLocaleString()} · {appointment.reason || 'Follow-up visit'}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{appointment.status}</span></div>)}</div></section>
  </div>;
}

export default function DoctorAppointmentsPage() { return <ProtectedRoute allowedRoles={DOCTOR_ROLES}><DashboardLayout dashboardTitle="Appointments"><AppointmentsContent /></DashboardLayout></ProtectedRoute>; }
