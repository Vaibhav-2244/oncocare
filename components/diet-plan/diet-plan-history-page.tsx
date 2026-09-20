"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Apple,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock3,
  Coffee,
  Droplets,
  FileText,
  GlassWater,
  History,
  Info,
  Leaf,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Soup,
  Utensils,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { dietFetch } from "@/lib/diet-client";

import type {
  DietPlan,
  MealPlanItem,
  MealType,
} from "@/types/diet-plan";

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  mid_morning: "Mid-morning",
  lunch: "Lunch",
  evening_snack: "Evening snack",
  dinner: "Dinner",
};

const MEAL_ORDER: Record<MealType, number> = {
  breakfast: 1,
  mid_morning: 2,
  lunch: 3,
  evening_snack: 4,
  dinner: 5,
};

const MEAL_ICONS = {
  breakfast: Coffee,
  mid_morning: Apple,
  lunch: Soup,
  evening_snack: GlassWater,
  dinner: Utensils,
};

type ApiResult = {
  success?: boolean;
  data?: unknown;
  error?: unknown;
};

function isDietPlan(value: unknown): value is DietPlan {
  if (!value || typeof value !== "object") {
    return false;
  }

  const plan = value as Partial<DietPlan>;

  return (
    typeof plan.userId === "string" &&
    typeof plan.planDate === "string" &&
    typeof plan.summary === "string" &&
    Array.isArray(plan.meals) &&
    typeof plan.hydrationGuidance === "string"
  );
}

function sortMeals(
  meals: MealPlanItem[],
): MealPlanItem[] {
  return [...meals].sort(
    (a, b) =>
      MEAL_ORDER[a.mealType] -
      MEAL_ORDER[b.mealType],
  );
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function isToday(value: string): boolean {
  const date = new Date();

  const today = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(
      2,
      "0",
    ),
    String(date.getDate()).padStart(
      2,
      "0",
    ),
  ].join("-");

  return value === today;
}

