'use client';

import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  ShieldCheck,
  FileBarChart,
  Bell,
  ArrowUpRight,
  Building2,
  Activity,
} from 'lucide-react';
import { Section, SectionHeading, Reveal, StaggerGroup, StaggerItem } from '@/components/shared/reveal';

const benefits = [
  {
    icon: LayoutDashboard,
    title: 'Real-Time Cohort Dashboard',
    description: 'Monitor all your cancer patients on one screen—symptoms, adherence, risk scores, and outcomes.',
  },
  {
    icon: TrendingUp,
    title: 'Outcome Analytics',
    description: 'Track treatment efficacy, readmission rates, and patient quality-of-life metrics across cohorts.',
  },
  {
    icon: ShieldCheck,
    title: 'Compliance & Security',
    description: 'HIPAA-aligned data handling, audit trails, and role-based access for every member of your care team.',
  },
  {
    icon: Bell,
    title: 'Early Warning Alerts',
    description: 'AI flags at-risk patients before complications escalate—reducing ER visits and readmissions.',
  },
];

export function ForHospitals() {
  return (
    <section id="hospitals" className="relative overflow-hidden bg-slate-950 py-24 sm:py-32">
      {/* Background */}
      <div className="absolute inset-0 bg-grid-dark opacity-30" />
      <div className="absolute right-0 top-1/4 h-[400px] w-[400px] rounded-full bg-blue-500/10 blur-[100px]" />
      <div className="absolute left-0 bottom-1/4 h-[400px] w-[400px] rounded-full bg-teal-500/10 blur-[100px]" />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          {/* Left: Content */}
          <div>
            <SectionHeading
              light
              align="left"
              eyebrow="For Hospitals"
              title={
                <>
                  Enterprise-grade infrastructure for{' '}
                  <span className="gradient-text-light">cancer care teams</span>
                </>
              }
              subtitle="OncoCare+ for Hospitals is a B2B SaaS platform that extends your oncology department beyond its walls—continuous monitoring, AI risk scoring, and cohort analytics, all in one dashboard."
            />

            <StaggerGroup className="mt-10 grid gap-4 sm:grid-cols-2" stagger={0.08}>
              {benefits.map((benefit) => (
                <StaggerItem key={benefit.title}>
                  <div className="group rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md transition-all hover:border-teal-400/30 hover:bg-white/[0.08]">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500/20 to-blue-500/20 ring-1 ring-teal-400/20">
                      <benefit.icon className="h-5 w-5 text-teal-300" />
                    </div>
                    <h3 className="mt-4 text-sm font-bold text-white">{benefit.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                      {benefit.description}
                    </p>
                  </div>
                </StaggerItem>
              ))}
            </StaggerGroup>

            <Reveal delay={0.3}>
              <a
                href="#cta"
                className="group mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg transition-all hover:shadow-xl hover:shadow-teal-500/20"
              >
                Request Enterprise Demo
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </Reveal>
          </div>

          {/* Right: Hospital dashboard mockup */}
          <Reveal delay={0.2}>
            <div className="relative">
              <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-teal-500/10 to-blue-500/10 blur-2xl" />

              <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl backdrop-blur-xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-deep to-teal-400">
                      <Building2 className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">Hospital Dashboard</div>
                      <div className="text-[10px] text-slate-400">Tata Memorial · Oncology Dept</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-teal-500/10 px-2.5 py-1 text-[10px] font-semibold text-teal-300 ring-1 ring-teal-400/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
                    247 active patients
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 p-5">
                  {[
                    { icon: Users, label: 'Monitored', value: '247', color: 'text-teal-300' },
                    { icon: Activity, label: 'At Risk', value: '12', color: 'text-amber-300' },
                    { icon: TrendingUp, label: 'Stable', value: '94%', color: 'text-emerald-300' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl border border-white/5 bg-white/5 p-3">
                      <stat.icon className={`h-4 w-4 ${stat.color}`} />
                      <div className="mt-2 text-xl font-bold text-white">{stat.value}</div>
                      <div className="text-[10px] text-slate-400">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Patient list */}
                <div className="px-5 pb-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">Priority Patients</span>
                    <span className="text-[10px] text-teal-400">View all</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { name: 'Priya Sharma', id: 'OC-1042', risk: 'Moderate', riskColor: 'text-amber-300 bg-amber-500/10 ring-amber-400/20', score: '7.8' },
                      { name: 'Rajesh Kumar', id: 'OC-1038', risk: 'Low', riskColor: 'text-emerald-300 bg-emerald-500/10 ring-emerald-400/20', score: '8.5' },
                      { name: 'Anita Desai', id: 'OC-1051', risk: 'High', riskColor: 'text-rose-300 bg-rose-500/10 ring-rose-400/20', score: '5.2' },
                    ].map((patient) => (
                      <motion.div
                        key={patient.id}
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 }}
                        className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2.5"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-500/30 to-blue-500/30 text-[10px] font-bold text-teal-200">
                            {patient.name.charAt(0)}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-white">{patient.name}</div>
                            <div className="text-[10px] text-slate-400">{patient.id}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-slate-300">{patient.score}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${patient.riskColor}`}>
                            {patient.risk}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Footer bar */}
                <div className="flex items-center justify-between border-t border-white/5 px-5 py-3">
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <FileBarChart className="h-3 w-3 text-teal-400" />
                    Last sync: 2 min ago
                  </div>
                  <div className="text-[10px] text-slate-400">Updated in real-time</div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
