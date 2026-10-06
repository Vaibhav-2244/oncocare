import { supabase } from '@/lib/supabase-client';
import { getCaregiverNotifications, type CaregiverNotification } from '@/lib/caregiver-medication';

export type CaregiverRelationshipStatus = 'active' | 'pending' | 'revoked';

export interface CaregiverPatient {
  relationship_id: string;
  patient_id: string;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  relationship: string;
  status: CaregiverRelationshipStatus;
  notification_enabled: boolean;
  created_at: string;
}

export async function getCaregiverPatients(): Promise<CaregiverPatient[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('caregiver_relationships')
    .select('*')
    .eq('caregiver_id', user.id)
    .in('status', ['active', 'pending'])
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const patientIds = data.map((item) => item.patient_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone')
    .in('id', patientIds);

  if (profilesError) throw profilesError;

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));

  return data.map((relationship) => {
    const profile = profileMap.get(relationship.patient_id);
    return {
      relationship_id: relationship.id,
      patient_id: relationship.patient_id,
      patient_name: profile?.full_name || 'Patient',
      patient_email: profile?.email || null,
      patient_phone: profile?.phone || null,
      relationship: relationship.relationship || 'Caregiver',
      status: relationship.status,
      notification_enabled: Boolean(relationship.notification_enabled),
      created_at: relationship.created_at,
    };
  });
}

export async function getCaregiverPatientById(patientId: string): Promise<CaregiverPatient | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('caregiver_relationships')
    .select('*')
    .eq('caregiver_id', user.id)
    .eq('patient_id', patientId)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  if (!data) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone')
    .eq('id', patientId)
    .maybeSingle();

  if (profileError) throw profileError;

  return {
    relationship_id: data.id,
    patient_id: data.patient_id,
    patient_name: profile?.full_name || 'Patient',
    patient_email: profile?.email || null,
    patient_phone: profile?.phone || null,
    relationship: data.relationship || 'Caregiver',
    status: data.status,
    notification_enabled: Boolean(data.notification_enabled),
    created_at: data.created_at,
  };
}

export async function getCaregiverDashboardStats() {
  const [patients, notificationsResponse] = await Promise.all([
    getCaregiverPatients(),
    getCaregiverNotifications(),
  ]);
  if (notificationsResponse.error) throw notificationsResponse.error;

  return {
    totalPatients: patients.length,
    activePatients: patients.filter((patient) => patient.status === 'active').length,
    pendingLinks: patients.filter((patient) => patient.status === 'pending').length,
    notifications: (notificationsResponse.data as CaregiverNotification[] | null || []).filter((notification) => !notification.is_read).length,
  };
}
