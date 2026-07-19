'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Clock, Star, TrendingDown, ArrowUpRight, ShieldCheck } from 'lucide-react';
import type { Medicine, MedicinePrice } from '@/lib/medicine-types';
import { availabilityConfig, formatINR } from '@/lib/medicine-types';
import { cn } from '@/lib/utils';

type SortBy = 'price' | 'distance' | 'delivery' | 'rating';

const sortOptions: { value: SortBy; label: string }[] = [
  { value: 'price', label: 'Lowest Price' },
  { value: 'distance', label: 'Nearest' },
  { value: 'delivery', label: 'Fastest Delivery' },
  { value: 'rating', label: 'Highest Rated' },
];

export function PriceComparisonTable({
  medicine,
  prices,
}: {
  medicine: Medicine;
  prices: MedicinePrice[];
}) {
  const [sortBy, setSortBy] = useState<SortBy>('price');

  const sorted = useMemo(() => {
    const available = prices.filter((p) => p.availability !== 'out_of_stock');
    const sortedCopy = [...available];
    switch (sortBy) {
      case 'price':
        return sortedCopy.sort((a, b) => a.current_price - b.current_price);
      case 'distance':
        return sortedCopy.sort((a, b) => a.distance_km - b.distance_km);
      case 'delivery':
        return sortedCopy.sort((a, b) => a.delivery_time_hours - b.delivery_time_hours);
      case 'rating':
        return sortedCopy.sort((a, b) => (b.pharmacy?.rating || 0) - (a.pharmacy?.rating || 0));
      default:
        return sortedCopy;
    }
  }, [prices, sortBy]);

  const lowestPrice = sorted.length > 0 ? sorted[0].current_price : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Price Comparison</h3>
          <p className="text-xs text-slate-500">
            {sorted.length} pharmacies with this medicine in stock
          </p>
        </div>
        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400">Sort by:</span>
          <div className="flex flex-wrap gap-1.5">
            {sortOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setSortBy(option.value)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                  sortBy === option.value
                    ? 'bg-gradient-to-r from-emerald-deep to-teal-500 text-white shadow-md shadow-teal-500/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table — desktop */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3">Pharmacy</th>
              <th className="px-5 py-3">Current Price</th>
              <th className="px-5 py-3">MRP</th>
              <th className="px-5 py-3">Discount</th>
              <th className="px-5 py-3">Availability</th>
              <th className="px-5 py-3">Distance</th>
              <th className="px-5 py-3">Delivery</th>
              <th className="px-5 py-3">Rating</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((price, i) => {
              const isLowest = lowestPrice === price.current_price;
              const avail = availabilityConfig[price.availability];
              return (
                <motion.tr
                  key={price.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className={cn(
                    'border-b border-slate-50 transition-colors hover:bg-teal-50/30',
                    isLowest && 'bg-emerald-50/40'
                  )}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-50 to-emerald-50 text-xs font-bold text-emerald-deep ring-1 ring-teal-200/40">
                        {price.pharmacy?.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                          {price.pharmacy?.name}
                          {price.pharmacy?.is_verified && (
                            <ShieldCheck className="h-3 w-3 text-teal-500" />
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">{price.pharmacy?.city}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        {formatINR(price.current_price)}
                      </span>
                      {isLowest && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          Best Price
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500">{formatINR(medicine.mrp)}</td>
                  <td className="px-5 py-4">
                    {price.discount_percent > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                        <TrendingDown className="h-3 w-3" />
                        {price.discount_percent}%
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold',
                      avail.color, avail.bg
                    )}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', avail.dot)} />
                      {avail.label}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="flex items-center gap-1 text-xs text-slate-600">
                      <MapPin className="h-3 w-3 text-slate-400" />
                      {price.distance_km} km
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="flex items-center gap-1 text-xs text-slate-600">
                      <Clock className="h-3 w-3 text-slate-400" />
                      {price.delivery_time_hours}h
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="flex items-center gap-1 text-xs font-medium text-slate-700">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {price.pharmacy?.rating.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <a
                      href="#"
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all hover:bg-teal-100 hover:text-emerald-deep"
                    >
                      Visit
                      <ArrowUpRight className="h-3 w-3" />
                    </a>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cards — mobile */}
      <div className="space-y-3 p-4 md:hidden">
        {sorted.map((price, i) => {
          const isLowest = lowestPrice === price.current_price;
          const avail = availabilityConfig[price.availability];
          return (
            <div
              key={price.id}
              className={cn(
                'rounded-xl border p-4',
                isLowest ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-50 to-emerald-50 text-xs font-bold text-emerald-deep ring-1 ring-teal-200/40">
                    {price.pharmacy?.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                      {price.pharmacy?.name}
                      {price.pharmacy?.is_verified && <ShieldCheck className="h-3 w-3 text-teal-500" />}
                    </div>
                    <div className="text-[10px] text-slate-400">{price.pharmacy?.city}</div>
                  </div>
                </div>
                {isLowest && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    Best Price
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-lg font-bold text-slate-900">{formatINR(price.current_price)}</span>
                <span className="text-xs text-slate-400 line-through">{formatINR(medicine.mrp)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
                <span className={cn('flex items-center gap-1', avail.color)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', avail.dot)} />
                  {avail.label}
                </span>
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{price.distance_km} km</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{price.delivery_time_hours}h</span>
                <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{price.pharmacy?.rating.toFixed(1)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length === 0 && (
        <div className="p-12 text-center">
          <p className="text-sm font-medium text-slate-500">No pharmacies currently have this medicine in stock.</p>
          <p className="mt-1 text-xs text-slate-400">Set up a restock alert to be notified when it becomes available.</p>
        </div>
      )}
    </div>
  );
}
