export interface Appointment {
  id: string;
  patient_id: string;
  patient_name: string;

  doctor_id: string | null;
  doctor_patient_id: string | null;

  starts_at: string;
  duration_minutes: number | null;

  visit_type: string | null;
  status: string | null;

  reason: string | null;
  notes: string | null;

  source: string | null;
}