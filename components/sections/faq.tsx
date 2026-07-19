'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus } from 'lucide-react';
import { Section, SectionHeading, Reveal } from '@/components/shared/reveal';

const faqs = [
  {
    question: 'Is OncoCare+ a replacement for my oncologist?',
    answer:
      "Absolutely not. OncoCare+ is designed to support and extend your oncologist's care—not replace it. Our AI monitors your symptoms daily and flags concerns, but every care plan is reviewed and approved by your doctor. Think of us as the bridge between your hospital visits.",
  },
  {
    question: 'How does the AI symptom checker work?',
    answer:
      'Our AI uses specialized oncology models trained on medical literature, clinical guidelines, and real-world patient data. When you report symptoms, it analyzes patterns, correlates them with your treatment phase, and provides personalized guidance—while alerting your care team if something needs clinical attention.',
  },
  {
    question: 'Are the caregivers verified and trained?',
    answer:
      'Yes. Every caregiver on our platform undergoes background verification, identity checks, and cancer-specific care training. We verify nursing credentials where applicable and provide ongoing education on chemotherapy care, infection control, and patient safety protocols.',
  },
  {
    question: 'Is my medical data secure?',
    answer:
      'Security is foundational to OncoCare+. We use end-to-end encryption for all data, comply with healthcare data protection standards, and never share your information without explicit consent. Our infrastructure is built with HIPAA-aligned practices and regular security audits.',
  },
  {
    question: 'Can I use OncoCare+ for any type of cancer?',
    answer:
      'Yes. OncoCare+ is designed to support patients across all cancer types and stages. Our AI adapts its guidance based on your specific diagnosis, treatment protocol, and current phase of care—from newly diagnosed through active treatment and into survivorship.',
  },
  {
    question: 'How much does OncoCare+ cost?',
    answer:
      "We're committed to making cancer care accessible. The core app—including AI symptom tracking, medication reminders, and care coordination—will be free for patients. Premium features like dedicated caregiver booking and advanced analytics have transparent pricing. We're also working with insurance partners and government schemes to expand coverage.",
  },
  {
    question: 'How can my hospital partner with OncoCare+?',
    answer:
      "We offer a B2B SaaS platform for hospitals and cancer centers. Your team gets a real-time cohort dashboard, AI risk scoring, and continuous patient monitoring between visits. Reach out through our Partner With Us form and we'll schedule a personalized demo.",
  },
  {
    question: 'When is OncoCare+ launching?',
    answer:
      "We're currently in our private beta with select hospital partners. Join our waitlist to get early access—we're rolling out invitations in phases and will keep you updated on our launch timeline.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Section id="faq" className="bg-brand-cloud">
      <SectionHeading
        eyebrow="FAQ"
        title={
          <>
            Questions, <span className="gradient-text">answered</span>
          </>
        }
        subtitle="Everything you need to know about OncoCare+. Can't find what you're looking for? Reach out to our team."
      />

      <div className="mx-auto mt-16 max-w-3xl">
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <Reveal key={i} delay={i * 0.05}>
              <div
                className={`overflow-hidden rounded-2xl border bg-white transition-all ${
                  open === i
                    ? 'border-teal-200 shadow-lg shadow-teal-500/5'
                    : 'border-slate-200/60 shadow-sm'
                }`}
              >
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className={`text-sm font-semibold transition-colors sm:text-base ${
                    open === i ? 'text-emerald-deep' : 'text-slate-800'
                  }`}>
                    {faq.question}
                  </span>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all ${
                    open === i
                      ? 'bg-gradient-to-br from-emerald-deep to-teal-400 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {open === i ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {open === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <p className="px-6 pb-5 text-sm leading-relaxed text-slate-600">
                        {faq.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}
