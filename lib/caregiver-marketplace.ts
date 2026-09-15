import { supabase } from '@/lib/supabase-client';

export type MarketplaceService = {
  id: string;
  service_name: string;
  description: string | null;
  price: number | null;
  pricing_unit: string;
};

export type MarketplaceAvailability = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
};

export type MarketplaceCaregiver = {
  id: string;
  professional_title: string;
  about: string | null;
  years_of_experience: number;
  hourly_rate: number | null;
  service_area: string | null;
  verification_status: string;
  is_active: boolean;
  is_available: boolean;
  rating: number;
  review_count: number;
  services: MarketplaceService[];
  specializations: string[];
  languages: string[];
  availability: MarketplaceAvailability[];
};

type CaregiverProfileRow = {
  id: string;
  professional_title: string;
  about: string | null;
  years_of_experience: number;
  hourly_rate: number | string | null;
  service_area: string | null;
  verification_status: string;
  is_active: boolean;
  is_available: boolean;
  rating: number | string;
  review_count: number;
};

type ServiceRow = MarketplaceService & {
  caregiver_id: string;
  is_active: boolean;
};

type SpecializationRow = {
  caregiver_id: string;
  specialization: string;
};

type LanguageRow = {
  caregiver_id: string;
  language: string;
};

type AvailabilityRow = MarketplaceAvailability & {
  caregiver_id: string;
};

export async function getMarketplaceCaregivers(): Promise<{
  success: boolean;
  caregivers: MarketplaceCaregiver[];
  error?: string;
}> {
  try {
    const { data: profiles, error: profilesError } = await supabase
      .from('caregiver_profiles')
      .select(`
        id,
        professional_title,
        about,
        years_of_experience,
        hourly_rate,
        service_area,
        verification_status,
        is_active,
        is_available,
        rating,
        review_count
      `)
      .eq('is_active', true)
      .eq('verification_status', 'verified')
      .order('rating', { ascending: false });

    if (profilesError) {
      return { success: false, caregivers: [], error: profilesError.message };
    }

    const profileRows = (profiles ?? []) as CaregiverProfileRow[];
    if (profileRows.length === 0) return { success: true, caregivers: [] };

    const caregiverIds = profileRows.map((profile) => profile.id);

    const [servicesResult, specializationsResult, languagesResult, availabilityResult] = await Promise.all([
      supabase
        .from('caregiver_services')
        .select(`id, caregiver_id, service_name, description, price, pricing_unit, is_active`)
        .in('caregiver_id', caregiverIds)
        .eq('is_active', true),
      supabase
        .from('caregiver_specializations')
        .select(`caregiver_id, specialization`)
        .in('caregiver_id', caregiverIds),
      supabase
        .from('caregiver_languages')
        .select(`caregiver_id, language`)
        .in('caregiver_id', caregiverIds),
      supabase
        .from('caregiver_availability')
        .select(`id, caregiver_id, day_of_week, start_time, end_time, is_available`)
        .in('caregiver_id', caregiverIds)
        .eq('is_available', true),
    ]);

    const services = (servicesResult.data ?? []) as ServiceRow[];
    const specializations = (specializationsResult.data ?? []) as SpecializationRow[];
    const languages = (languagesResult.data ?? []) as LanguageRow[];
    const availability = (availabilityResult.data ?? []) as AvailabilityRow[];

    const caregivers: MarketplaceCaregiver[] = profileRows.map((profile) => ({
      id: profile.id,
      professional_title: profile.professional_title,
      about: profile.about,
      years_of_experience: profile.years_of_experience,
      hourly_rate: profile.hourly_rate === null ? null : Number(profile.hourly_rate),
      service_area: profile.service_area,
      verification_status: profile.verification_status,
      is_active: profile.is_active,
      is_available: profile.is_available,
      rating: Number(profile.rating),
      review_count: profile.review_count,
      services: services
        .filter((service) => service.caregiver_id === profile.id)
        .map((service) => ({
          id: service.id,
          service_name: service.service_name,
          description: service.description,
          price: service.price === null ? null : Number(service.price),
          pricing_unit: service.pricing_unit,
        })),
      specializations: specializations
        .filter((item) => item.caregiver_id === profile.id)
        .map((item) => item.specialization),
      languages: languages
        .filter((item) => item.caregiver_id === profile.id)
        .map((item) => item.language),
      availability: availability
        .filter((item) => item.caregiver_id === profile.id)
        .map((item) => ({
          id: item.id,
          day_of_week: item.day_of_week,
          start_time: item.start_time,
          end_time: item.end_time,
          is_available: item.is_available,
        })),
    }));

    return { success: true, caregivers };
  } catch (error) {
    return {
      success: false,
      caregivers: [],
      error: error instanceof Error ? error.message : 'Unexpected marketplace error',
    };
  }
}

