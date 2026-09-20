"use client";

import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  History,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { dietFetch } from "@/lib/diet-client";

import type {
  DietJourneyEntry,
  DietWeeklyOverview,
} from "@/types/diet-experience";

interface PatternsResponse {
  success?: boolean;
  data?: {
    overview: DietWeeklyOverview;
    journey: DietJourneyEntry[];
  };
  error?: string;
}

function formatJourneyDate(
  value: string,
): string {
  const date = new Date(
    `${value}T00:00:00`,
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  );
}

function sentimentLabel(
  value: DietJourneyEntry["feedbackSentiment"],
): string {
  switch (value) {
    case "positive":
      return "ðŸ™‚ Felt good";
    case "neutral":
      return "ðŸ˜ Felt okay";
    case "negative":
      return "ðŸ™ Didn't feel great";
    default:
      return "No check-in yet";
  }
}

export default function DietPatternsPage() {
  const [data, setData] = useState<PatternsResponse["data"]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadPatterns() {
    setLoading(true);
    setError("");

    try {
      const response = await dietFetch(
        "/api/diet-plan/patterns?days=14",
        {
          cache: "no-store",
        },
      );

      const result =
        (await response.json()) as PatternsResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.data
      ) {
        throw new Error(
          result.error ??
            "Unable to load your nutrition journey.",
        );
      }

      setData(result.data);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load your nutrition journey.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPatterns();
  }, []);

  return (
    <main className="min-h-screen bg-[#f7fbfb] px-5 py-8 text-[#1f2937] sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-7 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <a
              href="/dashboard/diet-plan"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl text-sm font-semibold text-[#167772]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to today&apos;s plan
            </a>

            <div className="mt-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf7f5] text-[#167772]">
                <History className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Your nutrition journey
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
                  A look back at the last 14 days
                </h1>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              void loadPatterns()
            }
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition motion-reduce:transition-none hover:border-[#b8ddda] hover:text-[#167772] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={
                loading
                  ? "h-4 w-4 animate-spin motion-reduce:animate-none"
                  : "h-4 w-4"
              }
            />
            Refresh
          </button>
        </header>

        {loading ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-28 animate-pulse rounded-3xl bg-white motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : error ? (
          <div className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-6 text-sm leading-6 text-red-800">
            {error}
          </div>
        ) : data ? (
          <>
            <section className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Plans available
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">
                  {data.overview.plansAvailable}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  saved in this period
                </p>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Daily check-ins
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">
                  {data.overview.positiveFeedbackCount +
                    data.overview.neutralFeedbackCount +
                    data.overview.negativeFeedbackCount}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  recorded during this period
                </p>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Meal swaps
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">
                  {data.overview.replacementCount}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  recorded during this period
                </p>
              </div>
            </section>

            {data.overview.notablePatterns.length > 0 && (
              <section className="mt-6 rounded-3xl border border-[#d7ecea] bg-[#eef8f7] p-6 sm:p-7">
                <h2 className="text-lg font-semibold text-slate-900">
                  A few patterns from what you recorded
                </h2>

                <div className="mt-4 space-y-3">
                  {data.overview.notablePatterns.map(
                    (pattern) => (
                      <div
                        key={pattern}
                        className="flex gap-3 text-sm leading-6 text-slate-700"
                      >
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#167772]" />
                        <span>{pattern}</span>
                      </div>
                    ),
                  )}
                </div>
              </section>
            )}

            <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-[#167772]" />
                <h2 className="text-xl font-semibold">
                  Your day-by-day rhythm
                </h2>
              </div>

              <p className="mt-1 text-sm text-slate-500">
                This reflects what was actually recorded. A blank day simply means there isn&apos;t enough data to say more.
              </p>

              <div className="mt-6 space-y-4">
                {data.journey.map((entry) => (
                  <article
                    key={entry.date}
                    className="relative border-l-2 border-slate-100 pl-5"
                  >
                    <div className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-[#1f8f8a]" />

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {formatJourneyDate(
                            entry.date,
                          )}
                        </p>

                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {entry.summary ??
                            "No saved meal plan for this day."}
                        </p>
                      </div>

                      <div className="shrink-0 space-y-1 text-xs text-slate-500 sm:text-right">
                        <p>
                          {sentimentLabel(
                            entry.feedbackSentiment,
                          )}
                        </p>

                        {entry.mealReplacements > 0 && (
                          <p>
                            {entry.mealReplacements} meal swap
                            {entry.mealReplacements === 1
                              ? ""
                              : "s"}
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}

        <p className="mt-8 pb-8 text-center text-xs leading-5 text-slate-400">
          Your nutrition journey reflects recorded plans and feedback. It does not diagnose symptoms or replace clinical review.
        </p>
      </div>
    </main>
  );
}
