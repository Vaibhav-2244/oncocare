export interface CaregiverNotification {
  id: string;
  patient_id?: string | null;
  patient_name?: string | null;
  caregiver_id: string;
  medication_id?: string | null;
  medication_log_id?: string | null;
  title: string;
  message: string;
  type: string;
  channel?: string | null;
  is_read: boolean;
  delivery_status?: string | null;
  created_at: string;
  delivered_at?: string | null;
  failed_at?: string | null;
  failure_reason?: string | null;
  sent_to?: string | null;
}