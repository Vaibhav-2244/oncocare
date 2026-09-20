import {
  format,
  isValid,
  parseISO,
} from "date-fns";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  evaluateNutritionSafety,
  validateMealSafety,
} from "@/lib/nutrition/safety";
import { validateNutritionContent } from "@/lib/nutrition/content-safety";
import { retrieveNutritionKnowledge } from "@/lib/nutrition/knowledge";
import { getPatientNutritionContext } from "@/services/patient-context/patient-context";
import { generateNutritionPlan } from "@/services/nutrition-ai/nutrition-ai";
import {
  getDietaryPreferences,
} from "@/services/diet-preferences/diet-preferences";
import type {
  DietaryPreferences,
  DietPlan,
} from "@/types/diet-plan";

const DIET_PLAN_SELECT = `
  id,
  user_id,
  plan_date,
  summary,
  meals,
  hydration_guidance,
  general_nutrition_notes,
  safety_notes,
  sources,
  personalization_factors,
  model_version,
  knowledge_version,
  generated_at,
  updated_at
`;

type GeneratedDietPlan = Pick<
  DietPlan,
  | "summary"
  | "meals"
  | "hydrationGuidance"
  | "generalNutritionNotes"
  | "safetyNotes"
  | "sources"
  | "personalizationFactors"
>;

export type DietPlanGenerationResult =
  | {
      status: "existing";
      plan: DietPlan;
    }
  | {
      status: "generated";
      plan: DietPlan;
    }
  | {
      status:
        "missing_required_information";
      reasons: string[];
    }
  | {
      status:
        "requires_professional_support";
      reasons: string[];
    };

function mapDatabasePlan(
  row: Record<string, unknown>,
): DietPlan {
  return {
    id:
      typeof row.id === "string"
        ? row.id
        : undefined,

    userId: String(
      row.user_id,
    ),

    planDate: String(
      row.plan_date,
    ),

    summary: String(
      row.summary ?? "",
    ),

    meals: Array.isArray(
      row.meals,
    )
      ? row.meals
      : [],

    hydrationGuidance: String(
      row.hydration_guidance ?? "",
    ),

    generalNutritionNotes:
      Array.isArray(
        row.general_nutrition_notes,
      )
        ? row.general_nutrition_notes
        : [],

    safetyNotes:
      Array.isArray(
        row.safety_notes,
      )
        ? row.safety_notes
        : [],

    sources:
      Array.isArray(
        row.sources,
      )
        ? row.sources
        : [],

    personalizationFactors:
      Array.isArray(
        row.personalization_factors,
      )
        ? row.personalization_factors
        : [],

    generatedAt: String(
      row.generated_at ??
        new Date().toISOString(),
    ),

    modelVersion:
      typeof row.model_version ===
      "string"
        ? row.model_version
        : undefined,

    knowledgeVersion:
      typeof row.knowledge_version ===
      "string"
        ? row.knowledge_version
        : undefined,
  };
}

function validatePlanDate(
  value: string,
): string {
  const parsed =
    parseISO(value);

  if (!isValid(parsed)) {
    throw new Error(
      "Invalid diet plan date.",
    );
  }

  return format(
    parsed,
    "yyyy-MM-dd",
  );
}

