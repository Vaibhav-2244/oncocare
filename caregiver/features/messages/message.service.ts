import { supabase } from "@/lib/supabase/client";
import { verifyPatientAccess } from "@/features/caregiver/caregiver.service";
import type { PatientMessage } from "@/types";

export async function getPatientMessages(
  patientId: string
): Promise<PatientMessage[]> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const { data, error } = await supabase.rpc(
    "get_patient_messages_for_caregiver",
    {
      target_patient_id: patientId,
    }
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as PatientMessage[];
}

export async function sendPatientMessage(
  patientId: string,
  content: string
): Promise<PatientMessage> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const trimmedContent = content.trim();

  if (!trimmedContent) {
    throw new Error("MESSAGE_EMPTY");
  }

  const { data, error } = await supabase.rpc(
    "caregiver_send_patient_message",
    {
      target_patient_id: patientId,
      message_content: trimmedContent,
    }
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("MESSAGE_SEND_FAILED");
  }

  return data as PatientMessage;
}