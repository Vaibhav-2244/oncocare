export type RoleName =
  | 'super_admin'
  | 'admin'
  | 'patient'
  | 'family_caregiver'
  | 'doctor'
  | 'hospital'
  | 'pharmacy'
  | 'medical_advisor'
  | 'research_partner';

export interface Role {
  id: string;
  name: RoleName;
  display_name: string;
  description: string | null;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  date_of_birth: string | null;
  gender: string | null;
  bio: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  notification_email: boolean;
  notification_push: boolean;
  notification_sms: boolean;
  privacy_profile_visible: boolean;
  privacy_show_activity: boolean;
  is_email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  email_notifications: boolean;
  push_notifications: boolean;
  sms_notifications: boolean;
  medicine_reminders: boolean;
  appointment_reminders: boolean;
  price_alerts: boolean;
  restock_alerts: boolean;
  newsletter: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  profile: Profile | null;
  roles: Role[];
  primaryRole: RoleName | null;
}

export const roleConfig: Record<RoleName, { displayName: string; description: string; icon: string; dashboardPath: string }> = {
  super_admin: { displayName: 'Super Admin', description: 'Full system access', icon: 'ShieldCheck', dashboardPath: '/dashboard/admin' },
  admin: { displayName: 'Admin', description: 'System administration', icon: 'Settings', dashboardPath: '/dashboard/admin' },
  patient: { displayName: 'Patient', description: 'Cancer patient', icon: 'Heart', dashboardPath: '/dashboard/patient' },
  family_caregiver: { displayName: 'Family Caregiver', description: 'Caregiver for a patient', icon: 'Users', dashboardPath: '/dashboard/patient' },
  doctor: { displayName: 'Doctor', description: 'Healthcare provider', icon: 'Stethoscope', dashboardPath: '/dashboard/doctor' },
  hospital: { displayName: 'Hospital', description: 'Healthcare institution', icon: 'Building2', dashboardPath: '/dashboard/hospital' },
  pharmacy: { displayName: 'Pharmacy', description: 'Pharmacy partner', icon: 'Pill', dashboardPath: '/dashboard/pharmacy' },
  medical_advisor: { displayName: 'Medical Advisor', description: 'Medical professional', icon: 'Brain', dashboardPath: '/dashboard/patient' },
  research_partner: { displayName: 'Research Partner', description: 'Research access', icon: 'FlaskConical', dashboardPath: '/dashboard/research' },
};

export const signupRoles: RoleName[] = [
  'patient',
  'family_caregiver',
  'doctor',
  'hospital',
  'pharmacy',
  'research_partner',
];
