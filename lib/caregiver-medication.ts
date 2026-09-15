import { supabase } from '@/lib/supabase-client';

export interface AssignedPatient {
  relationship_id: string;
  patient_id: string;
  patient_name: string;
  relationship: string;
  status: string;
  notification_enabled: boolean;
  notification_channels: string[];
  relationship_created_at: string;
}

export interface CaregiverMedication {
  id: string;
  user_id: string;
  name: string;
  dosage: string;
  frequency: string;
  times: string[] | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  is_active: boolean;
  last_taken_at: string | null;
}

export interface CaregiverHistoryItem {
  id: string;
  patient_id: string;
  medication_id: string;
  medication_name: string;
  dosage: string;
  scheduled_at: string | null;
  taken_at: string | null;
  status: string;
  patient_response: string | null;
  caregiver_notified_at: string | null;
}

export interface CaregiverNotification {
  id: string;
  patient_id: string | null;
  caregiver_id: string | null;
  medication_id: string | null;
  medication_log_id: string | null;
  title: string;
  message: string | null;
  type: string;
  is_read: boolean;
  created_at: string;
}

export async function getAssignedPatients() {
  return supabase.rpc('get_assigned_caregiver_patients');
}

export async function getPatientMedications(patientId: string) {
  return supabase.rpc('get_caregiver_medications', { target_patient_id: patientId });
}

export async function getPatientHistory(patientId: string) {
  return supabase.rpc('get_caregiver_medication_history', { target_patient_id: patientId });
}

export async function getCaregiverNotifications() {
  return supabase.rpc('get_caregiver_notifications');
}

export async function markCaregiverNotificationRead(notificationId: string) {
  return supabase.rpc('mark_caregiver_notification_read', {
    target_notification_id: notificationId,
  });
}

export async function getCaregiverSettings() {
  return supabase.rpc('get_caregiver_notification_settings');
}

export async function updateCaregiverSettings(
  relationshipId: string,
  enabled: boolean,
) {
  return supabase.rpc('update_caregiver_notification_preferences', {
    target_relationship_id: relationshipId,
    target_notification_enabled: enabled,
    target_notification_channels: enabled ? ['in_app'] : [],
  });
}