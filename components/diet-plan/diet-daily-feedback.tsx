"use client";

import {
  CheckCircle2,
  Loader2,
  MessageCircleHeart,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";
import { dietFetch } from "@/lib/diet-client";

import type {
  MealFeedbackSentiment,
} from "@/types/diet-experience";

interface DietDailyFeedbackProps {
  planDate: string;
  existingSentiment?: MealFeedbackSentiment | null;
}

const OPTIONS: Array<{
  sentiment: MealFeedbackSentiment;
  emoji: string;
  label: string;
}> = [
  {
    sentiment: "positive",
    emoji: "ðŸ™‚",
    label: "Pretty good",
  },
  {
    sentiment: "neutral",
    emoji: "ðŸ˜",
    label: "It was okay",
  },
  {
    sentiment: "negative",
    emoji: "ðŸ™",
    label: "Not great",
  },
];

export default function DietDailyFeedback({
  planDate,
  existingSentiment = null,
}: DietDailyFeedbackProps) {
  const [selected, setSelected] =
    useState<MealFeedbackSentiment | null>(
      existingSentiment ?? null,
    );

  const [note, setNote] = useState("");
  const [saving, setSaving] =
    useState(false);
  const [saved, setSaved] = useState(
    Boolean(existingSentiment),
  );
  const [loading, setLoading] = useState(
    !existingSentiment,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (existingSentiment) {
      return;
    }

    let cancelled = false;

    async function loadExistingFeedback() {
      try {
        const response = await dietFetch(
          `/api/diet-feedback?date=${encodeURIComponent(
            planDate,
          )}`,
          {
            cache: "no-store",
          },
        );

        const result =
          (await response.json()) as {
            success?: boolean;
            data?: {
              sentiment?: MealFeedbackSentiment;
              note?: string;
            } | null;
          };

        if (
          !cancelled &&
          response.ok &&
          result.success &&
          result.data?.sentiment
        ) {
          setSelected(
            result.data.sentiment,
          );
          setNote(
            result.data.note ?? "",
          );
          setSaved(true);
        }
      } catch {
        // Feedback is optional and must never block the plan.
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadExistingFeedback();

    return () => {
      cancelled = true;
    };
  }, [
    existingSentiment,
    planDate,
  ]);

  async function submitFeedback(
    sentiment: MealFeedbackSentiment,
    feedbackNote?: string,
  ) {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const response = await dietFetch(
        "/api/diet-feedback",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            planDate,
            mealType: "daily",
            sentiment,
            note:
              feedbackNote?.trim() ||
              undefined,
          }),
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
        };

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Unable to save feedback.",
        );
      }

      setSelected(sentiment);
      setSaved(true);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save feedback right now.",
      );
    } finally {
      setSaving(false);
    }
  }

  function selectSentiment(
    sentiment: MealFeedbackSentiment,
  ) {
    setError("");

    if (sentiment === "negative") {
      setSelected("negative");
      setSaved(false);
      return;
    }

    void submitFeedback(
      sentiment,
    );
  }

  if (loading) {
    return (
      <section className="mt-8 rounded-3xl border border-[#d7ecea] bg-white p-6 shadow-sm sm:p-7">
        <div className="h-5 w-44 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
        <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map(
            (item) => (
              <div
                key={item}
                className="h-16 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none"
              />
            ),
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-3xl border border-[#d7ecea] bg-white p-6 shadow-sm sm:p-7">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eaf7f5] text-[#167772]">
          <MessageCircleHeart className="h-5 w-5" />
        </div>

        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            How did today feel?
          </h2>

          <p className="mt-1 text-sm leading-6 text-slate-500">
            A quick check-in helps future plans better reflect your experience.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {OPTIONS.map(
          (option) => {
            const active =
              selected ===
              option.sentiment;

            return (
              <button
                key={option.sentiment}
                type="button"
                onClick={() =>
                  selectSentiment(
                    option.sentiment,
                  )
                }
                disabled={saving}
                aria-pressed={active}
                className={`min-h-16 rounded-2xl border px-4 py-3 text-left transition motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 ${
                  active
                    ? "border-[#8ccfc9] bg-[#eef8f7]"
                    : "border-slate-200 bg-white hover:border-[#b8ddda]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="text-2xl"
                    aria-hidden="true"
                  >
                    {option.emoji}
                  </span>

                  <span className="text-sm font-semibold text-slate-800">
                    {option.label}
                  </span>
                </div>
              </button>
            );
          },
        )}
      </div>

      {selected === "negative" && (
        <div className="mt-5 rounded-2xl bg-[#f7fbfb] p-4">
          <label
            htmlFor="daily-feedback-note"
            className="text-sm font-semibold text-slate-800"
          >
            Anything I should know for tomorrow?
            <span className="ml-1 font-normal text-slate-400">
              Optional
            </span>
          </label>

          <textarea
            id="daily-feedback-note"
            value={note}
            onChange={(event) =>
              setNote(
                event.target.value.slice(
                  0,
                  500,
                ),
              )
            }
            placeholder="For example: lunch felt too heavy, or I didn't enjoy the texture."
            className="mt-2 min-h-24 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-[#8ccfc9] focus:ring-4 focus:ring-[#eaf7f5] motion-reduce:transition-none"
            maxLength={500}
            disabled={saving}
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] leading-5 text-slate-400">
              Your note is used as personalization feedback, not as a diagnosis.
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  void submitFeedback(
                    "negative",
                    note,
                  )
                }
                disabled={saving}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1f8f8a] px-4 py-2.5 text-xs font-semibold text-white transition motion-reduce:transition-none hover:bg-[#167772] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    Saving
                  </>
                ) : (
                  "Save feedback"
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  void submitFeedback(
                    "negative",
                  )
                }
                disabled={saving}
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition motion-reduce:transition-none hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Skip note
              </button>
            </div>
          </div>
        </div>
      )}

      {saved && (
        <div
          className="mt-4 flex items-center gap-2 text-xs font-semibold text-[#167772]"
          role="status"
        >
          <CheckCircle2 className="h-4 w-4" />
          Got it. We&apos;ll use this as feedback for future planning.
        </div>
      )}

      {error && (
        <p
          className="mt-4 text-xs font-medium text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}
    </section>
  );
}
