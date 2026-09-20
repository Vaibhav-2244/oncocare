import type {
  DietPlan,
  MealPlanItem,
  MealType,
} from "@/types/diet-plan";

export const BATCH_REPLACEMENT_REASONS = [
  "not_appealing",
  "too_heavy",
  "too_similar",
  "not_feeling_it",
  "didnt_sit_well",
  "prefer_different_ingredients",
  "skip_explaining",
] as const;

export type BatchReplacementReason =
  (typeof BATCH_REPLACEMENT_REASONS)[number];

export interface BatchReplaceMealInput {
  planDate?: string;
  mealTypes: MealType[];
  reason?: BatchReplacementReason;
}

export interface BatchReplaceMealResult {
  plan: DietPlan;
  replacedMeals: MealPlanItem[];
  replacementNumbers: Record<MealType, 1 | 2>;
}

export interface MealReplacementStatus {
  mealType: MealType;
  used: number;
  remaining: number;
  available: boolean;
}
