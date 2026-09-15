'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { ArrowRight, Building2, Sparkles, Mail, CheckCircle2 } from 'lucide-react';
import { Reveal } from '@/components/shared/reveal';

export function CTA() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (email.trim()) setSubmitted(true);
  };

  return (
    <section id="cta" className="relative overflow-hidden px-6 py-24 sm:py-32">
      {/* Background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-emerald-deep via-teal-600 to-blue-700" />
      <div className="absolute inset-0 -z-10 bg-grid-dark opacity-20" />

      {/* Floating orbs */}
      <motion.div
        animate={{ y: [0, -20, 0], x: [0, 10, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute left-10 top-10 h-40 w-40 rounded-full bg-teal-300/20 blur-3xl"
      />
      <motion.div
        animate={{ y: [0, 20, 0], x: [0, -10, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute right-10 bottom-10 h-48 w-48 rounded-full bg-blue-400/20 blur-3xl"
      />

      <div className="relative mx-auto max-w-4xl text-center">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-teal-200 ring-1 ring-white/20 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5" />
            Join the Movement
          </span>
        </Reveal>

        <Reveal delay={0.1}>
          <h2 className="mt-8 text-balance text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl md:text-6xl">
            Let&apos;s Transform Cancer Care Together.
          </h2>
        </Reveal>

        <Reveal delay={0.15}>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-teal-50 sm:text-lg">
            Whether you&apos;re a patient, caregiver, doctor, or hospital—there&apos;s a place for you in the OncoCare+ community. Join our waitlist today and be part of India&apos;s cancer care revolution.
          </p>
        </Reveal>

        {/* Email input + button */}
        <Reveal delay={0.2}>
          <form onSubmit={handleSubmit} className="mx-auto mt-10 flex max-w-md flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(event) => { setEmail(event.target.value); setSubmitted(false); }}
                required
                className="w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3.5 pl-11 text-sm text-white placeholder:text-teal-200/60 backdrop-blur-md focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>
            <button type="submit" className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-emerald-deep shadow-lg transition-all hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5">
              {submitted ? 'You are on the list' : 'Join Waitlist'}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </form>
        </Reveal>

        {/* Trust line */}
        <Reveal delay={0.25}>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-teal-100/80">
            {['No spam, ever', 'Early access perks', 'Shape the product'].map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-teal-300" />
                {item}
              </div>
            ))}
          </div>
        </Reveal>

        {/* Secondary CTA */}
        <Reveal delay={0.3}>
          <div className="mt-10 flex flex-col items-center gap-4">
            <div className="h-px w-16 bg-white/20" />
            <a
              href="#hospitals"
              className="group inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-md transition-all hover:bg-white/10 hover:border-white/30"
            >
              <Building2 className="h-4 w-4" />
              Become a Hospital Partner
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
