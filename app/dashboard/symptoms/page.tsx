'use client';

import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  HeartPulse,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  Stethoscope,
  Pill,
  Clock,
  Brain,
  User,
  type LucideIcon,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout, PATIENT_CAREGIVER_ROLES, type NavItem } from '@/components/auth/dashboard-layout';

const navItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Symptoms', href: '/dashboard/symptoms', icon: Activity },
  { label: 'Treatments', href: '/dashboard/treatments', icon: HeartPulse },
  { label: 'Medications', href: '/dashboard/medications', icon: Pill },
  { label: 'Care Team', href: '/dashboard/care-team', icon: Stethoscope },
  { label: 'Timeline', href: '/dashboard/timeline', icon: Clock },
  { label: 'AI Engine', href: '/dashboard/ai-engine', icon: Brain },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

const moduleCards: Array<{
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  accent: string;
}> = [
  {
    title: 'Symptom Checker',
    description: 'AI-guided assessment, emergency detection, and guided symptom journal tracking.',
    href: '/dashboard/symptoms/checker',
    icon: MessageSquareText,
    accent: 'from-teal-500 to-emerald-500',
  },
  {
    title: 'Side Effect Tracker',
    description: 'Log treatment side effects with severity, trends, follow-ups, and daily progress summaries.',
    href: '/dashboard/symptoms/tracker',
    icon: Activity,
    accent: 'from-blue-500 to-indigo-500',
  },
  {
    title: 'Follow-ups',
    description: 'Review due or scheduled check-ins and keep your symptom and treatment plan on track.',
    href: '/dashboard/symptoms/follow-ups',
    icon: CalendarClock,
    accent: 'from-amber-500 to-orange-500',
  },
];

function OverviewCard({ title, description, href, icon: Icon, accent }: (typeof moduleCards)[number]) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
    >
      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-sm`}>
        <Icon className="h-5 w-5" />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-700">
        Open module <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function SymptomOverview() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Patient safety</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Symptom & Side Effect Monitor</h1>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Emergency symptoms should be assessed immediately
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {moduleCards.map((card) => (
          <OverviewCard key={card.href} {...card} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
              <HeartPulse className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">What this module covers</h2>
          </div>
          <ul className="space-y-2 text-sm leading-6 text-slate-600">
            <li>• Guided symptom assessment and severity ratings</li>
            <li>• Treatment-related side-effect tracking with trends</li>
            <li>• Follow-up scheduling and reminder checks</li>
            <li>• Safety alerts for urgent or emergency symptoms</li>
            <li>• AI-supported support based on your patient context</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <Stethoscope className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">When to seek urgent help</h2>
          </div>
          <p className="text-sm leading-6 text-slate-600">
            Seek immediate medical attention for severe difficulty breathing, chest pain, fainting, uncontrolled bleeding, seizure-like activity, or rapidly worsening symptoms. This module keeps that emergency logic intact and promotes quick action.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SymptomsOverviewPage() {
  return (
    <ProtectedRoute allowedRoles={PATIENT_CAREGIVER_ROLES}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <SymptomOverview />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
