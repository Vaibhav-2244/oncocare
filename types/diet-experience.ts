import type {
  DietPlan,
  MealPlanItem,
  MealType,
} from "@/types/diet-plan";

export type MealFeedbackSentiment =
  | "positive"
  | "neutral"
  | "negative";

export type MealFeedbackReason =
  | "not_appealing"
  | "too_heavy"
  | "too_similar"
  | "not_feeling_it"
  | "food_unavailable"
  | "too_difficult"
  | "skip_swap"
  | "other";

export interface DietFeedbackEvent {
  id: string;
  userId: string;
  planDate: string;
  mealType:
    | MealType
    | "daily";
  sentiment: MealFeedbackSentiment;
  reason?: MealFeedbackReason;
  note?: string;
  createdAt: string;
}

export interface SubmitMealFeedbackInput {
  planDate: string;
  mealType: MealType;
  sentiment: MealFeedbackSentiment;
  reason?: MealFeedbackReason;
  note?: string;
}

export interface SubmitDailyFeedbackInput {
  planDate: string;
  sentiment: MealFeedbackSentiment;
  note?: string;
}

export interface DietMealReplacement {
  id: string;
  userId: string;
  planDate: string;
  mealType: MealType;
  replacementNumber: 1 | 2;
  reason?: MealFeedbackReason;
  previousMeal: MealPlanItem;
  replacementMeal: MealPlanItem;
  createdAt: string;
}

export interface ReplaceMealInput {
  planDate: string;
  mealType: MealType;
  reason?: MealFeedbackReason;
}

export interface ReplaceMealResult {
  plan: DietPlan;
  replacedMeal: MealPlanItem;
  replacementNumber: 1 | 2;
}

export interface DietPersonalizationSignal {
  id: string;
  userId: string;
  signalKey: string;
  occurrenceCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
  metadata: Record<string, unknown>;
}

export interface DietWeeklyOverview {
  startDate: string;
  endDate: string;
  plansAvailable: number;
  totalMeals: number;
  positiveFeedbackCount: number;
  neutralFeedbackCount: number;
  negativeFeedbackCount: number;
  replacementCount: number;
  notablePatterns: string[];
}

export interface DietJourneyEntry {
  date: string;
  planAvailable: boolean;
  summary?: string;
  feedbackSentiment?:
    | MealFeedbackSentiment
    | null;
  mealReplacements: number;
}

export interface DietCareTeamSummary {
  startDate: string;
  endDate: string;
  plansAvailable: number;
  feedbackSummary: {
    positive: number;
    neutral: number;
    negative: number;
  };
  mealReplacements: number;
  notablePatterns: string[];
  patientPreferences: {
    dietType?: string;
    allergies: string[];
    intolerances: string[];
    avoidedFoods: string[];
    preferredFoods: string[];
    cuisinePreferences: string[];
    appetite?: string;
  };
}
