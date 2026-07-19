'use client';

import { motion } from 'framer-motion';
import { Bookmark, Clock, Heart, Bell, TrendingUp, Package, Brain, AlertTriangle, Pill, MapPin } from 'lucide-react';
import type { WatchlistItem, RecentlyViewed, FavouritePharmacy } from '@/lib/medicine-types';
import { formatINR } from '@/lib/medicine-types';

export function UserFeaturesPanel({
  watchlist,
  recentlyViewed,
  favouritePharmacies,
}: {
  watchlist: WatchlistItem[];
  recentlyViewed: RecentlyViewed[];
  favouritePharmacies: FavouritePharmacy[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Watchlist */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-50 to-emerald-50 ring-1 ring-teal-200/40">
            <Bookmark className="h-4 w-4 text-emerald-deep" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">My Watchlist</h3>
          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            {watchlist.length}
          </span>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {watchlist.length > 0 ? (
            watchlist.map((item) => (
              <div key={item.id} className="flex items-center gap-3 border-b border-slate-50 p-3 last:border-0">
                <Pill className="h-4 w-4 shrink-0 text-teal-500" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-slate-800">{item.medicine?.name}</div>
                  <div className="text-[10px] text-slate-400">{formatINR(item.medicine?.mrp || 0)}</div>
                </div>
                {item.notify_restock && (
                  <Bell className="h-3.5 w-3.5 text-amber-500" />
                )}
                {item.price_alert_threshold && (
                  <span className="text-[10px] font-semibold text-emerald-600">
                    {formatINR(item.price_alert_threshold)}
                  </span>
                )}
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-xs text-slate-400">
              No medicines in your watchlist yet.
            </div>
          )}
        </div>
      </div>

      {/* Recently viewed */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 ring-1 ring-blue-200/40">
            <Clock className="h-4 w-4 text-blue-500" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Recently Viewed</h3>
          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            {recentlyViewed.length}
          </span>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {recentlyViewed.length > 0 ? (
            recentlyViewed.map((item) => (
              <div key={item.id} className="flex items-center gap-3 border-b border-slate-50 p-3 last:border-0">
                <Pill className="h-4 w-4 shrink-0 text-blue-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-slate-800">{item.medicine?.name}</div>
                  <div className="text-[10px] text-slate-400">{item.medicine?.generic_name}</div>
                </div>
                <span className="text-[10px] text-slate-400">
                  {new Date(item.viewed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-xs text-slate-400">
              No recently viewed medicines.
            </div>
          )}
        </div>
      </div>

      {/* Favourite pharmacies */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-50 to-pink-50 ring-1 ring-rose-200/40">
            <Heart className="h-4 w-4 text-rose-500" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">Favourite Pharmacies</h3>
          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            {favouritePharmacies.length}
          </span>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {favouritePharmacies.length > 0 ? (
            favouritePharmacies.map((item) => (
              <div key={item.id} className="flex items-center gap-3 border-b border-slate-50 p-3 last:border-0">
                <MapPin className="h-4 w-4 shrink-0 text-rose-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-slate-800">{item.pharmacy?.name}</div>
                  <div className="text-[10px] text-slate-400">{item.pharmacy?.city}</div>
                </div>
                <span className="text-[10px] font-medium text-amber-500">
                  {item.pharmacy?.rating.toFixed(1)}
                </span>
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-xs text-slate-400">
              No favourite pharmacies yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FutureAIFeatures() {
  const features = [
    { icon: TrendingUp, title: 'Medicine Price Prediction', description: 'AI forecasts price trends to help you buy at the optimal time.', color: 'from-teal-500 to-emerald-500' },
    { icon: Package, title: 'Availability Prediction', description: 'Predicts stock levels so you can plan ahead before shortages hit.', color: 'from-blue-500 to-indigo-500' },
    { icon: MapPin, title: 'Alternative Pharmacy Suggestions', description: 'Recommends nearby pharmacies when your preferred one is out of stock.', color: 'from-emerald-500 to-teal-500' },
    { icon: AlertTriangle, title: 'Drug Interaction Warnings', description: 'AI checks your medication list for potentially harmful interactions.', color: 'from-amber-500 to-orange-500' },
    { icon: Pill, title: 'Medicine Reminder Integration', description: 'Syncs with your OncoCare+ treatment tracker for seamless reminders.', color: 'from-cyan-500 to-blue-500' },
    { icon: Brain, title: 'Smart Price Alerts', description: 'Get notified instantly when your watched medicine drops in price.', color: 'from-teal-400 to-cyan-500' },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((feature, i) => (
        <motion.div
          key={feature.title}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.05 }}
          className="group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all hover:shadow-lg hover:shadow-slate-900/5"
        >
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} text-white shadow-md`}>
            <feature.icon className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-sm font-bold text-slate-900">{feature.title}</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{feature.description}</p>
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Coming Soon
          </span>
        </motion.div>
      ))}
    </div>
  );
}
