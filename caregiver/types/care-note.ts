export type CareNoteType =
  | "observation"
  | "routine"
  | "symptom"
  | "medication"
  | "care"
  | "other";

export interface CareNote {
  id: string;
  patient_id: string;
  caregiver_id: string;
  note_text: string;
  note_type: CareNoteType;
  created_at: string;
  updated_at: string;
}