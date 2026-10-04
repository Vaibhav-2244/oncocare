export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

export type TaskPriority =
  | "low"
  | "normal"
  | "high"
  | "urgent";

export type TaskType =
  | "care"
  | "appointment"
  | "medication"
  | "investigation"
  | "doctor_instruction"
  | "other";

export interface CaregiverTask {
  id: string;
  patient_id: string;
  caregiver_id: string;
  title: string;
  description: string | null;
  task_type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  completed_at: string | null;
  created_by_user_id: string | null;
  created_by_role: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  taskType: TaskType;
  priority: TaskPriority;
  dueAt?: string | null;
}