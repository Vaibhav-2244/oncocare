import { NextResponse } from "next/server";
import { getDietAuthenticatedClient } from "@/lib/diet-auth";

import {
  evaluateNutritionSafety,
} from "@/lib/nutrition/safety";
import {
  getDietaryPreferences,
} from "@/services/diet-preferences/diet-preferences";
import {
  getPatientNutritionContext,
} from "@/services/patient-context/patient-context";

type AttentionFlag = {
  code: string;
  label: string;
};

type PatientContext = Awaited<
  ReturnType<typeof getPatientNutritionContext>
>;

type Preferences = Awaited<
  ReturnType<typeof getDietaryPreferences>
>;

function buildAttentionFlags(
  context: PatientContext,
  preferences: Preferences,
): AttentionFlag[] {
  const flags: AttentionFlag[] = [];

  if (preferences.dietType) {
    const labelMap: Record<string, string> = {
      vegetarian: "Vegetarian",
      non_vegetarian: "Non-vegetarian",
      vegan: "Vegan",
      eggetarian: "Eggetarian",
      other:
        preferences.otherDietType?.trim() ||
        "Your selected diet pattern",
    };

    flags.push({
      code: "diet_type",
      label:
        labelMap[preferences.dietType] ??
        "Your selected diet pattern",
    });
  }

  if (preferences.appetite === "low") {
    flags.push({
      code: "low_appetite",
      label:
        "Lower appetite noted — portions can stay smaller and easier to manage.",
    });
  } else if (preferences.appetite === "variable") {
    flags.push({
      code: "variable_appetite",
      label:
        "Variable appetite noted — the plan can stay flexible around how you're eating.",
    });
  }

  if (
    context.symptoms.some(
      (symptom) =>
        symptom.severity > 0 &&
        symptom.severity < 7,
    )
  ) {
    flags.push({
      code: "symptom_accommodation",
      label:
        "Recent symptoms are being considered when meal choices are made.",
    });
  }

  if (
    context.treatments.some(
      (treatment) =>
        treatment.status === "active",
    )
  ) {
    flags.push({
      code: "treatment_timing",
      label:
        "Your recorded treatment timing is considered where reliable nutrition guidance supports it.",
    });
  }

  return flags;
}

function buildProfessionalSupportReasons(
  context: PatientContext,
): string[] {
  const seriousSymptoms =
    context.symptoms.filter(
      (symptom) =>
        symptom.severity >= 7 ||
        /severe|persistent|uncontrolled|unable|inability|dehydration|difficulty swallowing/i.test(
          `${symptom.name} ${symptom.notes ?? ""}`,
        ),
    );

  if (seriousSymptoms.length === 0) {
    return [
      "Some recorded information suggests a standard AI meal plan may not be the right next step right now.",
    ];
  }

  return seriousSymptoms.slice(0, 3).map(
    (symptom) => {
      const severityText =
        Number.isFinite(symptom.severity) &&
        symptom.severity > 0
          ? ` (${symptom.severity}/10)`
          : "";

      return `You reported ${symptom.name}${severityText}, which needs professional support before a standard meal plan is used.`;
    },
  );
}

export async function GET(request: Request) {
  const authenticated = await getDietAuthenticatedClient(request);
  if (!authenticated) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const userId = authenticated.user.id;
  try {
    const [context, preferences] =
      await Promise.all([
        getPatientNutritionContext(userId),
        getDietaryPreferences(userId),
      ]);

    const mergedContext = {
      ...context,
      dietaryPreferences: preferences,
    };

    const safety =
      evaluateNutritionSafety(
        mergedContext,
      );

    return NextResponse.json({
      success: true,
      data: {
        professionalSupport: {
          requiresProfessionalSupport:
            safety.requiresProfessionalSupport,
          reasons:
            safety.requiresProfessionalSupport
              ? buildProfessionalSupportReasons(
                  context,
                )
              : [],
        },
        flags: buildAttentionFlags(
          context,
          preferences,
        ),
      },
    });
  } catch (error) {
    console.error(
      "Diet plan state error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to load your current nutrition status.",
      },
      { status: 500 },
    );
  }
}
