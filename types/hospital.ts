export type HospitalVerificationStatus = 'pending' | 'verified' | 'suspended';

export interface HospitalOrg {
  id: string;
  name: string;
  owner_user_id: string | null;
  timezone: string;
  patient_id_label: string;
  patient_id_prefix: string;
  verification_status: HospitalVerificationStatus;
  verification_requested_at?: string | null;
  demo_data_loaded?: boolean;
  settings: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface HospitalDepartment {
  id: string;
  hospital_id: string;
  name: string;
  department_type: 'clinical' | 'diagnostic';
  is_active: boolean;
  created_at: string;
}

export interface HospitalMember {
  id: string;
  hospital_id: string;
  user_id: string;
  staff_role: string;
  is_active: boolean;
  is_demo?: boolean;
  created_at: string;
}

export interface HospitalPatient {
  id: string;
  hospital_id: string;
  patient_identifier: string;
  normalized_identifier: string;
  name: string;
  mobile: string | null;
  dob: string | null;
  age: number | null;
  gender: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface HospitalDoctor {
  id: string;
  hospital_id: string;
  doctor_name: string;
  user_id: string | null;
  department_id: string | null;
  specialty: string | null;
  doctor_identifier?: string | null;
  email?: string | null;
  phone?: string | null;
  registration_no?: string | null;
  registration_council?: string | null;
  is_active: boolean;
  created_at: string;
  is_demo?: boolean;
}

export type HospitalAppointmentStatus = 'scheduled' | 'confirmed' | 'checked_in' | 'in_consultation' | 'completed' | 'cancelled' | 'no_show';
export type HospitalQueueStatus = 'waiting' | 'called' | 'in_consultation' | 'completed' | 'skipped' | 'no_show' | 'cancelled' | 'referred';
export type HospitalOrderStatus = 'ordered' | 'waitlisted' | 'offered' | 'scheduled' | 'checked_in' | 'performed' | 'processing' | 'report_ready' | 'doctor_reviewed' | 'cancelled';

export interface HospitalQueueEntry {
  id: string;
  token: number;
  patient: string;
  identifier: string;
  priority: number;
  status: HospitalQueueStatus;
  patients_ahead: number;
  est_low: number | null;
  est_high: number | null;
  is_walk_in: boolean;
}

export interface HospitalQueueState {
  session: { id: string; doctor: string; department: string | null; room: string | null; status: string; delay_note: string | null; last_token: number };
  serving: Array<{ id: string; token: number; patient: string; status: string }>;
  next_token: number | null;
  waiting_count: number;
  completed_today: number;
  avg_consult_min: number | null;
  entries: HospitalQueueEntry[];
}

export interface HospitalCommandCenter {
  kpis: { opd_patients_today: number; checked_in: number; waiting: number; in_consultation: number; pending_reports: number; admissions_today: number };
  queues: Array<{ session_id: string; doctor: string; department: string | null; room: string | null; status: string; serving_token: number | null; next_token: number | null; waiting: number; completed: number; delay_flag: boolean }>;
  action_required: Array<{ key: string; severity: 'info' | 'warning' | 'critical'; count: number; href: string }>;
  checkins_by_hour: Array<{ hour: number; count: number }>;
  opd_14_days: Array<{ date: string; count: number }>;
  recent_events: Array<{ event_type: string; patient: string; created_at: string; details: Record<string, unknown> }>;
}
