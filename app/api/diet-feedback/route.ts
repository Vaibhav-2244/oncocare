import { NextResponse } from "next/server";
import { getDietAuthenticatedClient } from "@/lib/diet-auth";

import {
  getDailyFeedback,
  getRecentFeedback,
  recordDailyFeedback,
  recordMealFeedback,
} from "@/services/diet-feedback/diet-feedback";

export async function GET(
  request: Request,
) {
  const authenticated = await getDietAuthenticatedClient(request);
  if (!authenticated) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const userId = authenticated.user.id;

  try {
    const url = new URL(
      request.url,
    );

    const date =
      url.searchParams.get("date");

    if (date) {
      const feedback =
        await getDailyFeedback(userId,
          date,
        );

      return NextResponse.json({
        success: true,
        data: feedback,
      });
    }

    const rawDays = Number(
      url.searchParams.get("days") ??
        "14",
    );

    const days = Number.isFinite(
      rawDays,
    )
      ? rawDays
      : 14;

    const feedback =
      await getRecentFeedback(userId,
        days,
      );

    return NextResponse.json({
      success: true,
      data: feedback,
    });
  } catch (error) {
    console.error(
      "Diet feedback GET error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to load nutrition feedback right now.",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
) {
  const authenticated = await getDietAuthenticatedClient(request);
  if (!authenticated) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const userId = authenticated.user.id;

  try {
    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;

    if (
      body.mealType ===
      "daily"
    ) {
      const data =
        await recordDailyFeedback(userId, {
          planDate: String(
            body.planDate ??
              "",
          ),
          sentiment:
            body.sentiment as
              | "positive"
              | "neutral"
              | "negative",
          note:
            typeof body.note ===
            "string"
              ? body.note
              : undefined,
        });

      return NextResponse.json({
        success: true,
        data,
      });
    }

    const data =
      await recordMealFeedback(userId, {
        planDate: String(
          body.planDate ??
            "",
        ),
        mealType:
          body.mealType as
            | "breakfast"
            | "mid_morning"
            | "lunch"
            | "evening_snack"
            | "dinner",
        sentiment:
          body.sentiment as
            | "positive"
            | "neutral"
            | "negative",
        reason:
          typeof body.reason ===
          "string"
            ? (body.reason as never)
            : undefined,
        note:
          typeof body.note ===
          "string"
            ? body.note
            : undefined,
      });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      "Diet feedback POST error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "I couldn't save that feedback right now. Please try again.",
      },
      { status: 400 },
    );
  }
}
