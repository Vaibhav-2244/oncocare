import { supabase } from "@/lib/supabase/client";

import { verifyPatientAccess } from "@/features/caregiver/caregiver.service";

import type { Appointment } from "@/types";

export async function getPatientAppointments(
  patientId: string,
): Promise<Appointment[]> {
  /*
   * Defense-in-depth authorization check.
   *
   * The RPC also performs this check at the database
   * layer. We keep this browser-side check so an
   * unauthorized route fails before requesting data.
   */
  const hasAccess = await verifyPatientAccess(
    patientId,
  );

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const { data, error } = await supabase.rpc(
    "get_patient_appointments_for_caregiver",
    {
      target_patient_id: patientId,
    },
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as Appointment[];
}