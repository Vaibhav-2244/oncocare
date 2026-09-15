'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity, ArrowRight, Brain, Calendar, CheckCircle2, Clock, FileText,
  HeartPulse, Loader2, MapPin, Pill, Sparkles, type LucideIcon,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, commonNavItems } from '@/components/auth/dashboard-layout';
import { useAuth } from '@/lib/auth-context';
import { getPatientSummary, type PatientSummaryData } from '@/lib/patient-summary';
import { supabase } from '@/lib/supabase-client';

interface RoadmapEvent {
  id: string;
  title: string;
  date: string;
  description: string | null;
  completed: boolean;
  icon: LucideIcon;
}

interface JourneyInsights {
  journeySummary: string;
  currentFocus: string;
  nextAction: string;
  reminders: string[];
}

const emptyInsights: JourneyInsights = {
  journeySummary: '',
  currentFocus: '',
  nextAction: '',
  reminders: [],
};

function dateLabel(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function buildEvents(data: PatientSummaryData): RoadmapEvent[] {
  const now = Date.now();
  const events: RoadmapEvent[] = data.health_timeline.map((event) => ({
    id: `timeline-${event.id}`,
    title: event.title,
    date: event.event_date,
    description: event.description,
    completed: new Date(event.event_date).getTime() <= now,
    icon: Clock,
  }));

  data.appointments.forEach((appointment) => events.push({
    id: `appointment-${appointment.id}`,
    title: appointment.reason || `${appointment.type.replaceAll('_', ' ')} appointment`,
    date: appointment.appointment_date,
    description: appointment.notes,
    completed: appointment.status === 'completed' || new Date(appointment.appointment_date).getTime() <= now,
    icon: Calendar,
  }));

  data.treatments.forEach((treatment) => {
    if (!treatment.start_date) return;
    events.push({
      id: `treatment-${treatment.id}`,
      title: treatment.name,
      date: treatment.start_date,
      description: `${treatment.type.replaceAll('_', ' ')} · ${treatment.status}`,
      completed: treatment.status === 'completed' || new Date(treatment.start_date).getTime() <= now,
      icon: HeartPulse,
    });
  });

  data.medications.forEach((medication) => {
    if (!medication.start_date) return;
    events.push({
      id: `medication-${medication.id}`,
      title: `${medication.name} added`,
      date: medication.start_date,
      description: medication.notes,
      completed: new Date(medication.start_date).getTime() <= now,
      icon: Pill,
    });
  });

  data.symptoms.forEach((symptom) => {
    if (!symptom.recorded_at) return;
    events.push({
      id: `symptom-${symptom.id}`,
      title: `${symptom.name} recorded`,
      date: symptom.recorded_at,
      description: symptom.notes,
      completed: true,
      icon: Activity,
    });
  });

  data.documents.forEach((document) => events.push({
    id: `document-${document.id}`,
    title: `${document.title} uploaded`,
    date: document.created_at,
    description: document.category,
    completed: true,
    icon: FileText,
  }));

  return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function RoadmapSkeleton() {
  return <div className="animate-pulse space-y-4"><div className="h-28 rounded-2xl bg-slate-100" /><div className="h-96 rounded-2xl bg-slate-100" /></div>;
}

function JourneyContent() {
  const { user } = useAuth();
  const [data, setData] = useState<PatientSummaryData | null>(null);
  const [insights, setInsights] = useState(emptyInsights);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getPatientSummary(user.id)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load roadmap'))
      .finally(() => setLoading(false));
  }, [user]);

  const events = useMemo(() => data ? buildEvents(data) : [], [data]);
  const completedCount = events.filter((event) => event.completed).length;
  const progress = events.length ? Math.round((completedCount / events.length) * 100) : 0;
  const upcomingAppointment = data?.appointments
    .filter((item) => item.status !== 'cancelled' && new Date(item.appointment_date).getTime() > Date.now())
    .sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime())[0];
  const activeTreatment = data?.treatments.find((item) => item.status === 'active');
  const activeMedication = data?.medications.find((item) => item.is_active);
  const latestSymptom = data?.symptoms[0];

  const generateInsights = async () => {
    if (!user) return;
    setAiLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session?.access_token || ''}`,
        },
        body: JSON.stringify({ mode: 'journey-roadmap' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to generate insights');
      const json = result.summary.replace(/^```json\s*|\s*```$/g, '');
      const parsed = JSON.parse(json) as JourneyInsights;
      setInsights({
        journeySummary: parsed.journeySummary || '',
        currentFocus: parsed.currentFocus || '',
        nextAction: parsed.nextAction || '',
        reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate AI insights');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) return <RoadmapSkeleton />;
  if (error && !data) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">{error}</div>;
  if (!data) return null;

  const stats: Array<[string, number, LucideIcon]> = [
    ['Appointments Completed', data.appointments.filter((item) => item.status === 'completed').length, Calendar],
    ['Treatments Recorded', data.treatments.length, HeartPulse],
    ['Medications Active', data.medications.filter((item) => item.is_active).length, Pill],
    ['Symptoms Logged', data.symptoms.length, Activity],
    ['Documents Uploaded', data.documents.length, FileText],
    ['Timeline Events', data.health_timeline.length, Clock],
  ];

  return <div className="space-y-6">
    <div><p className="text-sm font-semibold text-teal-600">Patient Dashboard</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Cancer Journey Roadmap</h1><p className="mt-1 text-sm text-slate-500">A view of the care records you have added to OncoCare+.</p></div>

    <section className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-slate-500">Overall Journey Progress</p><p className="mt-2 text-4xl font-bold text-slate-900">{progress}%</p></div><MapPin className="h-6 w-6 text-teal-600" /></div><div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all" style={{ width: `${progress}%` }} /></div><div className="mt-3 flex justify-between text-xs text-slate-500"><span>Completed: {completedCount} events</span><span>Upcoming: {events.length - completedCount} events</span></div></section>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.8fr)]"><section className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold text-slate-900">Journey Timeline</h2>{events.length === 0 ? <p className="mt-5 text-sm text-slate-500">Your roadmap will appear as medical records are added.</p> : <div className="mt-6 space-y-0">{events.map((event, index) => <div key={event.id} className="flex gap-4"><div className="flex flex-col items-center"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${event.completed ? 'bg-teal-50 text-teal-600' : 'bg-slate-50 text-slate-400'}`}>{event.completed ? <CheckCircle2 className="h-5 w-5" /> : <event.icon className="h-4 w-4" />}</div>{index < events.length - 1 && <div className="w-px flex-1 bg-slate-200" />}</div><div className="min-w-0 flex-1 pb-6"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-900">{event.title}</h3><span className="text-xs text-slate-500">{dateLabel(event.date)}</span></div>{event.description && <p className="mt-1 text-xs text-slate-500">{event.description}</p>}<span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${event.completed ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{event.completed ? 'Completed' : 'Upcoming'}</span></div></div>)}</div>}</section>

      <div className="space-y-6"><section className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold text-slate-900">Current Focus</h2><div className="mt-4 space-y-4">{activeTreatment && <p className="text-sm"><span className="block text-xs text-slate-500">Current Treatment</span><strong className="text-slate-900">{activeTreatment.name}</strong></p>}{upcomingAppointment && <p className="text-sm"><span className="block text-xs text-slate-500">Next Appointment</span><strong className="text-slate-900">{dateLabel(upcomingAppointment.appointment_date)}</strong></p>}{activeMedication && <p className="text-sm"><span className="block text-xs text-slate-500">Current Medication</span><strong className="text-slate-900">{activeMedication.name}</strong></p>}{latestSymptom && <p className="text-sm"><span className="block text-xs text-slate-500">Latest Symptom</span><strong className="text-slate-900">{latestSymptom.name}</strong></p>}{!activeTreatment && !upcomingAppointment && !activeMedication && !latestSymptom && <p className="text-sm text-slate-500">No current focus has been recorded yet.</p>}</div></section>

      <section className="rounded-2xl border border-teal-100 bg-teal-50/60 p-6"><div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">AI Journey Insights</h2><Brain className="h-5 w-5 text-teal-600" /></div>{insights.journeySummary ? <div className="mt-4 space-y-3 text-sm text-slate-600"><p>{insights.journeySummary}</p>{insights.currentFocus && <p><strong>Current focus:</strong> {insights.currentFocus}</p>}{insights.nextAction && <p><strong>Next action:</strong> {insights.nextAction}</p>}{insights.reminders.length > 0 && <p><strong>Reminders:</strong> {insights.reminders.join(' ')}</p>}</div> : <p className="mt-3 text-sm text-slate-600">Generate a concise summary from your existing records.</p>}<button onClick={generateInsights} disabled={aiLoading} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">{aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{aiLoading ? 'Generating...' : 'Generate Insights'}</button></section></div></div>

    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{stats.map(([label, value, Icon]) => <div key={label} className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm"><Icon className="h-5 w-5 text-teal-600" /><p className="mt-3 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>)}</section>

    {events.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center"><p className="text-sm text-slate-600">Your cancer journey roadmap will become available as more medical records, treatments and appointments are added.</p><Link href="/dashboard/timeline" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-700">Add a timeline event <ArrowRight className="h-4 w-4" /></Link></div>}
    {error && data && <p className="text-sm text-rose-600">{error}</p>}
  </div>;
}

export default function CancerJourneyPage() {
  return <ProtectedRoute allowedRoles={['patient', 'family_caregiver', 'medical_advisor']}><DashboardLayout navItems={commonNavItems} dashboardTitle="Patient Dashboard"><JourneyContent /></DashboardLayout></ProtectedRoute>;
}
