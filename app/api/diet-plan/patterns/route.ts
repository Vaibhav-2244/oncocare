import { NextResponse } from "next/server";
import { getDietAuthenticatedClient } from "@/lib/diet-auth";

import { getPatientNutritionPatterns } from "@/services/diet-patterns/diet-patterns";

export async function GET(
  request: Request,
) {
  const authenticated = await getDietAuthenticatedClient(request);
  if (!authenticated) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  try {
    const url = new URL(request.url);

    const rawDays = Number(
      url.searchParams.get("days") ??
        "14",
    );

    const days = Number.isFinite(
      rawDays,
    )
      ? rawDays
      : 14;

    const data =
      await getPatientNutritionPatterns(
        authenticated.user.id,
        days,
      );

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      "Diet patterns GET error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to load your nutrition journey right now.",
      },
      { status: 500 },
    );
  }
}
