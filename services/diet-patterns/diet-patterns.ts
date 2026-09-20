import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getDietPlanHistory } from "@/services/diet-plan/diet-plan";
import { getRecentFeedback } from "@/services/diet-feedback/diet-feedback";
import type {
  DietJourneyEntry,
  DietWeeklyOverview,
  MealFeedbackSentiment,
} from "@/types/diet-experience";
import type { MealType } from "@/types/diet-plan";

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  mid_morning: "Mid-morning",
  lunch: "Lunch",
  evening_snack: "Evening snack",
  dinner: "Dinner",
};

function clampDays(windowDays: number): number {
  return Math.min(
    Math.max(
      Math.floor(windowDays),
      1,
    ),
    31,
  );
}

function getDateWindow(windowDays: number): {
  startDate: string;
  endDate: string;
} {
  const days = clampDays(windowDays);
  const end = new Date();
  const start = addDays(
    end,
    -(days - 1),
  );

  return {
    startDate: format(
      start,
      "yyyy-MM-dd",
    ),
    endDate: format(
      end,
      "yyyy-MM-dd",
    ),
  };
}

export async function getPatientNutritionPatterns(
  userId: string,
  windowDays = 14,
): Promise<{
  overview: DietWeeklyOverview;
  journey: DietJourneyEntry[];
}> {
  const { startDate, endDate } = getDateWindow(
    windowDays,
  );

  const safeDays = clampDays(windowDays);

  const [plans, feedback, replacementResult] =
    await Promise.all([
      getDietPlanHistory(userId, safeDays),
      getRecentFeedback(userId, safeDays),
      createSupabaseAdminClient()
        .from("diet_meal_replacements")
        .select(
          "id, plan_date, meal_type",
        )
        .eq("user_id", userId)
        .gte("plan_date", startDate)
        .lte("plan_date", endDate),
    ]);

  if (replacementResult.error) {
    throw new Error(
      `Unable to load meal replacement history: ${replacementResult.error.message}`,
    );
  }

  const replacements =
    Array.isArray(
      replacementResult.data,
    )
      ? replacementResult.data
      : [];

  const feedbackByDate = new Map<
    string,
    typeof feedback[number]
  >();

  for (const item of feedback) {
    if (
      item.mealType === "daily" &&
      !feedbackByDate.has(item.planDate)
    ) {
      feedbackByDate.set(
        item.planDate,
        item,
      );
    }
  }

  const replacementsByDate = new Map<
    string,
    number
  >();

  for (const item of replacements) {
    const date = String(
      item.plan_date,
    );
    replacementsByDate.set(
      date,
      (replacementsByDate.get(date) ?? 0) +
        1,
    );
  }

  const plansByDate = new Map(
    plans.map((plan) => [
      plan.planDate,
      plan,
    ]),
  );

  const journey: DietJourneyEntry[] = [];
  const end = parseISO(endDate);
  const start = parseISO(startDate);
  const totalRangeDays =
    differenceInCalendarDays(
      end,
      start,
    );

  for (
    let offset = 0;
    offset <= totalRangeDays;
    offset += 1
  ) {
    const date = format(
      addDays(start, offset),
      "yyyy-MM-dd",
    );

    const plan =
      plansByDate.get(date);
    const dailyFeedback =
      feedbackByDate.get(date);

    journey.push({
      date,
      planAvailable:
        Boolean(plan),
      summary:
        plan?.summary,
      feedbackSentiment:
        dailyFeedback?.sentiment ??
        null,
      mealReplacements:
        replacementsByDate.get(date) ??
        0,
    });
  }

  const dailyFeedback = [
    ...feedbackByDate.values(),
  ];

  const positiveFeedbackCount = dailyFeedback.filter(
    (item) => item.sentiment === "positive",
  ).length;

  const neutralFeedbackCount = dailyFeedback.filter(
    (item) => item.sentiment === "neutral",
  ).length;

  const negativeFeedbackCount = dailyFeedback.filter(
    (item) => item.sentiment === "negative",
  ).length;

  const mealReplacementCount =
    replacements.length;

  const negativeMealFeedback = feedback.filter(
    (item) =>
      item.mealType !== "daily" &&
      item.sentiment === "negative",
  );

  const negativeMealTypeCounts = new Map<
    MealType,
    number
  >();

  for (const item of negativeMealFeedback) {
    if (item.mealType === "daily") {
      continue;
    }

    const mealType =
      item.mealType as MealType;

    negativeMealTypeCounts.set(
      mealType,
      (negativeMealTypeCounts.get(mealType) ??
        0) + 1,
    );
  }

  const replacementMealCounts = new Map<
    MealType,
    number
  >();

  for (const item of replacements) {
    const mealType =
      String(item.meal_type) as MealType;

    if (
      MEAL_LABELS[
        mealType
      ]
    ) {
      replacementMealCounts.set(
        mealType,
        (replacementMealCounts.get(
          mealType,
        ) ?? 0) + 1,
      );
    }
  }

  const notablePatterns: string[] = [];

  const mostReplaced = [...replacementMealCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];

  if (
    mostReplaced &&
    mostReplaced[1] >= 2
  ) {
    notablePatterns.push(
      `${MEAL_LABELS[mostReplaced[0]]} was replaced ${mostReplaced[1]} times in this period.`,
    );
  }

  const mostNegative = [...negativeMealTypeCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];

  if (
    mostNegative &&
    mostNegative[1] >= 2
  ) {
    notablePatterns.push(
      `You recorded negative meal feedback for ${MEAL_LABELS[mostNegative[0]]} ${mostNegative[1]} times in this period.`,
    );
  }

  if (
    mealReplacementCount === 0 &&
    negativeFeedbackCount === 0 &&
    plans.length >= 3
  ) {
    notablePatterns.push(
      "No meal swaps or negative daily feedback were recorded during this period.",
    );
  }

  const overview: DietWeeklyOverview = {
    startDate,
    endDate,
    plansAvailable: plans.length,
    totalMeals: plans.reduce(
      (sum, plan) =>
        sum + plan.meals.length,
      0,
    ),
    positiveFeedbackCount,
    neutralFeedbackCount,
    negativeFeedbackCount,
    replacementCount:
      mealReplacementCount,
    notablePatterns,
  };

  return {
    overview,
    journey,
  };
}
