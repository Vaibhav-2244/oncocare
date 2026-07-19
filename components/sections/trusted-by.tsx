'use client';

import { motion } from 'framer-motion';
import { Heart, Building2, GraduationCap, Landmark, Users, Cross } from 'lucide-react';

const partners = [
  { name: 'Tata Memorial', icon: Cross, category: 'Cancer Center' },
  { name: 'AIIMS Delhi', icon: Building2, category: 'Hospital' },
  { name: 'Apollo Oncology', icon: Heart, category: 'Cancer Center' },
  { name: 'Kidwai Institute', icon: Building2, category: 'Cancer Center' },
  { name: 'Indian Cancer Society', icon: Users, category: 'NGO' },
  { name: 'NIMHANS', icon: GraduationCap, category: 'Medical Advisor' },
  { name: 'Ayushman Bharat', icon: Landmark, category: 'Govt Program' },
  { name: 'RGCIRC', icon: Cross, category: 'Cancer Center' },
];

export function TrustedBy() {
  return (
    <section className="relative border-y border-slate-100 bg-white py-16">
      <div className="mx-auto max-w-7xl px-6">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
        >
          Trusted by leading hospitals, cancer centers & institutions across India
        </motion.p>

        <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8">
          {partners.map((partner, i) => (
            <motion.div
              key={partner.name}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="group flex flex-col items-center gap-2"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-slate-400 transition-all duration-300 group-hover:border-teal-200 group-hover:bg-teal-50 group-hover:text-emerald-deep group-hover:shadow-md">
                <partner.icon className="h-5 w-5" />
              </div>
              <div className="text-center">
                <div className="text-xs font-semibold text-slate-600 transition-colors group-hover:text-slate-900">
                  {partner.name}
                </div>
                <div className="text-[10px] text-slate-400">{partner.category}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
