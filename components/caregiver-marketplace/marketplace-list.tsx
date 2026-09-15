'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MarketplaceCaregiver } from '@/lib/caregiver-marketplace';

export default function CaregiverMarketplaceList({ caregivers }: { caregivers: MarketplaceCaregiver[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [specialization, setSpecialization] = useState('all');
  const [language, setLanguage] = useState('all');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [sortBy, setSortBy] = useState('recommended');

  const specializations = useMemo(
    () => Array.from(new Set(caregivers.flatMap((caregiver) => caregiver.specializations ?? []) )).sort(),
    [caregivers],
  );

  const languages = useMemo(
    () => Array.from(new Set(caregivers.flatMap((caregiver) => caregiver.languages ?? []) )).sort(),
    [caregivers],
  );

  const filteredCaregivers = useMemo(() => {
    let results = [...caregivers];

    const searchValue = search.trim().toLowerCase();
    if (searchValue) {
      results = results.filter((caregiver) => {
        const searchable = [
          caregiver.professional_title,
          caregiver.service_area ?? '',
          ...(caregiver.specializations ?? []),
          ...(caregiver.languages ?? []),
          ...(caregiver.services ?? []).map((service) => service.service_name),
        ]
          .join(' ')
          .toLowerCase();

        return searchable.includes(searchValue);
      });
    }

    const locationValue = location.trim().toLowerCase();
    if (locationValue) {
      results = results.filter((caregiver) => (caregiver.service_area ?? '').toLowerCase().includes(locationValue));
    }

    if (specialization !== 'all') {
      results = results.filter((caregiver) => (caregiver.specializations ?? []).some((item) => item.toLowerCase() === specialization.toLowerCase()));
    }

    if (language !== 'all') {
      results = results.filter((caregiver) => (caregiver.languages ?? []).some((item) => item.toLowerCase() === language.toLowerCase()));
    }

    if (availableOnly) {
      results = results.filter((caregiver) => caregiver.is_available === true);
    }

    if (sortBy === 'rating') {
      results.sort((a, b) => b.rating - a.rating);
    }

    if (sortBy === 'experience') {
      results.sort((a, b) => b.years_of_experience - a.years_of_experience);
    }

    if (sortBy === 'price_low') {
      results.sort((a, b) => {
        const priceA = a.hourly_rate ?? Number.MAX_SAFE_INTEGER;
        const priceB = b.hourly_rate ?? Number.MAX_SAFE_INTEGER;
        return priceA - priceB;
      });
    }

    if (sortBy === 'recommended') {
      results.sort((a, b) => {
        const scoreA = a.rating * 10 + a.years_of_experience + (a.is_available ? 5 : 0);
        const scoreB = b.rating * 10 + b.years_of_experience + (b.is_available ? 5 : 0);
        return scoreB - scoreA;
      });
    }

    return results;
  }, [caregivers, location, language, search, sortBy, specialization, availableOnly]);

  const displayedCaregivers =
    searchPerformed || search || location || specialization !== 'all' || language !== 'all' || availableOnly
      ? filteredCaregivers
      : caregivers;

  const clearFilters = () => {
    setSearch('');
    setLocation('');
    setSpecialization('all');
    setLanguage('all');
    setAvailableOnly(false);
    setSearchPerformed(false);
    setSortBy('recommended');
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-bold tracking-wide text-teal-600">ONCOCARE+</p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">Caregiver Marketplace</h1>
          </div>

        </div>
      </header>

      <section className="border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-xs font-bold tracking-wide text-teal-600">PATIENT CARE</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Find the right caregiver for your needs</h2>
          <p className="mt-3 text-sm text-slate-500">
            Browse verified caregivers based on experience, specialization, language, location and availability.
          </p>

          <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr]">
              <div>
                <label htmlFor="search" className="mb-2 block text-xs font-semibold text-slate-700">Search</label>
                <input
                  id="search"
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search caregiver or care type..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </div>

              <div>
                <label htmlFor="location" className="mb-2 block text-xs font-semibold text-slate-700">Location</label>
                <input
                  id="location"
                  type="text"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="City or area"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </div>

              <div>
                <label htmlFor="specialization" className="mb-2 block text-xs font-semibold text-slate-700">Specialization</label>
                <select
                  id="specialization"
                  value={specialization}
                  onChange={(event) => setSpecialization(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                >
                  <option value="all">All Specializations</option>
                  {specializations.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="language" className="mb-2 block text-xs font-semibold text-slate-700">Language</label>
                <select
                  id="language"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                >
                  <option value="all">All Languages</option>
                  {languages.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={availableOnly}
                  onChange={(event) => setAvailableOnly(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Show only currently available caregivers
              </label>

              <div className="flex gap-2">
                <button type="button" onClick={clearFilters} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                  Clear Filters
                </button>
                <button type="button" onClick={() => setSearchPerformed(true)} className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700">
                  Search Caregivers
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="min-h-[55vh] bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Verified Caregivers</h2>
              <p className="mt-1 text-xs text-slate-500">
                {displayedCaregivers.length} {displayedCaregivers.length === 1 ? 'caregiver' : 'caregivers'} found
              </p>
            </div>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            >
              <option value="recommended">Recommended</option>
              <option value="rating">Highest Rated</option>
              <option value="experience">Most Experienced</option>
              <option value="price_low">Lowest Price</option>
            </select>
          </div>

          {displayedCaregivers.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-6 py-20 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 text-2xl">🔎</div>
              <h3 className="mt-5 text-lg font-bold text-slate-900">No caregivers found</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Try changing your search or removing some filters.</p>
              <button type="button" onClick={clearFilters} className="mt-6 rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700">
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {displayedCaregivers.map((caregiver) => (
                <article key={caregiver.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal-50 text-lg font-bold text-teal-700">
                          {(caregiver.professional_title || 'C').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900">{caregiver.professional_title}</h3>
                          <p className="mt-1 text-xs text-slate-500">{caregiver.years_of_experience} years of experience</p>
                        </div>
                      </div>

                      <button type="button" aria-label="Save caregiver" className="text-xl text-slate-300 transition hover:text-teal-500">
                        ♡
                      </button>
                    </div>

                    {caregiver.verification_status === 'verified' && (
                      <div className="mt-4 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                        ✓ Verified Caregiver
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-3 border-y border-slate-100 py-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Rating</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">★ {caregiver.rating.toFixed(1)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Reviews</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{caregiver.review_count}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Experience</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{caregiver.years_of_experience} yrs</p>
                      </div>
                    </div>

                    {caregiver.service_area && (
                      <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                        <span>📍</span>
                        <span>{caregiver.service_area}</span>
                      </div>
                    )}

                    {caregiver.languages.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {caregiver.languages.slice(0, 3).map((language) => (
                          <span key={`${caregiver.id}-${language}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                            {language}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Starting from</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">
                          {caregiver.hourly_rate ? `₹${caregiver.hourly_rate}` : 'Custom'}
                          <span className="text-xs font-medium text-slate-500">/hr</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/caregiver-marketplace/caregivers/${caregiver.id}`)}
                        className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
                      >
                        View Profile
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
