/**
 * Core domain types for the Personalized Diet Plans feature.
 *
 * The Diet Plans feature remains independent from other OncoCare+ features.
 * It may read relevant shared patient context, but nutrition preferences
 * and diet-plan experience data remain owned by this feature.
 */

export type DataSource =
  | "patient_reported"
  | "clinical_record"
  | "medication_record"
  | "supplement_record"
  | "lab_record"
  | "health_timeline"
  | "feature_input";

export interface PatientProfileContext {
  userId: string;
  dateOfBirth?: string;
  gender?: string;
  city?: string;
  state?: string;
}

export interface TreatmentContext {
  id: string;
  type: string;
  name: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  progress?: number;
  source: DataSource;
  verified: boolean;
}

export interface SymptomContext {
  id: string;
  name: string;
  severity: number;
  notes?: string;
  recordedAt?: string;
  source: DataSource;
  verified: boolean;
}

export interface MedicationContext {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  times?: unknown;
  startDate?: string;
  endDate?: string;
  notes?: string;
  isActive?: boolean;
  source: DataSource;
  verified: boolean;
}

export interface SupplementContext {
  id: string;
  name: string;
  category: string;
  dosage: string;
  frequency: string;
  timing: string;
  purpose?: string;
  startDate: string;
  endDate?: string;
  prescribingDoctor?: string;
  notes?: string;
  isActive: boolean;
  source: DataSource;
  verified: boolean;
}

export interface LabValueContext {
  id: string;
  testDate?: string;
  testName: string;
  canonicalName?: string;
  value?: number;
  normalizedValue?: number;
  unit?: string;
  normalizedUnit?: string;
  referenceLow?: number;
  referenceHigh?: number;
  referenceText?: string;
  source: DataSource;
  isReviewed: boolean;
  isCorrected: boolean;
  isRejected: boolean;
}

export interface HealthTimelineContext {
  id: string;
  eventType: string;
  title: string;
  description?: string;
  eventDate: string;
  source: DataSource;
}

export interface DietaryPreferences {
  dietType?:
    | "vegetarian"
    | "non_vegetarian"
    | "vegan"
    | "eggetarian"
    | "other";

  otherDietType?: string;

  allergies: string[];

  /**
   * Optional for backward compatibility with older context objects.
   * When present, these are a subset of allergies and remain hard exclusions.
   */
  severeAllergies?: string[];

  intolerances: string[];
  avoidedFoods: string[];
  preferredFoods: string[];
  cuisinePreferences: string[];

  /**
   * Kept for compatibility with existing persistence.
   * The saved value is derived from mealTiming.
   */
  mealCount?: number;

  mealTiming?: string[];

  appetite?:
    | "low"
    | "normal"
    | "increased"
    | "variable";

  nutritionGoals: string[];
}

export interface LifestyleContext {
  activityLevel?:
    | "sedentary"
    | "light"
    | "moderate"
    | "high";

  exerciseTypes?: string[];
  exerciseFrequency?: string;
  typicalWakeTime?: string;
  typicalSleepTime?: string;
  workPattern?: string;
}

export interface PatientNutritionContext {
  profile: PatientProfileContext;
  treatments: TreatmentContext[];
  symptoms: SymptomContext[];
  medications: MedicationContext[];
  supplements: SupplementContext[];
  labs: LabValueContext[];
  healthTimeline: HealthTimelineContext[];
  dietaryPreferences: DietaryPreferences;
  lifestyle: LifestyleContext;
  additionalNotes?: string;
  generatedAt: string;
  contextVersion: string;
}

export type MealType =
  | "breakfast"
  | "mid_morning"
  | "lunch"
  | "evening_snack"
  | "dinner";

export interface MealPlanItem {
  mealType: MealType;
  name: string;
  description: string;
  ingredients: string[];

  /**
   * Patient-facing explanation based only on actual context.
   * Must never invent symptoms, diagnoses, or treatment effects.
   */
  whyThisMeal?: string;

  /**
   * Practical household portion guidance.
   * Not a clinical calorie/macronutrient prescription.
   */
  portionGuidance?: string;

  /**
   * Approximate preparation time in minutes.
   */
  estimatedPrepMinutes?: number;

  preparationNotes?: string;
  hydrationGuidance?: string;
  nutritionNotes?: string[];
  safetyNotes?: string[];
}

export interface DietPlanSafetyNote {
  severity:
    | "info"
    | "warning"
    | "urgent";

  message: string;
}

export interface DietPlanSource {
  title: string;
  organization?: string;
  url?: string;
  publicationDate?: string;
  sourceType:
    | "guideline"
    | "review"
    | "clinical_resource"
    | "reference";
}

export interface DietPlan {
  id?: string;
  userId: string;
  planDate: string;
  summary: string;
  meals: MealPlanItem[];
  hydrationGuidance: string;
  generalNutritionNotes: string[];
  safetyNotes: DietPlanSafetyNote[];
  sources: DietPlanSource[];
  personalizationFactors: string[];
  generatedAt: string;
  modelVersion?: string;
  knowledgeVersion?: string;
}