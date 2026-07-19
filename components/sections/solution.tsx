'use client';

import { motion } from 'framer-motion';
import {
  Activity,
  Brain,
  Calendar,
  HeartPulse,
  MessageCircle,
  Pill,
  TrendingUp,
  Users,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { Section, SectionHeading, Reveal } from '@/components/shared/reveal';

const pillars = [
  {
    icon: Brain,
    title: 'AI Care Coordinator',
    description: 'A personalized AI assistant that understands your diagnosis, tracks your symptoms, and guides you 24/7.',
  },
  {
    icon: Users,
    title: 'Verified Caregiver Network',
    description: 'On-demand access to trained, background-verified cancer caregivers—nurses, attendants, and home health aides.',
  },
  {
    icon: HeartPulse,
    title: 'Continuous Monitoring',
    description: 'Daily symptom tracking with AI risk scoring that alerts your care team before complications arise.',
  },
  {
    icon: Pill,
    title: 'Treatment & Medication',
    description: 'Smart reminders, side-effect logging, and lab trend visualization—all in one unified timeline.',
  },
];

export function Solution() {
  return (
    <Section id="solution">
      <SectionHeading
        eyebrow="The Solution"
        title={
          <>
            One platform for the entire{' '}
            <span className="gradient-text">cancer journey</span>
          </>
        }
        subtitle="OncoCare+ unifies care coordination, AI monitoring, caregiver access, and financial support into a single, beautifully designed experience—for patients, families, and doctors."
      />

      <div className="mt-16 grid items-center gap-12 lg:grid-cols-2">
        {/* Left: Pillars */}
        <div className="grid gap-4">
          {pillars.map((pillar, i) => (
            <Reveal key={pillar.title} delay={i * 0.1}>
              <motion.div
                whileHover={{ x: 6 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="group flex items-start gap-4 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all hover:border-teal-200 hover:shadow-lg hover:shadow-teal-500/5"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-deep to-teal-400 text-white shadow-md shadow-teal-500/20">
                  <pillar.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{pillar.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    {pillar.description}
                  </p>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>

        {/* Right: Interactive dashboard mockup */}
        <Reveal delay={0.2}>
          <div className="relative">
            {/* Glow */}
            <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-teal-200/30 via-emerald-200/20 to-blue-200/20 blur-2xl" />

            {/* Main card */}
            <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-2xl shadow-slate-900/10">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-deep to-teal-400">
                    <Activity className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-sm font-bold text-slate-800">Care Dashboard</span>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-200/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </div>
              </div>

              {/* Body */}
              <div className="space-y-4 p-5">
                {/* AI Assistant bubble */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 }}
                  className="flex items-start gap-3 rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-50 p-4 ring-1 ring-teal-200/40"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-deep to-teal-400 shadow-md">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-emerald-deep">OncoCare AI Assistant</div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      Good morning, Priya. Your symptom score improved to 8.2. I've scheduled your medication reminder and flagged a mild nausea trend to your oncologist.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-medium text-teal-600 ring-1 ring-teal-200/50">
                        View analysis
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200/50">
                        Dismiss
                      </span>
                    </div>
                  </div>
                </motion.div>

                {/* Quick stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: TrendingUp, label: 'Recovery', value: '74%', color: 'text-emerald-500' },
                    { icon: Calendar, label: 'Next Visit', value: '3 days', color: 'text-blue-500' },
                    { icon: Pill, label: 'Medications', value: '4 active', color: 'text-teal-500' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                      <stat.icon className={`h-4 w-4 ${stat.color}`} />
                      <div className="mt-2 text-lg font-bold text-slate-800">{stat.value}</div>
                      <div className="text-[10px] text-slate-400">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Care team */}
                <div className="rounded-xl border border-slate-100 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">Care Team</span>
                    <span className="text-[10px] text-teal-500">View all</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {['Dr. Sharma', 'Nurse Anita', 'Ravi (Caregiver)'].map((name, i) => (
                      <div key={name} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                        <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                          i === 0 ? 'bg-emerald-500' : i === 1 ? 'bg-blue-500' : 'bg-teal-500'
                        }`}>
                          {name.charAt(0)}
                        </div>
                        <span className="text-[10px] font-medium text-slate-600">{name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Checklist */}
                <div className="space-y-2">
                  {['Complete symptom check-in', 'Take morning medication', 'Upload latest lab report'].map((task, i) => (
                    <motion.div
                      key={task}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.4 + i * 0.1 }}
                      className="flex items-center gap-2 text-xs"
                    >
                      <CheckCircle2 className={`h-4 w-4 ${i < 2 ? 'text-emerald-500' : 'text-slate-300'}`} />
                      <span className={i < 2 ? 'text-slate-400 line-through' : 'text-slate-600'}>
                        {task}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* Floating AI orb */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -right-4 -top-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-deep to-teal-400 shadow-xl shadow-teal-500/30"
            >
              <MessageCircle className="h-7 w-7 text-white" />
              <div className="absolute inset-0 rounded-2xl bg-teal-400/30 blur-lg -z-10" />
            </motion.div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
