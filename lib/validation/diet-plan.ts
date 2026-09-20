import { z } from "zod";

const mealTypeSchema =
  z.enum([
    "breakfast",
    "mid_morning",
    "lunch",
    "evening_snack",
    "dinner",
  ]);

const mealPlanItemSchema =
  z.object({
    mealType:
      mealTypeSchema,

    name:
      z
        .string()
        .min(1)
        .max(200),

    description:
      z
        .string()
        .min(1)
        .max(1000),

    ingredients:
      z
        .array(
          z
            .string()
            .min(1)
            .max(200),
        )
        .min(1)
        .max(30),

    preparationNotes:
      z
        .string()
        .max(1000),

    hydrationGuidance:
      z
        .string()
        .max(500),

    nutritionNotes:
      z
        .array(
          z
            .string()
            .min(1)
            .max(500),
        )
        .max(10),

    safetyNotes:
      z
        .array(
          z
            .string()
            .min(1)
            .max(500),
        )
        .max(10),
  });

const safetyNoteSchema =
  z.object({
    severity:
      z.enum([
        "info",
        "warning",
        "urgent",
      ]),

    message:
      z
        .string()
        .min(1)
        .max(1000),
  });

const sourceSchema =
  z.object({
    title:
      z
        .string()
        .min(1)
        .max(300),

    organization:
      z
        .string()
        .max(200),

    url:
      z
        .string()
        .max(2000),

    publicationDate:
      z
        .string()
        .max(50),

    sourceType:
      z.enum([
        "guideline",
        "review",
        "clinical_resource",
        "reference",
      ]),
  });

export const dietPlanSchema =
  z.object({
    summary:
      z
        .string()
        .min(1)
        .max(2000),

    meals:
      z
        .array(
          mealPlanItemSchema,
        )
        .min(1)
        .max(5),

    hydrationGuidance:
      z
        .string()
        .min(1)
        .max(1500),

    generalNutritionNotes:
      z
        .array(
          z
            .string()
            .min(1)
            .max(700),
        )
        .max(15),

    safetyNotes:
      z
        .array(
          safetyNoteSchema,
        )
        .max(15),

    sources:
      z
        .array(
          sourceSchema,
        )
        .min(1)
        .max(10),

    personalizationFactors:
      z
        .array(
          z
            .string()
            .min(1)
            .max(500),
        )
        .max(15),
  });

export type ValidatedDietPlanOutput =
  z.infer<
    typeof dietPlanSchema
  >;