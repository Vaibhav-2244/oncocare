import { NextResponse } from 'next/server';

const ALLOWED_RADII = [5, 10, 25, 50] as const;
const PLACES_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const PLACES_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';
const CANCER_SEARCH_RADIUS_KM = 500;
const CANCER_SEARCH_QUERIES = ['oncology hospital', 'cancer treatment center', 'cancer hospital'];

interface NearbyHospitalsRequest {
  latitude?: unknown;
  longitude?: unknown;
  radius?: unknown;
  mode?: unknown;
}

interface GooglePlace {
  id?: unknown;
  displayName?: { text?: unknown };
  formattedAddress?: unknown;
  nationalPhoneNumber?: unknown;
  rating?: unknown;
  userRatingCount?: unknown;
  googleMapsUri?: unknown;
  location?: { latitude?: unknown; longitude?: unknown };
  currentOpeningHours?: { openNow?: unknown };
  types?: unknown;
}

interface GooglePlacesResponse {
  places?: GooglePlace[];
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

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function distanceInKm(
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number,
): number {
  const earthRadiusKm = 6371;
  const latitudeDelta = ((secondLatitude - firstLatitude) * Math.PI) / 180;
  const longitudeDelta = ((secondLongitude - firstLongitude) * Math.PI) / 180;
  const latitude1 = (firstLatitude * Math.PI) / 180;
  const latitude2 = (secondLatitude * Math.PI) / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.sin(longitudeDelta / 2) ** 2 * Math.cos(latitude1) * Math.cos(latitude2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function locationBounds(latitude: number, longitude: number, radiusKm: number) {
  const latitudeDelta = radiusKm / 110.574;
  const longitudeDelta = Math.min(
    180,
    radiusKm / (111.32 * Math.max(Math.abs(Math.cos((latitude * Math.PI) / 180)), 0.01)),
  );

  return {
    low: {
      latitude: Math.max(-90, latitude - latitudeDelta),
      longitude: Math.max(-180, longitude - longitudeDelta),
    },
    high: {
      latitude: Math.min(90, latitude + latitudeDelta),
      longitude: Math.min(180, longitude + longitudeDelta),
    },
  };
}

async function searchTextPlaces(
  query: string,
  latitude: number,
  longitude: number,
  radiusKm: number,
  apiKey: string,
): Promise<GooglePlace[]> {
  const response = await fetch(PLACES_TEXT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.location',
        'places.nationalPhoneNumber',
        'places.rating',
        'places.userRatingCount',
        'places.currentOpeningHours.openNow',
        'places.googleMapsUri',
        'places.types',
      ].join(','),
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: 20,
      rankPreference: 'DISTANCE',
      regionCode: 'IN',
      locationRestriction: {
        rectangle: locationBounds(latitude, longitude, radiusKm),
      },
    }),
    cache: 'no-store',
  });

  if (!response.ok) throw new Error('Google could not complete the hospital search.');
  const data = (await response.json()) as GooglePlacesResponse;
  return data.places || [];
}

function uniqueNearbyHospitals(
  places: GooglePlace[],
  latitude: number,
  longitude: number,
  maximumDistanceKm: number,
): NearbyHospital[] {
  const unique = new Map<string, NearbyHospital>();

  for (const place of places) {
    const hospital = parsePlace(place, latitude, longitude);
    if (hospital && hospital.distanceKm <= maximumDistanceKm) unique.set(hospital.id, hospital);
  }

  return [...unique.values()]
    .sort((first, second) => first.distanceKm - second.distanceKm)
    .slice(0, 20);
}

