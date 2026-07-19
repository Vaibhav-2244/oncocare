'use client';

import { motion } from 'framer-motion';
import { Pill, MapPin, Clock, ShieldCheck, FileText, TrendingDown, Star, ArrowRight } from 'lucide-react';
import type { Medicine, MedicinePrice } from '@/lib/medicine-types';
import { availabilityConfig, formatINR } from '@/lib/medicine-types';
import { cn } from '@/lib/utils';

export function MedicineCard({
  medicine,
  prices,
  onSelect,
  index = 0,
}: {
  medicine: Medicine;
  prices: MedicinePrice[];
  onSelect: (medicine: Medicine) => void;
  index?: number;
}) {
  const inStockPrices = prices.filter((p) => p.availability !== 'out_of_stock');
  const lowestPrice = inStockPrices.length > 0
    ? Math.min(...inStockPrices.map((p) => p.current_price))
    : null;
  const bestPriceEntry = inStockPrices.find((p) => p.current_price === lowestPrice);
  const discount = bestPriceEntry ? bestPriceEntry.discount_percent : 0;
  const availability = bestPriceEntry?.availability || 'out_of_stock';
  const availConfig = availabilityConfig[availability];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ y: -4 }}
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all hover:border-teal-200 hover:shadow-xl hover:shadow-slate-900/5"
      onClick={() => onSelect(medicine)}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 ring-1 ring-teal-200/40">
            <Pill className="h-5 w-5 text-emerald-deep" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-deep">
              {medicine.name}
            </h3>
            <p className="text-xs text-slate-500">
              {medicine.generic_name} · {medicine.strength} · {medicine.form}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1',
            availConfig.color, availConfig.bg, 'ring-current/20'
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', availConfig.dot)} />
            {availConfig.label}
          </span>
        </div>
      </div>

      {/* Badges */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {medicine.prescription_required && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 ring-1 ring-blue-200/40">
            <FileText className="h-2.5 w-2.5" />
            Rx Required
          </span>
        )}
        {bestPriceEntry?.pharmacy?.is_verified && (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-emerald-deep ring-1 ring-teal-200/40">
            <ShieldCheck className="h-2.5 w-2.5" />
            Verified Pharmacy
          </span>
        )}
        {discount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-200/40">
            <TrendingDown className="h-2.5 w-2.5" />
            {discount}% Off
          </span>
        )}
      </div>

      {/* Price + pharmacy info */}
      <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4">
        <div>
          {lowestPrice !== null ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-900">{formatINR(lowestPrice)}</span>
                {medicine.mrp > lowestPrice && (
                  <span className="text-xs text-slate-400 line-through">{formatINR(medicine.mrp)}</span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
                {bestPriceEntry?.pharmacy && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {bestPriceEntry.pharmacy.name}
                  </span>
                )}
                {bestPriceEntry && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {bestPriceEntry.delivery_time_hours}h delivery
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="text-sm font-medium text-slate-400">Currently out of stock</div>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs font-semibold text-teal-600 opacity-0 transition-opacity group-hover:opacity-100">
          Compare
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </motion.div>
  );
}
