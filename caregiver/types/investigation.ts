export interface PatientInvestigation {
  id: string;
  patient_id: string;
  hospital_id: string;
  type_id: string;
  investigation_name: string;
  category: string;
  department_id: string | null;
  priority: string;
  status: string;
  scheduled_for: string | null;
  ordered_at: string;
  checked_in_at: string | null;
  performed_at: string | null;
  processing_at: string | null;
  report_ready_at: string | null;
  reviewed_at: string | null;
  expected_report_from: string | null;
  expected_report_to: string | null;
  needs_reschedule: boolean;
  cancelled_at: string | null;
  cancel_reason: string | null;
  prep_instructions: string | null;
  ordered_by_doctor_id: string | null;
  created_at: string;
  updated_at: string;
}