function parsePlace(
  place: GooglePlace,
  latitude: number,
  longitude: number,
): NearbyHospital | null {
  const id = asString(place.id);
  const name = asString(place.displayName?.text);
  const placeLatitude = asNumber(place.location?.latitude);
  const placeLongitude = asNumber(place.location?.longitude);

  if (!id || !name || placeLatitude === null || placeLongitude === null) return null;

  return {
    id,
    name,
    address: asString(place.formattedAddress),
    latitude: placeLatitude,
    longitude: placeLongitude,
    phone: asString(place.nationalPhoneNumber),
    rating: asNumber(place.rating),
    reviewCount: asNumber(place.userRatingCount),
    openNow: typeof place.currentOpeningHours?.openNow === 'boolean'
      ? place.currentOpeningHours.openNow
      : null,
    mapsUrl: asString(place.googleMapsUri),
    distanceKm: distanceInKm(latitude, longitude, placeLatitude, placeLongitude),
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'Hospital search is temporarily unavailable.' }, { status: 503 });
  }

  let body: NearbyHospitalsRequest;
  try {
    body = (await request.json()) as NearbyHospitalsRequest;
  } catch {
    return NextResponse.json({ error: 'Please provide a valid hospital search request.' }, { status: 400 });
  }

  const latitude = typeof body.latitude === 'number' ? body.latitude : Number(body.latitude);
  const longitude = typeof body.longitude === 'number' ? body.longitude : Number(body.longitude);
  const radius = typeof body.radius === 'number' ? body.radius : Number(body.radius);

  if (!isFiniteCoordinate(latitude) || latitude < -90 || latitude > 90
    || !isFiniteCoordinate(longitude) || longitude < -180 || longitude > 180
    || !ALLOWED_RADII.includes(radius as (typeof ALLOWED_RADII)[number])) {
    return NextResponse.json({ error: 'The location or search radius is invalid.' }, { status: 400 });
  }

  try {
    if (body.mode === 'cancer') {
      const cancerPlaces = (await Promise.all(CANCER_SEARCH_QUERIES.map((query) => (
        searchTextPlaces(query, latitude, longitude, CANCER_SEARCH_RADIUS_KM, apiKey)
      )))).flat();
      const cancerHospitals = uniqueNearbyHospitals(
        cancerPlaces,
        latitude,
        longitude,
        CANCER_SEARCH_RADIUS_KM,
      );

      if (cancerHospitals.length > 0) {
        return NextResponse.json({ hospitals: cancerHospitals, fallback: false });
      }

      const generalPlaces = (await Promise.all(['hospital', 'medical center'].map((query) => (
        searchTextPlaces(query, latitude, longitude, CANCER_SEARCH_RADIUS_KM, apiKey)
      )))).flat();
      const fallbackHospitals = uniqueNearbyHospitals(
        generalPlaces,
        latitude,
        longitude,
        CANCER_SEARCH_RADIUS_KM,
      );

      return NextResponse.json({
        hospitals: fallbackHospitals,
        fallback: fallbackHospitals.length > 0,
        searchUrl: fallbackHospitals.length === 0
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`oncology hospital near ${latitude},${longitude}`)}`
          : null,
      });
    }

    const response = await fetch(PLACES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.nationalPhoneNumber',
          'places.rating',
          'places.userRatingCount',
          'places.currentOpeningHours.openNow',
          'places.googleMapsUri',
          'places.types',
        ].join(','),
      },
      body: JSON.stringify({
        includedTypes: ['hospital', 'medical_clinic'],
        maxResultCount: 20,
        rankPreference: 'DISTANCE',
        locationRestriction: {
          circle: {
            center: { latitude, longitude },
            radius: radius * 1000,
          },
        },
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Google could not complete the hospital search.' }, { status: 502 });
    }

    const data = (await response.json()) as GooglePlacesResponse;
    const hospitals = (data.places || [])
      .map((place) => parsePlace(place, latitude, longitude))
      .filter((place): place is NearbyHospital => place !== null)
      .sort((first, second) => first.distanceKm - second.distanceKm);

    return NextResponse.json({ hospitals });
  } catch {
    return NextResponse.json({ error: 'We could not reach the hospital search service.' }, { status: 502 });
  }
}