import type {
  DietaryPreferences,
  PatientNutritionContext,
} from "@/types/diet-plan";

export interface NutritionSafetyResult {
  safeToGenerate: boolean;
  requiresProfessionalSupport: boolean;
  reasons: string[];
  hardExclusions: string[];
}

const SERIOUS_NUTRITION_PATTERNS = [
  /\bsevere nausea\b/i,
  /\bsevere vomiting\b/i,
  /\bpersistent vomiting\b/i,
  /\bfrequent vomiting\b/i,
  /\buncontrolled vomiting\b/i,
  /\bdifficulty swallowing\b/i,
  /\bswallowing difficulty\b/i,
  /\bpainful swallowing\b/i,
  /\bdysphagia\b/i,
  /\bunable to eat\b/i,
  /\bunable to drink\b/i,
  /\bcannot eat\b/i,
  /\bcannot drink\b/i,
  /\bcan't eat\b/i,
  /\bcan't drink\b/i,
  /\binability to eat\b/i,
  /\binability to drink\b/i,
  /\bdehydration\b/i,
  /\bsignificant weight loss\b/i,
];

const SERIOUS_SYMPTOM_NAMES = [
  "severe nausea",
  "severe vomiting",
  "persistent vomiting",
  "frequent vomiting",
  "uncontrolled vomiting",
  "difficulty swallowing",
  "swallowing difficulty",
  "painful swallowing",
  "dysphagia",
  "unable to eat",
  "unable to drink",
  "cannot eat",
  "cannot drink",
  "inability to eat",
  "inability to drink",
  "dehydration",
  "significant weight loss",
];

function normalize(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /[^\p{L}\p{N}\s-]/gu,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    );
}

function containsFoodTerm(
  text: string,
  term: string,
): boolean {
  const normalizedText =
    normalize(text);

  const normalizedTerm =
    normalize(term);

  if (!normalizedTerm) {
    return false;
  }

  if (
    normalizedTerm.includes(" ")
  ) {
    return normalizedText.includes(
      normalizedTerm,
    );
  }

  return normalizedText
    .split(" ")
    .includes(
      normalizedTerm,
    );
}

function isSeriousNutritionSymptom(
  symptom: PatientNutritionContext["symptoms"][number],
): boolean {
  const symptomName =
    normalize(
      symptom.name,
    );

  const symptomNotes =
    normalize(
      symptom.notes ?? "",
    );

  const combinedText = [
    symptomName,
    symptomNotes,
  ]
    .filter(Boolean)
    .join(" ");

  /*
   * A high severity eating-related symptom
   * should always require professional review.
   */
  if (
    symptom.severity >= 7 &&
    SERIOUS_NUTRITION_PATTERNS.some(
      (pattern) =>
        pattern.test(
          combinedText,
        ),
    )
  ) {
    return true;
  }

  /*
   * Some symptom records may use a textual name
   * such as "severe nausea" without a reliable
   * severity value. These should still be caught.
   */
  if (
    SERIOUS_SYMPTOM_NAMES.some(
      (seriousName) =>
        symptomName ===
          seriousName ||
        symptomName.includes(
          seriousName,
        ),
    )
  ) {
    return true;
  }

  /*
   * Severe language in notes combined with
   * an eating-related problem should also trigger.
   */
  if (
    /severe|persistent|uncontrolled|unable|inability/i.test(
      combinedText,
    ) &&
    SERIOUS_NUTRITION_PATTERNS.some(
      (pattern) =>
        pattern.test(
          combinedText,
        ),
    )
  ) {
    return true;
  }

  return false;
}

export function getHardExclusions(
  preferences: DietaryPreferences,
): string[] {
  return [
    ...preferences.allergies,
    ...preferences.intolerances,
    ...preferences.avoidedFoods,
  ]
    .map(
      (value) =>
        value.trim(),
    )
    .filter(Boolean);
}

export function evaluateNutritionSafety(
  context: PatientNutritionContext,
): NutritionSafetyResult {
  const reasons: string[] = [];

  for (
    const symptom of context.symptoms
  ) {
    if (
      isSeriousNutritionSymptom(
        symptom,
      )
    ) {
      reasons.push(
        `The recorded symptom "${symptom.name}" may require professional nutrition or clinical support before a standard AI meal plan is generated.`,
      );
    }
  }

  const uniqueReasons =
    [
      ...new Set(
        reasons,
      ),
    ];

  const requiresProfessionalSupport =
    uniqueReasons.length > 0;

  return {
    safeToGenerate:
      !requiresProfessionalSupport,

    requiresProfessionalSupport,

    reasons:
      uniqueReasons,

    hardExclusions:
      getHardExclusions(
        context.dietaryPreferences,
      ),
  };
}

export function mealContainsExcludedFood(
  ingredients: string[],
  excludedFoods: string[],
): string[] {
  const violations: string[] = [];

  for (
    const ingredient of ingredients
  ) {
    for (
      const excludedFood of excludedFoods
    ) {
      if (
        containsFoodTerm(
          ingredient,
          excludedFood,
        )
      ) {
        violations.push(
          excludedFood,
        );
      }
    }
  }

  return [
    ...new Set(
      violations,
    ),
  ];
}

export function validateMealSafety(
  meals: Array<{
    ingredients: string[];
  }>,
  excludedFoods: string[],
): string[] {
  const violations =
    new Set<string>();

  for (
    const meal of meals
  ) {
    const mealViolations =
      mealContainsExcludedFood(
        meal.ingredients,
        excludedFoods,
      );

    for (
      const violation of mealViolations
    ) {
      violations.add(
        violation,
      );
    }
  }

  return [
    ...violations,
  ];
}