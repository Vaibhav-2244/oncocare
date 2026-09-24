'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft, MapPin, Phone, Clock, Star, ShieldCheck, Truck, Navigation,
  Heart, Pill, Package, Syringe, Percent, MessageSquare,
} from 'lucide-react';
import {
  getPharmacyById, getPharmacyReviews, getPharmacyMedicines,
  toggleFavouritePharmacy, getFavouritePharmacies,
} from '@/lib/medicine-api';
import type { Pharmacy, PharmacyReview, MedicinePrice } from '@/lib/medicine-types';
import { availabilityConfig, formatINR } from '@/lib/medicine-types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';

export default function PharmacyProfilePage() {
  const { user } = useAuth();
  const params = useParams();
  const pharmacyId = params.id as string;

  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [reviews, setReviews] = useState<PharmacyReview[]>([]);
  const [medicines, setMedicines] = useState<MedicinePrice[]>([]);
  const [isFavourite, setIsFavourite] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pharm, revs, meds, favs] = await Promise.all([
        getPharmacyById(pharmacyId),
        getPharmacyReviews(pharmacyId),
        getPharmacyMedicines(pharmacyId),
        user ? getFavouritePharmacies(user.id) : Promise.resolve([]),
      ]);
      setPharmacy(pharm);
      setReviews(revs);
      setMedicines(meds);
      setIsFavourite(favs.some((f) => f.pharmacy_id === pharmacyId));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [pharmacyId, user]);

  useEffect(() => {
    if (!pharmacyId) return;
    loadData();
  }, [pharmacyId, loadData]);

  const handleToggleFav = async () => {
    if (!user) return;
    try {
      const fav = await toggleFavouritePharmacy(user.id, pharmacyId);
      setIsFavourite(fav);
    } catch {
      // silently fail
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white pt-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-200 border-t-teal-500" />
      </div>
    );
  }

  if (!pharmacy) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white pt-20">
        <p className="text-sm font-medium text-slate-500">Pharmacy not found</p>
        <a href="/medicine-finder" className="mt-4 text-sm font-semibold text-emerald-deep">Back to Medicine Finder</a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pt-20">
      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Back */}
        <a
          href="/medicine-finder"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-all hover:border-teal-300 hover:text-emerald-deep"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Medicine Finder
        </a>

        {/* Pharmacy header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm"
        >
          <div className="relative bg-gradient-to-br from-teal-50 via-emerald-50 to-blue-50 p-8">
            <div className="absolute inset-0 bg-grid opacity-20" />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-deep to-teal-400 text-2xl font-bold text-white shadow-lg shadow-teal-500/20">
                  {pharmacy.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-slate-900">{pharmacy.name}</h1>
                    {pharmacy.is_verified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-deep">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Verified
                      </span>
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    {pharmacy.address}, {pharmacy.city}, {pharmacy.state} {pharmacy.pincode}
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="flex items-center gap-1 text-sm font-semibold text-slate-700">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      {pharmacy.rating.toFixed(1)}
                      <span className="text-xs font-normal text-slate-400">({pharmacy.review_count} reviews)</span>
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleToggleFav}
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
                  isFavourite
                    ? 'bg-rose-50 text-rose-500 ring-1 ring-rose-200'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:text-rose-500'
                )}
              >
                <Heart className={cn('h-4 w-4', isFavourite && 'fill-rose-500 text-rose-500')} />
                {isFavourite ? 'Favourited' : 'Add to Favourites'}
              </button>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
            <InfoCard icon={Phone} label="Contact" value={pharmacy.contact_number || 'N/A'} />
            <InfoCard icon={Clock} label="Hours" value={pharmacy.operating_hours} />
            <InfoCard icon={Navigation} label="Location" value={`${pharmacy.city}, ${pharmacy.state}`} />
            <InfoCard icon={Truck} label="Delivery" value={pharmacy.home_delivery ? 'Available' : 'Not available'} />
          </div>

          {/* Capabilities */}
          <div className="flex flex-wrap gap-2 border-t border-slate-100 p-6">
            {pharmacy.is_24x7 && <Badge icon={Clock} label="Open 24x7" />}
            {pharmacy.home_delivery && <Badge icon={Truck} label="Home Delivery" />}
            {pharmacy.cancer_medicines && <Badge icon={Pill} label="Cancer Medicines" />}
            {pharmacy.injectables && <Badge icon={Syringe} label="Injectables" />}
            {pharmacy.discount_available && <Badge icon={Percent} label="Discounts Available" />}
          </div>
        </motion.div>

        {/* Map placeholder */}
        <div className="relative mt-6 h-56 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 to-teal-50/50">
          <div className="absolute inset-0 bg-grid opacity-30" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Navigation className="h-8 w-8 text-slate-400" />
            <span className="text-xs font-medium text-slate-500">{pharmacy.address}</span>
            <span className="text-[11px] text-slate-400">
              {pharmacy.latitude}, {pharmacy.longitude}
            </span>
          </div>
        </div>

        {/* Available medicines */}
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Available Medicines ({medicines.length})</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {medicines.map((med, i) => {
              const avail = availabilityConfig[med.availability];
              return (
                <motion.div
                  key={med.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Pill className="h-4 w-4 text-teal-500" />
                      <span className="text-sm font-semibold text-slate-800">{med.medicine?.name}</span>
                    </div>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', avail.color, avail.bg)}>
                      {avail.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{med.medicine?.generic_name} · {med.medicine?.strength}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900">{formatINR(med.current_price)}</span>
                    {med.discount_percent > 0 && (
                      <span className="text-[10px] font-semibold text-emerald-600">{med.discount_percent}% off</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Reviews */}
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Reviews ({reviews.length})</h2>
          <div className="space-y-3">
            {reviews.map((review) => (
              <div key={review.id} className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-50 to-emerald-50 text-xs font-bold text-emerald-deep ring-1 ring-teal-200/40">
                      {review.author_name.charAt(0)}
                    </div>
                    <span className="text-sm font-semibold text-slate-800">{review.author_name}</span>
                  </div>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={cn('h-3.5 w-3.5', i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200')} />
                    ))}
                  </div>
                </div>
                {review.comment && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{review.comment}</p>
                )}
              </div>
            ))}
            {reviews.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                <MessageSquare className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">No reviews yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
      <Icon className="h-4 w-4 text-teal-500" />
      <div className="mt-2 text-sm font-bold text-slate-800">{value}</div>
      <div className="text-[11px] text-slate-400">{label}</div>
    </div>
  );
}

function Badge({ icon: Icon, label }: { icon: typeof Clock; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-emerald-deep ring-1 ring-teal-200/40">
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