export async function getMarketplaceCaregiverById(caregiverId: string): Promise<{
  success: boolean;
  caregiver: MarketplaceCaregiver | null;
  error?: string;
}> {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('caregiver_profiles')
      .select(`
        id,
        professional_title,
        about,
        years_of_experience,
        hourly_rate,
        service_area,
        verification_status,
        is_active,
        is_available,
        rating,
        review_count
      `)
      .eq('id', caregiverId)
      .eq('is_active', true)
      .eq('verification_status', 'verified')
      .maybeSingle();

    if (profileError) {
      return { success: false, caregiver: null, error: profileError.message };
    }

    if (!profile) {
      return { success: false, caregiver: null, error: 'Caregiver not found' };
    }

    const profileRow = profile as CaregiverProfileRow;
    const [servicesResult, specializationsResult, languagesResult, availabilityResult] = await Promise.all([
      supabase
        .from('caregiver_services')
        .select(`id, caregiver_id, service_name, description, price, pricing_unit, is_active`)
        .eq('caregiver_id', caregiverId)
        .eq('is_active', true),
      supabase
        .from('caregiver_specializations')
        .select(`caregiver_id, specialization`)
        .eq('caregiver_id', caregiverId),
      supabase
        .from('caregiver_languages')
        .select(`caregiver_id, language`)
        .eq('caregiver_id', caregiverId),
      supabase
        .from('caregiver_availability')
        .select(`id, caregiver_id, day_of_week, start_time, end_time, is_available`)
        .eq('caregiver_id', caregiverId)
        .eq('is_available', true),
    ]);

    const services = (servicesResult.data ?? []) as ServiceRow[];
    const specializations = (specializationsResult.data ?? []) as SpecializationRow[];
    const languages = (languagesResult.data ?? []) as LanguageRow[];
    const availability = (availabilityResult.data ?? []) as AvailabilityRow[];

    const caregiver: MarketplaceCaregiver = {
      id: profileRow.id,
      professional_title: profileRow.professional_title,
      about: profileRow.about,
      years_of_experience: profileRow.years_of_experience,
      hourly_rate: profileRow.hourly_rate === null ? null : Number(profileRow.hourly_rate),
      service_area: profileRow.service_area,
      verification_status: profileRow.verification_status,
      is_active: profileRow.is_active,
      is_available: profileRow.is_available,
      rating: Number(profileRow.rating),
      review_count: profileRow.review_count,
      services: services.map((service) => ({
        id: service.id,
        service_name: service.service_name,
        description: service.description,
        price: service.price === null ? null : Number(service.price),
        pricing_unit: service.pricing_unit,
      })),
      specializations: specializations.map((item) => item.specialization),
      languages: languages.map((item) => item.language),
      availability: availability.map((item) => ({
        id: item.id,
        day_of_week: item.day_of_week,
        start_time: item.start_time,
        end_time: item.end_time,
        is_available: item.is_available,
      })),
    };

    return { success: true, caregiver };
  } catch (error) {
    return {
      success: false,
      caregiver: null,
      error: error instanceof Error ? error.message : 'Unexpected caregiver lookup error',
    };
  }
}
