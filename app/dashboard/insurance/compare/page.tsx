"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";

type InsurancePlan = {
  id: string;
  name: string;
  provider_id: string;
  coverage_amount: number;
  waiting_period_months: number;
  estimated_premium: number;
  cancer_coverage: boolean;
  hospital_network_size: number;
  benefits: string[] | null;
};

type InsuranceProvider = {
  id: string;
  name: string;
  description: string | null;
};

type PlanWithProvider = InsurancePlan & {
  provider?: InsuranceProvider;
};

export default function InsuranceComparePage() {
  const [plans, setPlans] = useState<PlanWithProvider[]>([]);

  const [selectedPlanOne, setSelectedPlanOne] =
    useState("");

  const [selectedPlanTwo, setSelectedPlanTwo] =
    useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ============================================================
  // READ PLAN FROM URL
  // ============================================================

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search
    );

    const planFromUrl = params.get("plan");

    if (planFromUrl) {
      setSelectedPlanOne(planFromUrl);
    }
  }, []);

  // ============================================================
  // LOAD INSURANCE PLANS
  // ============================================================

  useEffect(() => {
    const loadPlans = async () => {
      setLoading(true);
      setError("");

      const {
        data: plansData,
        error: plansError,
      } = await supabase
        .from("insurance_plans")
        .select(
          "id, name, provider_id, coverage_amount, waiting_period_months, estimated_premium, cancer_coverage, hospital_network_size, benefits"
        )
        .eq("is_active", true)
        .eq("cancer_coverage", true)
        .order("coverage_amount", {
          ascending: false,
        });

      if (plansError) {
        console.error(
          "Comparison plans error:",
          plansError
        );

        setError(
          "Unable to load insurance plans."
        );

        setLoading(false);
        return;
      }

      if (!plansData || plansData.length === 0) {
        setPlans([]);
        setLoading(false);
        return;
      }

      // ========================================================
      // LOAD PROVIDERS
      // ========================================================

      const providerIds = Array.from(
        new Set(
          plansData.map(
            (plan) => plan.provider_id
          )
        )
      );

      const {
        data: providersData,
        error: providersError,
      } = await supabase
        .from("insurance_providers")
        .select(
          "id, name, description"
        )
        .in("id", providerIds);

      if (providersError) {
        console.error(
          "Comparison providers error:",
          providersError
        );

        setError(
          "Unable to load insurance provider information."
        );

        setLoading(false);
        return;
      }

      // ========================================================
      // CREATE PROVIDER MAP
      // ========================================================

      const providerMap = new Map(
        (providersData || []).map(
          (provider) => [
            provider.id,
            provider,
          ]
        )
      );

      // ========================================================
      // COMBINE PLANS + PROVIDERS
      // ========================================================

      const combinedPlans: PlanWithProvider[] =
        plansData.map((plan) => ({
          ...plan,
          provider:
            providerMap.get(
              plan.provider_id
            ),
        }));

      setPlans(combinedPlans);

      setLoading(false);
    };

    loadPlans();
  }, []);

  // ============================================================
  // SELECTED PLANS
  // ============================================================

  const planOne = plans.find(
    (plan) =>
      plan.id === selectedPlanOne
  );

  const planTwo = plans.find(
    (plan) =>
      plan.id === selectedPlanTwo
  );

  // ============================================================
  // FORMATTERS
  // ============================================================

  const formatCoverage = (
    amount: number
  ) => {
    return `₹${amount}L`;
  };

  const formatPremium = (
    amount: number
  ) => {
    return `₹${amount.toLocaleString(
      "en-IN"
    )}`;
  };

  // ============================================================
  // COMPARISON WINNERS
  // ============================================================

  const getCoverageWinner = () => {
    if (!planOne || !planTwo) {
      return null;
    }

    if (
      planOne.coverage_amount >
      planTwo.coverage_amount
    ) {
      return "one";
    }

    if (
      planTwo.coverage_amount >
      planOne.coverage_amount
    ) {
      return "two";
    }

    return "tie";
  };

  const getPremiumWinner = () => {
    if (!planOne || !planTwo) {
      return null;
    }

    if (
      planOne.estimated_premium <
      planTwo.estimated_premium
    ) {
      return "one";
    }

    if (
      planTwo.estimated_premium <
      planOne.estimated_premium
    ) {
      return "two";
    }

    return "tie";
  };

  const getWaitingWinner = () => {
    if (!planOne || !planTwo) {
      return null;
    }

    if (
      planOne.waiting_period_months <
      planTwo.waiting_period_months
    ) {
      return "one";
    }

    if (
      planTwo.waiting_period_months <
      planOne.waiting_period_months
    ) {
      return "two";
    }

    return "tie";
  };

  const getHospitalWinner = () => {
    if (!planOne || !planTwo) {
      return null;
    }

    if (
      planOne.hospital_network_size >
      planTwo.hospital_network_size
    ) {
      return "one";
    }

    if (
      planTwo.hospital_network_size >
      planOne.hospital_network_size
    ) {
      return "two";
    }

    return "tie";
  };

  const coverageWinner =
    getCoverageWinner();

  const premiumWinner =
    getPremiumWinner();

  const waitingWinner =
    getWaitingWinner();

  const hospitalWinner =
    getHospitalWinner();

  // ============================================================
  // CALCULATE COMPARISON SCORE
  // ============================================================

  const getScore = (
    plan: PlanWithProvider
  ) => {
    let score = 0;

    // Coverage
    if (
      coverageWinner === "one" &&
      plan.id === planOne?.id
    ) {
      score++;
    }

    if (
      coverageWinner === "two" &&
      plan.id === planTwo?.id
    ) {
      score++;
    }

    // Premium
    if (
      premiumWinner === "one" &&
      plan.id === planOne?.id
    ) {
      score++;
    }

    if (
      premiumWinner === "two" &&
      plan.id === planTwo?.id
    ) {
      score++;
    }

    // Waiting period
    if (
      waitingWinner === "one" &&
      plan.id === planOne?.id
    ) {
      score++;
    }

    if (
      waitingWinner === "two" &&
      plan.id === planTwo?.id
    ) {
      score++;
    }

    // Hospital network
    if (
      hospitalWinner === "one" &&
      plan.id === planOne?.id
    ) {
      score++;
    }

    if (
      hospitalWinner === "two" &&
      plan.id === planTwo?.id
    ) {
      score++;
    }

    // Cancer coverage
    if (plan.cancer_coverage) {
      score++;
    }

    return score;
  };

  // ============================================================
  // RECOMMENDED PLAN
  // ============================================================

  let recommendedPlan:
    | PlanWithProvider
    | null = null;

  let recommendationReason = "";

  if (planOne && planTwo) {
    const scoreOne =
      getScore(planOne);

    const scoreTwo =
      getScore(planTwo);

    if (scoreOne > scoreTwo) {
      recommendedPlan = planOne;
    } else if (scoreTwo > scoreOne) {
      recommendedPlan = planTwo;
    } else {
      // If scores are tied, use coverage as tie-breaker.
      if (
        planOne.coverage_amount >
        planTwo.coverage_amount
      ) {
        recommendedPlan = planOne;
      } else if (
        planTwo.coverage_amount >
        planOne.coverage_amount
      ) {
        recommendedPlan = planTwo;
      } else {
        // Final tie-breaker: lower premium
        if (
          planOne.estimated_premium <=
          planTwo.estimated_premium
        ) {
          recommendedPlan = planOne;
        } else {
          recommendedPlan = planTwo;
        }
      }
    }

    if (recommendedPlan) {
      const reasons: string[] = [];

      if (
        recommendedPlan.id ===
        planOne.id
      ) {
        if (coverageWinner === "one") {
          reasons.push(
            "higher coverage"
          );
        }

        if (premiumWinner === "one") {
          reasons.push(
            "lower estimated premium"
          );
        }

        if (waitingWinner === "one") {
          reasons.push(
            "shorter waiting period"
          );
        }

        if (hospitalWinner === "one") {
          reasons.push(
            "larger hospital network"
          );
        }
      }

      if (
        recommendedPlan.id ===
        planTwo.id
      ) {
        if (coverageWinner === "two") {
          reasons.push(
            "higher coverage"
          );
        }

        if (premiumWinner === "two") {
          reasons.push(
            "lower estimated premium"
          );
        }

        if (waitingWinner === "two") {
          reasons.push(
            "shorter waiting period"
          );
        }

        if (hospitalWinner === "two") {
          reasons.push(
            "larger hospital network"
          );
        }
      }

      if (
        reasons.length === 0
      ) {
        recommendationReason =
          "This plan provides the strongest overall balance based on the available comparison data.";
      } else if (
        reasons.length === 1
      ) {
        recommendationReason =
          `This plan stands out because it offers ${reasons[0]}.`;
      } else {
        recommendationReason =
          `This plan stands out because it offers ${reasons
            .slice(0, -1)
            .join(
              ", "
            )}, and ${reasons[reasons.length - 1]}.`;
      }
    }
  }

  // ============================================================
  // LOADING STATE
  // ============================================================

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F5F7FA] px-6 py-10">
        <div className="mx-auto max-w-6xl">

          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-12 text-center shadow-sm">

            <p className="text-sm text-[#64748B]">
              Loading insurance plans...
            </p>

          </div>

        </div>
      </main>
    );
  }

  // ============================================================
  // ERROR STATE
  // ============================================================

  if (error) {
    return (
      <main className="min-h-screen bg-[#F5F7FA] px-6 py-10">

        <div className="mx-auto max-w-6xl">

          <Link
            href="/dashboard/insurance"
            className="mb-6 inline-flex text-sm font-medium text-[#0F766E] hover:underline"
          >
            ← Back to Insurance
          </Link>

          <div className="rounded-2xl border border-red-200 bg-white p-10 text-center shadow-sm">

            <h1 className="text-xl font-bold text-[#1F2937]">
              Unable to Compare Plans
            </h1>

            <p className="mt-2 text-sm text-red-600">
              {error}
            </p>

          </div>

        </div>

      </main>
    );
  }

  // ============================================================
  // MAIN PAGE
  // ============================================================

  return (
    <main className="min-h-screen bg-[#F5F7FA] px-6 py-10 text-[#1F2937]">

      <div className="mx-auto max-w-6xl">

        {/* ====================================================== */}
        {/* HEADER */}
        {/* ====================================================== */}

        <div className="mb-8">

          <Link
            href="/dashboard/insurance"
            className="mb-5 inline-flex text-sm font-medium text-[#0F766E] hover:underline"
          >
            ← Back to Insurance
          </Link>

          <p className="text-sm font-medium text-[#0F766E]">
            Insurance Support
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            Compare Insurance Plans
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748B]">
            Select two plans to compare their
            coverage, premium, waiting period,
            hospital network, cancer coverage,
            and benefits.
          </p>

        </div>

        {/* ====================================================== */}
        {/* PLAN SELECTORS */}
        {/* ====================================================== */}

        <section className="mb-8 grid gap-5 md:grid-cols-2">

          {/* PLAN 1 */}

          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#0F766E]">
              Plan 1
            </p>

            <select
              value={selectedPlanOne}
              onChange={(event) =>
                setSelectedPlanOne(
                  event.target.value
                )
              }
              className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm outline-none transition focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
            >

              <option value="">
                Select first plan
              </option>

              {plans.map((plan) => (
                <option
                  key={plan.id}
                  value={plan.id}
                  disabled={
                    plan.id ===
                    selectedPlanTwo
                  }
                >
                  {plan.provider?.name ||
                    "Provider"}{" "}
                  — {plan.name}
                </option>
              ))}

            </select>

          </div>

          {/* PLAN 2 */}

          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#0F766E]">
              Plan 2
            </p>

            <select
              value={selectedPlanTwo}
              onChange={(event) =>
                setSelectedPlanTwo(
                  event.target.value
                )
              }
              className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm outline-none transition focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
            >

              <option value="">
                Select second plan
              </option>

              {plans.map((plan) => (
                <option
                  key={plan.id}
                  value={plan.id}
                  disabled={
                    plan.id ===
                    selectedPlanOne
                  }
                >
                  {plan.provider?.name ||
                    "Provider"}{" "}
                  — {plan.name}
                </option>
              ))}

            </select>

          </div>

        </section>

        {/* ====================================================== */}
        {/* FINAL RECOMMENDATION */}
        {/* ====================================================== */}

        {planOne &&
          planTwo &&
          recommendedPlan && (

            <section className="mb-8 overflow-hidden rounded-2xl border border-[#2EC4B6] bg-white shadow-sm">

              <div className="bg-[#E8F8F6] p-7">

                <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">

                  <div className="flex-1">

                    <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#0F766E] shadow-sm">

                      <span className="text-base">
                        ✓
                      </span>

                      Recommended for You

                    </div>

                    <h2 className="text-2xl font-bold text-[#1F2937]">
                      {recommendedPlan.name}
                    </h2>

                    <p className="mt-1 text-sm font-medium text-[#0F766E]">
                      {recommendedPlan.provider?.name ||
                        "Insurance Provider"}
                    </p>

                    <p className="mt-4 max-w-2xl text-sm leading-6 text-[#64748B]">
                      {recommendationReason}
                    </p>

                  </div>

                  <Link
                    href={`/dashboard/insurance/${recommendedPlan.id}`}
                    className="inline-flex shrink-0 justify-center rounded-xl bg-[#0F766E] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#095C57]"
                  >
                    View Recommended Plan
                  </Link>

                </div>

              </div>

              {/* KEY METRICS */}

              <div className="grid gap-px border-t border-[#D5EEEA] bg-[#E5E7EB] md:grid-cols-4">

                <div className="bg-white p-5">

                  <p className="text-xs text-[#64748B]">
                    Coverage
                  </p>

                  <p className="mt-1 text-lg font-bold text-[#1F2937]">
                    {formatCoverage(
                      recommendedPlan.coverage_amount
                    )}
                  </p>

                </div>

                <div className="bg-white p-5">

                  <p className="text-xs text-[#64748B]">
                    Estimated Premium
                  </p>

                  <p className="mt-1 text-lg font-bold text-[#1F2937]">
                    {formatPremium(
                      recommendedPlan.estimated_premium
                    )}
                  </p>

                </div>

                <div className="bg-white p-5">

                  <p className="text-xs text-[#64748B]">
                    Waiting Period
                  </p>

                  <p className="mt-1 text-lg font-bold text-[#1F2937]">
                    {
                      recommendedPlan.waiting_period_months
                    }{" "}
                    months
                  </p>

                </div>

                <div className="bg-white p-5">

                  <p className="text-xs text-[#64748B]">
                    Hospital Network
                  </p>

                  <p className="mt-1 text-lg font-bold text-[#1F2937]">
                    {
                      recommendedPlan.hospital_network_size
                    }+
                  </p>

                </div>

              </div>

              {/* DISCLAIMER */}

              <div className="border-t border-[#E5E7EB] bg-white px-7 py-4">

                <p className="text-xs leading-5 text-[#64748B]">
                  This recommendation is based on the
                  comparison criteria available in
                  OncoCare+. It is intended for
                  informational purposes only and should
                  not replace advice from a qualified
                  insurance advisor or the insurance
                  provider.
                </p>

              </div>

            </section>

          )}

        {/* ====================================================== */}
        {/* PLAN COMPARISON */}
        {/* ====================================================== */}

        {planOne && planTwo ? (

          <section className="mb-8 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">

            <div className="border-b border-[#E5E7EB] p-6">

              <h2 className="text-xl font-bold">
                Plan Comparison
              </h2>

              <p className="mt-1 text-sm text-[#64748B]">
                Compare the selected plans side by side.
              </p>

            </div>

            {/* PLAN HEADERS */}

            <div className="grid grid-cols-3 border-b border-[#E5E7EB]">

              <div className="p-5">

                <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                  Feature
                </p>

              </div>

              <div className="border-l border-[#E5E7EB] p-5">

                <p className="text-xs font-medium text-[#0F766E]">
                  {planOne.provider?.name ||
                    "Provider"}
                </p>

                <h3 className="mt-1 font-bold">
                  {planOne.name}
                </h3>

              </div>

              <div className="border-l border-[#E5E7EB] p-5">

                <p className="text-xs font-medium text-[#0F766E]">
                  {planTwo.provider?.name ||
                    "Provider"}
                </p>

                <h3 className="mt-1 font-bold">
                  {planTwo.name}
                </h3>

              </div>

            </div>

            {/* COVERAGE */}

            <div className="grid grid-cols-3 border-b border-[#E5E7EB]">

              <div className="p-5 text-sm font-medium">
                Coverage
              </div>

              <div
                className={`border-l border-[#E5E7EB] p-5 text-sm ${
                  coverageWinner === "one"
                    ? "bg-[#E8F8F6] font-bold text-[#0F766E]"
                    : ""
                }`}
              >

                {formatCoverage(
                  planOne.coverage_amount
                )}

                {coverageWinner === "one" && (
                  <span className="ml-2 text-xs">
                    Better
                  </span>
                )}

              </div>

              <div
                className={`border-l border-[#E5E7EB] p-5 text-sm ${
                  coverageWinner === "two"
                    ? "bg-[#E8F8F6] font-bold text-[#0F766E]"
                    : ""
                }`}
              >

                {formatCoverage(
                  planTwo.coverage_amount
                )}

                {coverageWinner === "two" && (
                  <span className="ml-2 text-xs">
                    Better
                  </span>
                )}

              </div>

            </div>

            {/* PREMIUM */}

            <div className="grid grid-cols-3 border-b border-[#E5E7EB]">

              <div className="p-5 text-sm font-medium">
                Estimated Premium
              </div>

              <div
                className={`border-l border-[#E5E7EB] p-5 text-sm ${
                  premiumWinner === "one"
                    ? "bg-[#E8F8F6] font-bold text-[#0F766E]"
                    : ""
                }`}
              >

                {formatPremium(
                  planOne.estimated_premium
                )}

                {premiumWinner === "one" && (
                  <span className="ml-2 text-xs">
                    Lower
                  </span>
                )}

              </div>

              <div
                className={`border-l border-[#E5E7EB] p-5 text-sm ${
                  premiumWinner === "two"
                    ? "bg-[#E8F8F6] font-bold text-[#0F766E]"
                    : ""
                }`}
              >

                {formatPremium(
                  planTwo.estimated_premium
                )}

                {premiumWinner === "two" && (
                  <span className="ml-2 text-xs">
                    Lower
                  </span>
                )}

              </div>

            </div>

            {/* WAITING PERIOD */}

            <div className="grid grid-cols-3 border-b border-[#E5E7EB]">

              <div className="p-5 text-sm font-medium">
                Waiting Period
              </div>

              <div
                className={`border-l border-[#E5E7EB] p-5 text-sm ${
                  waitingWinner === "one"
                    ? "bg-[#E8F8F6] font-bold text-[#0F766E]"
                    : ""
                }`}
              >

                {planOne.waiting_period_months}{" "}
                months

                {waitingWinner === "one" && (
                  <span className="ml-2 text-xs">
                    Shorter
                  </span>
                )}

              </div>

              <div
                className={`border-l border-[#E5E7EB] p-5 text-sm ${
                  waitingWinner === "two"
                    ? "bg-[#E8F8F6] font-bold text-[#0F766E]"
                    : ""
                }`}
              >

                {planTwo.waiting_period_months}{" "}
                months

                {waitingWinner === "two" && (
                  <span className="ml-2 text-xs">
                    Shorter
                  </span>
                )}

              </div>

            </div>

            {/* HOSPITAL NETWORK */}

            <div className="grid grid-cols-3 border-b border-[#E5E7EB]">

              <div className="p-5 text-sm font-medium">
                Hospital Network
              </div>

              <div
                className={`border-l border-[#E5E7EB] p-5 text-sm ${
                  hospitalWinner === "one"
                    ? "bg-[#E8F8F6] font-bold text-[#0F766E]"
                    : ""
                }`}
              >

                {planOne.hospital_network_size}+

                {hospitalWinner === "one" && (
                  <span className="ml-2 text-xs">
                    Larger
                  </span>
                )}

              </div>

              <div
                className={`border-l border-[#E5E7EB] p-5 text-sm ${
                  hospitalWinner === "two"
                    ? "bg-[#E8F8F6] font-bold text-[#0F766E]"
                    : ""
                }`}
              >

                {planTwo.hospital_network_size}+

                {hospitalWinner === "two" && (
                  <span className="ml-2 text-xs">
                    Larger
                  </span>
                )}

              </div>

            </div>

            {/* CANCER COVERAGE */}

            <div className="grid grid-cols-3 border-b border-[#E5E7EB]">

              <div className="p-5 text-sm font-medium">
                Cancer Coverage
              </div>

              <div className="border-l border-[#E5E7EB] p-5 text-sm">

                {planOne.cancer_coverage
                  ? "✓ Covered"
                  : "✕ Not covered"}

              </div>

              <div className="border-l border-[#E5E7EB] p-5 text-sm">

                {planTwo.cancer_coverage
                  ? "✓ Covered"
                  : "✕ Not covered"}

              </div>

            </div>

            {/* BENEFITS */}

            <div className="grid grid-cols-3">

              <div className="p-5 text-sm font-medium">
                Benefits
              </div>

              {/* PLAN ONE */}

              <div className="border-l border-[#E5E7EB] p-5">

                {planOne.benefits &&
                planOne.benefits.length > 0 ? (

                  <div className="space-y-2">

                    {planOne.benefits.map(
                      (benefit, index) => (

                        <div
                          key={`one-${index}`}
                          className="flex items-start gap-2 text-sm"
                        >

                          <span className="text-[#0F766E]">
                            ✓
                          </span>

                          <span>
                            {benefit}
                          </span>

                        </div>

                      )
                    )}

                  </div>

                ) : (

                  <span className="text-sm text-[#64748B]">
                    No benefits listed.
                  </span>

                )}

              </div>

              {/* PLAN TWO */}

              <div className="border-l border-[#E5E7EB] p-5">

                {planTwo.benefits &&
                planTwo.benefits.length > 0 ? (

                  <div className="space-y-2">

                    {planTwo.benefits.map(
                      (benefit, index) => (

                        <div
                          key={`two-${index}`}
                          className="flex items-start gap-2 text-sm"
                        >

                          <span className="text-[#0F766E]">
                            ✓
                          </span>

                          <span>
                            {benefit}
                          </span>

                        </div>

                      )
                    )}

                  </div>

                ) : (

                  <span className="text-sm text-[#64748B]">
                    No benefits listed.
                  </span>

                )}

              </div>

            </div>

          </section>

        ) : (

          /* ==================================================== */
          /* EMPTY STATE */
          /* ==================================================== */

          <section className="mb-8 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-12 text-center">

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F8F6] text-xl text-[#0F766E]">
              ⇄
            </div>

            <h2 className="mt-4 text-lg font-bold">
              Select two plans to compare
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#64748B]">
              Choose one plan from each dropdown.
              The detailed comparison will appear
              automatically.
            </p>

          </section>

        )}

        {/* ====================================================== */}
        {/* AVAILABLE PLANS */}
        {/* ====================================================== */}

        <section className="mb-8">

          <h2 className="mb-4 text-xl font-bold">
            Available Plans
          </h2>

          <div className="grid gap-4 md:grid-cols-3">

            {plans.map((plan) => (

              <div
                key={plan.id}
                className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm"
              >

                <p className="text-sm font-medium text-[#0F766E]">
                  {plan.provider?.name ||
                    "Insurance Provider"}
                </p>

                <h3 className="mt-1 font-bold">
                  {plan.name}
                </h3>

                <div className="mt-4 space-y-2 text-sm">

                  <div className="flex justify-between gap-4">

                    <span className="text-[#64748B]">
                      Coverage
                    </span>

                    <strong>
                      {formatCoverage(
                        plan.coverage_amount
                      )}
                    </strong>

                  </div>

                  <div className="flex justify-between gap-4">

                    <span className="text-[#64748B]">
                      Premium
                    </span>

                    <strong>
                      {formatPremium(
                        plan.estimated_premium
                      )}
                    </strong>

                  </div>

                  <div className="flex justify-between gap-4">

                    <span className="text-[#64748B]">
                      Waiting
                    </span>

                    <strong>
                      {
                        plan.waiting_period_months
                      }{" "}
                      months
                    </strong>

                  </div>

                </div>

                <div className="mt-4 flex gap-2">

                  <button
                    type="button"
                    onClick={() =>
                      setSelectedPlanOne(
                        plan.id
                      )
                    }
                    disabled={
                      plan.id ===
                      selectedPlanTwo
                    }
                    className="flex-1 rounded-xl border border-[#0F766E] px-3 py-2 text-xs font-semibold text-[#0F766E] transition hover:bg-[#E8F8F6] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Use as Plan 1
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setSelectedPlanTwo(
                        plan.id
                      )
                    }
                    disabled={
                      plan.id ===
                      selectedPlanOne
                    }
                    className="flex-1 rounded-xl border border-[#0F766E] px-3 py-2 text-xs font-semibold text-[#0F766E] transition hover:bg-[#E8F8F6] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Use as Plan 2
                  </button>

                </div>

                <Link
                    href={`/dashboard/insurance/${plan.id}`}
                  className="mt-3 block w-full rounded-xl bg-[#0F766E] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#095C57]"
                >
                  View Details
                </Link>

              </div>

            ))}

          </div>

        </section>

        {/* ====================================================== */}
        {/* DISCLAIMER */}
        {/* ====================================================== */}

        <section className="mb-8 rounded-2xl border border-[#E5E7EB] bg-white p-6">

          <p className="text-xs leading-5 text-[#64748B]">
            Insurance information shown here is provided
            for comparison and informational purposes.
            Estimated premiums, coverage, waiting periods,
            benefits, and network information should be
            verified with the insurance provider before
            making a purchase decision.
          </p>

        </section>

      </div>

    </main>
  );
}