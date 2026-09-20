import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type {
  PatientNutritionContext,
} from "@/types/diet-plan";

export interface NutritionKnowledgeDocument {
  id: string;
  title: string;
  organization?: string;
  url?: string;
  publicationDate?: string;
  sourceType: string;
  content: string;
  tags: string[];
  knowledgeVersion: string;
}

interface KnowledgeRow {
  id: string;
  title: string;
  organization: string | null;
  url: string | null;
  publication_date: string | null;
  source_type: string;
  content: string;
  tags: string[] | null;
  knowledge_version: string;
}

function tokenize(
  text: string,
): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(
          /[^\p{L}\p{N}\s-]/gu,
          " ",
        )
        .split(/\s+/)
        .filter(
          (token) =>
            token.length >= 4,
        ),
    ),
  ];
}

function buildContextQuery(
  context: PatientNutritionContext,
): string {
  const treatmentTerms =
    context.treatments.flatMap(
      (treatment) => [
        treatment.type,
        treatment.name,
        treatment.status ?? "",
      ],
    );

  const symptomTerms =
    context.symptoms.flatMap(
      (symptom) => [
        symptom.name,
        symptom.notes ?? "",
      ],
    );

  const medicationTerms =
    context.medications.map(
      (medication) =>
        medication.name,
    );

  const supplementTerms =
    context.supplements.flatMap(
      (supplement) => [
        supplement.name,
        supplement.category,
        supplement.purpose ?? "",
      ],
    );

  const preferenceTerms = [
    ...context.dietaryPreferences
      .preferredFoods,
    ...context.dietaryPreferences
      .avoidedFoods,
    ...context.dietaryPreferences
      .cuisinePreferences,
    ...context.dietaryPreferences
      .nutritionGoals,
  ];

  return [
    ...treatmentTerms,
    ...symptomTerms,
    ...medicationTerms,
    ...supplementTerms,
    ...preferenceTerms,
    "cancer treatment nutrition",
    "food safety",
  ].join(" ");
}

function scoreDocument(
  document: NutritionKnowledgeDocument,
  queryTokens: string[],
): number {
  const searchableText = [
    document.title,
    document.organization ?? "",
    document.content,
    ...document.tags,
  ].join(" ");

  const documentTokens =
    new Set(
      tokenize(
        searchableText,
      ),
    );

  let score = 0;

  for (const token of queryTokens) {
    if (
      documentTokens.has(token)
    ) {
      score += 1;
    }
  }

  const title =
    document.title.toLowerCase();

  if (
    title.includes("nutrition") &&
    queryTokens.some(
      (token) =>
        token.includes(
          "nutrition",
        ),
    )
  ) {
    score += 3;
  }

  if (
    title.includes("safety") &&
    queryTokens.some(
      (token) =>
        token.includes("safety"),
    )
  ) {
    score += 3;
  }

  return score;
}

export async function retrieveNutritionKnowledge(
  context: PatientNutritionContext,
  limit = 4,
): Promise<NutritionKnowledgeDocument[]> {
  const supabase =
    createSupabaseAdminClient();

  const { data, error } =
    await supabase
      .from(
        "diet_nutrition_knowledge",
      )
      .select(
        `
          id,
          title,
          organization,
          url,
          publication_date,
          source_type,
          content,
          tags,
          knowledge_version
        `,
      )
      .eq(
        "is_active",
        true,
      );

  if (error) {
    throw new Error(
      `Unable to retrieve nutrition knowledge: ${error.message}`,
    );
  }

  const rows =
    (data ?? []) as KnowledgeRow[];

  const documents =
    rows.map(
      (
        row,
      ): NutritionKnowledgeDocument => ({
        id: row.id,
        title: row.title,
        organization:
          row.organization ??
          undefined,
        url:
          row.url ??
          undefined,
        publicationDate:
          row.publication_date ??
          undefined,
        sourceType:
          row.source_type,
        content:
          row.content,
        tags:
          row.tags ?? [],
        knowledgeVersion:
          row.knowledge_version,
      }),
    );

  const queryTokens =
    tokenize(
      buildContextQuery(
        context,
      ),
    );

  return documents
    .map(
      (document) => ({
        document,
        score:
          scoreDocument(
            document,
            queryTokens,
          ),
      }),
    )
    .sort(
      (a, b) =>
        b.score -
        a.score,
    )
    .slice(
      0,
      limit,
    )
    .map(
      ({
        document,
      }) => document,
    );
}