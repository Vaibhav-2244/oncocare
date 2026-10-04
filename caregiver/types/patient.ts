export interface AssignedPatient {
  relationship_id: string;
  patient_id: string;
  patient_name: string;
  relationship: string | null;
  status: string;
  notification_enabled: boolean;
  notification_channels: string[];
  relationship_created_at: string;

  patient_mobile?: string | null;
  patient_dob?: string | null;
  patient_age?: number | null;
  patient_gender?: string | null;
  hospital_id?: string | null;
}

export interface PatientActivity {
  id: string;
  hospital_id: string;
  patient_id: string;
  actor_user_id: string | null;
  event_type: string;
  details: Record<string, unknown> | null;
  visible_to_patient: boolean;
  is_demo: boolean;
  created_at: string;
}