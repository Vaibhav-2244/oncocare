'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Hospital,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  ShieldCheck,
  Star,
  WifiOff,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { DashboardLayout } from '@/components/auth/dashboard-layout';

const mapLibraries: ('places')[] = ['places'];
const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 20.5937, lng: 78.9629 };
const radiusOptions = [5, 10, 25, 50] as const;

type Radius = (typeof radiusOptions)[number];
type SortOption = 'nearest' | 'rating';

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface NearbyHospital {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  rating: number | null;
  reviewCount: number | null;
  openNow: boolean | null;
  mapsUrl: string | null;
  distanceKm: number;
}

interface ApiResponse {
  hospitals?: NearbyHospital[];
  error?: string;
}

function formatDistance(distanceKm: number) {
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m away` : `${distanceKm.toFixed(1)} km away`;
}

function formatReviews(reviewCount: number) {
  return reviewCount >= 1000 ? `${(reviewCount / 1000).toFixed(1)}k reviews` : `${reviewCount} reviews`;
}

function LocationMessage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-semibold">We need your location to search nearby</p>
          <p className="mt-1 text-sm text-amber-800">{message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-800"
          >
            <Navigation className="h-4 w-4" /> Use My Location Again
          </button>
        </div>
      </div>
    </div>
  );
}

function HospitalCard({
  hospital,
  selected,
  onSelect,
}: {
  hospital: NearbyHospital;
  selected: boolean;
  onSelect: () => void;
}) {
  const directionsUrl = hospital.mapsUrl
    || `https://www.google.com/maps/dir/?api=1&destination=${hospital.latitude},${hospital.longitude}`;

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm transition ${selected ? 'border-teal-400 ring-2 ring-teal-100' : 'border-slate-200 hover:border-teal-200'}`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <Hospital className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold leading-5 text-slate-900">{hospital.name}</h2>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-500">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{hospital.address || 'Address unavailable'}</span>
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
        <span className="font-semibold text-teal-700">{formatDistance(hospital.distanceKm)}</span>
        {hospital.rating !== null && (
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {hospital.rating.toFixed(1)}
            {hospital.reviewCount !== null && <span>({formatReviews(hospital.reviewCount)})</span>}
          </span>
        )}
        {hospital.openNow !== null && (
          <span className={hospital.openNow ? 'text-emerald-700' : 'text-rose-600'}>
            {hospital.openNow ? 'Open now' : 'Closed now'}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <a
          href={directionsUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-700"
        >
          <Navigation className="h-3.5 w-3.5" /> Directions
        </a>
        {hospital.phone && (
          <a
            href={`tel:${hospital.phone}`}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
        )}
        {hospital.mapsUrl && (
          <a
            href={hospital.mapsUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <MapPin className="h-3.5 w-3.5" /> View on Map
          </a>
        )}
      </div>
    </article>
  );
}

function HospitalSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((item) => (
        <div key={item} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-slate-100" />
              <div className="h-3 w-full rounded bg-slate-100" />
            </div>
          </div>
          <div className="mt-4 h-3 w-1/2 rounded bg-slate-100" />
          <div className="mt-4 h-8 w-28 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function NearbyHospitalsContent() {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [hospitals, setHospitals] = useState<NearbyHospital[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);
  const [radius, setRadius] = useState<Radius>(25);
  const [sortOption, setSortOption] = useState<SortOption>('nearest');
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const { isLoaded: mapLoaded, loadError: mapLoadError } = useJsApiLoader({
    googleMapsApiKey: mapsApiKey,
    libraries: mapLibraries,
  });

  const searchHospitals = useCallback(async (location: Coordinates, selectedRadius: Radius) => {
    setSearching(true);
    setError(null);
    try {
      const response = await fetch('/api/nearby-hospitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...location, radius: selectedRadius }),
      });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok) throw new Error(data.error || 'Hospital search failed.');
      setHospitals(data.hospitals || []);
      setSelectedHospitalId(data.hospitals?.[0]?.id || null);
    } catch (searchError) {
      setHospitals([]);
      setSelectedHospitalId(null);
      setError(searchError instanceof Error ? searchError.message : 'We could not load nearby hospitals.');
    } finally {
      setSearching(false);
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationMessage('Your browser does not support location services. Try opening OncoCare+ in a current browser.');
      return;
    }

    setLocating(true);
    setLocationMessage(null);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCoordinates(location);
        setLocating(false);
      },
      (geolocationError) => {
        const message = geolocationError.code === geolocationError.PERMISSION_DENIED
          ? 'Location permission was denied. Allow location access in your browser settings, then try again.'
          : geolocationError.code === geolocationError.TIMEOUT
            ? 'The location request took too long. Please check your connection and try again.'
            : 'Your location is currently unavailable. Please try again.';
        setLocationMessage(message);
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    if (coordinates) void searchHospitals(coordinates, radius);
  }, [coordinates, radius, searchHospitals]);

  const sortedHospitals = useMemo(() => [...hospitals].sort((first, second) => (
    sortOption === 'nearest'
      ? first.distanceKm - second.distanceKm
      : (second.rating ?? -1) - (first.rating ?? -1)
  )), [hospitals, sortOption]);

  const mapCenter = coordinates
    ? { lat: coordinates.latitude, lng: coordinates.longitude }
    : defaultCenter;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-teal-700">
          <Hospital className="h-4 w-4" /> Care navigation
        </div>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Nearby Oncology Hospitals</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
          Find hospitals, cancer centres, and medical facilities near your current location so you can plan the next step in care.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-teal-100 bg-teal-50/70 p-4 text-sm text-teal-900">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
        <p>Your location is used only for this hospital search and is not permanently stored. No medical or profile information is sent to Google.</p>
      </div>

      {!coordinates && !locationMessage && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                <MapPin className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Allow location access to begin</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">We need your approximate current location to show nearby hospitals. Your precise location stays in your browser and is used only for this search.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={requestLocation}
              disabled={locating}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-wait disabled:opacity-70"
            >
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
              {locating ? 'Locating...' : 'Use My Current Location'}
            </button>
          </div>
        </div>
      )}

      {locationMessage && <LocationMessage message={locationMessage} onRetry={requestLocation} />}

      {coordinates && (
        <>
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Searching around your current location
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Radius
                <span className="relative">
                  <select
                    value={radius}
                    onChange={(event) => setRadius(Number(event.target.value) as Radius)}
                    className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-700 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  >
                    {radiusOptions.map((option) => <option key={option} value={option}>{option} km</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Sort
                <span className="relative">
                  <select
                    value={sortOption}
                    onChange={(event) => setSortOption(event.target.value as SortOption)}
                    className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-700 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  >
                    <option value="nearest">Nearest</option>
                    <option value="rating">Highest Rated</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </span>
              </label>
            </div>
          </div>

          {error && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <span className="flex items-center gap-2"><WifiOff className="h-4 w-4" /> {error}</span>
              <button type="button" onClick={() => void searchHospitals(coordinates, radius)} className="shrink-0 font-semibold underline">Try Again</button>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
            <section className="order-2 min-w-0 lg:order-1">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Hospitals near you</h2>
                {!searching && <span className="text-xs text-slate-500">{sortedHospitals.length} found</span>}
              </div>
              {searching ? <HospitalSkeleton /> : sortedHospitals.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                  <Hospital className="mx-auto h-8 w-8 text-slate-300" />
                  <h2 className="mt-3 font-semibold text-slate-900">No hospitals found</h2>
                  <p className="mt-1 text-sm text-slate-500">Try a wider search radius or use your location again.</p>
                  <button type="button" onClick={() => setRadius(50)} className="mt-4 text-sm font-semibold text-teal-700 hover:text-teal-800">Search within 50 km</button>
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedHospitals.map((hospital) => (
                    <HospitalCard
                      key={hospital.id}
                      hospital={hospital}
                      selected={hospital.id === selectedHospitalId}
                      onSelect={() => setSelectedHospitalId(hospital.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="order-1 h-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm lg:order-2 lg:h-[640px]">
              {!mapsApiKey || mapLoadError ? (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center text-slate-500">
                  <MapPin className="h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    {mapLoadError ? 'Google Maps authorization required' : 'Map unavailable'}
                  </p>
                  <p className="mt-1 max-w-sm text-xs leading-5">
                    {mapLoadError
                      ? 'Add http://localhost:3000/* to the browser key HTTP referrer restrictions in Google Cloud Console, then restart the dev server.'
                      : 'Hospital results are still available in the list.'}
                  </p>
                </div>
              ) : !mapLoaded ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading map...</div>
              ) : (
                <GoogleMap mapContainerStyle={mapContainerStyle} center={mapCenter} zoom={radius <= 10 ? 12 : radius <= 25 ? 11 : 10} options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}>
                  <MarkerF position={mapCenter} title="Your current location" icon={{ url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' }} />
                  {hospitals.map((hospital) => (
                    <MarkerF
                      key={hospital.id}
                      position={{ lat: hospital.latitude, lng: hospital.longitude }}
                      title={hospital.name}
                      icon={hospital.id === selectedHospitalId
                        ? 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'
                        : undefined}
                      onClick={() => setSelectedHospitalId(hospital.id)}
                    />
                  ))}
                </GoogleMap>
              )}
            </section>
          </div>

          <p className="flex items-center gap-2 text-xs text-slate-400"><Clock3 className="h-3.5 w-3.5" /> Hospital hours, ratings, and phone details are provided by Google and may change.</p>
        </>
      )}
    </div>
  );
}

export default function NearbyHospitalsPage() {
  return (
    <ProtectedRoute>
      <DashboardLayout dashboardTitle="Patient Portal">
        <NearbyHospitalsContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}