export async function getDietPlanByDate(
  userId: string,
  planDate: string,
): Promise<DietPlan | null> {
  const supabase =
    createSupabaseAdminClient();

  const normalizedDate =
    validatePlanDate(
      planDate,
    );

  const {
    data,
    error,
  } = await supabase
    .from("diet_plans")
    .select(
      DIET_PLAN_SELECT,
    )
    .eq(
      "user_id",
      userId,
    )
    .eq(
      "plan_date",
      normalizedDate,
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load diet plan: ${error.message}`,
    );
  }

  return data
    ? mapDatabasePlan(data)
    : null;
}

export async function getTodaysDietPlan(
  userId: string,
): Promise<
  DietPlan | null
> {
  const today = format(
    new Date(),
    "yyyy-MM-dd",
  );

  return getDietPlanByDate(userId, today);
}

export async function getDietPlanHistory(
  userId: string,
  limit = 14,
): Promise<DietPlan[]> {
  const supabase =
    createSupabaseAdminClient();

  const safeLimit =
    Math.min(
      Math.max(
        Math.floor(limit),
        1,
      ),
      31,
    );

  const {
    data,
    error,
  } = await supabase
    .from("diet_plans")
    .select(
      DIET_PLAN_SELECT,
    )
    .eq(
      "user_id",
      userId,
    )
    .order(
      "plan_date",
      {
        ascending: false,
      },
    )
    .limit(
      safeLimit,
    );

  if (error) {
    throw new Error(
      `Unable to load diet plan history: ${error.message}`,
    );
  }

  return Array.isArray(data)
    ? data.map(
        mapDatabasePlan,
      )
    : [];
}

function validateGeneratedPlan(
  plan: GeneratedDietPlan,
  hardExclusions: string[],
): void {
  const contentSafety =
    validateNutritionContent(
      plan,
    );

  if (
    !contentSafety.safe
  ) {
    throw new Error(
      contentSafety.violations.join(
        " ",
      ),
    );
  }

  if (
    !plan.summary.trim()
  ) {
    throw new Error(
      "The generated diet plan has no summary.",
    );
  }

  if (
    plan.meals.length === 0
  ) {
    throw new Error(
      "The generated diet plan contains no meals.",
    );
  }

  if (
    plan.sources.length === 0
  ) {
    throw new Error(
      "The generated diet plan contains no verified nutrition sources.",
    );
  }

  const mealTypes =
    new Set<string>();

  for (const meal of plan.meals) {
    if (
      mealTypes.has(
        meal.mealType,
      )
    ) {
      throw new Error(
        `The generated diet plan contains a duplicate ${meal.mealType} meal.`,
      );
    }

    mealTypes.add(
      meal.mealType,
    );
  }

  /*
   * The existing safety helper accepts the full
   * meal collection and returns string[] violations.
   */
  const mealSafetyViolations =
    validateMealSafety(
      plan.meals,
      hardExclusions,
    );

  if (
    mealSafetyViolations.length >
    0
  ) {
    throw new Error(
      mealSafetyViolations.join(
        " ",
      ),
    );
  }
}

export async function generateTodaysDietPlan(
  userId: string,
  regenerate = false,
): Promise<DietPlanGenerationResult> {
  const existingPlan =
    await getTodaysDietPlan(userId);

  /*
   * One saved plan per patient/day.
   * Do not call Gemini again unless regeneration
   * has explicitly been requested.
   */
  if (
    existingPlan &&
    !regenerate
  ) {
    return {
      status: "existing",
      plan: existingPlan,
    };
  }

  const [
    context,
    preferences,
  ] = await Promise.all([
    getPatientNutritionContext(userId),
    getDietaryPreferences(userId),
  ]);

  const mergedContext = {
    ...context,
    dietaryPreferences:
      preferences as DietaryPreferences,
  };

  /*
   * Treatment context is required for this
   * oncology-focused nutrition workflow.
   *
   * This is a controlled validation state,
   * not a server failure.
   */
  if (
    mergedContext.treatments
      .length === 0
  ) {
    return {
      status:
        "missing_required_information",
      reasons: [
        "Treatment information is required before a personalized oncology nutrition plan can be generated.",
      ],
    };
  }

  const safety =
    evaluateNutritionSafety(
      mergedContext,
    );

  if (
    safety.requiresProfessionalSupport
  ) {
    return {
      status:
        "requires_professional_support",
      reasons:
        safety.reasons,
    };
  }

  const knowledge =
    await retrieveNutritionKnowledge(
      mergedContext,
      4,
    );

  if (
    knowledge.length === 0
  ) {
    throw new Error(
      "No active nutrition knowledge is available for plan generation.",
    );
  }

  const generated =
    await generateNutritionPlan(
      mergedContext,
      knowledge,
    );

  validateGeneratedPlan(
    generated.plan,
    safety.hardExclusions,
  );

  const supabase =
    createSupabaseAdminClient();

  const planDate =
    format(
      new Date(),
      "yyyy-MM-dd",
    );

  const knowledgeVersions = [
    ...new Set(
      knowledge.map(
        (document) =>
          document.knowledgeVersion,
      ),
    ),
  ];

  const now =
    new Date().toISOString();

  const payload = {
    user_id: userId,
    plan_date: planDate,
    summary:
      generated.plan.summary,

    meals:
      generated.plan.meals,

    hydration_guidance:
      generated.plan
        .hydrationGuidance,

    general_nutrition_notes:
      generated.plan
        .generalNutritionNotes,

    safety_notes:
      generated.plan.safetyNotes,

    sources:
      generated.plan.sources,

    personalization_factors:
      generated.plan
        .personalizationFactors,

    model_version:
      generated.modelVersion,

    knowledge_version:
      knowledgeVersions.join(
        ", ",
      ),

    generated_at: now,
    updated_at: now,
  };

  const {
    data,
    error,
  } = await supabase
    .from("diet_plans")
    .upsert(
      payload,
      {
        onConflict:
          "user_id,plan_date",
      },
    )
    .select(
      DIET_PLAN_SELECT,
    )
    .single();

  if (error) {
    throw new Error(
      `Unable to save generated diet plan: ${error.message}`,
    );
  }

  return {
    status: "generated",
    plan: mapDatabasePlan(
      data,
    ),
  };
}