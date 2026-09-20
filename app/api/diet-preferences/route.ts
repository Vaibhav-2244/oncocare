import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getDietAuthenticatedClient } from "@/lib/diet-auth";

import {
  getDietaryPreferences,
  saveDietaryPreferences,
} from "@/services/diet-preferences/diet-preferences";

export async function GET(request: Request) {
  const authenticated = await getDietAuthenticatedClient(request);
  if (!authenticated) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  try {
    const preferences =
      await getDietaryPreferences(authenticated.user.id);

    return NextResponse.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    console.error(
      "Dietary preferences GET error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to load dietary preferences right now.",
        ...(process.env.NODE_ENV !== "production" && error instanceof Error
          ? { details: error.message }
          : {}),
      },
      {
        status: 500,
      },
    );
  }
}

export async function PUT(
  request: Request,
) {
  const authenticated = await getDietAuthenticatedClient(request);
  if (!authenticated) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  try {
    const body: unknown =
      await request.json();

    const preferences =
      await saveDietaryPreferences(authenticated.user.id,
        body,
      );

    return NextResponse.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    if (
      error instanceof ZodError
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Please check the dietary preferences and try again.",
        },
        {
          status: 400,
        },
      );
    }

    console.error(
      "Dietary preferences PUT error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to save dietary preferences right now.",
        ...(process.env.NODE_ENV !== "production" && error instanceof Error
          ? { details: error.message }
          : {}),
      },
      {
        status: 500,
      },
    );
  }
}