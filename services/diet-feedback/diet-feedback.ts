import { format, isValid, parseISO } from "date-fns";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  DietFeedbackEvent,
  MealFeedbackReason,
  MealFeedbackSentiment,
  SubmitDailyFeedbackInput,
  SubmitMealFeedbackInput,
} from "@/types/diet-experience";

const sentimentSchema = z.enum([
  "positive",
  "neutral",
  "negative",
]);

const reasonSchema = z
  .enum([
    "not_appealing",
    "too_heavy",
    "too_similar",
    "not_feeling_it",
    "food_unavailable",
    "too_difficult",
    "skip_swap",
    "other",
  ])
  .optional();

const feedbackInputSchema = z.object({
  planDate: z.string().trim(),
  mealType: z.union([
    z.enum([
      "breakfast",
      "mid_morning",
      "lunch",
      "evening_snack",
      "dinner",
    ]),
    z.literal("daily"),
  ]),
  sentiment: sentimentSchema,
  reason: reasonSchema,
  note: z
    .string()
    .trim()
    .max(500)
    .optional(),
});

const SIGNAL_BY_REASON: Partial<
  Record<MealFeedbackReason, string>
> = {
  not_appealing: "low_meal_appeal",
  too_heavy: "dislikes_heavy_meals",
  too_similar: "dislikes_similar_meals",
  not_feeling_it: "low_meal_appeal",
  food_unavailable: "food_unavailable",
  too_difficult: "preparation_difficulty",
  skip_swap: "meal_swapped_without_preference_change",
  other: "other_meal_feedback",
};

const SIGNAL_BY_SENTIMENT: Record<
  MealFeedbackSentiment,
  string
> = {
  positive: "positive_day_feedback",
  neutral: "neutral_day_feedback",
  negative: "negative_day_feedback",
};

function normalizePlanDate(
  value: string,
): string {
  const parsed = parseISO(value);

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

function parseFeedbackInput(
  input: unknown,
): SubmitMealFeedbackInput {
  const parsed =
    feedbackInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(
      "Please provide valid feedback.",
    );
  }

  if (parsed.data.mealType === "daily") {
    throw new Error(
      "Daily feedback must use the daily feedback method.",
    );
  }

  return {
    planDate: normalizePlanDate(
      parsed.data.planDate,
    ),
    mealType: parsed.data.mealType,
    sentiment: parsed.data.sentiment,
    reason: parsed.data.reason,
    note: parsed.data.note || undefined,
  };
}

function parseDailyFeedbackInput(
  input: unknown,
): SubmitDailyFeedbackInput {
  const parsed =
    z
      .object({
        planDate: z.string().trim(),
        sentiment: sentimentSchema,
        note: z
          .string()
          .trim()
          .max(500)
          .optional(),
      })
      .safeParse(input);

  if (!parsed.success) {
    throw new Error(
      "Please provide valid daily feedback.",
    );
  }

  return {
    planDate: normalizePlanDate(
      parsed.data.planDate,
    ),
    sentiment: parsed.data.sentiment,
    note: parsed.data.note || undefined,
  };
}

function toFeedbackEvent(
  row: Record<string, unknown>,
): DietFeedbackEvent {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    planDate: String(row.plan_date),
    mealType: String(
      row.meal_type,
    ) as DietFeedbackEvent["mealType"],
    sentiment: String(
      row.sentiment,
    ) as MealFeedbackSentiment,
    reason:
      typeof row.reason === "string"
        ? (row.reason as MealFeedbackReason)
        : undefined,
    note:
      typeof row.note === "string"
        ? row.note
        : undefined,
    createdAt: String(
      row.created_at,
    ),
  };
}

async function incrementSignal(
  userId: string,
  signalKey: string,
  planDate: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const supabase =
    createSupabaseAdminClient();

  const { data: existing, error: loadError } =
    await supabase
      .from(
        "diet_personalization_signals",
      )
      .select(
        "id, occurrence_count, first_observed_at, metadata",
      )
      .eq("user_id", userId)
      .eq("signal_key", signalKey)
      .maybeSingle();

  if (loadError) {
    throw new Error(
      `Unable to load feedback signal: ${loadError.message}`,
    );
  }

  const now =
    new Date().toISOString();

  const currentMetadata =
    existing &&
    typeof existing.metadata ===
      "object" &&
    existing.metadata !== null &&
    !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<
          string,
          unknown
        >)
      : {};

  const existingDates =
    Array.isArray(
      currentMetadata.planDates,
    )
      ? currentMetadata.planDates.filter(
          (value): value is string =>
            typeof value === "string",
        )
      : [];

  const planDates = [
    ...new Set([
      ...existingDates,
      planDate,
    ]),
  ].slice(-30);

  const { error } = await supabase
    .from(
      "diet_personalization_signals",
    )
    .upsert(
      {
        user_id: userId,
        signal_key: signalKey,
        occurrence_count:
          (Number(
            existing?.occurrence_count,
          ) || 0) + 1,
        first_observed_at:
          existing?.first_observed_at ??
          now,
        last_observed_at: now,
        metadata: {
          ...currentMetadata,
          ...metadata,
          planDates,
        },
      },
      {
        onConflict:
          "user_id,signal_key",
      },
    );

  if (error) {
    throw new Error(
      `Unable to save feedback signal: ${error.message}`,
    );
  }
}

