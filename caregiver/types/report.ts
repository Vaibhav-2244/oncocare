export interface DoctorReport {
  id: string;
  doctor_id: string;
  doctor_patient_id: string;
  report_type?: string | null;
  report_date?: string | null;
  flag?: string | null;
  summary?: string | null;
  created_at: string;
}

export interface LabReport {
  id: string;
  user_id: string;
  report_date?: string | null;
  lab_name?: string | null;
  report_title?: string | null;
  file_name: string;
  file_type?: string | null;
  file_size_bytes?: number | null;
  storage_path?: string | null;
  extraction_status?: string | null;
  review_status?: string | null;
  created_at?: string;
}