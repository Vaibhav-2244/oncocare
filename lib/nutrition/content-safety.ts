/**
 * Personalized Diet Plans
 * Nutrition content safety validation
 *
 * The validator must:
 * - block unsupported claims that food/diet/nutrition/herbs/supplements
 *   directly cure or treat cancer;
 * - block recommendations to change prescribed cancer treatment/medication;
 * - block replacement of medical treatment with food/diet/herbs/supplements;
 * - block dangerous detox/cleanse/extreme-fasting advice;
 * - allow normal oncology-nutrition context and explicit safety disclaimers.
 */

export interface NutritionContentSafetyResult {
  safe: boolean;
  violations: string[];
}

interface NutritionPlanContent {
  summary?: string;

  meals?: Array<{
    mealType?: string;
    name?: string;
    description?: string;
    ingredients?: string[];
    preparationNotes?: string;
    hydrationGuidance?: string;
    nutritionNotes?: string[];
    safetyNotes?: string[];
  }>;

  hydrationGuidance?: string;

  generalNutritionNotes?: string[];

  safetyNotes?: Array<{
    severity?: string;
    message?: string;
  }>;

  personalizationFactors?: string[];

  sources?: Array<{
    title?: string;
    organization?: string;
    url?: string;
    publicationDate?: string;
    sourceType?: string;
  }>;
}

