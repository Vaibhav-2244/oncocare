import { supabase } from "@/lib/supabase/client";
import type { AssignedPatient, PatientActivity } from "@/types";
import {
  getAssignedPatients,
  verifyPatientAccess,
} from "@/features/caregiver/caregiver.service";

export async function getMyPatients(): Promise<AssignedPatient[]> {
  return getAssignedPatients();
}

export async function getAuthorizedPatient(
  patientId: string,
): Promise<AssignedPatient | null> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    return null;
  }

  const patients = await getAssignedPatients();

  return patients.find((patient) => patient.patient_id === patientId) ?? null;
}

export async function getPatientTimeline(
  patientId: string,
): Promise<PatientActivity[]> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const { data, error } = await supabase
    .from("patient_journey_events")
    .select(
      `
        id,
        hospital_id,
        patient_id,
        actor_user_id,
        event_type,
        details,
        visible_to_patient,
        is_demo,
        created_at
      `,
    )
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as PatientActivity[];
}

export { getAssignedPatients, verifyPatientAccess };