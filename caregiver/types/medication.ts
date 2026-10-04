export interface Medication {
  id: string;
  patient_id: string;
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  times?: unknown;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
  is_active?: boolean;
  last_taken_at?: string | null;
  created_at?: string;
}

export interface MedicationHistory {
  id: string;
  patient_id: string;
  medication_id?: string | null;
  medication_name?: string | null;
  dosage?: string | null;
  scheduled_at?: string | null;
  taken_at?: string | null;
  status?: string | null;
  patient_response?: string | null;
  caregiver_notified_at?: string | null;
  created_at?: string;
}