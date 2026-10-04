import { supabase } from "@/lib/supabase/client";
import { verifyPatientAccess } from "@/features/caregiver/caregiver.service";
import type {
  DoctorCaregiverInstruction,
  InstructionStatus,
} from "@/types";

export async function getPatientInstructions(
  patientId: string,
): Promise<DoctorCaregiverInstruction[]> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const { data, error } = await supabase.rpc(
    "get_patient_instructions_for_caregiver",
    {
      target_patient_id: patientId,
    },
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as DoctorCaregiverInstruction[];
}

export async function updateInstructionStatus(
  patientId: string,
  instructionId: string,
  status: InstructionStatus,
): Promise<DoctorCaregiverInstruction> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const { data, error } = await supabase.rpc(
    "update_caregiver_instruction_status",
    {
      target_instruction_id: instructionId,
      new_status: status,
    },
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("INSTRUCTION_STATUS_UPDATE_FAILED");
  }

  return data as DoctorCaregiverInstruction;
}