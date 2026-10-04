export interface CaregiverProfile {
  id: string;
  user_id: string;
  professional_title?: string | null;
  about?: string | null;
  years_of_experience?: number | null;
  hourly_rate?: number | null;
  service_area?: string | null;
  verification_status?: string | null;
  is_active?: boolean;
  is_available?: boolean;
  rating?: number | null;
  review_count?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface AssignedPatient {
  relationship_id: string;
  patient_id: string;
  patient_name: string;
  relationship?: string | null;
  status: string;
  notification_enabled?: boolean;
  notification_channels?: string[];
  relationship_created_at?: string;
}