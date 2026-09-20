import { NextResponse } from "next/server";
import { getDietAuthenticatedClient } from "@/lib/diet-auth";

import {
  generateTodaysDietPlan,
  getDietPlanByDate,
  getDietPlanHistory,
  getTodaysDietPlan,
} from "@/services/diet-plan/diet-plan";

type DietPlanServiceResult =
  | {
      status: "existing" | "generated";
      plan: unknown;
    }
  | {
      status:
        | "missing_required_information"
        | "requires_professional_support"
        | "regeneration_limit_reached"
        | "generation_failed";
      reasons: string[];
      remaining?: number;
      retryable?: boolean;
    };

export async function GET(
  request: Request,
) {
  const authenticated = await getDietAuthenticatedClient(request);
  if (!authenticated) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }
  const { user } = authenticated;

  try {
    const url = new URL(request.url);

    if (
      url.searchParams.get("history") ===
      "true"
    ) {
      const rawLimit = Number(
        url.searchParams.get("limit") ??
          "14",
      );

      const limit = Number.isFinite(
        rawLimit,
      )
        ? rawLimit
        : 14;

      const plans = await getDietPlanHistory(
        user.id,
        limit,
      );

      return NextResponse.json({
        success: true,
        data: plans,
      });
    }

    const date =
      url.searchParams.get("date");

    const plan = date
      ? await getDietPlanByDate(user.id, date)
      : await getTodaysDietPlan(user.id);

    return NextResponse.json({
      success: true,
      data: plan,
    });
  } catch (error) {
    console.error(
      "Diet plan GET error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to load the nutrition plan right now.",
        ...(process.env.NODE_ENV !== "production" && error instanceof Error
          ? { details: error.message }
          : {}),
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
) {
  const authenticated = await getDietAuthenticatedClient(request);
  if (!authenticated) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  try {
    let regenerate = false;

    try {
      const body = await request.json();

      regenerate = Boolean(
        body &&
          typeof body === "object" &&
          "regenerate" in body &&
          (
            body as {
              regenerate?: unknown;
            }
          ).regenerate === true,
      );
    } catch {
      regenerate = false;
    }

    const result =
      (await generateTodaysDietPlan(
        authenticated.user.id,
        regenerate,
      )) as DietPlanServiceResult;

    switch (result.status) {
      case "missing_required_information":
        return NextResponse.json(
          {
            success: false,
            status:
              "missing_required_information",
            reasons: result.reasons,
          },
          { status: 422 },
        );

      case "requires_professional_support":
        return NextResponse.json(
          {
            success: false,
            status:
              "requires_professional_support",
            reasons: result.reasons,
          },
          { status: 422 },
        );

      case "regeneration_limit_reached":
        return NextResponse.json(
          {
            success: false,
            status:
              "regeneration_limit_reached",
            reasons: result.reasons,
            remaining:
              result.remaining ?? 0,
          },
          { status: 429 },
        );

      case "generation_failed":
        return NextResponse.json(
          {
            success: false,
            status:
              "generation_failed",
            reasons: result.reasons,
            retryable:
              result.retryable ?? true,
          },
          { status: 503 },
        );

      case "existing":
      case "generated":
        return NextResponse.json({
          success: true,
          status: result.status,
          data: result.plan,
        });

      default:
        return NextResponse.json(
          {
            success: false,
            error:
              "The nutrition plan service returned an unexpected status.",
          },
          { status: 500 },
        );
    }
  } catch (error) {
    console.error(
      "Diet plan POST error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "I couldn't complete your nutrition plan request right now. Please try again in a moment.",
        ...(process.env.NODE_ENV !== "production" && error instanceof Error
          ? { details: error.message }
          : {}),
      },
      { status: 500 },
    );
  }
}
