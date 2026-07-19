'use client';

import { motion } from 'framer-motion';
import { Tag, TrendingDown, Stethoscope, CheckCircle2, ArrowRight } from 'lucide-react';
import type { GenericAlternative } from '@/lib/medicine-types';
import { formatINR } from '@/lib/medicine-types';

export function GenericAlternatives({
  generics,
  brandMedicine,
}: {
  generics: GenericAlternative[];
  brandMedicine: { name: string; mrp: number; manufacturer: string | null };
}) {
  if (generics.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 ring-1 ring-blue-200/40">
            <Tag className="h-4 w-4 text-blue-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Generic Alternatives</h3>
            <p className="text-xs text-slate-500">Doctor-approved equivalents that may cost less</p>
          </div>
        </div>
      </div>

      {/* Notice */}
      <div className="flex items-start gap-3 border-b border-amber-100 bg-amber-50/60 p-4">
        <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-xs leading-relaxed text-amber-800">
          <span className="font-semibold">Always consult your oncologist or pharmacist</span> before switching
          to a generic alternative. Do not change your prescribed medication without medical guidance.
        </p>
      </div>

      {/* Generic cards */}
      <div className="divide-y divide-slate-50">
        {generics.map((generic, i) => {
          const med = generic.generic_medicine || generic.brand_medicine;
          if (!med) return null;
          const isGenericOfBrand = generic.brand_medicine?.name === brandMedicine.name;
          const displayMed = isGenericOfBrand ? generic.generic_medicine : generic.brand_medicine;
          if (!displayMed) return null;

          return (
            <motion.div
              key={generic.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center justify-between gap-4 p-5 transition-colors hover:bg-slate-50/50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 ring-1 ring-teal-200/40">
                  <Tag className="h-4 w-4 text-emerald-deep" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{displayMed.name}</span>
                    {generic.is_doctor_approved && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-200/40">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Doctor Approved
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {displayMed.generic_name} · {displayMed.strength} · {displayMed.manufacturer}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-900">{formatINR(displayMed.mrp)}</div>
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                    <TrendingDown className="h-3 w-3" />
                    Save {formatINR(generic.estimated_savings)}
                  </div>
                </div>
                <button className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-all hover:bg-teal-100 hover:text-emerald-deep">
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
