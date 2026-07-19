'use client';

import { motion } from 'framer-motion';
import { Sparkles, TrendingDown, Info, Stethoscope } from 'lucide-react';
import type { Medicine, MedicinePrice, GenericAlternative } from '@/lib/medicine-types';
import { formatINR } from '@/lib/medicine-types';

export function AIInsightsCard({
  medicine,
  prices,
  generics,
}: {
  medicine: Medicine;
  prices: MedicinePrice[];
  generics: GenericAlternative[];
}) {
  const inStockPrices = prices.filter((p) => p.availability !== 'out_of_stock');
  const lowestPrice = inStockPrices.length > 0
    ? Math.min(...inStockPrices.map((p) => p.current_price))
    : 0;
  const avgPrice = inStockPrices.length > 0
    ? inStockPrices.reduce((sum, p) => sum + p.current_price, 0) / inStockPrices.length
    : 0;
  const savingsVsMrp = medicine.mrp - lowestPrice;
  const savingsPercent = medicine.mrp > 0 ? Math.round((savingsVsMrp / medicine.mrp) * 100) : 0;
  const bestPharmacy = inStockPrices.find((p) => p.current_price === lowestPrice)?.pharmacy;
  const hasGenerics = generics.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-teal-200/40 bg-gradient-to-br from-teal-50 via-emerald-50 to-blue-50 p-6 shadow-lg shadow-teal-500/5"
    >
      {/* Glow */}
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-teal-300/20 blur-3xl" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-deep to-teal-400 shadow-md shadow-teal-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">AI Price Insight</h3>
            <p className="text-xs text-slate-500">Powered by OncoCare+ Intelligence</p>
          </div>
        </div>

        {/* Insight body */}
        <div className="mt-5 space-y-3">
          {bestPharmacy && (
            <div className="flex items-start gap-3 rounded-xl bg-white/60 p-3 backdrop-blur-sm">
              <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-sm leading-relaxed text-slate-700">
                <span className="font-semibold">{medicine.name}</span> is currently available at the lowest price of{' '}
                <span className="font-bold text-emerald-deep">{formatINR(lowestPrice)}</span> from{' '}
                <span className="font-semibold">{bestPharmacy.name}</span>, which is{' '}
                <span className="font-semibold text-emerald-600">{savingsPercent}% below MRP</span>.
                The average market price is {formatINR(Math.round(avgPrice))}.
              </p>
            </div>
          )}

          {hasGenerics && (
            <div className="flex items-start gap-3 rounded-xl bg-white/60 p-3 backdrop-blur-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              <p className="text-sm leading-relaxed text-slate-700">
                A <span className="font-semibold">generic alternative</span> may be available at a lower price.
                See the generic alternatives section below for details.
              </p>
            </div>
          )}

          {/* Medical disclaimer */}
          <div className="flex items-start gap-3 rounded-xl bg-amber-50/80 p-3 ring-1 ring-amber-200/40">
            <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs leading-relaxed text-amber-800">
              <span className="font-semibold">Medical Notice:</span> Never change or switch prescribed medication
              without consulting your treating oncologist or pharmacist. Price information is for comparison only
              and does not constitute medical advice.
            </p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/70 p-3 text-center backdrop-blur-sm">
            <div className="text-lg font-bold text-emerald-deep">{formatINR(lowestPrice)}</div>
            <div className="text-[10px] text-slate-500">Lowest Price</div>
          </div>
          <div className="rounded-xl bg-white/70 p-3 text-center backdrop-blur-sm">
            <div className="text-lg font-bold text-slate-700">{formatINR(Math.round(avgPrice))}</div>
            <div className="text-[10px] text-slate-500">Avg. Price</div>
          </div>
          <div className="rounded-xl bg-white/70 p-3 text-center backdrop-blur-sm">
            <div className="text-lg font-bold text-emerald-600">{savingsPercent}%</div>
            <div className="text-[10px] text-slate-500">Max Savings</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
