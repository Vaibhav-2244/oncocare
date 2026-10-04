import { supabase } from "@/lib/supabase/client";
import { verifyPatientAccess } from "@/features/caregiver/caregiver.service";
import type { Medication, MedicationHistory } from "@/types";

export async function getPatientMedications(
  patientId: string,
): Promise<Medication[]> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const { data, error } = await supabase.rpc(
    "get_patient_medications_for_caregiver",
    {
      target_patient_id: patientId,
    },
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as Medication[];
}

export async function getMedicationHistory(
  patientId: string,
): Promise<MedicationHistory[]> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const { data, error } = await supabase.rpc(
    "get_patient_medication_history_for_caregiver",
    {
      target_patient_id: patientId,
    },
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as MedicationHistory[];
}

export async function recordMedicationAction(
  patientId: string,
  medicationId: string,
  status: "taken" | "missed",
  scheduledAt?: string | null,
) {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const { data, error } = await supabase.rpc(
    "caregiver_record_medication_action",
    {
      target_patient_id: patientId,
      target_medication_id: medicationId,
      action_status: status,
      action_scheduled_at: scheduledAt ?? null,
    },
  );

  if (error) {
    throw error;
  }

  return data;
}

export async function isAuthorizedCaregiverForPatient(
  patientId: string,
): Promise<boolean> {
  return verifyPatientAccess(patientId);
}