'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertCircle, TrendingUp, Pill, Calendar, FileText,
  Users, Clock, MessageCircle, Bell, Brain, Siren, User, Settings,
  Plus, X, Video, Trash2, CheckCircle2, XCircle, CalendarDays,
  Stethoscope, type LucideIcon,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, PATIENT_ROLES, type NavItem } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';
import { VideoConsultation } from '@/components/tele-oncology/video-consultation';

const navItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: Activity },
  { label: 'Symptoms', href: '/dashboard/symptoms', icon: AlertCircle },
  { label: 'Treatments', href: '/dashboard/treatments', icon: TrendingUp },
  { label: 'Medications', href: '/dashboard/medications', icon: Pill },
  { label: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
  { label: 'Documents', href: '/dashboard/documents', icon: FileText },
  { label: 'Care Team', href: '/dashboard/care-team', icon: Users },
  { label: 'Timeline', href: '/dashboard/timeline', icon: Clock },
  { label: 'Community', href: '/dashboard/community', icon: MessageCircle },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'AI Engine', href: '/dashboard/ai-engine', icon: Brain },
  { label: 'Emergency', href: '/dashboard/emergency', icon: Siren },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

type AppointmentType = 'in_person' | 'teleconsultation';
type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled';

interface Appointment {
  id: string;
  user_id: string;
  doctor_id: string | null;
  hospital_id: string | null;
  appointment_date: string;
  status: AppointmentStatus;
  type: AppointmentType;
  reason: string;
  notes: string | null;
  created_at: string;
}

type TabKey = 'upcoming' | 'past' | 'all';

