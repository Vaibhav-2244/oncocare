import { NextResponse } from "next/server";
import { getDietAuthenticatedClient } from "@/lib/diet-auth";

import {
  getMealReplacementStatus,
  isMealBatchReplacementError,
  parseBatchReplacementInput,
  replaceMealsBatch,
} from "@/services/diet-meal-batch-replacement/diet-meal-batch-replacement";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unknown server error.";
}

export async function GET(request: Request) {
  const authenticated = await getDietAuthenticatedClient(request);
  if (!authenticated) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  try {
    const url = new URL(request.url);

    const status = await getMealReplacementStatus(authenticated.user.id,
      url.searchParams.get("date") ?? undefined,
    );

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error) {
    if (isMealBatchReplacementError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
        },
        {
          status: error.statusCode,
        },
      );
    }

    console.error("Meal replacement status error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to load meal replacement availability.",
        ...(process.env.NODE_ENV !== "production"
          ? {
              code: "INTERNAL_STATUS_ERROR",
              details: getErrorMessage(error),
            }
          : {}),
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: Request) {
  const authenticated = await getDietAuthenticatedClient(request);
  if (!authenticated) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  try {
    const body: unknown = await request.json();

    const input = parseBatchReplacementInput(body);

    if (input.mealTypes.length === 5) {
      return NextResponse.json(
        {
          success: false,
          status: "use_full_plan_regeneration",
          error:
            "Use full-plan regeneration when all meals are selected.",
        },
        {
          status: 400,
        },
      );
    }

    const result = await replaceMealsBatch(authenticated.user.id, input);

    return NextResponse.json({
      success: true,
      data: result.plan,
      replacedMeals: result.replacedMeals,
      replacementNumbers: result.replacementNumbers,
    });
  } catch (error) {
    if (isMealBatchReplacementError(error)) {
      const response: Record<string, unknown> = {
        success: false,
        error: error.message,
        code: error.code,
      };

      if (error.code === "REQUIRES_PROFESSIONAL_SUPPORT") {
        response.status = "requires_professional_support";
      }

      return NextResponse.json(response, {
        status: error.statusCode,
      });
    }

    const details = getErrorMessage(error);

    console.error("Batch meal replacement API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to replace the selected meals right now.",
        ...(process.env.NODE_ENV !== "production"
          ? {
              code: "INTERNAL_BATCH_REPLACEMENT_ERROR",
              details,
            }
          : {}),
      },
      {
        status: 500,
      },
    );
  }
}