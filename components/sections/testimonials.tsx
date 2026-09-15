'use client';

import { motion } from 'framer-motion';
import { Quote, Star, Heart, Stethoscope, Users } from 'lucide-react';
import { Section, SectionHeading, Reveal, StaggerGroup, StaggerItem } from '@/components/shared/reveal';

const testimonials = [
  {
    quote:
      "After my mother's discharge, we were completely lost. OncoCare+ became our daily guide—reminders, symptom tracking, and a caregiver who actually understood cancer care. It gave us our confidence back.",
    name: 'Priya Sharma',
    role: 'Patient · Breast Cancer Survivor',
    location: 'Mumbai, Maharashtra',
    icon: Heart,
    gradient: 'from-rose-400 to-pink-500',
    rating: 5,
  },
  {
    quote:
      "As an oncologist, I see 40+ patients a week. OncoCare+ gives me a clinical summary before each visit—I know exactly what changed, what's trending, and what needs attention. It's like having a dedicated care coordinator for every patient.",
    name: 'Dr. Arjun Mehta',
    role: 'Senior Oncologist',
    location: 'Tata Memorial, Mumbai',
    icon: Stethoscope,
    gradient: 'from-teal-500 to-emerald-500',
    rating: 5,
  },
  {
    quote:
      "Caring for my father during chemotherapy was overwhelming. The AI assistant caught his nausea pattern before it got severe, and the caregiver we found through the platform was a lifesaver. I finally felt supported.",
    name: 'Rahul Verma',
    role: 'Caregiver · Son of Patient',
    location: 'Bengaluru, Karnataka',
    icon: Users,
    gradient: 'from-blue-500 to-indigo-500',
    rating: 5,
  },
];

export function Testimonials() {
  return (
    <Section id="testimonials">
      <SectionHeading
        eyebrow="Testimonials"
        title={
          <>
            Real stories from{' '}
            <span className="gradient-text">real journeys</span>
          </>
        }
        subtitle="Patients, doctors, and caregivers who experienced the difference of continuous, AI-powered cancer care at home."
      />

      <StaggerGroup className="mt-16 grid gap-6 lg:grid-cols-3" stagger={0.12}>
        {testimonials.map((testimonial) => (
          <StaggerItem key={testimonial.name}>
            <motion.div
              whileHover={{ y: -8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="group relative h-full overflow-hidden rounded-3xl border border-slate-200/60 bg-white/60 p-8 shadow-sm backdrop-blur-xl transition-all hover:shadow-2xl hover:shadow-slate-900/5"
            >
              {/* Gradient glow on hover */}
              <div className={`absolute -top-20 -right-20 h-40 w-40 rounded-full bg-gradient-to-br ${testimonial.gradient} opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-10`} />

              {/* Quote icon */}
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${testimonial.gradient} text-white shadow-lg`}>
                <Quote className="h-5 w-5" />
              </div>

              {/* Rating */}
              <div className="mt-5 flex gap-0.5">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                ))}
              </div>

              {/* Quote */}
              <p className="mt-4 text-sm leading-relaxed text-slate-700">
                &ldquo;{testimonial.quote}&rdquo;
              </p>

              {/* Author */}
              <div className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-5">
                <div className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${testimonial.gradient} text-white shadow-md`}>
                  <testimonial.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">{testimonial.name}</div>
                  <div className="text-xs text-slate-500">{testimonial.role}</div>
                  <div className="text-[11px] text-slate-400">{testimonial.location}</div>
                </div>
              </div>
            </motion.div>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </Section>
  );
}
