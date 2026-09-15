'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, TrendingUp, ShieldCheck, Building2, ArrowLeft, Pill, X } from 'lucide-react';
import { MedicineSearchBar } from '@/components/medicine/search-bar';
import { MedicineCard } from '@/components/medicine/medicine-card';
import { PriceComparisonTable } from '@/components/medicine/price-comparison';
import { AIInsightsCard } from '@/components/medicine/ai-insights';
import { GenericAlternatives } from '@/components/medicine/generic-alternatives';
import { NearbyPharmacies } from '@/components/medicine/nearby-pharmacies';
import { UserFeaturesPanel, FutureAIFeatures } from '@/components/medicine/user-features';
import {
  searchMedicines,
  getMedicinePrices,
  getGenericAlternatives,
  getAllPharmacies,
  getWatchlist,
  getRecentlyViewed,
  getFavouritePharmacies,
  addToRecentlyViewed,
  toggleFavouritePharmacy,
  addToWatchlist,
  removeFromWatchlist,
} from '@/lib/medicine-api';
import type { Medicine, MedicinePrice, Pharmacy, GenericAlternative, WatchlistItem, RecentlyViewed, FavouritePharmacy } from '@/lib/medicine-types';
import { popularSearches } from '@/lib/medicine-types';

export default function MedicineFinderPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [prices, setPrices] = useState<MedicinePrice[]>([]);
  const [generics, setGenerics] = useState<GenericAlternative[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewed[]>([]);
  const [favouritePharmacies, setFavouritePharmacies] = useState<FavouritePharmacy[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  // Initial load
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [pharms, wl, rv, favs] = await Promise.all([
        getAllPharmacies(),
        getWatchlist(),
        getRecentlyViewed(),
        getFavouritePharmacies(),
      ]);
      setPharmacies(pharms);
      setWatchlist(wl);
      setRecentlyViewed(rv);
      setFavouritePharmacies(favs);
    } catch (e) {
      // silently fail — data will show as empty
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    setHasSearched(true);
    setShowDetail(false);
    setSelectedMedicine(null);
    setLoading(true);
    try {
      const results = await searchMedicines(query);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMedicine = async (medicine: Medicine) => {
    setSelectedMedicine(medicine);
    setShowDetail(true);
    setLoading(true);
    try {
      const [priceData, genericData] = await Promise.all([
        getMedicinePrices(medicine.id),
        getGenericAlternatives(medicine.id),
      ]);
      setPrices(priceData);
      setGenerics(genericData);
      await addToRecentlyViewed(medicine.id);
      const rv = await getRecentlyViewed();
      setRecentlyViewed(rv);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setShowDetail(false);
    setSelectedMedicine(null);
  };

  const handleToggleFavourite = async (pharmacyId: string) => {
    try {
      await toggleFavouritePharmacy(pharmacyId);
      const favs = await getFavouritePharmacies();
      setFavouritePharmacies(favs);
    } catch {
      // silently fail
    }
  };

  const favouriteIds = new Set(favouritePharmacies.map((f) => f.pharmacy_id));

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-12 sm:pt-36 sm:pb-16">
        {/* Background */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-teal-50/40 via-white to-white" />
        <div className="absolute inset-0 -z-10 bg-grid mask-fade-b opacity-40" />
        <div className="absolute left-1/2 top-0 -z-10 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-br from-teal-200/20 via-emerald-100/15 to-blue-200/15 blur-3xl" />

        <div className="mx-auto max-w-4xl px-6">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-200/60 bg-white/80 px-4 py-1.5 text-xs font-semibold text-emerald-deep shadow-sm backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-teal-500" />
              Medicine Price Intelligence
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-8 text-center text-balance text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl md:text-6xl"
          >
            Find Cancer Medicines at the{' '}
            <span className="gradient-text animate-gradient">Best Available Price</span>
          </motion.h1>

          {/* Subheading */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mx-auto mt-5 max-w-2xl text-center text-pretty text-base leading-relaxed text-slate-600 sm:text-lg"
          >
            Search trusted pharmacies, compare prices, check availability, and locate nearby stores—all in one place.
          </motion.p>

          {/* Search bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-10"
          >
            <MedicineSearchBar onSearch={handleSearch} onSelectMedicine={handleSelectMedicine} />

            {/* Example searches */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs font-medium text-slate-400">Try:</span>
              {popularSearches.map((med) => (
                <button
                  key={med}
                  onClick={() => handleSearch(med)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition-all hover:border-teal-300 hover:bg-teal-50 hover:text-emerald-deep"
                >
                  {med}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500"
          >
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-teal-500" /> Verified Pharmacies</span>
            <span className="flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-teal-500" /> Real-Time Prices</span>
            <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4 text-teal-500" /> {pharmacies.length}+ Partner Stores</span>
          </motion.div>
        </div>
      </section>

      {/* Main content */}
      <section className="px-6 pb-24">
        <div className="mx-auto max-w-7xl">
          <AnimatePresence mode="wait">
            {/* Detail view */}
            {showDetail && selectedMedicine ? (
              <motion.div
                key="detail"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Back button */}
                <button
                  onClick={handleBack}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-all hover:border-teal-300 hover:text-emerald-deep"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to results
                </button>

                {/* Medicine header */}
                <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-50 ring-1 ring-teal-200/40">
                        <Pill className="h-7 w-7 text-emerald-deep" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900">{selectedMedicine.name}</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          {selectedMedicine.generic_name} · {selectedMedicine.strength} · {selectedMedicine.form}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                            {selectedMedicine.category}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                            {selectedMedicine.manufacturer}
                          </span>
                          {selectedMedicine.prescription_required && (
                            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600">
                              Prescription Required
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">MRP</div>
                      <div className="text-2xl font-bold text-slate-900">
                        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(selectedMedicine.mrp)}
                      </div>
                    </div>
                  </div>
                  {selectedMedicine.description && (
                    <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-relaxed text-slate-600">
                      {selectedMedicine.description}
                    </p>
                  )}
                </div>

                {/* AI Insights + Price Comparison */}
                <div className="grid gap-6 lg:grid-cols-12">
                  <div className="lg:col-span-5">
                    <AIInsightsCard medicine={selectedMedicine} prices={prices} generics={generics} />
                  </div>
                  <div className="lg:col-span-7">
                    <PriceComparisonTable medicine={selectedMedicine} prices={prices} />
                  </div>
                </div>

                {/* Generic Alternatives */}
                {generics.length > 0 && (
                  <GenericAlternatives generics={generics} brandMedicine={selectedMedicine} />
                )}
              </motion.div>
            ) : (
              /* Search results / default view */
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-12"
              >
                {/* Search results */}
                {hasSearched && (
                  <div>
                    <div className="mb-6 flex items-center justify-between">
                      <h2 className="text-xl font-bold text-slate-900">
                        {loading ? 'Searching...' : `${searchResults.length} medicines found`}
                        {searchQuery && <span className="ml-2 text-sm font-normal text-slate-500">for &quot;{searchQuery}&quot;</span>}
                      </h2>
                    </div>

                    {loading ? (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                          <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />
                        ))}
                      </div>
                    ) : searchResults.length > 0 ? (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {searchResults.map((medicine, i) => (
                          <MedicineCard
                            key={medicine.id}
                            medicine={medicine}
                            prices={[]}
                            onSelect={handleSelectMedicine}
                            index={i}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center">
                        <Pill className="mx-auto h-10 w-10 text-slate-300" />
                        <p className="mt-4 text-sm font-medium text-slate-600">No medicines found</p>
                        <p className="mt-1 text-xs text-slate-400">Try searching by generic name, manufacturer, or category</p>
                      </div>
                    )}
                  </div>
                )}

                {/* User features panel */}
                <div>
                  <h2 className="mb-6 text-xl font-bold text-slate-900">Your Medicine Dashboard</h2>
                  <UserFeaturesPanel
                    watchlist={watchlist}
                    recentlyViewed={recentlyViewed}
                    favouritePharmacies={favouritePharmacies}
                  />
                </div>

                {/* Nearby pharmacies */}
                <div>
                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-slate-900">Nearby Verified Pharmacies</h2>
                    <p className="mt-1 text-sm text-slate-500">Locate trusted pharmacies near you with cancer medicine availability</p>
                  </div>
                  <NearbyPharmacies
                    pharmacies={pharmacies}
                    onSelectPharmacy={() => {}}
                    favouriteIds={favouriteIds}
                    onToggleFavourite={handleToggleFavourite}
                  />
                </div>

                {/* Future AI features */}
                <div>
                  <div className="mb-6">
                    <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-deep ring-1 ring-teal-200/60">
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
                      Coming Soon
                    </span>
                    <h2 className="mt-4 text-2xl font-bold text-slate-900">
                      Future <span className="gradient-text">AI-Powered</span> Features
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      We&apos;re building intelligent tools to make medicine discovery even smarter.
                    </p>
                  </div>
                  <FutureAIFeatures />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}
