export type InstructionPriority =
  | "low"
  | "normal"
  | "high"
  | "urgent";

export type InstructionStatus =
  | "pending"
  | "acknowledged"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface DoctorCaregiverInstruction {
  id: string;
  doctor_id: string;
  doctor_patient_id: string;
  patient_id: string;
  caregiver_id: string;
  title: string;
  instruction_text: string;
  priority: InstructionPriority;
  status: InstructionStatus;
  due_at: string | null;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}