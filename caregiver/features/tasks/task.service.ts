import { supabase } from "@/lib/supabase/client";
import { verifyPatientAccess } from "@/features/caregiver/caregiver.service";

import type {
  CaregiverTask,
  CreateTaskInput,
  TaskStatus,
} from "@/types";

export async function getPatientTasks(
  patientId: string,
): Promise<CaregiverTask[]> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const { data, error } = await supabase.rpc(
    "get_patient_tasks_for_caregiver",
    {
      target_patient_id: patientId,
    },
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as CaregiverTask[];
}

export async function createPatientTask(
  patientId: string,
  input: CreateTaskInput,
): Promise<CaregiverTask> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const title = input.title.trim();

  if (!title) {
    throw new Error("TASK_TITLE_EMPTY");
  }

  const { data, error } = await supabase.rpc(
    "create_patient_task_for_caregiver",
    {
      target_patient_id: patientId,
      title_input: title,
      description_input:
        input.description?.trim() || null,
      task_type_input: input.taskType,
      priority_input: input.priority,
      due_at_input: input.dueAt || null,
    },
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("TASK_CREATE_FAILED");
  }

  return data as CaregiverTask;
}

export async function updatePatientTaskStatus(
  patientId: string,
  taskId: string,
  status: TaskStatus,
): Promise<CaregiverTask> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const { data, error } = await supabase.rpc(
    "update_patient_task_status_for_caregiver",
    {
      target_task_id: taskId,
      new_status: status,
    },
  );

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("TASK_STATUS_UPDATE_FAILED");
  }

  return data as CaregiverTask;
}