function normalizeText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function collectPlanText(plan: NutritionPlanContent): string {
  const parts: string[] = [];

  if (plan.summary) {
    parts.push(plan.summary);
  }

  if (plan.hydrationGuidance) {
    parts.push(plan.hydrationGuidance);
  }

  for (const note of plan.generalNutritionNotes ?? []) {
    if (note) {
      parts.push(note);
    }
  }

  for (const factor of plan.personalizationFactors ?? []) {
    if (factor) {
      parts.push(factor);
    }
  }

  for (const safetyNote of plan.safetyNotes ?? []) {
    if (safetyNote.message) {
      parts.push(safetyNote.message);
    }
  }

  for (const meal of plan.meals ?? []) {
    if (meal.name) {
      parts.push(meal.name);
    }

    if (meal.description) {
      parts.push(meal.description);
    }

    for (const ingredient of meal.ingredients ?? []) {
      if (ingredient) {
        parts.push(ingredient);
      }
    }

    if (meal.preparationNotes) {
      parts.push(meal.preparationNotes);
    }

    if (meal.hydrationGuidance) {
      parts.push(meal.hydrationGuidance);
    }

    for (const note of meal.nutritionNotes ?? []) {
      if (note) {
        parts.push(note);
      }
    }

    for (const note of meal.safetyNotes ?? []) {
      if (note) {
        parts.push(note);
      }
    }
  }

  /*
   * Source titles and URLs are deliberately excluded.
   * Legitimate sources may contain phrases such as:
   * "Nutrition During Cancer Treatment".
   */
  return normalizeText(parts.join(" "));
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * Detect explicit negation / disclaimer language.
 *
 * Examples that must NOT be rejected:
 * - "This diet does not cure cancer."
 * - "Food cannot cure cancer."
 * - "No food can treat cancer."
 * - "This plan is not intended to treat cancer."
 * - "Do not use this diet to replace medical treatment."
 */
function containsExplicitNegation(sentence: string): boolean {
  const negationPatterns = [
    /\bdoes\s+not\b/i,
    /\bdo\s+not\b/i,
    /\bdid\s+not\b/i,
    /\bdoesn't\b/i,
    /\bdon't\b/i,
    /\bdidn't\b/i,
    /\bcannot\b/i,
    /\bcan't\b/i,
    /\bcould\s+not\b/i,
    /\bcouldn't\b/i,
    /\bwill\s+not\b/i,
    /\bwon't\b/i,
    /\bwould\s+not\b/i,
    /\bwouldn't\b/i,
    /\bshould\s+not\b/i,
    /\bshouldn't\b/i,
    /\bmust\s+not\b/i,
    /\bmustn't\b/i,
    /\bnever\b/i,
    /\bno\s+(?:food|foods|diet|meal|meals|herb|herbs|supplement|supplements|nutrition)\b/i,
    /\bnot\s+intended\s+to\b/i,
    /\bnot\s+designed\s+to\b/i,
    /\bnot\s+a\s+(?:treatment|cure)\b/i,
    /\bnot\s+used\s+to\b/i,
    /\bnot\s+replace\b/i,
    /\bnot\s+substitute\b/i,
    /\bwithout\s+replacing\b/i,
  ];

  return negationPatterns.some((pattern) => pattern.test(sentence));
}

/**
 * The sentence is considered a direct unsupported claim only when
 * the positive claim itself is present.
 *
 * Important distinction:
 *
 * BLOCK:
 *   "This diet can cure cancer."
 *   "These foods treat cancer."
 *
 * ALLOW:
 *   "This diet cannot cure cancer."
 *   "Food does not treat cancer."
 */
function containsUnsupportedCancerTreatmentClaim(text: string): boolean {
  const sentences = splitSentences(text);

  const positiveClaimPatterns = [
    // Food/diet/nutrition/herbs/supplements + positive treatment verb + cancer.
    /\b(?:food|foods|diet|meal|meals|nutrition|nutritional\s+therapy|herb|herbs|herbal\s+remedy|herbal\s+medicine|supplement|supplements|juice|tea|drink)\b[\s\S]{0,100}\b(?:cures?|treats?|heals?|eliminates?|destroys?|kills?|shrinks?|reverses?|eradicates?)\b[\s\S]{0,70}\b(?:cancer|tumou?r|malignancy|metastasis|metastatic\s+disease)\b/i,

    // Positive modal claim:
    // "This diet can treat cancer."
    /\b(?:food|foods|diet|meal|meals|nutrition|herb|herbs|herbal\s+remedy|herbal\s+medicine|supplement|supplements|juice|tea|drink)\b[\s\S]{0,70}\b(?:can|could|will|would|may|might)\s+(?:cure|treat|heal|eliminate|destroy|kill|shrink|reverse|eradicate)\b[\s\S]{0,70}\b(?:cancer|tumou?r|malignancy|metastasis|metastatic\s+disease)\b/i,

    // "A diet is a treatment/cure for cancer."
    /\b(?:food|foods|diet|meal|meals|nutrition|herb|herbs|herbal\s+remedy|herbal\s+medicine|supplement|supplements)\b[\s\S]{0,70}\b(?:is|are|was|were)\s+(?:a\s+)?(?:cure|treatment|therapy|remedy)\s+(?:for|against)\b[\s\S]{0,50}\b(?:cancer|tumou?r|malignancy|metastasis)\b/i,

    // Direct statement such as:
    // "This food fights cancer."
    /\b(?:food|foods|diet|meal|meals|nutrition|herb|herbs|herbal\s+remedy|supplement|supplements)\b[\s\S]{0,60}\b(?:fights?|battle|battles|attacks?|destroys?|kills?)\b[\s\S]{0,60}\b(?:cancer|tumou?r|malignancy|metastasis)\b/i,

    // "Use X to treat/cure cancer."
    /\b(?:use|using|take|taking|consume|consuming|follow|following)\b[\s\S]{0,60}\b(?:food|foods|diet|meal|meals|nutrition|herb|herbs|herbal\s+remedy|supplement|supplements|juice|tea|drink)\b[\s\S]{0,70}\b(?:to\s+)?(?:cure|treat|heal|eliminate|destroy|kill|shrink|reverse)\b[\s\S]{0,50}\b(?:cancer|tumou?r|malignancy|metastasis)\b/i,
  ];

  for (const sentence of sentences) {
    /*
     * A sentence that explicitly denies a cancer-treatment claim
     * is a safety statement, not an unsupported claim.
     */
    if (containsExplicitNegation(sentence)) {
      continue;
    }

    if (positiveClaimPatterns.some((pattern) => pattern.test(sentence))) {
      return true;
    }
  }

  return false;
}

/**
 * Detect instructions to modify prescribed treatment or medication.
 *
 * Explicit safety statements such as:
 * "Do not stop chemotherapy."
 * are allowed.
 */
function containsTreatmentChangeInstruction(text: string): boolean {
  const sentences = splitSentences(text);

  const treatmentChangePattern =
    /\b(?:stop|stopping|discontinue|discontinuing|skip|skipping|replace|replacing|substitute|substituting|switch|switching|reduce|reducing|increase|increasing|change|changing)\b[\s\S]{0,80}\b(?:chemotherapy|chemo|radiation|radiotherapy|immunotherapy|targeted\s+therapy|hormone\s+therapy|cancer\s+treatment|oncology\s+treatment|prescription\s+medication|prescribed\s+medication|medicine|medication)\b/i;

  for (const sentence of sentences) {
    if (containsExplicitNegation(sentence)) {
      continue;
    }

    if (treatmentChangePattern.test(sentence)) {
      return true;
    }
  }

  return false;
}

/**
 * Detect suggestions that nutrition/food/herbs/supplements
 * replace medical treatment.
 *
 * Explicit warnings such as:
 * "Do not replace chemotherapy with supplements."
 * are allowed.
 */
function containsReplacementClaim(text: string): boolean {
  const sentences = splitSentences(text);

  const replacementPatterns = [
    /\b(?:replace|replaces|replacing|substitute|substitutes|substituting)\b[\s\S]{0,70}\b(?:cancer\s+treatment|chemotherapy|chemo|radiation|radiotherapy|immunotherapy|targeted\s+therapy|prescription\s+medication|medicine|medication)\b/i,

    /\b(?:instead\s+of|in\s+place\s+of|rather\s+than)\b[\s\S]{0,70}\b(?:chemotherapy|chemo|radiation|radiotherapy|immunotherapy|targeted\s+therapy|cancer\s+treatment|medicine|medication)\b/i,

    /\b(?:diet|food|foods|herbs|supplements|nutrition)\b[\s\S]{0,70}\b(?:replace|replace\s+medical\s+treatment|substitute\s+for)\b/i,
  ];

  for (const sentence of sentences) {
    if (containsExplicitNegation(sentence)) {
      continue;
    }

    if (replacementPatterns.some((pattern) => pattern.test(sentence))) {
      return true;
    }
  }

  return false;
}

/**
 * Detect potentially dangerous detox/cleanse/starvation/extreme fasting advice.
 */
function containsDangerousDietClaim(text: string): boolean {
  const sentences = splitSentences(text);

  const dangerousPatterns = [
    /\b(?:starve|starvation|starving)\b[\s\S]{0,60}\b(?:cancer|tumou?r|malignancy|treatment)\b/i,

    /\b(?:detox|detoxify|detoxification)\b[\s\S]{0,70}\b(?:cancer|tumou?r|treatment|chemotherapy|chemo)\b/i,

    /\b(?:cleanse|cleansing)\b[\s\S]{0,70}\b(?:cancer|tumou?r|treatment|chemotherapy|chemo)\b/i,

    /\b(?:extreme\s+fasting|prolonged\s+fasting|water[-\s]?only\s+fasting)\b/i,
  ];

  for (const sentence of sentences) {
    /*
     * A sentence warning against a dangerous practice should not
     * itself become a violation.
     */
    if (containsExplicitNegation(sentence)) {
      continue;
    }

    if (dangerousPatterns.some((pattern) => pattern.test(sentence))) {
      return true;
    }
  }

  return false;
}

/**
 * Detect unsupported claims that Ayurvedic/herbal approaches
 * directly cure or treat cancer.
 *
 * General contextual language such as:
 * "Ayurvedic foods may be included as culturally preferred foods"
 * remains allowed.
 */
function containsUnsupportedAyurvedicTreatmentClaim(text: string): boolean {
  const sentences = splitSentences(text);

  const ayurvedicPatterns = [
    /\b(?:ayurveda|ayurvedic|herbal|herbs|traditional\s+medicine)\b[\s\S]{0,100}\b(?:cures?|treats?|heals?|eliminates?|destroys?|kills?|shrinks?|reverses?)\b[\s\S]{0,100}\b(?:cancer|tumou?r|malignancy|metastasis|metastatic\s+disease)\b/i,

    /\b(?:cancer|tumou?r|malignancy|metastasis|metastatic\s+disease)\b[\s\S]{0,100}\b(?:ayurveda|ayurvedic|herbal\s+treatment|herbal\s+therapy)\b[\s\S]{0,100}\b(?:cure|treat|heal|eliminate|destroy|kill|shrink|reverse)\b/i,
  ];

  for (const sentence of sentences) {
    if (containsExplicitNegation(sentence)) {
      continue;
    }

    if (ayurvedicPatterns.some((pattern) => pattern.test(sentence))) {
      return true;
    }
  }

  return false;
}

/**
 * Main validator.
 */
export function validateNutritionContent(
  plan: NutritionPlanContent,
): NutritionContentSafetyResult {
  const text = collectPlanText(plan);

  if (!text) {
    return {
      safe: false,
      violations: [
        "The generated nutrition plan contains no readable content.",
      ],
    };
  }

  const violations: string[] = [];

  if (containsUnsupportedCancerTreatmentClaim(text)) {
    violations.push(
      "The generated plan contains an unsupported claim that food, diet, nutrition, herbs, or supplements can directly treat or cure cancer.",
    );
  }

  if (containsTreatmentChangeInstruction(text)) {
    violations.push(
      "The generated plan contains a recommendation to change, stop, skip, replace, or otherwise modify prescribed cancer treatment or medication.",
    );
  }

  if (containsReplacementClaim(text)) {
    violations.push(
      "The generated plan suggests replacing medical treatment or prescribed medication with nutrition, food, herbs, or supplements.",
    );
  }

  if (containsDangerousDietClaim(text)) {
    violations.push(
      "The generated plan contains a potentially unsafe detox, cleanse, starvation, or extreme-fasting recommendation.",
    );
  }

  if (containsUnsupportedAyurvedicTreatmentClaim(text)) {
    violations.push(
      "The generated plan contains an unsupported Ayurvedic or herbal cancer-treatment claim.",
    );
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}