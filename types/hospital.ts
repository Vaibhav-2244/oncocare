export type HospitalVerificationStatus = 'pending' | 'verified' | 'suspended';

export interface HospitalOrg {
  id: string;
  name: string;
  owner_user_id: string | null;
  timezone: string;
  patient_id_label: string;
  patient_id_prefix: string;
  verification_status: HospitalVerificationStatus;
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

export interface HospitalDoctor {
  id: string;
  hospital_id: string;
  doctor_name: string;
  user_id: string | null;
  department_id: string | null;
  specialty: string | null;
  is_active: boolean;
  created_at: string;
}
