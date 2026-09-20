'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity, ArrowRight, Bell, Building2, Calendar, CheckCircle2,
  ChevronLeft, ChevronRight, Clock3, FileText, Filter, MapPin,
  Search, Stethoscope, Users, Video,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, type NavItem } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';

type Appointment = {
  id: string;
  user_id: string;
  doctor_id: string | null;
  appointment_date: string;
  status: string;
  type: string;
  reason: string | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  bio: string | null;
};

const hospitalNavItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard/hospital', icon: Activity },
  { label: 'Patients', href: '/dashboard/hospital#patients', icon: Users },
  { label: 'Care Team', href: '/dashboard/hospital#doctors', icon: Stethoscope },
  { label: 'Appointments', href: '/dashboard/hospital#appointments', icon: Calendar },
  { label: 'Reports & Documents', href: '/dashboard/documents', icon: FileText },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Hospital Profile', href: '/dashboard/profile', icon: Building2 },
];

function formatDate(value: string, includeTime = false) {
  const date = new Date(value);
  return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}${includeTime ? ` at ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}`;
}

function statusClass(status: string) {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700';
  if (status === 'cancelled' || status === 'no_show') return 'bg-rose-50 text-rose-700';
  if (status === 'confirmed') return 'bg-teal-50 text-teal-700';
  return 'bg-blue-50 text-blue-700';
}

function initials(name: string | null | undefined, fallback = 'U') {
  return name ? name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2) : fallback;
}

