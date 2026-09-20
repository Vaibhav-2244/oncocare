"use client";

import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  Pencil,
  CheckCircle2,
  CircleAlert,
  Loader2,
  ShieldCheck,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { dietFetch } from "@/lib/diet-client";

type DietType =
  | "vegetarian"
  | "non_vegetarian"
  | "vegan"
  | "eggetarian"
  | "other";

type Appetite =
  | "low"
  | "normal"
  | "increased"
  | "variable";

interface DietaryPreferences {
  dietType?: DietType;
  allergies: string[];
  intolerances: string[];
  avoidedFoods: string[];
  preferredFoods: string[];
  cuisinePreferences: string[];
  mealCount?: number;
  mealTiming: string[];
  appetite?: Appetite;
  nutritionGoals: string[];
  otherDietType?: string;
  severeAllergies?: string[];
}

const INITIAL_PREFERENCES: DietaryPreferences = {
  dietType: undefined,
  allergies: [],
  intolerances: [],
  avoidedFoods: [],
  preferredFoods: [],
  cuisinePreferences: [],
  mealCount: 5,
  mealTiming: [
    "Breakfast",
    "Mid-morning",
    "Lunch",
    "Evening snack",
    "Dinner",
  ],
  appetite: undefined,
  nutritionGoals: [],
  otherDietType: undefined,
  severeAllergies: [],
};

const MEAL_TIMINGS = [
  "Breakfast",
  "Mid-morning",
  "Lunch",
  "Evening snack",
  "Dinner",
];

const NUTRITION_GOALS = [
  "Maintain energy",
  "Support adequate nutrition",
  "Support recovery",
  "Maintain strength",
  "Manage appetite",
  "Stay hydrated",
];

const DIET_OPTIONS: Array<{
  value: DietType;
  label: string;
  description: string;
}> = [
  {
    value: "vegetarian",
    label: "Vegetarian",
    description: "No meat or fish.",
  },
  {
    value: "non_vegetarian",
    label: "Non-vegetarian",
    description: "Includes meat, fish or poultry.",
  },
  {
    value: "vegan",
    label: "Vegan",
    description: "No animal-derived foods.",
  },
  {
    value: "eggetarian",
    label: "Eggetarian",
    description: "Vegetarian foods with eggs.",
  },
  {
    value: "other",
    label: "Something else",
    description: "Tell us more in the next steps.",
  },
];

const APPETITE_OPTIONS: Array<{
  value: Appetite;
  label: string;
  description: string;
}> = [
  {
    value: "low",
    label: "Low",
    description: "I often don't feel like eating much.",
  },
  {
    value: "normal",
    label: "Normal",
    description: "My appetite is fairly usual for me.",
  },
  {
    value: "increased",
    label: "Increased",
    description: "I feel hungry more often than usual.",
  },
  {
    value: "variable",
    label: "It varies",
    description: "Some days are much easier than others.",
  },
];

const TOTAL_STEPS = 6;

interface TagFieldProps {
  label: string;
  description: string;
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}

