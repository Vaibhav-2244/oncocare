import { supabase } from "@/lib/supabase/client";
import type { AssignedPatient } from "@/types";

/**
 * Authentication is owned by the OncoCare+ integration team.
 *
 * This service does NOT create, refresh, or manage login credentials.
 * It only consumes the authenticated Supabase session that is already
 * present in the browser.
 */
export async function getCurrentUser() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return session?.user ?? null;
}

export async function getMyCaregiverProfile() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("AUTH_SESSION_MISSING");
  }

  const { data, error } = await supabase
    .from("caregiver_profiles")
    .select(
      `
        id,
        user_id,
        professional_title,
        about,
        years_of_experience,
        hourly_rate,
        service_area,
        verification_status,
        is_active,
        is_available,
        rating,
        review_count,
        created_at,
        updated_at
      `,
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function getAssignedPatients(): Promise<AssignedPatient[]> {
  const profile = await getMyCaregiverProfile();

  if (!profile || !profile.is_active) {
    return [];
  }

  const { data: relationships, error } = await supabase
    .from("patient_caregiver_relationships")
    .select(
      `
        id,
        patient_id,
        caregiver_id,
        relationship,
        status,
        notification_enabled,
        notification_channels,
        created_at,
        updated_at
      `,
    )
    .eq("caregiver_id", profile.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  if (!relationships?.length) {
    return [];
  }

  const patientIds = relationships.map(
    (relationship) => relationship.patient_id,
  );

  const { data: patients, error: patientError } = await supabase
    .from("hospital_patients")
    .select(
      `
        id,
        name,
        patient_user_id,
        mobile,
        dob,
        age,
        gender,
        hospital_id
      `,
    )
    .in("id", patientIds);

  if (patientError) {
    throw patientError;
  }

  const patientMap = new Map(
    (patients ?? []).map((patient) => [patient.id, patient]),
  );

  const result: AssignedPatient[] = [];

  for (const relationship of relationships) {
    const patient = patientMap.get(relationship.patient_id);

    if (!patient) {
      continue;
    }

    const assignedPatient: AssignedPatient = {
      relationship_id: relationship.id,
      patient_id: patient.id,
      patient_name: patient.name,
      relationship: relationship.relationship ?? null,
      status: relationship.status,
      notification_enabled: relationship.notification_enabled,
      notification_channels: relationship.notification_channels ?? [],
      relationship_created_at: relationship.created_at,
      patient_mobile: patient.mobile ?? null,
      patient_dob: patient.dob ?? null,
      patient_age: patient.age ?? null,
      patient_gender: patient.gender ?? null,
      hospital_id: patient.hospital_id ?? null,
    };

    result.push(assignedPatient);
  }

  return result;
}

/**
 * Database-level authorization check.
 *
 * This must remain in place even if the UI already filtered the
 * patient's assignment list.
 */
export async function verifyPatientAccess(
  patientId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "is_active_caregiver_for_patient",
    {
      target_patient_id: patientId,
    },
  );

  if (error) {
    throw error;
  }

  return Boolean(data);
}