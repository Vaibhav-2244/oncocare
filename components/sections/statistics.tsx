'use client';

import { Users, Building2, Brain, Stethoscope, Heart } from 'lucide-react';
import { AnimatedCounter } from '@/components/shared/animated-counter';
import { Reveal } from '@/components/shared/reveal';

const stats = [
  { icon: Heart, value: 10000, suffix: '+', label: 'Cancer Patients Supported', sublabel: 'Target Year 1', isTarget: true },
  { icon: Building2, value: 50, suffix: '+', label: 'Hospital Partners', sublabel: 'Target Year 1', isTarget: true },
  { icon: Brain, value: 1000000, suffix: '+', label: 'AI Predictions', sublabel: 'Coming Soon', isTarget: true },
  { icon: Stethoscope, value: 500, suffix: '+', label: 'Oncologists', sublabel: 'Target Year 1', isTarget: true },
  { icon: Users, value: 2000, suffix: '+', label: 'Verified Caregivers', sublabel: 'Target Year 1', isTarget: true },
];

export function Statistics() {
  return (
    <section className="relative overflow-hidden bg-slate-950 py-24">
      {/* Background */}
      <div className="absolute inset-0 bg-grid-dark opacity-20" />
      <div className="absolute left-1/2 top-0 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-br from-teal-500/10 to-blue-500/10 blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-teal-300 ring-1 ring-white/15">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
              Our Vision
            </span>
            <h2 className="mt-6 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
              Building India&apos;s largest{' '}
              <span className="gradient-text-light">cancer care network</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-slate-400 sm:text-lg">
              We&apos;re just getting started. Here&apos;s what we&apos;re building toward in our first year.
            </p>
          </div>
        </Reveal>

        <div className="mt-16 grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.1}>
              <div className="flex flex-col items-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-blue-500/20 ring-1 ring-teal-400/20">
                  <stat.icon className="h-5 w-5 text-teal-300" />
                </div>
                <AnimatedCounter
                  value={stat.value}
                  suffix={stat.suffix}
                  label={stat.label}
                  sublabel={stat.sublabel}
                  isTarget={stat.isTarget}
                />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