function HospitalDashboardContent() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [documentsCount, setDocumentsCount] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [appointmentStatus, setAppointmentStatus] = useState('all');
  const [appointmentDoctor, setAppointmentDoctor] = useState('all');
  const [appointmentDate, setAppointmentDate] = useState('all');
  const [patientPage, setPatientPage] = useState(0);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [appointmentsRes, documentsRes, notificationsRes, activityRes] = await Promise.all([
        supabase.from('appointments').select('id, user_id, doctor_id, appointment_date, status, type, reason').eq('hospital_id', user.id).order('appointment_date', { ascending: true }),
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('notifications').select('id, title, message, is_read, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(4),
        supabase.from('activity_log').select('id, title, description, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(4),
      ]);

      if (appointmentsRes.error) throw appointmentsRes.error;
      if (documentsRes.error) throw documentsRes.error;
      if (notificationsRes.error) throw notificationsRes.error;
      if (activityRes.error) throw activityRes.error;

      const appointmentRows = (appointmentsRes.data || []) as Appointment[];
      const relatedIds = Array.from(new Set(appointmentRows.flatMap((appointment) => [appointment.user_id, appointment.doctor_id].filter(Boolean) as string[])));
      let relatedProfiles: Profile[] = [];
      if (relatedIds.length > 0) {
        const profilesRes = await supabase.from('profiles').select('id, full_name, email, phone, city, state, bio').in('id', relatedIds);
        if (profilesRes.error) throw profilesRes.error;
        relatedProfiles = (profilesRes.data || []) as Profile[];
      }

      setAppointments(appointmentRows);
      setProfiles(relatedProfiles);
      setDocumentsCount(documentsRes.count || 0);
      setNotifications(notificationsRes.data || []);
      setActivity(activityRes.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the hospital dashboard.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const doctorIds = useMemo(() => Array.from(new Set(appointments.map((appointment) => appointment.doctor_id).filter(Boolean) as string[])), [appointments]);
  const patientIds = useMemo(() => Array.from(new Set(appointments.map((appointment) => appointment.user_id))), [appointments]);
  const doctors = doctorIds.map((id) => profileById.get(id)).filter(Boolean) as Profile[];
  const patients = patientIds.map((id) => profileById.get(id)).filter(Boolean) as Profile[];
  const todayKey = new Date().toDateString();
  const todayAppointments = appointments.filter((appointment) => new Date(appointment.appointment_date).toDateString() === todayKey);
  const upcomingAppointments = appointments.filter((appointment) => new Date(appointment.appointment_date) >= new Date() && !['cancelled', 'completed', 'no_show'].includes(appointment.status));
  const activePatients = new Set(upcomingAppointments.map((appointment) => appointment.user_id)).size;

  const filteredPatients = patients.filter((patient) => {
    const search = patientSearch.toLowerCase().trim();
    return !search || [patient.full_name, patient.email, patient.phone].some((value) => value?.toLowerCase().includes(search));
  });
  const visiblePatients = filteredPatients.slice(patientPage * 5, patientPage * 5 + 5);

  const filteredAppointments = appointments.filter((appointment) => {
    const matchesStatus = appointmentStatus === 'all' || appointment.status === appointmentStatus;
    const matchesDoctor = appointmentDoctor === 'all' || appointment.doctor_id === appointmentDoctor;
    const date = new Date(appointment.appointment_date);
    const matchesDate = appointmentDate === 'all'
      || (appointmentDate === 'today' && date.toDateString() === todayKey)
      || (appointmentDate === 'upcoming' && upcomingAppointments.some((item) => item.id === appointment.id));
    return matchesStatus && matchesDoctor && matchesDate;
  });

  const statCards = [
    { label: 'Associated patients', value: patientIds.length, icon: Users, tone: 'bg-teal-50 text-teal-700' },
    { label: 'Active patients', value: activePatients, icon: Activity, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Care team members', value: doctors.length, icon: Stethoscope, tone: 'bg-amber-50 text-amber-700' },
    { label: "Today's appointments", value: todayAppointments.length, icon: Calendar, tone: 'bg-rose-50 text-rose-700' },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-teal-900 to-emerald-800 p-6 text-white shadow-lg lg:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-200">Hospital operations</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Welcome, {user?.profile?.full_name || 'Hospital team'}</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-200">A focused view of the patients, clinicians, and appointments associated with your account.</p>
          </div>
          <Link href="/dashboard/profile" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20">
            <Building2 className="h-4 w-4" /> Edit hospital profile
          </Link>
        </div>
      </section>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.tone}`}><stat.icon className="h-5 w-5" /></div>
            <p className="mt-4 text-2xl font-bold text-slate-900">{loading ? '—' : stat.value}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4"><div><h2 className="font-bold text-slate-900">Upcoming appointments</h2><p className="mt-1 text-xs text-slate-500">{upcomingAppointments.length} scheduled across your hospital</p></div><a href="#appointments" className="text-xs font-semibold text-teal-700">View schedule</a></div>
          <div className="mt-5 space-y-3">
            {loading ? [1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-50" />) : upcomingAppointments.slice(0, 4).map((appointment) => {
              const patient = profileById.get(appointment.user_id);
              const doctor = appointment.doctor_id ? profileById.get(appointment.doctor_id) : null;
              return <div key={appointment.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">{appointment.type === 'teleconsultation' ? <Video className="h-5 w-5" /> : <Calendar className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{patient?.full_name || 'Patient'}</p><p className="truncate text-xs text-slate-500">{formatDate(appointment.appointment_date, true)} · {doctor?.full_name ? `Dr. ${doctor.full_name}` : 'Doctor not assigned'}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${statusClass(appointment.status)}`}>{appointment.status.replace('_', ' ')}</span></div>;
            })}
            {!loading && upcomingAppointments.length === 0 && <div className="py-8 text-center text-sm text-slate-500"><Calendar className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2">No upcoming appointments</p></div>}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Recent activity</h2><p className="mt-1 text-xs text-slate-500">Updates from this hospital account</p></div><Activity className="h-5 w-5 text-teal-600" /></div><div className="mt-5 space-y-4">{activity.length > 0 ? activity.map((item) => <div key={item.id} className="flex gap-3"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-500" /><div><p className="text-sm font-medium text-slate-800">{item.title}</p><p className="mt-0.5 text-xs text-slate-500">{item.description || 'Account activity'} · {formatDate(item.created_at)}</p></div></div>) : <p className="py-8 text-center text-sm text-slate-500">No recent activity yet</p>}</div></div>
      </section>

      <section id="patients" className="scroll-mt-24 rounded-2xl border border-slate-200/70 bg-white shadow-sm"><div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Associated patients</h2><p className="mt-1 text-xs text-slate-500">Patients linked through hospital appointments</p></div><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={patientSearch} onChange={(event) => { setPatientSearch(event.target.value); setPatientPage(0); }} placeholder="Search patients" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-400 sm:w-64" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Patient</th><th className="px-5 py-3 font-semibold">Contact</th><th className="px-5 py-3 font-semibold">Assigned doctor</th><th className="px-5 py-3 font-semibold">Appointments</th><th className="px-5 py-3 font-semibold">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{visiblePatients.map((patient) => { const patientAppointments = appointments.filter((appointment) => appointment.user_id === patient.id); const doctor = patientAppointments.find((appointment) => appointment.doctor_id)?.doctor_id; return <tr key={patient.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">{initials(patient.full_name, 'P')}</div><div><p className="font-semibold text-slate-800">{patient.full_name || 'Patient'}</p><p className="text-xs text-slate-500">{patient.city || patient.state || 'Profile details limited'}</p></div></div></td><td className="px-5 py-4 text-slate-600">{patient.email || patient.phone || 'Not provided'}</td><td className="px-5 py-4 text-slate-600">{doctor ? `Dr. ${profileById.get(doctor)?.full_name || 'Assigned'}` : 'Unassigned'}</td><td className="px-5 py-4 text-slate-600">{patientAppointments.length}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${patientAppointments.some((appointment) => upcomingAppointments.some((item) => item.id === appointment.id)) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{patientAppointments.some((appointment) => upcomingAppointments.some((item) => item.id === appointment.id)) ? 'Active' : 'Inactive'}</span></td></tr>})}</tbody></table></div>{!loading && visiblePatients.length === 0 && <div className="p-10 text-center text-sm text-slate-500"><Users className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2">No associated patients found</p></div>}<div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500"><span>{filteredPatients.length} patients</span><div className="flex items-center gap-2"><button aria-label="Previous patients" disabled={patientPage === 0} onClick={() => setPatientPage((page) => page - 1)} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><button aria-label="Next patients" disabled={(patientPage + 1) * 5 >= filteredPatients.length} onClick={() => setPatientPage((page) => page + 1)} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div></section>

      <section id="doctors" className="scroll-mt-24 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Doctors and care team</h2><p className="mt-1 text-xs text-slate-500">Clinicians associated through hospital appointments</p></div><Stethoscope className="h-5 w-5 text-teal-600" /></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{doctors.map((doctor) => { const doctorAppointments = appointments.filter((appointment) => appointment.doctor_id === doctor.id); return <div key={doctor.id} className="rounded-xl border border-slate-100 p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">{initials(doctor.full_name, 'D')}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">Dr. {doctor.full_name || 'Doctor'}</p><p className="truncate text-xs text-slate-500">{doctor.bio || 'Healthcare professional'}</p></div></div><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500"><span>{new Set(doctorAppointments.map((appointment) => appointment.user_id)).size} patients</span><span>{doctorAppointments.length} appointments</span></div></div>})}</div>{!loading && doctors.length === 0 && <div className="py-8 text-center text-sm text-slate-500"><Stethoscope className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2">No associated doctors found</p></div>}</section>

      <section id="appointments" className="scroll-mt-24 rounded-2xl border border-slate-200/70 bg-white shadow-sm"><div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-bold text-slate-900">Hospital appointments</h2><p className="mt-1 text-xs text-slate-500">Review appointments visible to your hospital account</p></div><div className="flex flex-wrap items-center gap-2"><Filter className="h-4 w-4 text-slate-400" /><select value={appointmentDate} onChange={(event) => setAppointmentDate(event.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs"><option value="all">All dates</option><option value="today">Today</option><option value="upcoming">Upcoming</option></select><select value={appointmentStatus} onChange={(event) => setAppointmentStatus(event.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs"><option value="all">All statuses</option><option value="scheduled">Scheduled</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select><select value={appointmentDoctor} onChange={(event) => setAppointmentDoctor(event.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs"><option value="all">All doctors</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>Dr. {doctor.full_name || 'Doctor'}</option>)}</select></div></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Date and time</th><th className="px-5 py-3 font-semibold">Patient</th><th className="px-5 py-3 font-semibold">Doctor</th><th className="px-5 py-3 font-semibold">Type</th><th className="px-5 py-3 font-semibold">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredAppointments.map((appointment) => <tr key={appointment.id}><td className="px-5 py-4 text-slate-700"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-400" />{formatDate(appointment.appointment_date, true)}</div></td><td className="px-5 py-4 font-medium text-slate-800">{profileById.get(appointment.user_id)?.full_name || 'Patient'}</td><td className="px-5 py-4 text-slate-600">{appointment.doctor_id ? `Dr. ${profileById.get(appointment.doctor_id)?.full_name || 'Doctor'}` : 'Unassigned'}</td><td className="px-5 py-4 capitalize text-slate-600">{appointment.type.replace('_', ' ')}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(appointment.status)}`}>{appointment.status.replace('_', ' ')}</span></td></tr>)}</tbody></table></div>{!loading && filteredAppointments.length === 0 && <div className="p-10 text-center text-sm text-slate-500"><Calendar className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2">No appointments match these filters</p></div>}</section>

      <section className="grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Reports and documents</h2><p className="mt-1 text-xs text-slate-500">Documents owned by your hospital account</p></div><FileText className="h-5 w-5 text-teal-600" /></div><div className="mt-5 flex items-center justify-between rounded-xl bg-slate-50 p-4"><div><p className="text-2xl font-bold text-slate-900">{loading ? '—' : documentsCount}</p><p className="text-xs text-slate-500">Available documents</p></div><Link href="/dashboard/documents" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700">Open documents <ArrowRight className="h-3.5 w-3.5" /></Link></div></div><div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Notifications</h2><p className="mt-1 text-xs text-slate-500">Alerts for this hospital account</p></div><Bell className="h-5 w-5 text-teal-600" /></div><div className="mt-4 space-y-3">{notifications.length > 0 ? notifications.slice(0, 3).map((notification) => <div key={notification.id} className="flex gap-3 rounded-xl bg-slate-50 p-3"><CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${notification.is_read ? 'text-slate-400' : 'text-teal-600'}`} /><div><p className="text-sm font-medium text-slate-800">{notification.title}</p><p className="mt-0.5 text-xs text-slate-500">{notification.message || formatDate(notification.created_at)}</p></div></div>) : <p className="py-5 text-center text-sm text-slate-500">No notifications yet</p>}</div></div></section>

      <section className="flex flex-wrap gap-3"><Link href="/dashboard/profile" className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"><Building2 className="h-4 w-4" /> Update hospital profile</Link><a href="#appointments" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-teal-200"><Calendar className="h-4 w-4" /> Review schedule</a><Link href="/dashboard/documents" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-teal-200"><FileText className="h-4 w-4" /> View reports</Link><span className="inline-flex items-center gap-2 px-2.5 py-2.5 text-xs text-slate-500"><MapPin className="h-4 w-4" /> {user?.profile?.city || user?.profile?.state || 'Add your location in profile'}</span></section>
    </div>
  );
}

export default function HospitalDashboardPage() {
  return <ProtectedRoute allowedRoles={['hospital']}><DashboardLayout navItems={hospitalNavItems} dashboardTitle="Hospital Portal"><HospitalDashboardContent /></DashboardLayout></ProtectedRoute>;
}
