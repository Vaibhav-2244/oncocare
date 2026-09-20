"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  Apple,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  Droplets,
  ExternalLink,
  GlassWater,
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
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { dietFetch } from "@/lib/diet-client";

import type {
  DietPlan,
  MealPlanItem,
  MealType,
} from "@/types/diet-plan";

import type {
  BatchReplacementReason,
  MealReplacementStatus,
} from "@/types/diet-batch-replacement";

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

const BATCH_REPLACEMENT_REASONS: Array<{
  value: BatchReplacementReason;
  label: string;
}> = [
  {
    value: "not_appealing",
    label: "Not appealing today",
  },
  {
    value: "too_heavy",
    label: "Too heavy today",
  },
  {
    value: "too_similar",
    label: "Had something similar recently",
  },
  {
    value: "didnt_sit_well",
    label: "Didn't sit well",
  },
  {
    value: "prefer_different_ingredients",
    label: "Prefer different ingredients",
  },
  {
    value: "skip_explaining",
    label: "Skip explaining",
  },
];

type AttentionFlag = {
  code: string;
  label: string;
};

type DietPlanStateResponse = {
  flags?: unknown;
};

type ApiResult = {
  success?: boolean;
  status?: string;
  data?: unknown;
  reasons?: unknown;
  error?: unknown;
  details?: unknown;
  code?: unknown;
  replacedMeals?: unknown;
  replacementNumbers?: unknown;
};

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function isToday(value: string): boolean {
  const today = new Date();
  const current = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  return current === value;
}

function sortMeals(meals: MealPlanItem[]): MealPlanItem[] {
  return [...meals].sort(
    (a, b) =>
      MEAL_ORDER[a.mealType] -
      MEAL_ORDER[b.mealType],
  );
}

function extractReasons(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" &&
          item.trim().length > 0,
      )
    : [];
}

function extractError(
  value: unknown,
  fallback: string,
): string {
  return typeof value === "string" &&
    value.trim().length > 0
    ? value
    : fallback;
}

function isDietPlan(
  value: unknown,
): value is DietPlan {
  if (
    !value ||
    typeof value !== "object"
  ) {
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

function normaliseFlags(value: unknown): AttentionFlag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is AttentionFlag =>
      !!item &&
      typeof item === "object" &&
      typeof (item as { code?: unknown }).code === "string" &&
      typeof (item as { label?: unknown }).label === "string",
  );
}

function mealTypeAvailable(
  statuses: MealReplacementStatus[],
  mealType: MealType,
): MealReplacementStatus | undefined {
  return statuses.find(
    (status) =>
      status.mealType === mealType,
  );
}

function SkeletonCard() {
  return (
    <article className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="h-32 animate-pulse bg-slate-100" />
      <div className="space-y-3 p-5">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
        <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="flex gap-2">
          <div className="h-8 w-20 animate-pulse rounded-full bg-slate-100" />
          <div className="h-8 w-20 animate-pulse rounded-full bg-slate-100" />
        </div>
      </div>
    </article>
  );
}

function MealVisual({
  mealType,
}: {
  mealType: MealType;
}) {
  return (
    <div className="relative flex h-32 items-center justify-center overflow-hidden bg-gradient-to-br from-[#eff9f6] via-white to-[#f6f0ff]">
      <div className="absolute -left-8 -top-8 h-24 w-24 rounded-full bg-[#dff3ee] opacity-80" />
      <div className="absolute -bottom-10 -right-8 h-28 w-28 rounded-full bg-[#eee8ff] opacity-70" />
      <div className="relative flex h-20 w-20 items-center justify-center rounded-[22px] border border-white/80 bg-white/80 text-4xl shadow-sm backdrop-blur">
        {(() => {
          const MealIcon = MEAL_ICONS[mealType];
          return <MealIcon className="h-10 w-10 text-[#167772]" strokeWidth={1.8} aria-hidden="true" />;
        })()}
      </div>
    </div>
  );
}

