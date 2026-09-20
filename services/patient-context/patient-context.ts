import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  HealthTimelineContext,
  LabValueContext,
  MedicationContext,
  PatientNutritionContext,
  PatientProfileContext,
  SupplementContext,
  SymptomContext,
  TreatmentContext,
} from "@/types/diet-plan";

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value
    : undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export async function getPatientNutritionContext(userId: string): Promise<PatientNutritionContext> {
  const supabase = createSupabaseAdminClient();

  const [
    profileResult,
    treatmentsResult,
    symptomsResult,
    medicationsResult,
    supplementsResult,
    labsResult,
    timelineResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        `
          id,
          date_of_birth,
          gender,
          city,
          state
        `,
      )
      .eq("id", userId)
      .maybeSingle(),

    supabase
      .from("treatments")
      .select(
        `
          id,
          type,
          name,
          status,
          start_date,
          end_date,
          notes,
          progress
        `,
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),

    supabase
      .from("symptoms")
      .select(
        `
          id,
          name,
          severity,
          notes,
          recorded_at
        `,
      )
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false })
      .limit(30),

    supabase
      .from("medications")
      .select(
        `
          id,
          name,
          dosage,
          frequency,
          times,
          start_date,
          end_date,
          notes,
          is_active
        `,
      )
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),

    supabase
      .from("supplement_tracker_items")
      .select(
        `
          id,
          name,
          category,
          dosage,
          frequency,
          timing,
          purpose,
          start_date,
          end_date,
          prescribing_doctor,
          notes,
          is_active
        `,
      )
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),

    supabase
      .from("lab_values")
      .select(
        `
          id,
          test_date,
          test_name,
          canonical_name,
          value,
          normalized_value,
          unit,
          normalized_unit,
          reference_low,
          reference_high,
          reference_text,
          is_reviewed,
          is_corrected,
          is_rejected
        `,
      )
      .eq("user_id", userId)
      .eq("is_rejected", false)
      .order("test_date", { ascending: false })
      .limit(50),

    supabase
      .from("health_timeline")
      .select(
        `
          id,
          event_type,
          title,
          description,
          event_date
        `,
      )
      .eq("user_id", userId)
      .order("event_date", { ascending: false })
      .limit(30),
  ]);

  const firstError = [
    profileResult.error,
    treatmentsResult.error,
    symptomsResult.error,
    medicationsResult.error,
    supplementsResult.error,
    labsResult.error,
    timelineResult.error,
  ].find(Boolean);

  if (firstError) {
    throw new Error(
      `Unable to load patient nutrition context: ${firstError.message}`,
    );
  }

  const profileRow = profileResult.data;

  const profile: PatientProfileContext = {
    userId,
    dateOfBirth: toOptionalString(profileRow?.date_of_birth),
    gender: toOptionalString(profileRow?.gender),
    city: toOptionalString(profileRow?.city),
    state: toOptionalString(profileRow?.state),
  };

  const treatments: TreatmentContext[] = (treatmentsResult.data ?? []).map(
    (row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      status: toOptionalString(row.status),
      startDate: toOptionalString(row.start_date),
      endDate: toOptionalString(row.end_date),
      notes: toOptionalString(row.notes),
      progress: toOptionalNumber(row.progress),
      source: "clinical_record",
      verified: false,
    }),
  );

  const symptoms: SymptomContext[] = (symptomsResult.data ?? []).map(
    (row) => ({
      id: row.id,
      name: row.name,
      severity:
        typeof row.severity === "number" ? row.severity : 0,
      notes: toOptionalString(row.notes),
      recordedAt: toOptionalString(row.recorded_at),
      source: "patient_reported",
      verified: false,
    }),
  );

  const medications: MedicationContext[] = (
    medicationsResult.data ?? []
  ).map((row) => ({
    id: row.id,
    name: row.name,
    dosage: row.dosage ?? "",
    frequency: row.frequency ?? "",
    times: row.times,
    startDate: toOptionalString(row.start_date),
    endDate: toOptionalString(row.end_date),
    notes: toOptionalString(row.notes),
    isActive: row.is_active ?? true,
    source: "medication_record",
    verified: false,
  }));

  const supplements: SupplementContext[] = (
    supplementsResult.data ?? []
  ).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category ?? "",
    dosage: row.dosage ?? "",
    frequency: row.frequency ?? "",
    timing: row.timing ?? "",
    purpose: toOptionalString(row.purpose),
    startDate: row.start_date ?? "",
    endDate: toOptionalString(row.end_date),
    prescribingDoctor: toOptionalString(row.prescribing_doctor),
    notes: toOptionalString(row.notes),
    isActive: row.is_active ?? true,
    source: "supplement_record",
    verified: false,
  }));

  const labs: LabValueContext[] = (labsResult.data ?? []).map(
    (row) => ({
      id: row.id,
      testDate: toOptionalString(row.test_date),
      testName: row.test_name,
      canonicalName: toOptionalString(row.canonical_name),
      value: toOptionalNumber(row.value),
      normalizedValue: toOptionalNumber(row.normalized_value),
      unit: toOptionalString(row.unit),
      normalizedUnit: toOptionalString(row.normalized_unit),
      referenceLow: toOptionalNumber(row.reference_low),
      referenceHigh: toOptionalNumber(row.reference_high),
      referenceText: toOptionalString(row.reference_text),
      source: "lab_record",
      isReviewed: row.is_reviewed ?? false,
      isCorrected: row.is_corrected ?? false,
      isRejected: row.is_rejected ?? false,
    }),
  );

  const healthTimeline: HealthTimelineContext[] = (
    timelineResult.data ?? []
  ).map((row) => ({
    id: row.id,
    eventType: row.event_type,
    title: row.title,
    description: toOptionalString(row.description),
    eventDate: row.event_date,
    source: "health_timeline",
  }));

  return {
    profile,
    treatments,
    symptoms,
    medications,
    supplements,
    labs,
    healthTimeline,

    dietaryPreferences: {
      allergies: [],
      intolerances: [],
      avoidedFoods: [],
      preferredFoods: [],
      cuisinePreferences: [],
      mealTiming: [],
      nutritionGoals: [],
    },

    lifestyle: {},

    generatedAt: new Date().toISOString(),
    contextVersion: "1.0",
  };
}