'use client';

import { GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import { Loader2, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type Radius = 5 | 10 | 25 | 50;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface NearbyHospital {
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

const mapLibraries: ('places')[] = ['places'];
const mapContainerStyle = { width: '100%', height: '100%' };

export default function HospitalMap({
  apiKey,
  center,
  hospitals,
  radius,
  selectedHospitalId,
  onSelect,
}: {
  apiKey: string;
  center: { lat: number; lng: number };
  hospitals: NearbyHospital[];
  radius: Radius;
  selectedHospitalId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations('components.nearbyHospitals.hospitalMap');
  const { isLoaded, loadError } = useJsApiLoader({ googleMapsApiKey: apiKey, libraries: mapLibraries });

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-slate-500">
        <MapPin className="h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-700">{t('googleMapsAuthorizationRequired')}</p>
        <p className="mt-1 max-w-sm text-xs leading-5">{t('addHttpLocalhost3000ToTheBrowserKeyHttpReferrerRestrictionsInGoogleCloudConsoleT')}</p>
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('loadingMap')}</div>;
  }

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={center}
      zoom={radius <= 10 ? 12 : radius <= 25 ? 11 : 10}
      options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
    >
      <MarkerF position={center} title={t('yourCurrentLocation')} icon={{ url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' }} />
      {hospitals.map((hospital) => (
        <MarkerF
          key={hospital.id}
          position={{ lat: hospital.latitude, lng: hospital.longitude }}
          title={hospital.name}
          icon={hospital.id === selectedHospitalId ? 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' : undefined}
          onClick={() => onSelect(hospital.id)}
        />
      ))}
    </GoogleMap>
  );
}