export async function recordMealFeedback(
  userId: string,
  input: SubmitMealFeedbackInput,
): Promise<DietFeedbackEvent> {
  const parsed = parseFeedbackInput(
    input,
  );

  const supabase =
    createSupabaseAdminClient();

  const { data, error } =
    await supabase
      .from("diet_feedback_events")
      .insert({
        user_id: userId,
        plan_date: parsed.planDate,
        meal_type: parsed.mealType,
        sentiment: parsed.sentiment,
        reason: parsed.reason ?? null,
        note: parsed.note ?? null,
      })
      .select(
        "id, user_id, plan_date, meal_type, sentiment, reason, note, created_at",
      )
      .single();

  if (error || !data) {
    throw new Error(
      `Unable to save meal feedback: ${error?.message ?? "No feedback record was returned."}`,
    );
  }

  if (parsed.reason) {
    const signalKey =
      SIGNAL_BY_REASON[
        parsed.reason
      ];

    if (signalKey) {
      await incrementSignal(
        userId,
        signalKey,
        parsed.planDate,
        {
          mealType:
            parsed.mealType,
        },
      );
    }
  }

  return toFeedbackEvent(data);
}

export async function recordDailyFeedback(
  userId: string,
  input: SubmitDailyFeedbackInput,
): Promise<DietFeedbackEvent> {
  const parsed =
    parseDailyFeedbackInput(
      input,
    );

  const supabase =
    createSupabaseAdminClient();

  const { data, error } =
    await supabase
      .from("diet_feedback_events")
      .insert({
        user_id: userId,
        plan_date: parsed.planDate,
        meal_type: "daily",
        sentiment: parsed.sentiment,
        reason: null,
        note: parsed.note ?? null,
      })
      .select(
        "id, user_id, plan_date, meal_type, sentiment, reason, note, created_at",
      )
      .single();

  if (error || !data) {
    throw new Error(
      `Unable to save daily feedback: ${error?.message ?? "No feedback record was returned."}`,
    );
  }

  await incrementSignal(
    userId,
    SIGNAL_BY_SENTIMENT[
      parsed.sentiment
    ],
    parsed.planDate,
    {
      sentiment:
        parsed.sentiment,
    },
  );

  return toFeedbackEvent(data);
}

export async function getDailyFeedback(
  userId: string,
  planDate: string,
): Promise<DietFeedbackEvent | null> {
  const normalizedDate =
    normalizePlanDate(
      planDate,
    );

  const supabase =
    createSupabaseAdminClient();

  const { data, error } =
    await supabase
      .from("diet_feedback_events")
      .select(
        "id, user_id, plan_date, meal_type, sentiment, reason, note, created_at",
      )
      .eq("user_id", userId)
      .eq("plan_date", normalizedDate)
      .eq("meal_type", "daily")
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load daily feedback: ${error.message}`,
    );
  }

  return data
    ? toFeedbackEvent(data)
    : null;
}

export async function getRecentFeedback(
  userId: string,
  windowDays = 14,
): Promise<DietFeedbackEvent[]> {
  const safeDays = Math.min(
    Math.max(
      Math.floor(windowDays),
      1,
    ),
    31,
  );

  const supabase =
    createSupabaseAdminClient();

  const startDate = new Date();
  startDate.setDate(
    startDate.getDate() -
      (safeDays - 1),
  );

  const { data, error } =
    await supabase
      .from("diet_feedback_events")
      .select(
        "id, user_id, plan_date, meal_type, sentiment, reason, note, created_at",
      )
      .eq("user_id", userId)
      .gte(
        "plan_date",
        format(
          startDate,
          "yyyy-MM-dd",
        ),
      )
      .order("plan_date", {
        ascending: false,
      })
      .order("created_at", {
        ascending: false,
      });

  if (error) {
    throw new Error(
      `Unable to load recent feedback: ${error.message}`,
    );
  }

  return Array.isArray(data)
    ? data.map(toFeedbackEvent)
    : [];
}
