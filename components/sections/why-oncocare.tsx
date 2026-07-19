'use client';

import { motion } from 'framer-motion';
import { Check, X, Sparkles } from 'lucide-react';
import { Section, SectionHeading, Reveal } from '@/components/shared/reveal';

const rows: {
  feature: string;
  onco: boolean | string;
  others: boolean | string;
}[] = [
  { feature: 'AI-powered symptom analysis', onco: true, others: false },
  { feature: 'Verified cancer caregiver marketplace', onco: true, others: false },
  { feature: 'Personalized cancer journey roadmap', onco: true, others: false },
  { feature: 'Tele oncology consultations', onco: true, others: 'Limited' },
  { feature: 'Side-effect prediction & alerts', onco: true, others: false },
  { feature: 'Lab trend visualization with AI insights', onco: true, others: 'Basic' },
  { feature: 'Financial aid & govt scheme matching', onco: true, others: false },
  { feature: 'SOS emergency with care team alert', onco: true, others: false },
  { feature: 'Hospital dashboard for cohort monitoring', onco: true, others: false },
  { feature: 'AI-summarized doctor notes', onco: true, others: false },
  { feature: 'Mental health & community support', onco: true, others: 'Limited' },
  { feature: 'Built specifically for oncology', onco: true, others: false },
];

function Cell({ value, highlight }: { value: boolean | string; highlight?: boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <div className={`flex h-7 w-7 items-center justify-center rounded-full ${highlight ? 'bg-gradient-to-br from-emerald-deep to-teal-400 text-white shadow-md shadow-teal-500/20' : 'bg-slate-100 text-slate-400'}`}>
        <Check className="h-4 w-4" strokeWidth={3} />
      </div>
    ) : (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-slate-300">
        <X className="h-4 w-4" strokeWidth={2.5} />
      </div>
    );
  }
  return (
    <span className={`text-xs font-semibold ${highlight ? 'text-emerald-deep' : 'text-slate-500'}`}>
      {value}
    </span>
  );
}

export function WhyOncoCare() {
  return (
    <Section id="why" className="bg-brand-cloud">
      <SectionHeading
        eyebrow="Why OncoCare+"
        title={
          <>
            Not just another health app.{' '}
            <span className="gradient-text">The cancer care platform.</span>
          </>
        }
        subtitle="General healthcare apps weren't built for the complexity of cancer. OncoCare+ was—every feature, every workflow, every detail."
      />

      <Reveal delay={0.2}>
        <div className="mt-16 overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-xl shadow-slate-900/5">
          {/* Header row */}
          <div className="grid grid-cols-12 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <div className="col-span-6 px-6 py-5 text-sm font-semibold text-slate-500 md:col-span-7">
              Feature
            </div>
            <div className="col-span-3 px-3 py-5 text-center md:col-span-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-deep to-teal-500 px-3 py-1 text-xs font-bold text-white shadow-md shadow-teal-500/20">
                <Sparkles className="h-3 w-3" />
                OncoCare+
              </div>
            </div>
            <div className="col-span-3 px-3 py-5 text-center md:col-span-3">
              <span className="text-xs font-semibold text-slate-400">Other Healthcare Apps</span>
            </div>
          </div>

          {/* Data rows */}
          {rows.map((row, i) => (
            <motion.div
              key={row.feature}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              className={`grid grid-cols-12 items-center border-b border-slate-50 transition-colors hover:bg-teal-50/30 ${
                i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
              }`}
            >
              <div className="col-span-6 px-6 py-4 text-sm font-medium text-slate-700 md:col-span-7">
                {row.feature}
              </div>
              <div className="col-span-3 flex justify-center px-3 py-4 md:col-span-2">
                <Cell value={row.onco} highlight />
              </div>
              <div className="col-span-3 flex justify-center px-3 py-4 md:col-span-3">
                <Cell value={row.others} />
              </div>
            </motion.div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
