import { supabase } from "@/lib/supabase/client";
import type { CaregiverProfile } from "@/features/caregiver/caregiver-profile.service";

export async function updateMyCaregiverAvailability(
  isAvailable: boolean,
): Promise<CaregiverProfile> {
  const { data, error } = await supabase.rpc(
    "update_my_caregiver_availability",
    {
      new_is_available: isAvailable,
    },
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("AVAILABILITY_UPDATE_FAILED");
  }

  return data as CaregiverProfile;
}