'use client';

import { motion } from 'framer-motion';
import {
  Brain,
  TrendingUp,
  Sparkles,
  Stethoscope,
  Cpu,
  LineChart,
  type LucideIcon,
} from 'lucide-react';
import { Section, SectionHeading, Reveal, StaggerGroup, StaggerItem } from '@/components/shared/reveal';

const aiCards: {
  icon: LucideIcon;
  title: string;
  description: string;
  metric: string;
  metricLabel: string;
}[] = [
  {
    icon: Brain,
    title: 'Medical AI',
    description: 'Domain-specific models trained on oncology data—symptoms, labs, treatment protocols, and drug interactions.',
    metric: '12+',
    metricLabel: 'specialized models',
  },
  {
    icon: TrendingUp,
    title: 'Predictive Analytics',
    description: 'Anticipates complications, side-effect trajectories, and hospitalization risk before they happen.',
    metric: '92%',
    metricLabel: 'early detection accuracy',
  },
  {
    icon: Sparkles,
    title: 'Personalized Recommendations',
    description: 'Every recommendation adapts to your cancer type, stage, treatment phase, and real-time symptom data.',
    metric: '24/7',
    metricLabel: 'adaptive guidance',
  },
  {
    icon: Stethoscope,
    title: 'Clinical Intelligence',
    description: 'LLMs that summarize patient narratives, flag clinical concerns, and generate doctor-ready briefs in seconds.',
    metric: '<30s',
    metricLabel: 'to doctor brief',
  },
];

export function AISection() {
  return (
    <section id="ai" className="relative overflow-hidden bg-slate-950 py-24 sm:py-32">
      {/* Background effects */}
      <div className="absolute inset-0 bg-grid-dark opacity-40" />
      <div className="absolute left-1/4 top-0 h-[500px] w-[500px] rounded-full bg-teal-500/10 blur-[120px]" />
      <div className="absolute right-1/4 bottom-0 h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-[120px]" />
      <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/5 blur-[100px]" />

      <div className="relative mx-auto max-w-7xl px-6">
        <SectionHeading
          light
          eyebrow="AI Engine"
          title={
            <>
              Clinical-grade AI,{' '}
              <span className="gradient-text-light">built for oncology</span>
            </>
          }
          subtitle="Our AI doesn't replace doctors—it amplifies them. By continuously analyzing patient data, OncoCare+ AI catches what humans miss, predicts what's coming, and frees clinicians to focus on care."
        />

        {/* Central AI visualization */}
        <Reveal delay={0.2}>
          <div className="relative mx-auto mt-16 max-w-3xl">
            {/* Core orb */}
            <div className="relative mx-auto flex h-48 w-48 items-center justify-center">
              {/* Outer rings */}
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20 + i * 10, repeat: Infinity, ease: 'linear' }}
                  className={`absolute rounded-full border border-teal-400/20`}
                  style={{
                    width: `${100 + i * 30}%`,
                    height: `${100 + i * 30}%`,
                  }}
                >
                  <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-teal-400 shadow-glow" />
                </motion.div>
              ))}

              {/* Core */}
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-emerald-deep via-teal-500 to-blue-500 shadow-2xl"
              >
                <div className="absolute inset-0 rounded-full bg-teal-400/30 blur-xl" />
                <Cpu className="h-12 w-12 text-white" strokeWidth={1.5} />
              </motion.div>

              {/* Orbiting nodes */}
              {[
                { icon: Brain, angle: 0, delay: 0 },
                { icon: LineChart, angle: 90, delay: 0.5 },
                { icon: Stethoscope, angle: 180, delay: 1 },
                { icon: Sparkles, angle: 270, delay: 1.5 },
              ].map((node) => (
                <motion.div
                  key={node.angle}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 15, repeat: Infinity, ease: 'linear', delay: node.delay }}
                  className="absolute inset-0"
                  style={{ rotate: node.angle }}
                >
                  <div
                    className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"
                    style={{ transform: `rotate(${-node.angle}deg)` }}
                  >
                    <motion.div
                      animate={{ rotate: -360 }}
                      transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-400/30 bg-slate-900/80 backdrop-blur-md"
                    >
                      <node.icon className="h-4 w-4 text-teal-400" />
                    </motion.div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Data flow lines */}
            <div className="mt-8 flex items-center justify-center gap-6 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
                Real-time data ingestion
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                LLM inference
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Clinical validation
              </div>
            </div>
          </div>
        </Reveal>

        {/* AI cards */}
        <StaggerGroup className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" stagger={0.08}>
          {aiCards.map((card) => (
            <StaggerItem key={card.title}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md transition-all hover:border-teal-400/30 hover:bg-white/[0.07]"
              >
                {/* Glow on hover */}
                <div className="absolute -inset-px -z-10 rounded-2xl bg-gradient-to-br from-teal-500/0 via-transparent to-blue-500/0 opacity-0 transition-opacity duration-500 group-hover:from-teal-500/10 group-hover:to-blue-500/10 group-hover:opacity-100" />

                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500/20 to-blue-500/20 ring-1 ring-teal-400/20">
                  <card.icon className="h-5 w-5 text-teal-300" />
                </div>

                <h3 className="mt-5 text-base font-bold text-white">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {card.description}
                </p>

                <div className="mt-5 flex items-baseline gap-2 border-t border-white/5 pt-4">
                  <span className="text-2xl font-bold gradient-text-light">{card.metric}</span>
                  <span className="text-[11px] text-slate-500">{card.metricLabel}</span>
                </div>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