function TagField({
  label,
  description,
  values,
  placeholder,
  onChange,
}: TagFieldProps) {
  const [input, setInput] =
    useState("");

  function addValue() {
    const value = input.trim();

    if (!value) {
      return;
    }

    const exists = values.some(
      (item) =>
        item.toLowerCase() ===
        value.toLowerCase(),
    );

    if (exists) {
      setInput("");
      return;
    }

    onChange([
      ...values,
      value,
    ]);
    setInput("");
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (
      event.key === "Enter" ||
      event.key === ","
    ) {
      event.preventDefault();
      addValue();
    }

    if (
      event.key === "Backspace" &&
      !input &&
      values.length > 0
    ) {
      onChange(
        values.slice(0, -1),
      );
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">
          {label}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {description}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 transition motion-reduce:transition-none focus-within:border-[#8ccfc9] focus-within:ring-4 focus-within:ring-[#eaf7f5]">
        <div className="flex flex-wrap items-center gap-2">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf7f5] px-3 py-1.5 text-xs font-semibold text-[#28716d]"
            >
              {value}
              <button
                type="button"
                onClick={() =>
                  onChange(
                    values.filter(
                      (item) =>
                        item !== value,
                    ),
                  )
                }
                className="min-h-6 min-w-6 rounded-full p-1 transition motion-reduce:transition-none hover:bg-black/5"
                aria-label={`Remove ${value}`}
              >
                <X className="mx-auto h-3.5 w-3.5" />
              </button>
            </span>
          ))}

          <input
            value={input}
            onChange={(event) =>
              setInput(
                event.target.value,
              )
            }
            onKeyDown={handleKeyDown}
            onBlur={addValue}
            placeholder={
              values.length === 0
                ? placeholder
                : "Add another"
            }
            className="min-w-[160px] flex-1 bg-transparent px-1 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        Press Enter or comma after each item.
      </p>
    </div>
  );
}

function getAcknowledgement(
  step: number,
  preferences: DietaryPreferences,
): string {
  if (step === 1) {
    switch (
      preferences.dietType
    ) {
      case "vegan":
        return "Got it â€” weâ€™ll keep the plan fully plant-based.";
      case "vegetarian":
        return "Got it â€” weâ€™ll keep meat and fish out of your plan.";
      case "eggetarian":
        return "Got it â€” weâ€™ll keep the plan vegetarian and can include eggs.";
      case "non_vegetarian":
        return "Got it â€” weâ€™ll keep your usual eating pattern in mind.";
      default:
        return "Got it â€” weâ€™ll use what you tell us without making assumptions.";
    }
  }

  if (step === 2) {
    if (
      preferences.allergies.length >
      0
    ) {
      return "Thanks â€” those foods will be treated as hard exclusions when your plan is checked.";
    }

    if (
      preferences.intolerances.length >
      0
    ) {
      return "Thanks â€” weâ€™ll keep those intolerances in mind when building your meals.";
    }

    return "Thanks â€” weâ€™ll keep this part simple and only use what you actually told us.";
  }

  if (step === 3) {
    if (
      preferences.preferredFoods.length >
      0
    ) {
      return "Lovely â€” weâ€™ll look for ways to bring more of those familiar foods into future plans.";
    }

    return "Got it â€” your dislikes and preferences will help keep future options practical.";
  }

  if (step === 4) {
    return `Got it â€” weâ€™ll work around a ${preferences.mealCount ?? 5}-meal rhythm and the times you selected.`;
  }

  if (step === 5) {
    switch (
      preferences.appetite
    ) {
      case "low":
        return "Got it â€” future plans can lean toward smaller, practical options where the evidence supports it.";
      case "variable":
        return "Got it â€” weâ€™ll keep your day flexible rather than assuming every meal will feel the same.";
      case "increased":
        return "Got it â€” weâ€™ll keep your usual hunger pattern in mind.";
      default:
        return "Got it â€” weâ€™ll keep your usual appetite pattern in mind.";
    }
  }

  return preferences.nutritionGoals.length >
    0
    ? "Almost there â€” these goals will help shape future nutrition plans."
    : "Almost there â€” you can change these preferences whenever your needs change.";
}

