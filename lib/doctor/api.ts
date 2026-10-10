import { supabase } from '@/lib/supabase-client';

export interface DoctorPatient {
  id: string;
  patient_code: string;
  full_name: string;
  age: number | null;
  date_of_birth?: string | null;
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

export interface DoctorAppointment {
  id: string;
  doctor_patient_id: string;
  starts_at: string;
  duration_minutes: number;
  visit_type: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  reason: string | null;
}

export interface DoctorTreatmentPlan {
  id: string;
  doctor_patient_id: string;
  name: string;
  protocol: string | null;
  cycles_total: number | null;
  cycles_completed: number;
  progress_percent: number;
  status: 'active' | 'review_required' | 'completed' | 'cancelled';
}

type DoctorPatientRecord = Omit<DoctorPatient, 'age' | 'risk'> & {
  age?: number | null;
  date_of_birth?: string | null;
  risk?: DoctorPatient['risk'];
  risk_level?: DoctorPatient['risk'];
};

export interface DoctorDashboardSummary {
  kpis: {
    active_patients: number;
    appointments_today: number;
    pending_confirmations: number;
    high_risk: number;
    unread_items: number;
  };
  attention: DoctorPatient[];
  next_appointments: Array<{
    id: string;
    doctor_patient_id: string;
    patient_code: string;
    patient_name: string;
    starts_at: string;
    duration_minutes: number;
    visit_type: string;
    status: string;
    reason: string | null;
  }>;
  trend_14d: Array<{ date: string; appointments: number }>;
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

export interface DoctorHospitalPatient {
  id: string;
  hospital_id: string;
  hospital_name: string;
  identifier: string;
  name: string;
  age: number | null;
  gender: string | null;
  linked: boolean;
  doctor_id: string;
}

export interface DoctorHospitalAppointment {
  id: string;
  hospital_id: string;
  hospital_name: string;
  patient_id: string;
  patient_identifier: string;
  patient_name: string;
  scheduled_at: string;
  kind: string;
  status: string;
  reason: string | null;
}

export interface DoctorHospitalDashboard {
  patients: DoctorHospitalPatient[];
  appointments: DoctorHospitalAppointment[];
}

export interface DoctorPatientLiveData {
  symptoms: Array<Record<string, unknown>>;
  side_effects: Array<Record<string, unknown>>;
  medications: Array<Record<string, unknown>>;
  timeline: Array<Record<string, unknown>>;
  consent_scopes: string[];
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

export async function loadDoctorHospitalDashboard() {
  const { data, error } = await supabase.rpc('doctor_hospital_dashboard');
  if (error) throw rpcError(error.message);
  return data as DoctorHospitalDashboard;
}

export async function listDoctorPatients(filters: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc('doctor_list_patients', { p_filters: filters });
  if (error) throw rpcError(error.message);
  return data as { total: number; rows: DoctorPatient[] };
}

export async function createDoctorPatient(fields: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('doctor_create_patient', { p_fields: fields });
  if (error) throw rpcError(error.message);
  return normalizeDoctorPatient(data as DoctorPatientRecord);
}

export async function getDoctorPatient(id: string) {
  const { data, error } = await supabase.rpc('doctor_get_patient', { p_patient_id: id });
  if (error) throw rpcError(error.message);
  return normalizeDoctorPatient(data as DoctorPatientRecord);
}

export async function loadDoctorPatientLiveData(id: string) {
  const { data, error } = await supabase.rpc('doctor_get_patient_live_data', {
    p_doctor_patient_id: id,
  });
  if (error) throw rpcError(error.message);
  return data as DoctorPatientLiveData;
}

export async function updateDoctorPatient(id: string, fields: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('doctor_update_patient', { p_patient_id: id, p_fields: fields });
  if (error) throw rpcError(error.message);
  return normalizeDoctorPatient(data as DoctorPatientRecord);
}

export async function setDoctorPatientStatus(id: string, status: DoctorPatient['status']) {
  const { data, error } = await supabase.rpc('doctor_set_patient_status', { p_patient_id: id, p_status: status });
  if (error) throw rpcError(error.message);
  return normalizeDoctorPatient(data as DoctorPatientRecord);
}

export async function updateDoctorAppointmentStatus(
  id: string,
  status: DoctorAppointment['status'],
) {
  const { data, error } = await supabase.rpc('doctor_update_appointment_status', {
    p_appointment_id: id,
    p_status: status,
  });
  if (error) throw rpcError(error.message);
  return data as DoctorAppointment;
}

export async function saveDoctorTreatmentPlan(
  id: string | null,
  patientId: string,
  fields: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc('doctor_save_treatment_plan', {
    p_plan_id: id,
    p_patient_id: patientId,
    p_fields: fields,
  });
  if (error) throw rpcError(error.message);
  return data as DoctorTreatmentPlan;
}

export async function cancelDoctorPrescription(id: string) {
  const { data, error } = await supabase.rpc('doctor_cancel_prescription', { p_prescription_id: id });
  if (error) throw rpcError(error.message);
  return data as { id: string; status: 'cancelled' };
}

function normalizeDoctorPatient(record: DoctorPatientRecord): DoctorPatient {
  const risk = record.risk ?? record.risk_level;
  if (!risk || !['low', 'moderate', 'high'].includes(risk)) {
    throw rpcError('The patient record returned an invalid risk level.');
  }
  let age = record.age ?? null;
  if (age === null && record.date_of_birth) {
    const today = new Date();
    const birthDate = new Date(`${record.date_of_birth}T00:00:00`);
    age = today.getFullYear() - birthDate.getFullYear();
    if (
      today.getMonth() < birthDate.getMonth()
      || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())
    ) age -= 1;
    age = Math.max(0, age);
  }
  return {
    id: record.id,
    patient_code: record.patient_code,
    full_name: record.full_name,
    age,
    date_of_birth: record.date_of_birth ?? null,
    sex: record.sex,
    phone: record.phone,
    cancer_type: record.cancer_type,
    stage: record.stage,
    current_treatment: record.current_treatment,
    cycle_label: record.cycle_label,
    risk,
    status: record.status,
    patient_user_id: record.patient_user_id,
    updated_at: record.updated_at,
  };
}
