import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  dietaryPreferencesSchema,
} from "@/lib/validation/diet-preferences";
import type { DietaryPreferences } from "@/types/diet-plan";

const DEFAULT_PREFERENCES: DietaryPreferences =
  {
    allergies: [],
    severeAllergies: [],
    intolerances: [],
    avoidedFoods: [],
    preferredFoods: [],
    cuisinePreferences: [],
    mealCount: 5,
    mealTiming: [
      "Breakfast",
      "Mid-morning",
      "Lunch",
      "Evening snack",
      "Dinner",
    ],
    appetite:
      undefined,
    nutritionGoals: [],
  };

function stringArrayOrEmpty(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (
      item,
    ): item is string =>
      typeof item === "string",
  );
}

function mapDatabaseRow(
  row: Record<string, unknown>,
): DietaryPreferences {
  const raw = {
    dietType:
      typeof row.diet_type ===
      "string"
        ? row.diet_type
        : undefined,

    otherDietType:
      typeof row.other_diet_type ===
      "string"
        ? row.other_diet_type
        : undefined,

    allergies:
      stringArrayOrEmpty(
        row.allergies,
      ),

    severeAllergies:
      stringArrayOrEmpty(
        row.severe_allergies,
      ),

    intolerances:
      stringArrayOrEmpty(
        row.intolerances,
      ),

    avoidedFoods:
      stringArrayOrEmpty(
        row.avoided_foods,
      ),

    preferredFoods:
      stringArrayOrEmpty(
        row.preferred_foods,
      ),

    cuisinePreferences:
      stringArrayOrEmpty(
        row.cuisine_preferences,
      ),

    mealCount:
      typeof row.meal_count ===
      "number"
        ? row.meal_count
        : undefined,

    mealTiming:
      stringArrayOrEmpty(
        row.meal_timing,
      ),

    appetite:
      typeof row.appetite ===
      "string"
        ? row.appetite
        : undefined,

    nutritionGoals:
      stringArrayOrEmpty(
        row.nutrition_goals,
      ),
  };

  /*
   * The same Zod contract is used for persisted data and
   * incoming request data. This gives us one normalization path.
   */
  return dietaryPreferencesSchema.parse(
    raw,
  );
}

const SELECT_FIELDS = `
  user_id,
  diet_type,
  other_diet_type,
  allergies,
  severe_allergies,
  intolerances,
  avoided_foods,
  preferred_foods,
  cuisine_preferences,
  meal_count,
  meal_timing,
  appetite,
  nutrition_goals
`;

export async function getDietaryPreferences(userId: string): Promise<DietaryPreferences> {
  const supabase =
    createSupabaseAdminClient();

  const {
    data,
    error,
  } = await supabase
    .from(
      "dietary_preferences",
    )
    .select(
      SELECT_FIELDS,
    )
    .eq(
      "user_id",
      userId,
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load dietary preferences: ${error.message}`,
    );
  }

  if (!data) {
    return {
      ...DEFAULT_PREFERENCES,

      allergies: [],

      severeAllergies: [],

      intolerances: [],

      avoidedFoods: [],

      preferredFoods: [],

      cuisinePreferences: [],

      mealTiming: [
        ...DEFAULT_PREFERENCES.mealTiming!,
      ],

      nutritionGoals: [],
    };
  }

  return mapDatabaseRow(
    data,
  );
}

/*
 * Accept unknown at the service boundary.
 *
 * Request JSON is untrusted input, so the service itself owns
 * schema validation rather than relying on a caller-side cast.
 */
export async function saveDietaryPreferences(
  userId: string,
  input: unknown,
): Promise<DietaryPreferences> {
  const validated =
    dietaryPreferencesSchema.parse(
      input,
    );

  const mealTiming =
    validated.mealTiming ??
    [];

  const supabase =
    createSupabaseAdminClient();

  const {
    data,
    error,
  } = await supabase
    .from(
      "dietary_preferences",
    )
    .upsert(
      {
        user_id:
          userId,

        diet_type:
          validated.dietType ??
          null,

        other_diet_type:
          validated.otherDietType ??
          null,

        allergies:
          validated.allergies,

        severe_allergies:
          validated.severeAllergies ??
          [],

        intolerances:
          validated.intolerances,

        avoided_foods:
          validated.avoidedFoods,

        preferred_foods:
          validated.preferredFoods,

        cuisine_preferences:
          validated.cuisinePreferences,

        /*
         * Single source of truth:
         * meal_count is derived from meal_timing.
         */
        meal_count:
          mealTiming.length,

        meal_timing:
          mealTiming,

        appetite:
          validated.appetite ??
          null,

        nutrition_goals:
          validated.nutritionGoals,

        updated_at:
          new Date().toISOString(),
      },
      {
        onConflict:
          "user_id",
      },
    )
    .select(
      SELECT_FIELDS,
    )
    .single();

  if (error) {
    throw new Error(
      `Unable to save dietary preferences: ${error.message}`,
    );
  }

  return mapDatabaseRow(
    data,
  );
}