export default function DietPreferencesForm() {
  const [preferences, setPreferences] =
    useState<DietaryPreferences>(
      INITIAL_PREFERENCES,
    );

  const [step, setStep] =
    useState(1);
  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [error, setError] =
    useState("");
  const [saved, setSaved] =
    useState(false);
  const [completed, setCompleted] =
    useState(false);
  const [hasSavedPreferences, setHasSavedPreferences] =
    useState(false);
  const [editing, setEditing] =
    useState(false);
  const [showSaveToast, setShowSaveToast] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      try {
        setLoading(true);
        setError("");

        const response =
          await dietFetch(
            "/api/diet-preferences",
            {
              method: "GET",
              cache: "no-store",
            },
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result?.details ?? result?.error ??
              "Unable to load dietary preferences.",
          );
        }

        if (!cancelled && !result?.data) {
          setEditing(true);
        }

        if (
          !cancelled &&
          result?.data
        ) {
          setPreferences({
            ...INITIAL_PREFERENCES,
            ...result.data,
            allergies:
              Array.isArray(
                result.data.allergies,
              )
                ? result.data.allergies
                : [],
            intolerances:
              Array.isArray(
                result.data.intolerances,
              )
                ? result.data.intolerances
                : [],
            avoidedFoods:
              Array.isArray(
                result.data.avoidedFoods,
              )
                ? result.data.avoidedFoods
                : [],
            preferredFoods:
              Array.isArray(
                result.data.preferredFoods,
              )
                ? result.data.preferredFoods
                : [],
            cuisinePreferences:
              Array.isArray(
                result.data.cuisinePreferences,
              )
                ? result.data.cuisinePreferences
                : [],
            mealTiming:
              Array.isArray(
                result.data.mealTiming,
              )
                ? result.data.mealTiming
                : INITIAL_PREFERENCES.mealTiming,
            nutritionGoals:
              Array.isArray(
                result.data.nutritionGoals,
              )
                ? result.data.nutritionGoals
                : [],
            otherDietType:
              typeof result.data.otherDietType ===
              "string"
                ? result.data.otherDietType
                : undefined,
            severeAllergies:
              Array.isArray(
                result.data.severeAllergies,
              )
                ? result.data.severeAllergies
                : [],
          });
          setHasSavedPreferences(true);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to load dietary preferences.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPreferences();

    return () => {
      cancelled = true;
    };
  }, []);

  function updatePreference<
    K extends keyof DietaryPreferences,
  >(
    key: K,
    value: DietaryPreferences[K],
  ) {
    setPreferences((current) => ({
      ...current,
      [key]: value,
    }));
    setSaved(false);
    setCompleted(false);
    setError("");
  }

  function toggleMealTiming(
    value: string,
  ) {
    const current =
      preferences.mealTiming;

    updatePreference(
      "mealTiming",
      current.includes(value)
        ? current.filter(
            (item) =>
              item !== value,
          )
        : [
            ...current,
            value,
          ],
    );
  }

  function toggleNutritionGoal(
    value: string,
  ) {
    const current =
      preferences.nutritionGoals;

    updatePreference(
      "nutritionGoals",
      current.includes(value)
        ? current.filter(
            (item) =>
              item !== value,
          )
        : [
            ...current,
            value,
          ],
    );
  }

  async function savePreferences() {
    setSaving(true);
    setError("");

    try {
      const response =
        await dietFetch(
          "/api/diet-preferences",
          {
            method: "PUT",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify(
              preferences,
            ),
          },
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result?.details ?? result?.error ??
            "Unable to save dietary preferences.",
        );
      }

      if (result?.data) {
        setPreferences({
          ...INITIAL_PREFERENCES,
          ...result.data,
          allergies: Array.isArray(result.data.allergies) ? result.data.allergies : [],
          intolerances: Array.isArray(result.data.intolerances) ? result.data.intolerances : [],
          avoidedFoods: Array.isArray(result.data.avoidedFoods) ? result.data.avoidedFoods : [],
          preferredFoods: Array.isArray(result.data.preferredFoods) ? result.data.preferredFoods : [],
          cuisinePreferences: Array.isArray(result.data.cuisinePreferences) ? result.data.cuisinePreferences : [],
          mealTiming: Array.isArray(result.data.mealTiming) ? result.data.mealTiming : INITIAL_PREFERENCES.mealTiming,
          nutritionGoals: Array.isArray(result.data.nutritionGoals) ? result.data.nutritionGoals : [],
          severeAllergies: Array.isArray(result.data.severeAllergies) ? result.data.severeAllergies : [],
        });
      }

      setHasSavedPreferences(true);
      setEditing(false);
      setSaved(true);
      setCompleted(true);
      setShowSaveToast(true);
      window.setTimeout(() => setShowSaveToast(false), 3500);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save dietary preferences.",
      );
    } finally {
      setSaving(false);
    }
  }

  function nextStep() {
    setError("");

    if (
      step === 1 &&
      !preferences.dietType
    ) {
      setError(
        "Please choose the eating pattern that fits you best.",
      );
      return;
    }

    if (
      step < TOTAL_STEPS
    ) {
      setStep(
        (current) =>
          current + 1,
      );
    }
  }

  function previousStep() {
    setError("");

    if (step > 1) {
      setStep(
        (current) =>
          current - 1,
      );
    }
  }

  const summaryItems =
    useMemo(
      () => [
        preferences.dietType
          ? `Eating pattern: ${
              DIET_OPTIONS.find(
                (option) =>
                  option.value ===
                  preferences.dietType,
              )?.label ??
              preferences.dietType
            }`
          : "Eating pattern: not specified",

        preferences.allergies.length >
        0
          ? `Allergies: ${preferences.allergies.join(", ")}`
          : "Allergies: none recorded",

        preferences.intolerances.length >
        0
          ? `Intolerances: ${preferences.intolerances.join(", ")}`
          : "Intolerances: none recorded",

        preferences.avoidedFoods.length >
        0
          ? `Foods to avoid: ${preferences.avoidedFoods.join(", ")}`
          : "Foods to avoid: none recorded",

        preferences.preferredFoods.length >
        0
          ? `Foods you like: ${preferences.preferredFoods.join(", ")}`
          : "Foods you like: not specified",

        preferences.cuisinePreferences.length >
        0
          ? `Cuisine: ${preferences.cuisinePreferences.join(", ")}`
          : "Cuisine: not specified",

        `Meal rhythm: ${preferences.mealCount ?? 5} meals`,

        preferences.appetite
          ? `Appetite: ${preferences.appetite}`
          : "Appetite: not specified",

        preferences.nutritionGoals.length >
        0
          ? `Goals: ${preferences.nutritionGoals.join(", ")}`
          : "Goals: not specified",
      ],
      [preferences],
    );

  const dietLabel =
    DIET_OPTIONS.find(
      (option) => option.value === preferences.dietType,
    )?.label ?? preferences.dietType ?? "Not specified";

  const displayList = (values: string[]) =>
    values.length > 0 ? values.join(", ") : "Not specified";

  function openEditor() {
    setEditing(true);
    setSaved(false);
    setCompleted(false);
    setShowSaveToast(false);
    setStep(1);
    setError("");
  }

  function closeEditor() {
    setEditing(false);
    setSaved(false);
    setCompleted(false);
    setError("");
  }

  function renderCurrentPreferences() {
    return (
      <section className="mt-7 overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.07)]">
        <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-[#f1fbf9] via-white to-[#f7fbfb] px-6 py-7 sm:px-8">
          <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[#dff4f1]/70 blur-2xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e4f6f3] text-[#167772]">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#167772]">
                  Current preferences
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                  Your nutrition profile
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  These are the preferences currently saved and used to personalize your meal plans.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openEditor}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#8ccfc9] bg-white px-4 py-2.5 text-sm font-semibold text-[#167772] shadow-sm transition hover:bg-[#eef8f7]"
            >
              <Pencil className="h-4 w-4" />
              Change preferences
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Eating pattern
            </p>
            <p className="mt-2 text-base font-semibold text-slate-900">{dietLabel}</p>
            {preferences.dietType === "other" && preferences.otherDietType ? (
              <p className="mt-1 text-sm leading-5 text-slate-500">{preferences.otherDietType}</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Meal routine
            </p>
            <p className="mt-2 text-base font-semibold text-slate-900">
              {preferences.mealCount ?? 5} meals / occasions
            </p>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              {displayList(preferences.mealTiming)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Appetite
            </p>
            <p className="mt-2 text-base font-semibold capitalize text-slate-900">
              {preferences.appetite ?? "Not specified"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Food allergies
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {displayList(preferences.allergies)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Intolerances
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {displayList(preferences.intolerances)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Severe allergies
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {displayList(preferences.severeAllergies ?? [])}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Foods & cuisine
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              <span className="font-medium text-slate-900">Likes:</span> {displayList(preferences.preferredFoods)}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              <span className="font-medium text-slate-900">Avoids:</span> {displayList(preferences.avoidedFoods)}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              <span className="font-medium text-slate-900">Cuisine:</span> {displayList(preferences.cuisinePreferences)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Nutrition goals
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {displayList(preferences.nutritionGoals)}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f7fbfb]">
        <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin text-[#167772] motion-reduce:animate-none" />
            <span className="text-sm font-medium text-slate-600">
              Loading your preferences...
            </span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7fbfb]">
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-slate-200/80 pb-5">
          <a
            href="/dashboard/diet-plan"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#167772]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to your plan
          </a>

          <Image
            src="/brand/oncocare-logo.png"
            alt="OncoCare+"
            width={165}
            height={54}
            className="h-12 w-32 object-contain object-right sm:h-14 sm:w-40"
            priority
          />
        </header>

        <section className="relative mt-7 overflow-hidden rounded-[30px] border border-[#d7ecea] bg-white px-6 py-7 shadow-[0_16px_50px_rgba(31,41,55,0.06)] sm:px-9 sm:py-9">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#eaf7f5] px-3 py-1.5 text-xs font-semibold text-[#167772]">
              <Sparkles className="h-3.5 w-3.5" />
              Personalized Nutrition
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Let&apos;s make your meals more personal.
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              I&apos;ll ask a few small questions, one step at a time. You can change these preferences whenever your routine or needs change.
            </p>
          </div>

          <Image
            src="/brand/oncocare-mascot.png"
            alt=""
            width={192}
            height={192}
            className="absolute -bottom-8 right-4 hidden w-40 opacity-95 sm:block md:w-48"
          />
        </section>

        {hasSavedPreferences && !editing ? (
          renderCurrentPreferences()
        ) : null}

        {editing && (
          <div className="mt-7 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
              Step {step} of {TOTAL_STEPS}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-600">
              A little at a time.
            </p>
          </div>

            <div className="flex items-center gap-2">
              {Array.from(
              { length: TOTAL_STEPS },
              (_, index) => {
                const active =
                  index + 1 <= step;

                return (
                  <span
                    key={index}
                    className={`h-2.5 rounded-full transition-all motion-reduce:transition-none ${
                      active
                        ? "w-7 bg-[#1f8f8a]"
                        : "w-2.5 bg-slate-200"
                    }`}
                    aria-hidden="true"
                  />
                );
              },
              )}
            </div>
          </div>
        )}

        {!editing && saved ? null : null}

        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#d7ecea] bg-[#eef8f7] px-4 py-4 sm:px-5">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#167772] shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Your preferences guide personalization
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm">
              These answers help shape nutrition suggestions. They do not replace treatment-specific advice from your oncology or nutrition care team.
            </p>
          </div>
        </div>

        {error && (
          <div
            className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4"
            role="alert"
          >
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <p className="text-sm leading-6 text-amber-900">
              {error}
            </p>
          </div>
        )}

        {editing && step <= TOTAL_STEPS ? (
          <section className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            {hasSavedPreferences && (
              <div className="mb-6 flex items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#167772]">
                    Editing your profile
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Update only what has changed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeEditor}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            )}

            {step === 1 && (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf7f5] text-[#167772]">
                    <Utensils className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-400">
                      Start here
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                      How do you usually eat?
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Choose the pattern that best matches your everyday diet.
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {DIET_OPTIONS.map(
                    (option) => {
                      const active =
                        preferences.dietType ===
                        option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            updatePreference(
                              "dietType",
                              option.value,
                            )
                          }
                          aria-pressed={active}
                          className={`min-h-24 rounded-2xl border p-4 text-left transition motion-reduce:transition-none ${
                            active
                              ? "border-[#8ccfc9] bg-[#eef8f7]"
                              : "border-slate-200 bg-white hover:border-[#b8ddda]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {option.label}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                {option.description}
                              </p>
                            </div>
                            {active && (
                              <CheckCircle2 className="h-5 w-5 shrink-0 text-[#167772]" />
                            )}
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-400">
                  Safety first
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                  Anything you absolutely need to avoid?
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Tell us about allergies and intolerances separately. This helps keep the safety checks clear.
                </p>

                <div className="mt-7 space-y-7">
                  <TagField
                    label="Food allergies"
                    description="Only add foods you know you are allergic to. These are treated as hard exclusions."
                    values={
                      preferences.allergies
                    }
                    placeholder="e.g. peanuts"
                    onChange={(values) =>
                      updatePreference(
                        "allergies",
                        values,
                      )
                    }
                  />

                  <TagField
                    label="Food intolerances"
                    description="Add foods that your body does not tolerate well."
                    values={
                      preferences.intolerances
                    }
                    placeholder="e.g. lactose"
                    onChange={(values) =>
                      updatePreference(
                        "intolerances",
                        values,
                      )
                    }
                  />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-400">
                  Make it yours
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                  What sounds good â€” and what doesn&apos;t?
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  These are personal preferences, not medical restrictions. You can be as specific as you like.
                </p>

                <div className="mt-7 space-y-7">
                  <TagField
                    label="Foods you avoid"
                    description="For foods you simply don't want included."
                    values={
                      preferences.avoidedFoods
                    }
                    placeholder="e.g. mushrooms"
                    onChange={(values) =>
                      updatePreference(
                        "avoidedFoods",
                        values,
                      )
                    }
                  />

                  <TagField
                    label="Foods you like"
                    description="Familiar foods can make a plan easier to actually follow."
                    values={
                      preferences.preferredFoods
                    }
                    placeholder="e.g. dal, rice"
                    onChange={(values) =>
                      updatePreference(
                        "preferredFoods",
                        values,
                      )
                    }
                  />

                  <TagField
                    label="Cuisine you enjoy"
                    description="Examples: North Indian, South Indian, Mediterranean, home-style."
                    values={
                      preferences.cuisinePreferences
                    }
                    placeholder="e.g. North Indian"
                    onChange={(values) =>
                      updatePreference(
                        "cuisinePreferences",
                        values,
                      )
                    }
                  />
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-400">
                  Your routine
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                  What kind of day feels comfortable?
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  We&apos;ll use this to shape the meal rhythm, not to impose a rigid schedule.
                </p>

                <div className="mt-7">
                  <p className="text-sm font-semibold text-slate-900">
                    Number of meals
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {[3, 4, 5].map(
                      (count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() =>
                            updatePreference(
                              "mealCount",
                              count,
                            )
                          }
                          className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition motion-reduce:transition-none ${
                            preferences.mealCount ===
                            count
                              ? "border-[#8ccfc9] bg-[#eef8f7] text-[#167772]"
                              : "border-slate-200 bg-white text-slate-700 hover:border-[#b8ddda]"
                          }`}
                        >
                          {count} meals
                        </button>
                      ),
                    )}
                  </div>

                  <p className="mt-6 text-sm font-semibold text-slate-900">
                    Which meal moments matter to you?
                  </p>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {MEAL_TIMINGS.map(
                      (timing) => {
                        const active =
                          preferences.mealTiming.includes(
                            timing,
                          );

                        return (
                          <button
                            key={timing}
                            type="button"
                            onClick={() =>
                              toggleMealTiming(
                                timing,
                              )
                            }
                            className={`flex min-h-12 items-center justify-between rounded-xl border px-4 text-sm font-medium transition motion-reduce:transition-none ${
                              active
                                ? "border-[#8ccfc9] bg-[#eef8f7] text-[#167772]"
                                : "border-slate-200 bg-white text-slate-700 hover:border-[#b8ddda]"
                            }`}
                          >
                            {timing}
                            {active && (
                              <Check className="h-4 w-4" />
                            )}
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              </>
            )}

            {step === 5 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-400">
                  How today feels
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                  How is your appetite usually?
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Choose the pattern that feels most like you these days. You can change it later.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {APPETITE_OPTIONS.map(
                    (option) => {
                      const active =
                        preferences.appetite ===
                        option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            updatePreference(
                              "appetite",
                              option.value,
                            )
                          }
                          className={`min-h-24 rounded-2xl border p-4 text-left transition motion-reduce:transition-none ${
                            active
                              ? "border-[#8ccfc9] bg-[#eef8f7]"
                              : "border-slate-200 bg-white hover:border-[#b8ddda]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {option.label}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                {option.description}
                              </p>
                            </div>
                            {active && (
                              <CheckCircle2 className="h-5 w-5 shrink-0 text-[#167772]" />
                            )}
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>
              </>
            )}

            {step === 6 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-400">
                  Last question
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                  What would you like your nutrition plan to support?
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Select any that feel relevant. These guide the tone and direction of future plans.
                </p>

                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {NUTRITION_GOALS.map(
                    (goal) => {
                      const active =
                        preferences.nutritionGoals.includes(
                          goal,
                        );

                      return (
                        <button
                          key={goal}
                          type="button"
                          onClick={() =>
                            toggleNutritionGoal(
                              goal,
                            )
                          }
                          className={`flex min-h-14 items-center justify-between rounded-xl border px-4 text-left text-sm font-medium transition motion-reduce:transition-none ${
                            active
                              ? "border-[#8ccfc9] bg-[#eef8f7] text-[#167772]"
                              : "border-slate-200 bg-white text-slate-700 hover:border-[#b8ddda]"
                          }`}
                        >
                          {goal}
                          {active && (
                            <Check className="h-4 w-4" />
                          )}
                        </button>
                      );
                    },
                  )}
                </div>
              </>
            )}

            <div className="mt-8 rounded-2xl bg-[#f7fbfb] p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#167772]" />
                <p className="text-sm leading-6 text-slate-600">
                  {getAcknowledgement(
                    step,
                    preferences,
                  )}
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={previousStep}
                disabled={step === 1 || saving}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition motion-reduce:transition-none hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>

              {step < TOTAL_STEPS ? (
                <button
                  type="button"
                  onClick={nextStep}
                  disabled={saving}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1f8f8a] px-5 py-2.5 text-sm font-semibold text-white transition motion-reduce:transition-none hover:bg-[#167772] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    void savePreferences()
                  }
                  disabled={saving}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1f8f8a] px-5 py-2.5 text-sm font-semibold text-white transition motion-reduce:transition-none hover:bg-[#167772] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                      Saving
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Save preferences
                    </>
                  )}
                </button>
              )}
            </div>
          </section>
        ) : null}

        {showSaveToast && (
          <div
            className="fixed right-5 top-5 z-50 w-[min(380px,calc(100vw-2.5rem))] rounded-2xl border border-[#c8e6e2] bg-white px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)]"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e6f6f3] text-[#167772]">
                <CheckCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  Your preferences are saved
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Your next meal plan will use these updated preferences.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSaveToast(false)}
                className="ml-auto rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <footer className="mt-8 flex items-start justify-center gap-2 px-4 text-center text-[11px] leading-5 text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Only dietary preference information belongs to this feature. Clinical information used for personalization remains governed by the existing OncoCare+ data and access controls.
          </p>
        </footer>
      </div>
    </main>
  );
}
