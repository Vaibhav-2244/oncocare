import { supabase } from './supabase-client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Comprehensive patient medical summary aggregator
 * Fetches all patient-related medical data from Supabase
 * and returns a structured object for LLM processing
 */

export interface PatientSummaryData {
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    date_of_birth: string | null;
    gender: string | null;
    bio: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
  } | null;
  symptoms: Array<{
    id: string;
    name: string;
    severity: number;
    notes: string | null;
    recorded_at: string | null;
  }>;
  treatments: Array<{
    id: string;
    type: string;
    name: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    notes: string | null;
    progress: number;
  }>;
  medications: Array<{
    id: string;
    name: string;
    dosage: string;
    frequency: string;
    start_date: string | null;
    end_date: string | null;
    notes: string | null;
    is_active: boolean;
    last_taken_at: string | null;
  }>;
  care_team: Array<{
    id: string;
    member_name: string;
    role: string;
    specialty: string | null;
    phone: string | null;
    email: string | null;
    hospital: string | null;
    notes: string | null;
  }>;
  health_timeline: Array<{
    id: string;
    event_type: string;
    title: string;
    description: string | null;
    event_date: string;
  }>;
  appointments: Array<{
    id: string;
    appointment_date: string;
    status: string;
    type: string;
    reason: string | null;
    notes: string | null;
  }>;
  documents: Array<{
    id: string;
    title: string;
    file_type: string | null;
    category: string;
    created_at: string;
  }>;
  medication_logs: Array<{
    medication_id: string;
    taken_at: string;
    status: string;
  }>;
}

/**
 * Aggregates all patient medical information from the database
 * @param userId - Authenticated user ID
 * @returns Structured patient summary object
 */
export async function getPatientSummary(userId: string, dbClient?: SupabaseClient): Promise<PatientSummaryData> {
  try {
    const client = dbClient || supabase;

    // Fetch all patient data in parallel
    const [
      profileRes,
      symptomsRes,
      treatmentsRes,
      medicationsRes,
      careTeamRes,
      timelineRes,
      appointmentsRes,
      documentsRes,
      medLogsRes,
    ] = await Promise.all([
      client.from('profiles').select('*').eq('id', userId).maybeSingle(),
      client.from('symptoms').select('*').eq('user_id', userId).order('recorded_at', { ascending: false }),
      client.from('treatments').select('*').eq('user_id', userId).order('start_date', { ascending: false }),
      client.from('medications').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      client.from('care_team').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      client.from('health_timeline').select('*').eq('user_id', userId).order('event_date', { ascending: false }),
      client
        .from('appointments')
        .select('id, appointment_date, status, type, reason, notes')
        .eq('user_id', userId)
        .order('appointment_date', { ascending: false })
        .limit(20),
      client
        .from('documents')
        .select('id, title, file_type, category, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20),
      client
        .from('medication_logs')
        .select('medication_id, taken_at, status')
        .eq('user_id', userId)
        .order('taken_at', { ascending: false })
        .limit(50),
    ]);

    // Temporary debug logging to help trace RLS / permissions issues
    if (profileRes && (profileRes as any).error) {
      console.error('profiles query error:', (profileRes as any).error);
    }
    if (profileRes && (profileRes as any).data === null) {
      console.log('profiles query returned no data for userId:', userId);
    }

    // Construct the summary object
    const summary: PatientSummaryData = {
      profile: profileRes.data
        ? {
            id: profileRes.data.id,
            full_name: profileRes.data.full_name,
            email: profileRes.data.email,
            phone: profileRes.data.phone,
            date_of_birth: profileRes.data.date_of_birth,
            gender: profileRes.data.gender,
            bio: profileRes.data.bio,
            emergency_contact_name: profileRes.data.emergency_contact_name,
            emergency_contact_phone: profileRes.data.emergency_contact_phone,
          }
        : null,
      symptoms: symptomsRes.data || [],
      treatments: treatmentsRes.data || [],
      medications: medicationsRes.data || [],
      care_team: careTeamRes.data || [],
      health_timeline: timelineRes.data || [],
      appointments: appointmentsRes.data || [],
      documents: documentsRes.data || [],
      medication_logs: medLogsRes.data || [],
    };

    return summary;
  } catch (error) {
    console.error('Error fetching patient summary:', error);
    throw new Error(`Failed to fetch patient summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Calculates age from date of birth
 */
export function calculateAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Formats patient summary data into a readable string representation
 * useful for debugging or logging
 */
export function formatPatientSummaryForLogging(summary: PatientSummaryData): string {
  const lines: string[] = [];
  
  if (summary.profile) {
    lines.push(`Patient: ${summary.profile.full_name || 'Unknown'}`);
    lines.push(`Email: ${summary.profile.email || 'N/A'}`);
  }
  
  lines.push(`Symptoms: ${summary.symptoms.length}`);
  lines.push(`Treatments: ${summary.treatments.length}`);
  lines.push(`Medications: ${summary.medications.length}`);
  lines.push(`Care Team Members: ${summary.care_team.length}`);
  lines.push(`Timeline Events: ${summary.health_timeline.length}`);
  lines.push(`Appointments: ${summary.appointments.length}`);
  lines.push(`Documents: ${summary.documents.length}`);
  
  return lines.join('\n');
}
