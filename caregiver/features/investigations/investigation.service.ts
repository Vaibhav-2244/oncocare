import { supabase } from "@/lib/supabase/client";
import { verifyPatientAccess } from "@/features/caregiver/caregiver.service";
import type { PatientInvestigation } from "@/types";

export async function getPatientInvestigations(
  patientId: string,
): Promise<PatientInvestigation[]> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const { data, error } = await supabase.rpc(
    "get_patient_investigations_for_caregiver",
    {
      target_patient_id: patientId,
    },
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as PatientInvestigation[];
}