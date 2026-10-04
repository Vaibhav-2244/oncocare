import { supabase } from "@/lib/supabase/client";
import { verifyPatientAccess } from "@/features/caregiver/caregiver.service";
import type {
  QueuePosition,
  QueueState,
} from "@/types";

interface QueueContext {
  entry_id: string | null;
  session_id: string | null;
  patient_id: string;
}

export async function getQueueContextForPatient(
  patientId: string,
): Promise<QueueContext | null> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const { data, error } = await supabase.rpc(
    "get_patient_queue_context_for_caregiver",
    {
      target_patient_id: patientId,
    },
  );

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return data as QueueContext;
}

export async function getQueueState(
  sessionId: string,
): Promise<QueueState | null> {
  const { data, error } = await supabase.rpc(
    "get_queue_state",
    {
      p_session_id: sessionId,
    },
  );

  if (error) {
    throw error;
  }

  return (data ?? null) as QueueState | null;
}

export async function getQueuePosition(
  entryId: string,
): Promise<QueuePosition | null> {
  const { data, error } = await supabase.rpc(
    "get_patient_queue_position",
    {
      p_entry_id: entryId,
    },
  );

  if (error) {
    throw error;
  }

  return (data ?? null) as QueuePosition | null;
}

export async function getPatientQueue(
  patientId: string,
): Promise<{
  context: QueueContext | null;
  state: QueueState | null;
  position: QueuePosition | null;
}> {
  const context =
    await getQueueContextForPatient(patientId);

  if (!context) {
    return {
      context: null,
      state: null,
      position: null,
    };
  }

  let state: QueueState | null = null;
  let position: QueuePosition | null = null;

  if (context.session_id) {
    state = await getQueueState(
      context.session_id,
    );
  }

  if (context.entry_id) {
    position = await getQueuePosition(
      context.entry_id,
    );
  }

  return {
    context,
    state,
    position,
  };
}