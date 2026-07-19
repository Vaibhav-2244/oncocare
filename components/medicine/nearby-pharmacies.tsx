'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Clock, Star, ShieldCheck, Truck, Syringe, Percent, Navigation, Heart } from 'lucide-react';
import type { Pharmacy } from '@/lib/medicine-types';
import { cn } from '@/lib/utils';

interface Filter {
  key: keyof Pharmacy;
  label: string;
  icon: typeof Clock;
}

const filters: Filter[] = [
  { key: 'is_24x7', label: 'Open 24x7', icon: Clock },
  { key: 'home_delivery', label: 'Home Delivery', icon: Truck },
  { key: 'cancer_medicines', label: 'Cancer Medicines', icon: ShieldCheck },
  { key: 'injectables', label: 'Injectables', icon: Syringe },
  { key: 'discount_available', label: 'Discount Available', icon: Percent },
];

export function NearbyPharmacies({
  pharmacies,
  onSelectPharmacy,
  favouriteIds,
  onToggleFavourite,
}: {
  pharmacies: Pharmacy[];
  onSelectPharmacy: (pharmacy: Pharmacy) => void;
  favouriteIds: Set<string>;
  onToggleFavourite: (pharmacyId: string) => void;
}) {
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const toggleFilter = (key: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (activeFilters.size === 0) return pharmacies;
    return pharmacies.filter((p) => {
      return Array.from(activeFilters).every((key) => p[key as keyof Pharmacy] === true);
    });
  }, [pharmacies, activeFilters]);

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-400">Filters:</span>
        {filters.map((filter) => {
          const isActive = activeFilters.has(filter.key as string);
          return (
            <button
              key={filter.key as string}
              onClick={() => toggleFilter(filter.key as string)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                isActive
                  ? 'bg-gradient-to-r from-emerald-deep to-teal-500 text-white shadow-md shadow-teal-500/20'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-emerald-deep'
              )}
            >
              <filter.icon className="h-3 w-3" />
              {filter.label}
            </button>
          );
        })}
      </div>

      {/* Map placeholder */}
      <div className="relative mb-6 h-48 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 to-teal-50/50">
        <div className="absolute inset-0 bg-grid opacity-40" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Navigation className="h-8 w-8" />
            <span className="text-xs font-medium">Interactive Map — {filtered.length} pharmacies nearby</span>
          </div>
        </div>
        {/* Pharmacy pins */}
        {filtered.slice(0, 6).map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.1 }}
            className="absolute"
            style={{
              left: `${15 + (i * 13) % 70}%`,
              top: `${25 + (i * 17) % 50}%`,
            }}
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-emerald-deep to-teal-400 text-[10px] font-bold text-white shadow-lg ring-2 ring-white">
              {p.name.charAt(0)}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Pharmacy cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((pharmacy, i) => (
          <motion.div
            key={pharmacy.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ y: -4 }}
            onClick={() => onSelectPharmacy(pharmacy)}
            className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all hover:border-teal-200 hover:shadow-xl hover:shadow-slate-900/5"
          >
            {/* Favourite button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavourite(pharmacy.id);
              }}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-500"
            >
              <Heart className={cn('h-4 w-4', favouriteIds.has(pharmacy.id) && 'fill-rose-500 text-rose-500')} />
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 text-lg font-bold text-emerald-deep ring-1 ring-teal-200/40">
                {pharmacy.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate text-sm font-bold text-slate-900 group-hover:text-emerald-deep">
                    {pharmacy.name}
                  </h3>
                  {pharmacy.is_verified && (
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-teal-500" />
                  )}
                </div>
                <p className="truncate text-xs text-slate-500">{pharmacy.address}</p>
              </div>
            </div>

            {/* Info row */}
            <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
              <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-600">
                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                {pharmacy.rating.toFixed(1)} ({pharmacy.review_count})
              </span>
              {pharmacy.is_24x7 && (
                <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-600">
                  <Clock className="h-2.5 w-2.5" />
                  24x7
                </span>
              )}
              {pharmacy.home_delivery && (
                <span className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 font-medium text-emerald-deep">
                  <Truck className="h-2.5 w-2.5" />
                  Delivery
                </span>
              )}
              {pharmacy.discount_available && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-600">
                  <Percent className="h-2.5 w-2.5" />
                  Discount
                </span>
              )}
            </div>

            {/* Address */}
            <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <MapPin className="h-3 w-3" />
              {pharmacy.city}, {pharmacy.state} · {pharmacy.operating_hours}
            </div>
          </motion.div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-slate-500">No pharmacies match your filters.</p>
        </div>
      )}
    </div>
  );
}
