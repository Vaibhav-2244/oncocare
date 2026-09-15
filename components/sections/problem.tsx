'use client';

import { motion } from 'framer-motion';
import { Home, Users, EyeOff, Puzzle, type LucideIcon } from 'lucide-react';
import { Section, SectionHeading, Reveal } from '@/components/shared/reveal';

const problems: {
  icon: LucideIcon;
  title: string;
  description: string;
  stat: string;
  statLabel: string;
  gradient: string;
}[] = [
  {
    icon: Home,
    title: 'Patients Struggle After Discharge',
    description:
      'Once discharged, cancer patients are left to manage complex care at home with little guidance—uncertain about symptoms, medications, and what to do when things change.',
    stat: '70%',
    statLabel: 'feel unprepared for home care',
    gradient: 'from-amber-50 to-orange-50',
  },
  {
    icon: Users,
    title: 'Families Are Overwhelmed',
    description:
      'Caregivers juggle appointments, medications, emotional support, and financial stress—often with no training, no breaks, and no one to turn to.',
    stat: '3x',
    statLabel: 'caregiver burnout rate',
    gradient: 'from-rose-50 to-pink-50',
  },
  {
    icon: EyeOff,
    title: 'Doctors Lack Continuous Monitoring',
    description:
      'Oncologists see patients every few weeks, missing critical windows between visits. Symptoms escalate silently, leading to ER visits and complications.',
    stat: '45%',
    statLabel: 'issues go unreported',
    gradient: 'from-sky-50 to-blue-50',
  },
  {
    icon: Puzzle,
    title: 'Cancer Care Is Fragmented',
    description:
      'Oncologists, labs, pharmacies, caregivers, and financial aid operate in silos. Patients navigate disconnected systems while fighting for their lives.',
    stat: '8+',
    statLabel: 'separate systems per patient',
    gradient: 'from-violet-50 to-purple-50',
  },
];

export function Problem() {
  return (
    <Section id="problem" className="bg-brand-cloud">
      <SectionHeading
        eyebrow="The Problem"
        title={
          <>
            Cancer care does not end at the{' '}
            <span className="gradient-text">hospital door</span>
          </>
        }
        subtitle="The hardest part of cancer treatment often begins after discharge. Patients and families are sent home with complex regimens, mounting anxiety, and nowhere to turn."
      />

      <div className="mt-16 grid gap-6 sm:grid-cols-2">
        {problems.map((problem, i) => (
          <Reveal key={problem.title} delay={i * 0.1}>
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="group relative h-full overflow-hidden rounded-3xl border border-slate-200/60 bg-white p-8 shadow-sm transition-shadow hover:shadow-xl hover:shadow-slate-900/5"
            >
              {/* Gradient bg on hover */}
              <div className={`absolute inset-0 -z-10 bg-gradient-to-br ${problem.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`} />

              <div className="flex items-start justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 text-slate-500 ring-1 ring-slate-200/60 transition-all duration-300 group-hover:from-teal-500 group-hover:to-emerald-500 group-hover:text-white group-hover:ring-teal-300/30 group-hover:shadow-lg group-hover:shadow-teal-500/20">
                  <problem.icon className="h-6 w-6" strokeWidth={1.8} />
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-slate-800 transition-colors group-hover:text-emerald-deep">
                    {problem.stat}
                  </div>
                  <div className="text-[11px] text-slate-400">{problem.statLabel}</div>
                </div>
              </div>

              <h3 className="mt-6 text-xl font-bold text-slate-900">{problem.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                {problem.description}
              </p>

              {/* Bottom accent line */}
              <div className="mt-6 h-1 w-12 rounded-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-all duration-500 group-hover:w-full" />
            </motion.div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
