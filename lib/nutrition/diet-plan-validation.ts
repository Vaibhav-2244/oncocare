import type {
  MealPlanItem,
} from "@/types/diet-plan";

import {
  validateMealSafety,
} from "@/lib/nutrition/safety";

export function validateMeal(
  meal: MealPlanItem,
  hardExclusions: string[],
): void {
  if (
    !meal ||
    typeof meal.name !==
      "string" ||
    meal.name.trim().length ===
      0
  ) {
    throw new Error(
      "The meal name is missing.",
    );
  }

  if (
    typeof meal.description !==
      "string" ||
    meal.description.trim().length ===
      0
  ) {
    throw new Error(
      "The meal description is missing.",
    );
  }

  if (
    !Array.isArray(
      meal.ingredients,
    ) ||
    meal.ingredients.length ===
      0
  ) {
    throw new Error(
      "The meal ingredients are missing.",
    );
  }

  const violations =
    validateMealSafety(
      [meal],
      hardExclusions,
    );

  if (
    violations.length > 0
  ) {
    throw new Error(
      violations.join(
        " ",
      ),
    );
  }
}