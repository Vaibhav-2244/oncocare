import { supabase } from "@/lib/supabase/client";
import { getCurrentUser } from "@/features/caregiver/caregiver.service";

export interface CaregiverProfile {
  id: string;
  user_id: string;
  professional_title: string | null;
  about: string | null;
  years_of_experience: number | null;
  hourly_rate: number | null;
  service_area: string | null;
  verification_status: string;
  is_active: boolean;
  is_available: boolean;
  rating: number | null;
  review_count: number;
  created_at: string;
  updated_at: string;
}

export async function getMyCaregiverProfile(): Promise<CaregiverProfile | null> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("AUTH_SESSION_MISSING");
  }

  const { data, error } = await supabase
    .from("caregiver_profiles")
    .select(`
      id,
      user_id,
      professional_title,
      about,
      years_of_experience,
      hourly_rate,
      service_area,
      verification_status,
      is_active,
      is_available,
      rating,
      review_count,
      created_at,
      updated_at
    `)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as CaregiverProfile | null;
}