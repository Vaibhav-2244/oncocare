'use client';

import { motion } from 'framer-motion';
import {
  Brain,
  Map,
  Users,
  Video,
  Pill,
  Calendar,
  Activity,
  FlaskConical,
  Utensils,
  Heart,
  Wallet,
  Landmark,
  Siren,
  LayoutDashboard,
  FileText,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { Section, SectionHeading, Reveal, StaggerGroup, StaggerItem } from '@/components/shared/reveal';

const features: {
  icon: LucideIcon;
  title: string;
  description: string;
  gradient: string;
  glow: string;
}[] = [
  {
    icon: Search,
    title: 'Medicine Price Intelligence',
    description: 'Search trusted pharmacies, compare cancer medicine prices, check stock availability, and find the best deals near you.',
    gradient: 'from-teal-500 to-cyan-500',
    glow: 'shadow-teal-500/20',
  },
  {
    icon: Brain,
    title: 'AI Symptom Checker',
    description: 'Conversational AI that assesses symptoms in real-time, triages severity, and recommends next steps.',
    gradient: 'from-teal-500 to-emerald-500',
    glow: 'shadow-teal-500/20',
  },
  {
    icon: Map,
    title: 'AI Cancer Journey',
    description: 'A personalized visual roadmap of your entire treatment path—from diagnosis to recovery—with milestones.',
    gradient: 'from-blue-500 to-indigo-500',
    glow: 'shadow-blue-500/20',
  },
  {
    icon: Users,
    title: 'Caregiver Marketplace',
    description: 'Browse, book, and manage verified cancer caregivers—nurses, attendants, and home health aides.',
    gradient: 'from-emerald-500 to-teal-500',
    glow: 'shadow-emerald-500/20',
  },
  {
    icon: Video,
    title: 'Tele Oncology',
    description: 'Connect with oncologists via secure video consultations—no travel, no waiting rooms, no delays.',
    gradient: 'from-cyan-500 to-blue-500',
    glow: 'shadow-cyan-500/20',
  },
  {
    icon: Pill,
    title: 'Medication Reminder',
    description: 'Smart reminders with drug interaction alerts, adherence tracking, and pharmacy refill automation.',
    gradient: 'from-teal-400 to-cyan-500',
    glow: 'shadow-teal-400/20',
  },
  {
    icon: Calendar,
    title: 'Treatment Tracker',
    description: 'Track chemotherapy cycles, radiation sessions, and surgery milestones in one unified timeline.',
    gradient: 'from-indigo-500 to-blue-500',
    glow: 'shadow-indigo-500/20',
  },
  {
    icon: Activity,
    title: 'Side Effect Tracker',
    description: 'Log nausea, fatigue, pain, and more. AI correlates patterns with your treatment to predict flare-ups.',
    gradient: 'from-emerald-500 to-green-500',
    glow: 'shadow-emerald-500/20',
  },
  {
    icon: FlaskConical,
    title: 'Lab Trends',
    description: 'Visualize blood counts, tumor markers, and lab results over time with AI-generated insights.',
    gradient: 'from-blue-500 to-sky-500',
    glow: 'shadow-blue-500/20',
  },
  {
    icon: Utensils,
    title: 'Personalized Nutrition',
    description: 'AI-built meal plans tailored to your treatment phase, side effects, and dietary preferences.',
    gradient: 'from-teal-500 to-emerald-500',
    glow: 'shadow-teal-500/20',
  },
  {
    icon: Heart,
    title: 'Mental Health',
    description: 'Connect with counselors, access guided meditations, and join support communities—built for cancer.',
    gradient: 'from-rose-400 to-pink-500',
    glow: 'shadow-rose-500/20',
  },
  {
    icon: Wallet,
    title: 'Financial Aid',
    description: 'Discover and apply to crowdfunding, insurance, and financial assistance programs in one place.',
    gradient: 'from-amber-500 to-orange-500',
    glow: 'shadow-amber-500/20',
  },
  {
    icon: Landmark,
    title: 'Government Schemes',
    description: 'AI-matched eligibility for government cancer relief schemes, with guided application support.',
    gradient: 'from-blue-500 to-indigo-500',
    glow: 'shadow-blue-500/20',
  },
  {
    icon: Siren,
    title: 'SOS Emergency',
    description: 'One-tap emergency alerts to your care team and family with live location and critical health data.',
    gradient: 'from-red-500 to-rose-500',
    glow: 'shadow-red-500/20',
  },
  {
    icon: LayoutDashboard,
    title: 'Hospital Dashboard',
    description: 'Real-time patient monitoring dashboard for hospitals—track cohorts, outcomes, and care quality.',
    gradient: 'from-emerald-deep to-teal-500',
    glow: 'shadow-teal-500/20',
  },
  {
    icon: FileText,
    title: 'Doctor Notes',
    description: 'AI-summarized patient narratives, symptom trends, and lab changes—so doctors prep in minutes.',
    gradient: 'from-slate-600 to-slate-800',
    glow: 'shadow-slate-500/20',
  },
];

export function Features() {
  return (
    <Section id="features" className="bg-brand-cloud">
      <SectionHeading
        eyebrow="Feature Showcase"
        title={
          <>
            Everything a cancer patient needs.{' '}
            <span className="gradient-text">Nothing they don't.</span>
          </>
        }
        subtitle="Fifteen deeply integrated modules—each designed with oncologists, patients, and caregivers. Built for the realities of cancer care at home."
      />

      <StaggerGroup className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" stagger={0.05}>
        {features.map((feature) => (
          <StaggerItem key={feature.title}>
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="group relative h-full overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm transition-all hover:shadow-xl hover:shadow-slate-900/5"
            >
              {/* Hover gradient bg */}
              <div className={`absolute inset-0 -z-10 bg-gradient-to-br ${feature.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-[0.03]`} />

              {/* Icon */}
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feature.gradient} text-white shadow-lg ${feature.glow} transition-transform duration-300 group-hover:scale-110`}>
                <feature.icon className="h-5 w-5" strokeWidth={2} />
              </div>

              <h3 className="mt-5 text-base font-bold text-slate-900">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {feature.description}
              </p>

              {/* Hover arrow */}
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-teal-600 opacity-0 transition-all duration-300 group-hover:opacity-100">
                Learn more
                <motion.span className="inline-block">→</motion.span>
              </div>

              {/* Bottom border accent */}
              <div className={`absolute bottom-0 left-0 h-0.5 w-0 bg-gradient-to-r ${feature.gradient} transition-all duration-500 group-hover:w-full`} />
            </motion.div>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </Section>
  );
}
