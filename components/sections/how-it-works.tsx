'use client';

import { motion } from 'framer-motion';
import {
  UserPlus,
  Upload,
  Brain,
  Stethoscope,
  CalendarHeart,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { Section, SectionHeading, Reveal } from '@/components/shared/reveal';

const steps: {
  icon: LucideIcon;
  step: string;
  title: string;
  description: string;
}[] = [
  {
    icon: UserPlus,
    step: '01',
    title: 'Create Account',
    description: 'Sign up in minutes. Tell us about your diagnosis, treatment stage, and care needs.',
  },
  {
    icon: Upload,
    step: '02',
    title: 'Upload Reports',
    description: 'Securely upload lab reports, prescriptions, and discharge summaries. AI extracts and organizes everything.',
  },
  {
    icon: Brain,
    step: '03',
    title: 'AI Analysis',
    description: 'Our AI analyzes your data, builds a personalized care plan, and identifies risks and support needs.',
  },
  {
    icon: Stethoscope,
    step: '04',
    title: 'Doctor Review',
    description: 'Your oncologist reviews and approves the AI-generated plan, adding clinical oversight and adjustments.',
  },
  {
    icon: CalendarHeart,
    step: '05',
    title: 'Daily Care',
    description: 'Receive daily guidance—medication reminders, symptom check-ins, nutrition tips, and caregiver support.',
  },
  {
    icon: TrendingUp,
    step: '06',
    title: 'Recovery Tracking',
    description: 'Watch your progress unfold. AI tracks recovery metrics, predicts milestones, and celebrates wins with you.',
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHeading
        eyebrow="How It Works"
        title={
          <>
            From sign-up to recovery in{' '}
            <span className="gradient-text">six simple steps</span>
          </>
        }
        subtitle="No complexity. No friction. Just a guided path from your first login to your last milestone."
      />

      <div className="mt-16">
        {/* Desktop timeline */}
        <div className="relative hidden md:block">
          {/* Connecting line */}
          <div className="absolute left-0 right-0 top-12 h-0.5 bg-gradient-to-r from-teal-200 via-emerald-200 to-blue-200" />
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.5, ease: 'easeInOut' }}
            className="absolute left-0 right-0 top-12 h-0.5 origin-left bg-gradient-to-r from-emerald-deep via-teal-500 to-blue-500"
          />

          <div className="grid grid-cols-6 gap-4">
            {steps.map((step, i) => (
              <Reveal key={step.step} delay={i * 0.15}>
                <div className="flex flex-col items-center text-center">
                  {/* Node */}
                  <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5 transition-all hover:scale-105 hover:border-teal-300 hover:shadow-teal-500/20">
                    <step.icon className="h-8 w-8 text-emerald-deep" strokeWidth={1.8} />
                    <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-deep to-teal-400 text-[10px] font-bold text-white shadow-md">
                      {step.step}
                    </span>
                  </div>
                  <h3 className="mt-5 text-sm font-bold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    {step.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Mobile timeline */}
        <div className="relative md:hidden">
          {/* Vertical line */}
          <div className="absolute left-12 top-0 bottom-0 w-0.5 bg-gradient-to-b from-teal-200 via-emerald-200 to-blue-200" />

          <div className="space-y-8">
            {steps.map((step, i) => (
              <Reveal key={step.step} delay={i * 0.1}>
                <div className="relative flex items-start gap-5">
                  <div className="relative z-10 flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
                    <step.icon className="h-8 w-8 text-emerald-deep" strokeWidth={1.8} />
                    <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-deep to-teal-400 text-[10px] font-bold text-white shadow-md">
                      {step.step}
                    </span>
                  </div>
                  <div className="pt-4">
                    <h3 className="text-base font-bold text-slate-900">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                      {step.description}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