function statusBadge(status: AppointmentStatus): { label: string; bg: string; text: string; dot: string } {
  switch (status) {
    case 'scheduled':
      return { label: 'Scheduled', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' };
    case 'confirmed':
      return { label: 'Confirmed', bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' };
    case 'completed':
      return { label: 'Completed', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' };
    case 'cancelled':
      return { label: 'Cancelled', bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' };
    default:
      return { label: status, bg: 'bg-slate-50', text: 'text-slate-700', dot: 'bg-slate-500' };
  }
}

function formatAppointmentDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function StatSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
      <div className="mt-3 h-7 w-16 animate-pulse rounded bg-slate-100" />
      <div className="mt-1 h-3 w-24 animate-pulse rounded bg-slate-50" />
    </div>
  );
}

function AppointmentSkeleton() {
  return (
    <div className="rounded-xl border border-slate-100 p-5">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 animate-pulse rounded-xl bg-slate-100" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-slate-50" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-slate-50" />
        </div>
        <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

function AppointmentsContent() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('upcoming');
  const [actionId, setActionId] = useState<string | null>(null);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);

  // form state
  const [type, setType] = useState<AppointmentType>('in_person');
  const [appointmentDate, setAppointmentDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [doctorName, setDoctorName] = useState<string>('');

  const loadAppointments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', user.id)
        .order('appointment_date', { ascending: false });
      if (queryError) throw queryError;
      setAppointments((data || []) as Appointment[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadAppointments();
  }, [user, loadAppointments]);

  const resetForm = () => {
    setType('in_person');
    setAppointmentDate('');
    setReason('');
    setNotes('');
    setDoctorName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!appointmentDate || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        user_id: user.id,
        type,
        appointment_date: new Date(appointmentDate).toISOString(),
        reason: reason.trim(),
        notes: notes.trim() || null,
        doctor_id: null,
        status: 'scheduled' as AppointmentStatus,
      };
      const { data, error: insertError } = await supabase
        .from('appointments')
        .insert(payload)
        .select()
        .single();
      if (insertError) throw insertError;
      setAppointments((prev) => [data as Appointment, ...prev]);
      resetForm();
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to book appointment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, status: AppointmentStatus) => {
    setActionId(id);
    try {
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ status })
        .eq('id', id);
      if (updateError) throw updateError;
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update appointment');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setActionId(id);
    try {
      const { error: deleteError } = await supabase.from('appointments').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setAppointments((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete appointment');
    } finally {
      setActionId(null);
    }
  };

  // stats
  const now = new Date();
  const totalAppointments = appointments.length;
  const upcoming = appointments.filter(
    (a) => new Date(a.appointment_date) >= now && a.status !== 'cancelled' && a.status !== 'completed',
  ).length;
  const completed = appointments.filter((a) => a.status === 'completed').length;
  const teleconsultations = appointments.filter((a) => a.type === 'teleconsultation').length;

  const statCards = [
    { label: 'Total Appointments', value: totalAppointments, icon: CalendarDays, color: 'from-teal-500 to-emerald-500' },
    { label: 'Upcoming', value: upcoming, icon: Calendar, color: 'from-blue-500 to-indigo-500' },
    { label: 'Completed', value: completed, icon: CheckCircle2, color: 'from-emerald-500 to-green-500' },
    { label: 'Teleconsultations', value: teleconsultations, icon: Video, color: 'from-purple-500 to-fuchsia-500' },
  ];

  // tab filter
  const filteredAppointments = appointments.filter((a) => {
    if (activeTab === 'upcoming') {
      return new Date(a.appointment_date) >= now && a.status !== 'cancelled' && a.status !== 'completed';
    }
    if (activeTab === 'past') {
      return new Date(a.appointment_date) < now || a.status === 'completed' || a.status === 'cancelled';
    }
    return true;
  });

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Appointments &amp; Teleconsultation</h1>
          <p className="mt-1 text-sm text-slate-500">Book and manage your in-person and virtual visits</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md hover:from-teal-700 hover:to-emerald-700"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? 'Cancel' : 'Book Appointment'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? [0, 1, 2, 3].map((i) => <StatSkeleton key={i} />)
          : statCards.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm"
              >
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md',
                    stat.color,
                  )}
                >
                  <stat.icon className="h-5 w-5" />
                </div>
                <div className="mt-3 text-2xl font-bold text-slate-900">{stat.value}</div>
                <div className="text-xs text-slate-500">{stat.label}</div>
              </motion.div>
            ))}
      </div>

      {/* Book appointment form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm"
            >
              <h2 className="text-base font-bold text-slate-900">Book a New Appointment</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as AppointmentType)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  >
                    <option value="in_person">In-Person Visit</option>
                    <option value="teleconsultation">Teleconsultation (Video)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Date &amp; Time
                  </label>
                  <input
                    type="datetime-local"
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Reason</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Follow-up consultation"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Doctor Name <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    placeholder="e.g. Dr. Ananya Sharma"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Any additional information for the doctor..."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-200/30"
                />
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-60"
                >
                  {submitting ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Book Appointment
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-slate-200/60 bg-white p-1.5 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
              activeTab === tab.key
                ? 'bg-gradient-to-r from-teal-50 to-emerald-50 text-teal-700 ring-1 ring-teal-200/40'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Appointment list */}
      <div className="space-y-3">
        {loading ? (
          [0, 1, 2].map((i) => <AppointmentSkeleton key={i} />)
        ) : filteredAppointments.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-slate-200/60 bg-white py-12 text-center shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-400">
              <Calendar className="h-7 w-7" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-700">
              {activeTab === 'upcoming'
                ? 'No upcoming appointments'
                : activeTab === 'past'
                  ? 'No past appointments yet'
                  : 'No appointments scheduled'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Book an appointment to get started with your care.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md"
            >
              <Plus className="h-4 w-4" /> Book Appointment
            </button>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredAppointments.map((appt, i) => {
              const badge = statusBadge(appt.status);
              const isTele = appt.type === 'teleconsultation';
              const isPast = new Date(appt.appointment_date) < now;
              const isActive = appt.status === 'scheduled' || appt.status === 'confirmed';
              return (
                <motion.div
                  key={appt.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: i * 0.03 }}
                  className="group rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm transition-colors hover:border-slate-300"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                        isTele ? 'bg-purple-50 text-purple-600' : 'bg-teal-50 text-teal-600',
                      )}
                    >
                      {isTele ? <Video className="h-6 w-6" /> : <Calendar className="h-6 w-6" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {appt.reason}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                            badge.bg,
                            badge.text,
                          )}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full', badge.dot)} />
                          {badge.label}
                        </span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            isTele ? 'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-600',
                          )}
                        >
                          {isTele ? 'Teleconsultation' : 'In-Person'}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        {formatAppointmentDate(appt.appointment_date)}
                      </div>

                      {appt.doctor_id && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <Stethoscope className="h-3 w-3" />
                          {appt.doctor_id}
                        </div>
                      )}

                      {appt.notes && (
                        <p className="mt-2 text-sm text-slate-600">{appt.notes}</p>
                      )}

                      {/* Action buttons */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {isTele && isActive && !isPast && (
                          <button
                            onClick={() => setActiveAppointment(appt)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:shadow-md"
                          >
                            <Video className="h-3.5 w-3.5" />
                            Join Video Call
                          </button>
                        )}
                        {isActive && (
                          <button
                            onClick={() => handleStatusChange(appt.id, 'completed')}
                            disabled={actionId === appt.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Mark Completed
                          </button>
                        )}
                        {isActive && (
                          <button
                            onClick={() => handleStatusChange(appt.id, 'cancelled')}
                            disabled={actionId === appt.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-60"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(appt.id)}
                          disabled={actionId === appt.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60"
                        >
                          {actionId === appt.id ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {activeAppointment && (
        <VideoConsultation
          appointment={activeAppointment}
          onClose={() => setActiveAppointment(null)}
        />
      )}
    </div>
  );
}

export default function AppointmentsPage() {
  return (
    <ProtectedRoute allowedRoles={PATIENT_ROLES}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <AppointmentsContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
