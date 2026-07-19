'use client';

import { motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  Building2,
  HeartPulse,
  Sparkles,
  Stethoscope,
  ShieldCheck,
  Brain,
  Calendar,
  TrendingUp,
  Bell,
} from 'lucide-react';

const trustIndicators = [
  { icon: Brain, label: 'AI Powered' },
  { icon: Stethoscope, label: 'Doctor Friendly' },
  { icon: HeartPulse, label: 'Patient First' },
  { icon: Building2, label: 'Built in India' },
];

const floatCards = [
  {
    icon: Activity,
    title: 'Symptom Score',
    value: 'Stable',
    sub: 'AI analyzed 12 metrics',
    color: 'from-teal-500 to-emerald-500',
    className: 'left-[2%] top-[18%] hidden lg:flex',
    delay: 0.8,
  },
  {
    icon: Calendar,
    title: 'Next Treatment',
    value: 'Tue, 10:00 AM',
    sub: 'Chemotherapy Cycle 3',
    color: 'from-blue-500 to-indigo-500',
    className: 'right-[3%] top-[12%] hidden md:flex',
    delay: 1.0,
  },
  {
    icon: TrendingUp,
    title: 'Recovery Trend',
    value: '+18%',
    sub: 'Improving steadily',
    color: 'from-emerald-500 to-teal-500',
    className: 'right-[5%] bottom-[14%] hidden lg:flex',
    delay: 1.2,
  },
  {
    icon: Bell,
    title: 'Medication',
    value: '3 reminders',
    sub: 'All on track today',
    color: 'from-teal-400 to-cyan-500',
    className: 'left-[4%] bottom-[16%] hidden md:flex',
    delay: 1.4,
  },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      {/* Background layers */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-teal-50/40 via-white to-white" />
      <div className="absolute inset-0 -z-10 bg-grid mask-fade-b opacity-60" />
      <div className="absolute left-1/2 top-0 -z-10 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-br from-teal-200/30 via-emerald-100/20 to-blue-200/20 blur-3xl" />
      <div className="absolute right-0 top-20 -z-10 h-[400px] w-[400px] rounded-full bg-gradient-to-br from-blue-200/20 to-teal-200/10 blur-3xl" />

      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-teal-200/60 bg-white/80 px-4 py-1.5 text-xs font-semibold text-emerald-deep shadow-sm backdrop-blur-md"
          >
            <Sparkles className="h-3.5 w-3.5 text-teal-500" />
            India's First AI-Powered Integrated Cancer Home Care Platform
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-8 max-w-4xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl md:text-7xl"
          >
            The Future of{' '}
            <span className="gradient-text animate-gradient">Cancer Care</span>{' '}
            Starts at Home.
          </motion.h1>

          {/* Subheading */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-slate-600 sm:text-lg md:text-xl"
          >
            AI-powered care coordination, symptom tracking, verified caregivers,
            financial support and personalized guidance—designed to support
            cancer patients and families throughout their journey.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
          >
            <a
              href="#cta"
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-deep to-teal-500 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/30 transition-all hover:shadow-xl hover:shadow-teal-500/40 hover:-translate-y-0.5"
            >
              <span className="relative z-10">Get Early Access</span>
              <ArrowRight className="relative z-10 h-4 w-4 transition-transform group-hover:translate-x-1" />
              <div className="absolute inset-0 bg-gradient-to-r from-teal-400 to-blue-500 opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
            <a
              href="#hospitals"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-7 py-3.5 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-md transition-all hover:border-teal-300 hover:text-emerald-deep hover:shadow-md"
            >
              Partner With Us
              <Building2 className="h-4 w-4" />
            </a>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-12 flex flex-wrap items-center justify-center gap-3 sm:gap-4"
          >
            {trustIndicators.map((item, i) => (
              <div
                key={item.label}
                className="group flex items-center gap-2.5 rounded-full border border-slate-200/80 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-md transition-all hover:border-teal-300 hover:shadow-md"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-teal-50 to-emerald-50 ring-1 ring-teal-200/50">
                  <item.icon className="h-3.5 w-3.5 text-emerald-deep" />
                </span>
                {item.label}
                {i < trustIndicators.length - 1 && (
                  <span className="ml-1 hidden h-1 w-1 rounded-full bg-slate-300 sm:block" />
                )}
              </div>
            ))}
          </motion.div>
        </div>

        {/* Hero visual — dashboard mockup with floating cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="relative mx-auto mt-16 max-w-5xl"
        >
          {/* Main dashboard card */}
          <div className="relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white/90 p-2 shadow-2xl shadow-slate-900/10 backdrop-blur-xl">
            <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 to-white">
              {/* Browser bar */}
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400/70" />
                  <div className="h-3 w-3 rounded-full bg-amber-400/70" />
                  <div className="h-3 w-3 rounded-full bg-green-400/70" />
                </div>
                <div className="mx-auto flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1 text-xs text-slate-400">
                  <ShieldCheck className="h-3 w-3 text-teal-500" />
                  app.oncocareplus.com/dashboard
                </div>
              </div>

              {/* Dashboard content */}
              <div className="grid grid-cols-12 gap-4 p-6">
                {/* Sidebar */}
                <div className="col-span-3 hidden flex-col gap-1 md:flex">
                  <div className="mb-3 flex items-center gap-2 px-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-deep to-teal-400">
                      <Activity className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-sm font-bold text-slate-800">OncoCare+</span>
                  </div>
                  {['Dashboard', 'Care Plan', 'Symptoms', 'Medications', 'Lab Trends', 'Caregivers'].map(
                    (item, i) => (
                      <div
                        key={item}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                          i === 0
                            ? 'bg-teal-50 text-emerald-deep ring-1 ring-teal-200/50'
                            : 'text-slate-500'
                        }`}
                      >
                        <div className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
                        {item}
                      </div>
                    )
                  )}
                </div>

                {/* Main content */}
                <div className="col-span-12 flex flex-col gap-4 md:col-span-9">
                  {/* Greeting */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Good morning, Priya</div>
                      <div className="text-xs text-slate-400">Day 42 of treatment · Breast Cancer · Stage II</div>
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 ring-1 ring-emerald-200/50">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Stable
                    </div>
                  </div>

                  {/* Stat cards */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Symptom Score', value: '8.2', trend: '+0.4', icon: Activity },
                      { label: 'Next Dose', value: '6h', trend: 'reminder', icon: Bell },
                      { label: 'Recovery', value: '74%', trend: '+5%', icon: TrendingUp },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                        <div className="flex items-center justify-between">
                          <stat.icon className="h-4 w-4 text-teal-500" />
                          <span className="text-[10px] font-semibold text-emerald-500">{stat.trend}</span>
                        </div>
                        <div className="mt-2 text-xl font-bold text-slate-800">{stat.value}</div>
                        <div className="text-[10px] text-slate-400">{stat.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Chart placeholder */}
                  <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">Recovery Progress</span>
                      <span className="text-[10px] text-slate-400">Last 30 days</span>
                    </div>
                    <div className="flex h-24 items-end gap-1.5">
                      {[40, 55, 48, 62, 58, 70, 65, 72, 68, 78, 75, 82, 79, 85, 88, 84, 90, 87, 92, 89, 94, 91, 96, 93, 98, 95, 100, 97, 102, 99].map(
                        (h, i) => (
                          <motion.div
                            key={i}
                            initial={{ height: 0 }}
                            animate={{ height: `${h}%` }}
                            transition={{ duration: 0.5, delay: 0.8 + i * 0.02 }}
                            className="flex-1 rounded-t bg-gradient-to-t from-teal-400 to-emerald-300"
                          />
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating cards */}
          {floatCards.map((card) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: card.delay }}
              className={`absolute ${card.className}`}
            >
              <div className="animate-float-slow">
                <div className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/90 p-3 shadow-xl shadow-slate-900/10 backdrop-blur-xl">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${card.color} shadow-md`}>
                    <card.icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="text-left">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{card.title}</div>
                    <div className="text-sm font-bold text-slate-800">{card.value}</div>
                    <div className="text-[10px] text-slate-500">{card.sub}</div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}

          {/* Glow under dashboard */}
          <div className="absolute -bottom-8 left-1/2 -z-10 h-32 w-3/4 -translate-x-1/2 rounded-full bg-gradient-to-r from-teal-400/20 via-emerald-400/20 to-blue-400/20 blur-3xl" />
        </motion.div>
      </div>
    </section>
  );
}
