import { supabase } from '@/lib/supabase-client';

export interface DoctorPatient {
  id: string;
  patient_code: string;
  full_name: string;
  age: number | null;
  sex: string | null;
  phone: string | null;
  cancer_type: string | null;
  stage: string | null;
  current_treatment: string | null;
  cycle_label: string | null;
  risk: 'low' | 'moderate' | 'high';
  status: 'active' | 'archived';
  patient_user_id: string | null;
  updated_at: string;
}

export interface DoctorDashboardSummary {
  kpis: {
    active_patients: number;
    appointments_today: number;
    pending_confirmations: number;
    high_risk: number;
    unread_items: number;
  };
  attention: DoctorPatient[];
  next_appointments: unknown[];
  trend_14d: unknown[];
  quick_counts: {
    unsigned_consultations: number;
    unreviewed_reports: number;
    unread_messages: number;
  };
}

export interface DoctorHospitalProfile {
  hospital_id: string;
  hospital_name: string;
  doctor_row_id: string;
  doctor_identifier: string | null;
  employee_id: string | null;
  full_name: string;
  designation: string | null;
  specialty: string | null;
  subspecialty: string | null;
  qualifications: string | null;
  registration_no: string | null;
  registration_council: string | null;
  years_experience: number | null;
  department: string | null;
  joining_date: string | null;
  employment_type: string | null;
  employment_status: string;
  opd_room: string | null;
  shift_schedule: Array<{ day: number; start: string; end: string }>;
  emergency_available: boolean;
  official_email: string | null;
  official_phone: string | null;
  verification_status: string | null;
  is_active: boolean;
  care_team: Array<{ assignment_id: string; user_id: string; name: string; email: string; role: string; department: string | null }>;
}

function rpcError(message: string): Error {
  return new Error(`Doctor workspace request failed: ${message}`);
}

export async function ensureDoctorWorkspace() {
  const { data, error } = await supabase.rpc('ensure_doctor_workspace');
  if (error) throw rpcError(error.message);
  return data as { profile: Record<string, unknown>; affiliations: unknown[] };
}

export async function loadDoctorSummary() {
  const { data, error } = await supabase.rpc('doctor_dashboard_summary');
  if (error) throw rpcError(error.message);
  return data as DoctorDashboardSummary;
}

export async function loadDoctorHospitalProfile() {
  const { data, error } = await supabase.rpc('doctor_hospital_profile');
  if (error) throw rpcError(error.message);
  return (data ?? []) as DoctorHospitalProfile[];
}

export async function listDoctorPatients(filters: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc('doctor_list_patients', { p_filters: filters });
  if (error) throw rpcError(error.message);
  return data as { total: number; rows: DoctorPatient[] };
}

export async function createDoctorPatient(fields: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('doctor_create_patient', { p_fields: fields });
  if (error) throw rpcError(error.message);
  return data as DoctorPatient;
}

export async function getDoctorPatient(id: string) {
  const { data, error } = await supabase.rpc('doctor_get_patient', { p_patient_id: id });
  if (error) throw rpcError(error.message);
  return data as DoctorPatient;
}
