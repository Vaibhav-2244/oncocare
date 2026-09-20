import { z } from "zod";

import type { DietaryPreferences } from "@/types/diet-plan";

const MAX_TAG_LENGTH = 40;
const MAX_TAGS_PER_FIELD = 10;
const MAX_OTHER_DIET_LENGTH = 80;

const CONTROLLED_MEAL_TIMINGS = [
  "Breakfast",
  "Mid-morning",
  "Lunch",
  "Evening snack",
  "Dinner",
] as const;

const CONTROLLED_NUTRITION_GOALS = [
  "Maintain energy",
  "Support adequate nutrition",
  "Support recovery",
  "Maintain strength",
  "Manage appetite",
  "Stay hydrated",
] as const;

const INSTRUCTION_LIKE_TEXT =
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions|rules)|system\s+prompt|developer\s+(?:message|instruction)|do\s+not\s+follow|stop\s+(?:chemotherapy|treatment|medication)|change\s+(?:my|the)\s+(?:medication|treatment)|replace\s+(?:my|the)\s+(?:medical|cancer)\s+treatment|prescribe\s+/i;

function normalizePatientText(
  value: string,
): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}\s&'()./+\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const dietaryTagSchema = z
  .string()
  .trim()
  .min(
    1,
    "Value cannot be empty.",
  )
  .max(
    MAX_TAG_LENGTH,
    `Each value must be ${MAX_TAG_LENGTH} characters or fewer.`,
  )
  .transform(
    normalizePatientText,
  )
  .refine(
    (value) =>
      value.length > 0,
    "Value cannot be empty.",
  )
  .refine(
    (value) =>
      !INSTRUCTION_LIKE_TEXT.test(
        value,
      ),
    "Please enter a food, cuisine, or preference name rather than instructions.",
  );

const dietaryTagList = z
  .array(
    dietaryTagSchema,
  )
  .max(
    MAX_TAGS_PER_FIELD,
    `You can add up to ${MAX_TAGS_PER_FIELD} items in this field.`,
  )
  .transform(
    (values) => {
      const output: string[] = [];
      const seen =
        new Set<string>();

      for (const value of values) {
        const normalized =
          normalizePatientText(
            value,
          );
        const key =
          normalized.toLowerCase();

        if (
          !normalized ||
          seen.has(key)
        ) {
          continue;
        }

        seen.add(key);
        output.push(
          normalized,
        );
      }

      return output;
    },
  );

const safeOtherDietTypeSchema =
  z
    .string()
    .trim()
    .max(
      MAX_OTHER_DIET_LENGTH,
      `Please keep the description to ${MAX_OTHER_DIET_LENGTH} characters or fewer.`,
    )
    .transform(
      normalizePatientText,
    )
    .refine(
      (value) =>
        !value ||
        !INSTRUCTION_LIKE_TEXT.test(
          value,
        ),
      "Please describe your eating pattern rather than entering instructions.",
    )
    .optional();

const appetiteSchema =
  z.enum([
    "low",
    "normal",
    "increased",
    "variable",
  ]);

const dietTypeSchema =
  z.enum([
    "vegetarian",
    "non_vegetarian",
    "vegan",
    "eggetarian",
    "other",
  ]);

const mealTimingSchema =
  z.enum(
    CONTROLLED_MEAL_TIMINGS,
  );

const nutritionGoalSchema =
  z.enum(
    CONTROLLED_NUTRITION_GOALS,
  );

export const dietaryPreferencesSchema =
  z
    .object({
      dietType:
        dietTypeSchema.optional(),

      otherDietType:
        safeOtherDietTypeSchema,

      allergies:
        dietaryTagList,

      severeAllergies:
        dietaryTagList.default(
          [],
        ),

      intolerances:
        dietaryTagList,

      avoidedFoods:
        dietaryTagList,

      preferredFoods:
        dietaryTagList,

      cuisinePreferences:
        dietaryTagList,

      mealCount:
        z
          .number()
          .int()
          .min(3)
          .max(5)
          .optional(),

      mealTiming:
        z
          .array(
            mealTimingSchema,
          )
          .max(
            CONTROLLED_MEAL_TIMINGS.length,
          )
          .transform(
            (values) => [
              ...new Set(values),
            ],
          ),

      appetite:
        appetiteSchema.optional(),

      nutritionGoals:
        z
          .array(
            nutritionGoalSchema,
          )
          .max(
            CONTROLLED_NUTRITION_GOALS.length,
          )
          .transform(
            (values) => [
              ...new Set(values),
            ],
          ),
    })
    .superRefine(
      (
        data,
        ctx,
      ) => {
        if (
          data.dietType ===
            "other" &&
          !data.otherDietType
        ) {
          ctx.addIssue({
            code: "custom",
            path: [
              "otherDietType",
            ],
            message:
              "Please tell us what your usual eating pattern is.",
          });
        }

        const allergySet =
          new Set(
            data.allergies.map(
              (value) =>
                value.toLowerCase(),
            ),
          );

        for (const severe of
          data.severeAllergies) {
          if (
            !allergySet.has(
              severe.toLowerCase(),
            )
          ) {
            ctx.addIssue({
              code: "custom",
              path: [
                "severeAllergies",
              ],
              message:
                "Every severe allergy must also be listed as an allergy.",
            });

            break;
          }
        }

        if (
          data.mealTiming
            .length > 0 &&
          (
            data.mealTiming
              .length < 3 ||
            data.mealTiming
              .length > 5
          )
        ) {
          ctx.addIssue({
            code: "custom",
            path: [
              "mealTiming",
            ],
            message:
              "Please select between 3 and 5 meal occasions.",
          });
        }
      },
    )
    .transform(
      (
        data,
      ): DietaryPreferences => ({
        dietType:
          data.dietType,

        otherDietType:
          data.dietType ===
            "other" &&
          data.otherDietType
            ? data.otherDietType
            : undefined,

        allergies:
          data.allergies,

        severeAllergies:
          data.severeAllergies,

        intolerances:
          data.intolerances,

        avoidedFoods:
          data.avoidedFoods,

        preferredFoods:
          data.preferredFoods,

        cuisinePreferences:
          data.cuisinePreferences,

        /**
         * Single source of truth:
         * mealCount follows the selected meal slots.
         */
        mealCount:
          data.mealTiming
            .length > 0
            ? data.mealTiming
                .length
            : 5,

        mealTiming:
          data.mealTiming,

        appetite:
          data.appetite,

        nutritionGoals:
          data.nutritionGoals,
      }),
    );

export type DietaryPreferencesInput =
  z.input<
    typeof dietaryPreferencesSchema
  >;