function ReferenceTile({
  icon,
  title,
  description,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={active}
      onClick={onClick}
      className="group rounded-[20px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#bfe3de] hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-[#d8eeeb]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eef8f7] text-[#167772]">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">
              {title}
            </p>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-400 transition ${
                active ? "rotate-180" : ""
              }`}
            />
          </div>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            {description}
          </p>
        </div>
      </div>
    </button>
  );
}

export default function DietPlanDashboard() {
  const [plan, setPlan] =
    useState<DietPlan | null>(null);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState("");
  const [attentionFlags, setAttentionFlags] =
    useState<AttentionFlag[]>([]);
  const [missingInfo, setMissingInfo] =
    useState<string[]>([]);
  const [generating, setGenerating] =
    useState(false);
  const [statusMessage, setStatusMessage] =
    useState("");
  const [whyOpen, setWhyOpen] =
    useState(false);
  const [expandedReference, setExpandedReference] =
    useState<"hydration" | "notes" | "sources" | null>(null);
  const [activeMeal, setActiveMeal] =
    useState<MealPlanItem | null>(null);
  const [changeMealOpen, setChangeMealOpen] =
    useState(false);
  const [selectedMealTypes, setSelectedMealTypes] =
    useState<MealType[]>([]);
  const [replacementReason, setReplacementReason] =
    useState<BatchReplacementReason | undefined>();
  const [replacementStatuses, setReplacementStatuses] =
    useState<MealReplacementStatus[]>([]);
  const [replacementLoading, setReplacementLoading] =
    useState(false);
  const [replacementError, setReplacementError] =
    useState("");
  const [replacingMealTypes, setReplacingMealTypes] =
    useState<Set<MealType>>(new Set());

  const sortedMeals = useMemo(
    () => (plan ? sortMeals(plan.meals) : []),
    [plan],
  );

  const canGenerate = !generating;

  function closeOverlays() {
    setActiveMeal(null);
    setChangeMealOpen(false);
  }

  function toggleReference(
    section: "hydration" | "notes" | "sources",
  ) {
    setExpandedReference(
      (current) =>
        current === section ? null : section,
    );
  }

  async function loadState() {
    try {
      const response = await dietFetch(
        "/api/diet-plan/state",
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
        return;
      }

      const data =
        result.data as DietPlanStateResponse | undefined;

      setAttentionFlags(
        normaliseFlags(
          data?.flags,
        ),
      );
    } catch {
      // The plan endpoint remains the source of truth when this
      // auxiliary state endpoint is unavailable.
    }
  }

  async function loadPlan() {
    setLoading(true);
    setError("");
    setMissingInfo([]);

    try {
      const response = await dietFetch(
        "/api/diet-plan",
        {
          cache: "no-store",
        },
      );

      const result =
        (await response.json()) as ApiResult;

      if (
        result.status ===
        "missing_required_information"
      ) {
        setPlan(null);
        setMissingInfo(
          extractReasons(result.reasons),
        );
            return;
      }

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          extractError(
            result.error ?? result.details,
            "Unable to load today's diet plan.",
          ),
        );
      }

      if (
        result.data === null ||
        result.data === undefined
      ) {
        setPlan(null);
        return;
      }

      if (
        !isDietPlan(result.data)
      ) {
        throw new Error(
          "The server returned an invalid diet plan.",
        );
      }

      setPlan(result.data);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load today's diet plan.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadReplacementStatuses() {
    if (!plan) {
      return;
    }

    try {
      const response = await dietFetch(
        `/api/diet-plan/batch-replacement?date=${encodeURIComponent(
          plan.planDate,
        )}`,
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
        setReplacementStatuses([]);
        return;
      }

      const data = Array.isArray(result.data)
        ? result.data.filter(
            (
              item,
            ): item is MealReplacementStatus =>
              !!item &&
              typeof item === "object" &&
              typeof (item as { mealType?: unknown }).mealType === "string" &&
              typeof (item as { used?: unknown }).used === "number" &&
              typeof (item as { remaining?: unknown }).remaining === "number" &&
              typeof (item as { available?: unknown }).available === "boolean",
          )
        : [];

      setReplacementStatuses(data);
    } catch {
      setReplacementStatuses([]);
    }
  }

  useEffect(() => {
    let mounted = true;

    void Promise.all([
      loadPlan(),
      loadState(),
    ]).finally(() => {
      if (!mounted) {
        return;
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (changeMealOpen) {
      void loadReplacementStatuses();
    }
  }, [changeMealOpen, plan?.planDate]);

  useEffect(() => {
    const hasOverlay =
      !!activeMeal ||
      changeMealOpen;

    if (!hasOverlay) {
      return;
    }

    const originalOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow =
        originalOverflow;
    };
  }, [
    activeMeal,
    changeMealOpen,
  ]);

  async function generatePlan(
    regenerate = false,
  ) {
    setGenerating(true);
    setError("");
    setMissingInfo([]);
    setStatusMessage(
      regenerate
        ? "Refreshing today's plan from your current information."
        : "Preparing your personalized nutrition plan.",
    );

    const controller =
      new AbortController();

    const timeoutId =
      window.setTimeout(
        () => controller.abort(),
        90000,
      );

    try {
      const response = await dietFetch(
        "/api/diet-plan",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            regenerate,
          }),
          signal: controller.signal,
        },
      );

      const result =
        (await response.json()) as ApiResult;

      if (
        result.status ===
        "missing_required_information"
      ) {
        setPlan(null);
        setMissingInfo(
          extractReasons(result.reasons),
        );
        setStatusMessage("");
        return;
      }

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          extractError(
            result.error ?? result.details,
            "Unable to generate today's diet plan.",
          ),
        );
      }

      if (
        !isDietPlan(result.data)
      ) {
        throw new Error(
          "The server completed the request but did not return a valid diet plan.",
        );
      }

      setPlan(result.data);
      setStatusMessage("");
      await loadState();
    } catch (caughtError) {
      setError(
        caughtError instanceof DOMException &&
          caughtError.name === "AbortError"
          ? "The diet plan request took too long to complete. Please try again."
          : caughtError instanceof Error
            ? caughtError.message
            : "Unable to generate today's diet plan.",
      );
      setStatusMessage("");
    } finally {
      window.clearTimeout(timeoutId);
      setGenerating(false);
    }
  }

  function startChangeMeal(
    mealType?: MealType,
  ) {
    if (!plan) {
      return;
    }

    setReplacementError("");
    setReplacementReason(undefined);
    setSelectedMealTypes(
      mealType ? [mealType] : [],
    );
    setChangeMealOpen(true);
  }

  function toggleMealSelection(
    mealType: MealType,
  ) {
    const status =
      mealTypeAvailable(
        replacementStatuses,
        mealType,
      );

    if (
      status &&
      !status.available
    ) {
      return;
    }

    setReplacementError("");

    setSelectedMealTypes(
      (current) =>
        current.includes(mealType)
          ? current.filter(
              (item) =>
                item !== mealType,
            )
          : [
              ...current,
              mealType,
            ],
    );
  }

  async function handleReplacement(
    retry = false,
  ) {
    if (
      !plan ||
      replacementLoading
    ) {
      return;
    }

    if (
      selectedMealTypes.length === 0
    ) {
      return;
    }

    if (
      selectedMealTypes.length === 5
    ) {
      setChangeMealOpen(false);
      setReplacementError("");
      await generatePlan(true);
      return;
    }

    setReplacementLoading(true);
    setReplacementError("");

    const selectedSet =
      new Set(selectedMealTypes);

    setReplacingMealTypes(
      selectedSet,
    );

    try {
      const response = await dietFetch(
        "/api/diet-plan/batch-replacement",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            planDate: plan.planDate,
            mealTypes:
              selectedMealTypes,
            reason:
              replacementReason,
          }),
        },
      );

      const result =
        (await response.json()) as ApiResult;

      if (
        !response.ok ||
        !result.success
      ) {
        const code =
          typeof result.code === "string"
            ? result.code
            : "";

        if (
          code ===
          "REPLACEMENT_LIMIT_REACHED"
        ) {
          throw new Error(
            "You've used the available replacements for one of these meals today. Your current plan is still unchanged.",
          );
        }

        if (
          code ===
          "REPLACEMENT_COOLDOWN"
        ) {
          throw new Error(
            "Please wait a moment before updating one of these meals again. Your current plan is still unchanged.",
          );
        }

        throw new Error(
          extractError(
            result.error,
            "Something went wrong generating a replacement. Your current plan is still unchanged.",
          ),
        );
      }

      if (
        !isDietPlan(
          result.data,
        )
      ) {
        throw new Error(
          "The replacement was generated, but the updated plan was not returned safely. Your current plan is still unchanged.",
        );
      }

      setPlan(result.data);
      setReplacementError("");
      setChangeMealOpen(false);
      setSelectedMealTypes([]);
      setReplacementReason(undefined);
      await loadReplacementStatuses();
    } catch (caughtError) {
      setReplacementError(
        retry
          ? caughtError instanceof Error
            ? caughtError.message
            : "Something went wrong generating a replacement. Please try again."
          : caughtError instanceof Error
            ? caughtError.message
            : "Something went wrong generating a replacement. Your current plan is still unchanged.",
      );
    } finally {
      setReplacementLoading(false);
      setReplacingMealTypes(
        new Set(),
      );
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f7fa] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <Image
              src="/brand/oncocare-logo.png"
              alt="OncoCare+"
              width={165}
              height={54}
              className="h-auto w-[135px]"
              priority
            />
            <div className="h-9 w-24 animate-pulse rounded-xl bg-slate-100" />
          </header>

          <section className="mt-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white">
            <div className="space-y-4 p-6 sm:p-8">
              <div className="h-8 w-64 animate-pulse rounded-xl bg-slate-200" />
              <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
              <div className="h-11 w-full animate-pulse rounded-2xl bg-slate-100" />
            </div>
          </section>

          <section className="mt-7">
            <div className="mb-4 h-7 w-44 animate-pulse rounded bg-slate-200" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                1,
                2,
                3,
                4,
                5,
              ].map((item) => (
                <SkeletonCard key={item} />
              ))}
            </div>
          </section>
        </div>
      </main>
    );
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
              className="rounded-xl bg-[#eef8f7] px-3.5 py-2 text-sm font-semibold text-[#167772]"
            >
              Diet plans
            </Link>
            <Link
              href="/dashboard/diet-plan/history"
              className="rounded-xl px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
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

          <div className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 sm:block">
            Personalized Diet Plans
          </div>
        </header>

        {error && (
          <div className="mt-5 flex flex-col gap-3 rounded-[20px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2.5">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">
                  Something went wrong
                </p>
                <p className="mt-1 leading-5">
                  {error}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadPlan()
              }
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-800 hover:bg-red-100"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        )}

        {missingInfo.length > 0 && (
          <section className="mt-6 rounded-[26px] border border-amber-200 bg-amber-50 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <h1 className="text-lg font-semibold text-amber-950">
                  A little more information is needed
                </h1>
                <p className="mt-1 text-sm leading-6 text-amber-900">
                  We need a few details from your current OncoCare+ information before we can safely personalize a plan.
                </p>

                <ul className="mt-3 space-y-1 text-sm text-amber-900">
                  {missingInfo.map(
                    (reason) => (
                      <li
                        key={reason}
                        className="flex gap-2"
                      >
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
                        <span>{reason}</span>
                      </li>
                    ),
                  )}
                </ul>

                <Link
                  href="/dashboard/diet-plan/preferences"
                  className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#167772] px-4 text-sm font-semibold text-white hover:bg-[#125f5b]"
                >
                  Review preferences
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>
        )}

        {!plan && missingInfo.length === 0 && (
          <section className="mt-6 overflow-hidden rounded-[28px] border border-[#d7ecea] bg-white shadow-[0_18px_60px_rgba(31,41,55,0.06)]">
            <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_280px] lg:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#eef8f7] px-3 py-1.5 text-xs font-semibold text-[#167772]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Personalized nutrition support
                </div>

                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
                  Your plan starts with what you&apos;ve shared.
                </h1>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  We&apos;ll use your available OncoCare+ information,
                  dietary preferences, and trusted nutrition guidance
                  to prepare today&apos;s plan.
                </p>

                <button
                  type="button"
                  onClick={() =>
                    void generatePlan(false)
                  }
                  disabled={generating}
                  className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#167772] px-5 text-sm font-semibold text-white transition hover:bg-[#125f5b] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {generating
                    ? "Preparing your plan..."
                    : "Create today's plan"}
                </button>

                {statusMessage && (
                  <p className="mt-3 text-xs text-slate-500">
                    {statusMessage}
                  </p>
                )}
              </div>

              <div className="hidden justify-center lg:flex">
                <Image
                  src="/brand/oncocare-mascot.png"
                  alt=""
                  width={240}
                  height={240}
                  className="w-[190px]"
                />
              </div>
            </div>
          </section>
        )}

        {plan && (
          <>
            <section className="mt-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_280px] lg:items-center">
                <div>
                  <p className="text-sm font-medium text-[#167772]">
                    {isToday(plan.planDate)
                      ? "Your plan for today"
                      : "Saved diet plan"}
                  </p>

                  <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                    Good morning
                  </h1>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {plan.summary}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(plan.planDate)}
                    </span>

                  </div>
                </div>

                <div className="hidden rounded-[22px] border border-[#e5efed] bg-[#f6faf9] p-5 lg:block">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#167772]">
                    A note for today
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Keep things simple and take the day one meal at a time.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setWhyOpen(
                    (current) => !current,
                  )
                }
                aria-expanded={whyOpen}
                className="flex w-full items-center justify-between gap-4 border-t border-slate-100 bg-slate-50/70 px-6 py-4 text-left transition hover:bg-slate-50 sm:px-8"
              >
                <div className="flex items-center gap-2.5">
                  <Info className="h-4 w-4 text-[#167772]" />
                  <span className="text-sm font-semibold text-slate-800">
                    See why this plan looks this way
                  </span>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition ${
                    whyOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {whyOpen && (
                <div className="border-t border-slate-100 px-6 py-5 sm:px-8">
                  <p className="text-sm leading-6 text-slate-600">
                    This plan uses the information currently available
                    about your preferences and nutrition context.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {attentionFlags
                      .slice(0, 6)
                      .map((flag) => (
                        <span
                          key={flag.code}
                          className="rounded-full bg-[#eef8f7] px-3 py-1.5 text-xs font-semibold text-[#286f6a]"
                        >
                          {flag.label}
                        </span>
                      ))}

                    {plan.personalizationFactors
                      .slice(0, 4)
                      .map((factor) => (
                        <span
                          key={factor}
                          className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600"
                        >
                          {factor}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </section>

            <section
              id="todays-meals"
              className="mt-7 scroll-mt-28"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                    Today&apos;s meals
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Simple. Nourishing. Tailored to you.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    startChangeMeal()
                  }
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#167772] px-4 text-sm font-semibold text-white transition hover:bg-[#125f5b] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#d8eeeb]"
                >
                  <RefreshCw className="h-4 w-4" />
                  Change a meal
                </button>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {sortedMeals
                  .slice(
                    0,
                    plan.meals.length,
                  )
                  .map(
                    (meal) => {
                      const replacing =
                        replacingMealTypes.has(
                          meal.mealType,
                        );

                      return (
                        <article
                          key={`${meal.mealType}-${meal.name}`}
                          className="group relative overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        >
                          <MealVisual
                            mealType={
                              meal.mealType
                            }
                          />

                          {replacing && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/85 backdrop-blur-sm">
                              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-lg">
                                <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#167772]" />
                                <p className="mt-2 text-xs font-semibold text-slate-700">
                                  Updating this meal...
                                </p>
                              </div>
                            </div>
                          )}

                          <div className="p-4">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#167772]">
                                <Clock3 className="h-3.5 w-3.5" />
                                {MEAL_LABELS[
                                  meal.mealType
                                ]}
                              </span>
                              <Utensils className="h-4 w-4 text-slate-300" />
                            </div>

                            <h3 className="mt-3 line-clamp-2 min-h-11 text-base font-semibold leading-5 text-slate-950">
                              {meal.name}
                            </h3>

                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                              {meal.description}
                            </p>

                            <div className="mt-4 flex flex-wrap gap-1.5">
                              {typeof meal.estimatedPrepMinutes ===
                                "number" && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                  <Clock3 className="h-3 w-3" />
                                  {meal.estimatedPrepMinutes} min
                                </span>
                              )}

                              {meal.portionGuidance && (
                                <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                  <Utensils className="h-3 w-3 shrink-0" />
                                  <span className="truncate">
                                    {meal.portionGuidance}
                                  </span>
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                setActiveMeal(
                                  meal,
                                )
                              }
                              className="mt-4 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#cfe8e4] bg-[#f7fcfb] px-3 text-xs font-semibold text-[#167772] transition hover:bg-[#eef8f7] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#d8eeeb]"
                            >
                              View details
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </article>
                      );
                    },
                  )}
              </div>
            </section>

            <section className="mt-6 grid gap-3 md:grid-cols-3">
              <ReferenceTile
                icon={
                  <Droplets className="h-5 w-5" />
                }
                title="Hydration"
                description="A simple hydration reminder for today."
                active={
                  expandedReference ===
                  "hydration"
                }
                onClick={() =>
                  toggleReference(
                    "hydration",
                  )
                }
              />

              <ReferenceTile
                icon={
                  <BookOpen className="h-5 w-5" />
                }
                title="Nutrition notes"
                description="Helpful guidance connected to your plan."
                active={
                  expandedReference ===
                  "notes"
                }
                onClick={() =>
                  toggleReference(
                    "notes",
                  )
                }
              />

              <ReferenceTile
                icon={
                  <ShieldCheck className="h-5 w-5" />
                }
                title="Where this guidance comes from"
                description="Trusted nutrition sources used for grounding."
                active={
                  expandedReference ===
                  "sources"
                }
                onClick={() =>
                  toggleReference(
                    "sources",
                  )
                }
              />
            </section>

            {expandedReference && (
              <section className="mt-3 overflow-hidden rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
                {expandedReference ===
                  "hydration" && (
                  <div className="flex gap-3">
                    <Droplets className="mt-0.5 h-5 w-5 shrink-0 text-[#167772]" />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Hydration guidance
                      </h3>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                        {plan.hydrationGuidance}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        General nutrition information only; follow your care team&apos;s individualized guidance.
                      </p>
                    </div>
                  </div>
                )}

                {expandedReference ===
                  "notes" && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      A few things worth knowing
                    </h3>

                    {plan.generalNutritionNotes.length ===
                    0 ? (
                      <p className="mt-2 text-sm text-slate-500">
                        There are no additional notes for this plan.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2.5">
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
                    )}
                  </div>
                )}

                {expandedReference ===
                  "sources" && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Where this guidance comes from
                    </h3>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Sources retrieved for this plan. No internal model or knowledge-base metadata is shown here.
                    </p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {plan.sources.map(
                        (source) => (
                          <div
                            key={`${source.title}-${source.url ?? ""}`}
                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-800">
                                  {source.title}
                                </p>
                                {source.organization && (
                                  <p className="mt-1 text-xs text-slate-500">
                                    {source.organization}
                                  </p>
                                )}
                              </div>

                              {source.url && (
                                <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
                              )}
                            </div>

                            {source.url && (
                              <a
                                href={
                                  source.url
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#167772] underline underline-offset-2"
                              >
                                View source
                                <ChevronRight className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}

            <div className="mt-5 flex items-center gap-3 rounded-[22px] border border-[#dceeea] bg-[#f2faf7] px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#167772] shadow-sm">
                <Leaf className="h-5 w-5" />
              </div>
              <p className="text-sm leading-5 text-slate-600">
                Every step counts. Be kind to yourself â€” progress takes time.
              </p>
            </div>

            <p className="mx-auto mt-6 max-w-3xl pb-8 text-center text-xs leading-5 text-slate-400">
              OncoCare+ nutrition guidance is informational and personalized
              from available data. It does not replace advice from your oncology
              or nutrition care team.
            </p>
          </>
        )}

        {changeMealOpen && plan && (
          <ChangeMealSheet
            plan={plan}
            selectedMealTypes={
              selectedMealTypes
            }
            replacementReason={
              replacementReason
            }
            replacementStatuses={
              replacementStatuses
            }
            loading={
              replacementLoading
            }
            error={
              replacementError
            }
            onToggleMeal={
              toggleMealSelection
            }
            onReasonChange={
              (reason) => {
                setReplacementReason(
                  reason,
                );
                setReplacementError(
                  "",
                );
              }
            }
            onCancel={() => {
              setChangeMealOpen(false);
              setReplacementError("");
            }}
            onGenerate={() =>
              void handleReplacement(
                false,
              )
            }
            onRetry={() =>
              void handleReplacement(
                true,
              )
            }
            onViewDetails={(meal) => {
              setChangeMealOpen(
                false,
              );
              setActiveMeal(
                meal,
              );
            }}
          />
        )}

        {activeMeal && (
          <MealDetailsSheet
            meal={activeMeal}
            onClose={() =>
              setActiveMeal(null)
            }
            onChangeMeal={() => {
              const mealType =
                activeMeal.mealType;

              setActiveMeal(null);
              startChangeMeal(
                mealType,
              );
            }}
          />
        )}

      </div>
    </main>
  );
}

function ChangeMealSheet({
  plan,
  selectedMealTypes,
  replacementReason,
  replacementStatuses,
  loading,
  error,
  onToggleMeal,
  onReasonChange,
  onCancel,
  onGenerate,
  onRetry,
  onViewDetails,
}: {
  plan: DietPlan;
  selectedMealTypes: MealType[];
  replacementReason?: BatchReplacementReason;
  replacementStatuses: MealReplacementStatus[];
  loading: boolean;
  error: string;
  onToggleMeal: (
    mealType: MealType,
  ) => void;
  onReasonChange: (
    reason: BatchReplacementReason | undefined,
  ) => void;
  onCancel: () => void;
  onGenerate: () => void;
  onRetry: () => void;
  onViewDetails: (
    meal: MealPlanItem,
  ) => void;
}) {
  const selectedCount =
    selectedMealTypes.length;

  const allAvailableMeals =
    plan.meals.every(
      (meal) =>
        mealTypeAvailable(
          replacementStatuses,
          meal.mealType,
        )?.available !== false,
    );

  function toggleAll() {
    if (!allAvailableMeals) {
      return;
    }

    if (
      selectedCount ===
      plan.meals.length
    ) {
      plan.meals.forEach((meal) => {
        if (
          selectedMealTypes.includes(
            meal.mealType,
          )
        ) {
          onToggleMeal(
            meal.mealType,
          );
        }
      });
      return;
    }

    plan.meals.forEach((meal) => {
      if (
        !selectedMealTypes.includes(
          meal.mealType,
        ) &&
        mealTypeAvailable(
          replacementStatuses,
          meal.mealType,
        )?.available !== false
      ) {
        onToggleMeal(
          meal.mealType,
        );
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="presentation"
    >
      <div
        className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-slate-200 bg-white shadow-2xl sm:rounded-[28px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-meal-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
          <div>
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
            <h2
              id="change-meal-title"
              className="text-xl font-semibold tracking-tight text-slate-950"
            >
              Change today&apos;s meal(s)
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Select one or more meals you&apos;d like to replace.
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Close change meal"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-400">
              Choose meals
            </p>

            <button
              type="button"
              onClick={toggleAll}
              disabled={!allAvailableMeals}
              className="text-xs font-semibold text-[#167772] disabled:cursor-not-allowed disabled:text-slate-300"
            >
              {selectedCount ===
              plan.meals.length
                ? "Clear selection"
                : "Select all available"}
            </button>
          </div>

          <div className="space-y-2">
            {sortMeals(
              plan.meals,
            ).map(
              (meal) => {
                const status =
                  mealTypeAvailable(
                    replacementStatuses,
                    meal.mealType,
                  );

                const unavailable =
                  status &&
                  !status.available;

                const selected =
                  selectedMealTypes.includes(
                    meal.mealType,
                  );

                return (
                  <div
                    key={meal.mealType}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition ${
                      selected
                        ? "border-[#a6dcd5] bg-[#eff9f7]"
                        : "border-slate-200 bg-white"
                    } ${
                      unavailable
                        ? "opacity-55"
                        : ""
                    }`}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={
                        selected
                      }
                      aria-label={`Select ${MEAL_LABELS[meal.mealType]}`}
                      disabled={
                        unavailable ||
                        loading
                      }
                      onClick={() =>
                        onToggleMeal(
                          meal.mealType,
                        )
                      }
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#d8eeeb] ${
                        selected
                          ? "border-[#167772] bg-[#167772] text-white"
                          : "border-slate-300 bg-white"
                      } disabled:cursor-not-allowed`}
                    >
                      {selected && (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={
                        unavailable ||
                        loading
                      }
                      onClick={() =>
                        onToggleMeal(
                          meal.mealType,
                        )
                      }
                      className="min-w-0 flex-1 text-left focus:outline-none"
                    >
                      <span className="block text-sm font-semibold text-slate-800">
                        <span className="mr-2">
                          {(() => {
                            const MealIcon = MEAL_ICONS[meal.mealType];
                            return <MealIcon className="mr-2 inline-block h-4 w-4 text-[#167772]" strokeWidth={1.8} aria-hidden="true" />;
                          })()}
                        </span>
                        {
                          MEAL_LABELS[
                            meal.mealType
                          ]
                        }
                      </span>

                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {meal.name}
                      </span>
                    </button>

                    {unavailable ? (
                      <span className="text-[11px] font-medium text-slate-400">
                        Already updated today
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onViewDetails(
                            meal,
                          )
                        }
                        className="hidden items-center gap-1 text-xs font-semibold text-[#167772] sm:inline-flex"
                      >
                        Details
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              },
            )}
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Why would you like a different option?
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Optional â€” one reason applies to all selected meals.
                </p>
              </div>
              {replacementReason && (
                <button
                  type="button"
                  onClick={() =>
                    onReasonChange(
                      undefined,
                    )
                  }
                  className="text-xs font-semibold text-slate-400 hover:text-slate-600"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {BATCH_REPLACEMENT_REASONS.map(
                (item) => {
                  const active =
                    replacementReason ===
                    item.value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      disabled={loading}
                      onClick={() =>
                        onReasonChange(
                          item.value,
                        )
                      }
                      className={`cursor-pointer rounded-full border px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#d8eeeb] ${
                        active
                          ? "border-[#8bcfc7] bg-[#e7f7f4] text-[#166e69]"
                          : "border-slate-200 bg-white text-slate-600 hover:border-[#c3e4df] hover:bg-[#f7fcfb]"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {item.label}
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {error && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-red-900">
                    We couldn&apos;t update those meals.
                  </p>
                  <p className="mt-1 text-sm leading-5 text-red-800">
                    {error}
                  </p>

                  <button
                    type="button"
                    onClick={onRetry}
                    disabled={loading}
                    className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-xl border border-red-200 bg-white px-3.5 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onGenerate}
            disabled={
              loading ||
              selectedCount === 0
            }
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#167772] px-5 text-sm font-semibold text-white transition hover:bg-[#125f5b] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {loading
              ? "Generating..."
              : "Generate replacement"}
          </button>
        </div>

        <div className="border-t border-slate-100 bg-[#f8fcfb] px-5 py-3.5 text-xs leading-5 text-slate-500 sm:px-6">
          <div className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#167772]" />
            <span>
              We&apos;ll suggest nutritious alternatives based on your preferences
              and current health context.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MealDetailsSheet({
  meal,
  onClose,
  onChangeMeal,
}: {
  meal: MealPlanItem;
  onClose: () => void;
  onChangeMeal: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px]"
      role="presentation"
    >
      <div
        className="absolute inset-y-0 right-0 flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="meal-detail-title"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to today&apos;s meals
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close meal details"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-6 sm:px-6">
          <MealVisual
            mealType={meal.mealType}
          />

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#167772]">
              {MEAL_LABELS[
                meal.mealType
              ]}
            </p>

            <h2
              id="meal-detail-title"
              className="mt-1 text-2xl font-semibold tracking-tight text-slate-950"
            >
              {meal.name}
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              {meal.description}
            </p>
          </div>

          {meal.whyThisMeal && (
            <section className="mt-6 rounded-[22px] border border-[#d7ecea] bg-[#f1faf8] p-5">
              <div className="flex items-start gap-3">
                <Leaf className="mt-0.5 h-5 w-5 shrink-0 text-[#167772]" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Why this fits you
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {meal.whyThisMeal}
                  </p>
                </div>
              </div>
            </section>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {meal.portionGuidance && (
              <section className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Portion guidance
                </p>
                <p className="mt-2 text-sm leading-5 text-slate-700">
                  {meal.portionGuidance}
                </p>
              </section>
            )}

            {typeof meal.estimatedPrepMinutes ===
              "number" && (
              <section className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Prep time
                </p>
                <p className="mt-2 text-sm leading-5 text-slate-700">
                  About{" "}
                  {
                    meal.estimatedPrepMinutes
                  }{" "}
                  minutes
                </p>
              </section>
            )}
          </div>

          <DetailSection
            title="Ingredients"
            icon={
              <Utensils className="h-5 w-5" />
            }
          >
            <div className="flex flex-wrap gap-2">
              {meal.ingredients.map(
                (ingredient) => (
                  <span
                    key={ingredient}
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
                <BookOpen className="h-5 w-5" />
              }
            >
              <p className="text-sm leading-6 text-slate-600">
                {meal.preparationNotes}
              </p>
            </DetailSection>
          )}

          {meal.nutritionNotes &&
            meal.nutritionNotes.length >
              0 && (
              <DetailSection
                title="Nutrition notes"
                icon={
                  <Sparkles className="h-5 w-5" />
                }
              >
                <ul className="space-y-2">
                  {meal.nutritionNotes.map(
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
              </DetailSection>
            )}

          {meal.safetyNotes &&
            meal.safetyNotes.length >
              0 && (
              <section className="mt-6 rounded-[22px] border border-amber-200 bg-amber-50 p-5">
                <div className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div>
                    <h3 className="text-sm font-semibold text-amber-950">
                      Safety notes
                    </h3>
                    <ul className="mt-2 space-y-1.5 text-sm leading-6 text-amber-900">
                      {meal.safetyNotes.map(
                        (note) => (
                          <li
                            key={note}
                          >
                            {note}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                </div>
              </section>
            )}

          <button
            type="button"
            onClick={onChangeMeal}
            className="mt-7 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#167772] px-5 text-sm font-semibold text-white hover:bg-[#125f5b]"
          >
            Change this meal
            <RefreshCw className="h-4 w-4" />
          </button>

          <p className="mt-4 pb-6 text-center text-xs leading-5 text-slate-400">
            Nutrition support is informational and does not replace advice
            from your oncology or nutrition care team.
          </p>
        </div>
      </div>
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
    <section className="mt-6 border-t border-slate-100 pt-5">
      <div className="flex items-center gap-2 text-[#167772]">
        {icon}
        <h3 className="text-sm font-semibold text-slate-900">
          {title}
        </h3>
      </div>
      <div className="mt-3">
        {children}
      </div>
    </section>
  );
}