function formatDate(
  value: string,
  long = false,
): string {
  const date = parseDate(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(
    "en-IN",
    long
      ? {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }
      : {
          day: "numeric",
          month: "short",
          year: "numeric",
        },
  );
}

function errorMessage(
  value: unknown,
  fallback: string,
): string {
  return typeof value === "string" &&
    value.trim()
    ? value
    : fallback;
}

function MealVisual({
  mealType,
}: {
  mealType: MealType;
}) {
  return (
    <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-[20px] bg-gradient-to-br from-[#eff9f6] via-white to-[#f5f1ff]">
      <div className="absolute -left-7 -top-7 h-20 w-20 rounded-full bg-[#dff3ee] opacity-80" />

      <div className="absolute -bottom-8 -right-7 h-24 w-24 rounded-full bg-[#ece7ff] opacity-70" />

      <div className="relative flex h-16 w-16 items-center justify-center rounded-[18px] border border-white/90 bg-white/85 text-3xl shadow-sm backdrop-blur">
        {(() => {
          const MealIcon = MEAL_ICONS[mealType];
          return <MealIcon className="h-8 w-8 text-[#167772]" strokeWidth={1.8} aria-hidden="true" />;
        })()}
      </div>
    </div>
  );
}

function MiniMeal({
  meal,
}: {
  meal: MealPlanItem;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <MealVisual mealType={meal.mealType} />

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#167772]">
        {MEAL_LABELS[meal.mealType]}
      </p>

      <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
        {meal.name}
      </p>
    </div>
  );
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 border-t border-slate-100 pt-5">
      <div className="flex items-center gap-2 text-[#167772]">
        {icon}

        <h4 className="text-sm font-semibold text-slate-900">
          {title}
        </h4>
      </div>

      <div className="mt-3">
        {children}
      </div>
    </section>
  );
}

function FullPlanSheet({
  plan,
  onClose,
}: {
  plan: DietPlan;
  onClose: () => void;
}) {
  useEffect(() => {
    const originalOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.body.style.overflow =
        originalOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px]">
      <div
        className="absolute inset-y-0 right-0 flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-full-plan-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#167772]">
              Full diet plan
            </p>

            <h2
              id="history-full-plan-title"
              className="mt-1 text-xl font-semibold tracking-tight text-slate-950"
            >
              {formatDate(plan.planDate)}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close full plan"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-6 sm:px-6">
          <section className="rounded-[22px] border border-[#d7ecea] bg-[#f1faf8] p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#167772]" />

              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Plan summary
                </h3>

                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {plan.summary}
                </p>
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-[22px] border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Droplets className="h-5 w-5 text-[#167772]" />

              <h3 className="text-sm font-semibold text-slate-900">
                Hydration
              </h3>
            </div>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              {plan.hydrationGuidance}
            </p>
          </section>

          <div className="mt-5 space-y-4">
            {sortMeals(plan.meals).map(
              (meal) => (
                <article
                  key={`${meal.mealType}-${meal.name}`}
                  className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm"
                >
                  <MealVisual
                    mealType={
                      meal.mealType
                    }
                  />

                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#167772]">
                      {
                        MEAL_LABELS[
                          meal.mealType
                        ]
                      }
                    </p>

                    <h3 className="mt-1 text-xl font-semibold text-slate-950">
                      {meal.name}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {meal.description}
                    </p>

                    {meal.whyThisMeal && (
                      <section className="mt-5 rounded-[20px] border border-[#d7ecea] bg-[#f1faf8] p-4">
                        <div className="flex items-start gap-3">
                          <Leaf className="mt-0.5 h-5 w-5 shrink-0 text-[#167772]" />

                          <div>
                            <h4 className="text-sm font-semibold text-slate-900">
                              Why this fits you
                            </h4>

                            <p className="mt-1 text-sm leading-6 text-slate-600">
                              {
                                meal.whyThisMeal
                              }
                            </p>
                          </div>
                        </div>
                      </section>
                    )}

                    {(meal.portionGuidance ||
                      typeof meal.estimatedPrepMinutes ===
                        "number") && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {meal.portionGuidance && (
                          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
                              Portion guidance
                            </p>

                            <p className="mt-2 text-sm leading-5 text-slate-700">
                              {
                                meal.portionGuidance
                              }
                            </p>
                          </div>
                        )}

                        {typeof meal.estimatedPrepMinutes ===
                          "number" && (
                          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
                              Prep time
                            </p>

                            <p className="mt-2 text-sm leading-5 text-slate-700">
                              About{" "}
                              {
                                meal.estimatedPrepMinutes
                              }{" "}
                              minutes
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <DetailSection
                      title="Ingredients"
                      icon={
                        <Utensils className="h-4 w-4" />
                      }
                    >
                      <div className="flex flex-wrap gap-2">
                        {meal.ingredients.map(
                          (
                            ingredient,
                          ) => (
                            <span
                              key={
                                ingredient
                              }
                              className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
                            >
                              {ingredient}
                            </span>
                          ),
                        )}
                      </div>
                    </DetailSection>

                    {meal.preparationNotes && (
                      <DetailSection
                        title="Preparation"
                        icon={
                          <BookOpen className="h-4 w-4" />
                        }
                      >
                        <p className="text-sm leading-6 text-slate-600">
                          {
                            meal.preparationNotes
                          }
                        </p>
                      </DetailSection>
                    )}

                    {meal.nutritionNotes &&
                      meal.nutritionNotes
                        .length >
                        0 && (
                        <DetailSection
                          title="Nutrition notes"
                          icon={
                            <FileText className="h-4 w-4" />
                          }
                        >
                          <ul className="space-y-2">
                            {meal.nutritionNotes.map(
                              (note) => (
                                <li
                                  key={
                                    note
                                  }
                                  className="flex gap-2.5 text-sm leading-6 text-slate-600"
                                >
                                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f8f8a]" />
                                  <span>
                                    {note}
                                  </span>
                                </li>
                              ),
                            )}
                          </ul>
                        </DetailSection>
                      )}

                    {meal.safetyNotes &&
                      meal.safetyNotes
                        .length >
                        0 && (
                        <section className="mt-5 rounded-[20px] border border-amber-200 bg-amber-50 p-4">
                          <div className="flex items-start gap-3">
                            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />

                            <div>
                              <h4 className="text-sm font-semibold text-amber-950">
                                Safety notes
                              </h4>

                              <ul className="mt-2 space-y-1.5 text-sm leading-6 text-amber-900">
                                {meal.safetyNotes.map(
                                  (
                                    note,
                                  ) => (
                                    <li
                                      key={
                                        note
                                      }
                                    >
                                      {
                                        note
                                      }
                                    </li>
                                  ),
                                )}
                              </ul>
                            </div>
                          </div>
                        </section>
                      )}
                  </div>
                </article>
              ),
            )}
          </div>

          {plan.generalNutritionNotes
            .length >
            0 && (
            <section className="mt-5 rounded-[22px] border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 text-[#167772]">
                <Info className="h-5 w-5" />

                <h3 className="text-sm font-semibold text-slate-900">
                  Nutrition notes for the day
                </h3>
              </div>

              <ul className="mt-3 space-y-2">
                {plan.generalNutritionNotes.map(
                  (note) => (
                    <li
                      key={note}
                      className="flex gap-2.5 text-sm leading-6 text-slate-600"
                    >
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f8f8a]" />
                      <span>{note}</span>
                    </li>
                  ),
                )}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DietPlanHistoryPage() {
  const [history, setHistory] =
    useState<DietPlan[]>([]);

  const [selectedDate, setSelectedDate] =
    useState<string | null>(null);

  const [selectedPlan, setSelectedPlan] =
    useState<DietPlan | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [fullPlanOpen, setFullPlanOpen] =
    useState(false);

  async function loadHistory() {
    setLoading(true);
    setError("");

    try {
      const response = await dietFetch(
        "/api/diet-plan?history=true&limit=14",
        {
          cache: "no-store",
        },
      );

      const result =
        (await response.json()) as ApiResult;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          errorMessage(
            result.error,
            "Unable to load your diet plan history.",
          ),
        );
      }

      const plans = Array.isArray(
        result.data,
      )
        ? result.data.filter(
            isDietPlan,
          )
        : [];

      setHistory(plans);

      const preferredDate =
        selectedDate &&
        plans.some(
          (plan) =>
            plan.planDate ===
            selectedDate,
        )
          ? selectedDate
          : plans[0]?.planDate ??
            null;

      setSelectedDate(
        preferredDate,
      );

      setSelectedPlan(
        plans.find(
          (plan) =>
            plan.planDate ===
            preferredDate,
        ) ?? null,
      );
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load your diet plan history.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  function selectPlan(
    date: string,
  ) {
    setSelectedDate(date);

    setSelectedPlan(
      history.find(
        (plan) =>
          plan.planDate === date,
      ) ?? null,
    );

    setFullPlanOpen(false);
    setError("");
  }

  return (
    <main className="min-h-screen bg-[#f5f7fa] px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="sticky top-3 z-30 flex items-center justify-between gap-4 rounded-[24px] border border-slate-200/90 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-5">
          <Link
            href="/dashboard/diet-plan"
            aria-label="OncoCare+ Diet Plans"
          >
            <Image
              src="/brand/oncocare-logo.png"
              alt="OncoCare+"
              width={165}
              height={54}
              className="h-auto w-[132px] sm:w-[145px]"
              priority
            />
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            <Link
              href="/dashboard/diet-plan"
              className="rounded-xl px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Diet plans
            </Link>

            <Link
              href="/dashboard/diet-plan/history"
              className="rounded-xl bg-[#eef8f7] px-3.5 py-2 text-sm font-semibold text-[#167772]"
            >
              History
            </Link>

            <Link
              href="/dashboard/diet-plan/preferences"
              className="rounded-xl px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Preferences
            </Link>
          </nav>

          <div className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 sm:flex">
            <History className="h-3.5 w-3.5" />
            Your nutrition journey
          </div>
        </header>

        <section className="mt-7 overflow-hidden rounded-[28px] border border-[#d7ecea] bg-white shadow-[0_18px_60px_rgba(31,41,55,0.06)]">
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_220px] lg:items-center">
            <div>
              <Link
                href="/dashboard/diet-plan"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#167772] hover:text-[#125f5b]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to today&apos;s plan
              </Link>

              <div className="mt-5 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef8f7] text-[#167772]">
                  <History className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Diet plan history
                  </p>

                  <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                    Your saved plans
                  </h1>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                    Look back at plans generated from the information available on each day.
                  </p>
                </div>
              </div>
            </div>

            <div className="hidden justify-center lg:flex">
              <Image
                src="/brand/oncocare-mascot.png"
                alt=""
                width={180}
                height={180}
                className="w-[155px]"
              />
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-5 flex flex-col gap-3 rounded-[20px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
            <p>{error}</p>

            <button
              type="button"
              onClick={() =>
                void loadHistory()
              }
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 font-semibold text-red-800 hover:bg-red-100"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="mt-7 grid gap-6 lg:grid-cols-[320px_1fr]">
            <div className="h-[520px] animate-pulse rounded-[26px] bg-white shadow-sm motion-reduce:animate-none" />

            <div className="h-[520px] animate-pulse rounded-[26px] bg-white shadow-sm motion-reduce:animate-none" />
          </div>
        ) : history.length ===
          0 ? (
          <section className="mt-7 rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef8f7] text-[#167772]">
              <CalendarDays className="h-6 w-6" />
            </div>

            <h2 className="mt-5 text-2xl font-semibold text-slate-950">
              No saved plans yet
            </h2>

            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Once a daily nutrition plan has been created, it will appear here so you can review it later.
            </p>

            <Link
              href="/dashboard/diet-plan"
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#167772] px-5 text-sm font-semibold text-white hover:bg-[#125f5b]"
            >
              Go to diet plans
              <ChevronRight className="h-4 w-4" />
            </Link>
          </section>
        ) : (
          <section className="mt-7 grid gap-6 lg:grid-cols-[320px_1fr]">
            <aside className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-400">
                  Saved plans
                </p>

                <h2 className="mt-1 text-xl font-semibold text-slate-950">
                  Choose a day
                </h2>

                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Select a saved date to preview that plan.
                </p>
              </div>

              <div className="max-h-[620px] overflow-y-auto p-3">
                {history.map(
                  (historyPlan) => {
                    const active =
                      selectedDate ===
                      historyPlan.planDate;

                    const today =
                      isToday(
                        historyPlan.planDate,
                      );

                    return (
                      <button
                        key={
                          historyPlan.id ??
                          historyPlan.planDate
                        }
                        type="button"
                        onClick={() =>
                          selectPlan(
                            historyPlan.planDate,
                          )
                        }
                        className={`mb-2 flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3.5 text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#d8eeeb] ${
                          active
                            ? "border-[#a6dcd5] bg-[#eef8f7]"
                            : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            active
                              ? "bg-white text-[#167772]"
                              : "bg-slate-50 text-slate-400"
                          }`}
                        >
                          <CalendarDays className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">
                              {today
                                ? "Today"
                                : formatDate(
                                    historyPlan.planDate,
                                  )}
                            </p>

                            {today && (
                              <span className="rounded-full bg-[#dff3ee] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#167772]">
                                Current
                              </span>
                            )}
                          </div>

                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                            {
                              historyPlan.summary
                            }
                          </p>
                        </div>

                        <ChevronRight
                          className={`h-4 w-4 shrink-0 ${
                            active
                              ? "text-[#167772]"
                              : "text-slate-300"
                          }`}
                        />
                      </button>
                    );
                  },
                )}
              </div>
            </aside>

            <section className="min-w-0 overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
              {!selectedPlan ? (
                <div className="flex min-h-[520px] items-center justify-center p-8 text-sm text-slate-500">
                  Select a saved plan to view its details.
                </div>
              ) : (
                <>
                  <div className="border-b border-slate-100 px-6 py-6 sm:px-7">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eef8f7] px-3 py-1.5 text-xs font-semibold text-[#167772]">
                            <CalendarDays className="h-3.5 w-3.5" />

                            {isToday(
                              selectedPlan.planDate,
                            )
                              ? "Today"
                              : formatDate(
                                  selectedPlan.planDate,
                                )}
                          </span>

                          {isToday(
                            selectedPlan.planDate,
                          ) && (
                            <span className="rounded-full bg-[#dff3ee] px-3 py-1.5 text-xs font-semibold text-[#167772]">
                              Current plan
                            </span>
                          )}
                        </div>

                        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                          Plan for{" "}
                          {formatDate(
                            selectedPlan.planDate,
                            true,
                          )}
                        </h2>

                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                          {
                            selectedPlan.summary
                          }
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setFullPlanOpen(
                            true,
                          )
                        }
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#bfe3de] bg-[#f7fcfb] px-4 text-sm font-semibold text-[#167772] hover:bg-[#eef8f7]"
                      >
                        <FileText className="h-4 w-4" />
                        View full plan
                      </button>
                    </div>
                  </div>

                  <div className="p-6 sm:p-7">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                      {sortMeals(
                        selectedPlan.meals,
                      ).map(
                        (meal) => (
                          <MiniMeal
                            key={`${meal.mealType}-${meal.name}`}
                            meal={meal}
                          />
                        ),
                      )}
                    </div>

                    <div className="mt-6 grid gap-4 lg:grid-cols-2">
                      <section className="rounded-[22px] border border-slate-200 bg-slate-50 p-5">
                        <div className="flex items-center gap-2 text-[#167772]">
                          <FileText className="h-5 w-5" />

                          <h3 className="text-sm font-semibold text-slate-900">
                            Plan summary
                          </h3>
                        </div>

                        <p className="mt-3 text-sm leading-6 text-slate-600">
                          {
                            selectedPlan.summary
                          }
                        </p>
                      </section>

                      <section className="rounded-[22px] border border-slate-200 bg-slate-50 p-5">
                        <div className="flex items-center gap-2 text-[#167772]">
                          <Utensils className="h-5 w-5" />

                          <h3 className="text-sm font-semibold text-slate-900">
                            Your feedback
                          </h3>
                        </div>

                        <p className="mt-3 text-sm leading-6 text-slate-600">
                          No meal feedback is recorded for this plan yet.
                        </p>
                      </section>
                    </div>

                    <section className="mt-5 rounded-[22px] border border-[#d7ecea] bg-[#f1faf8] p-5">
                      <div className="flex items-start gap-3">
                        <Droplets className="mt-0.5 h-5 w-5 shrink-0 text-[#167772]" />

                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">
                            Hydration guidance
                          </h3>

                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            {
                              selectedPlan.hydrationGuidance
                            }
                          </p>
                        </div>
                      </div>
                    </section>

                    {selectedPlan.personalizationFactors
                      .length >
                      0 && (
                      <section className="mt-5 rounded-[22px] border border-slate-200 bg-white p-5">
                        <div className="flex items-center gap-2 text-[#167772]">
                          <Sparkles className="h-5 w-5" />

                          <h3 className="text-sm font-semibold text-slate-900">
                            What this plan considered
                          </h3>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedPlan.personalizationFactors.map(
                            (
                              factor,
                            ) => (
                              <span
                                key={
                                  factor
                                }
                                className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600"
                              >
                                {
                                  factor
                                }
                              </span>
                            ),
                          )}
                        </div>
                      </section>
                    )}
                  </div>
                </>
              )}
            </section>
          </section>
        )}

        <div className="mt-6 flex flex-col gap-3 rounded-[22px] border border-[#dceeea] bg-[#f1faf8] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#167772]" />

            <p className="text-sm leading-5 text-slate-600">
              Saved plans reflect the information available on their respective dates. They do not replace advice from your oncology or nutrition care team.
            </p>
          </div>

          <Link
              href="/dashboard/diet-plan/preferences"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#167772] shadow-sm ring-1 ring-inset ring-[#cfe8e4] hover:bg-[#f8fcfb]"
          >
            Update preferences
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {fullPlanOpen &&
        selectedPlan && (
          <FullPlanSheet
            plan={selectedPlan}
            onClose={() =>
              setFullPlanOpen(
                false,
              )
            }
          />
        )}
    </main>
  );
}