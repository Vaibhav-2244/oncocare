"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";

type InsuranceProvider = {
  id: string;
  name: string;
  description: string | null;
};

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

type PlanWithProvider = InsurancePlan & {
  provider?: InsuranceProvider;
};

type ScoredPlan = PlanWithProvider & {
  score: number;
  matchPercentage: number;
  matchLabel: "Best Match" | "Good Match" | "Other Option";
};

type InsuranceReferral = {
  id: string;
  plan_id: string;
  status: string;
  created_at: string;
  plan_name: string;
  provider_name: string;
};

type InsuranceEnquiry = {
  id: string;
  plan_id: string;
  status: string | null;
  created_at: string;
};

export default function InsurancePage() {
  const [coverage, setCoverage] = useState("");
  const [budget, setBudget] = useState("");
  const [waitingPeriod, setWaitingPeriod] = useState("");

  const [plans, setPlans] = useState<PlanWithProvider[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [error, setError] = useState("");

  const [referrals, setReferrals] = useState<
    InsuranceReferral[]
  >([]);
  const [loadingReferrals, setLoadingReferrals] =
    useState(true);

  // ============================================================
  // LOAD INSURANCE PLANS
  // ============================================================

  useEffect(() => {
    const loadPlans = async () => {
      setLoadingPlans(true);
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
          "Insurance plans error:",
          plansError
        );

        setError(
          "Unable to load insurance plans."
        );

        setLoadingPlans(false);
        return;
      }

      if (
        !plansData ||
        plansData.length === 0
      ) {
        setPlans([]);
        setLoadingPlans(false);
        return;
      }

      const providerIds = [
        ...new Set(
          plansData.map(
            (plan) => plan.provider_id
          )
        ),
      ];

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
          "Insurance providers error:",
          providersError
        );

        setError(
          "Unable to load insurance providers."
        );

        setLoadingPlans(false);
        return;
      }

      const providerMap = new Map(
        (providersData || []).map(
          (provider) => [
            provider.id,
            provider,
          ]
        )
      );

      const combinedPlans: PlanWithProvider[] =
        plansData.map((plan) => ({
          ...plan,
          provider:
            providerMap.get(
              plan.provider_id
            ),
        }));

      setPlans(combinedPlans);
      setLoadingPlans(false);
    };

    loadPlans();
  }, []);

  // ============================================================
  // LOAD MY INSURANCE REFERRALS
  // ============================================================

  useEffect(() => {
    const loadMyReferrals = async () => {
      setLoadingReferrals(true);

      try {
        let referralEmail = "";

        // --------------------------------------------------------
        // First try the authenticated user's email.
        // --------------------------------------------------------

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user?.email) {
          referralEmail =
            user.email
              .trim()
              .toLowerCase();
        }

        // --------------------------------------------------------
        // If there is no authenticated email, use the email saved
        // after the insurance referral submission.
        // --------------------------------------------------------

        if (!referralEmail) {
          const savedEmail =
            window.localStorage.getItem(
              "oncocare_insurance_email"
            );

          if (savedEmail) {
            referralEmail =
              savedEmail
                .trim()
                .toLowerCase();
          }
        }

        // --------------------------------------------------------
        // No email means this visitor has not submitted a referral.
        // --------------------------------------------------------

        if (!referralEmail) {
          setReferrals([]);
          setLoadingReferrals(false);
          return;
        }

        // --------------------------------------------------------
        // Get enquiries belonging to this email.
        // --------------------------------------------------------

        const {
          data: enquiryData,
          error: enquiryError,
        } = await supabase.rpc(
          "get_insurance_referrals_by_email",
          {
            p_email: referralEmail,
          }
        );

        if (enquiryError) {
          console.error(
            "Insurance referrals error:",
            enquiryError
          );

          setReferrals([]);
          setLoadingReferrals(false);
          return;
        }

        if (
          !enquiryData ||
          enquiryData.length === 0
        ) {
          setReferrals([]);
          setLoadingReferrals(false);
          return;
        }

        // --------------------------------------------------------
        // Get plan information.
        // --------------------------------------------------------

        const enquiries = enquiryData as InsuranceEnquiry[];
        const planIds = Array.from(
          new Set(
            enquiries.map(
              (enquiry) => enquiry.plan_id
            )
          )
        );

        const {
          data: referralPlans,
          error: referralPlansError,
        } = await supabase
          .from("insurance_plans")
          .select(
            "id, name, provider_id"
          )
          .in("id", planIds);

        if (referralPlansError) {
          console.error(
            "Referral plans error:",
            referralPlansError
          );

          setReferrals([]);
          setLoadingReferrals(false);
          return;
        }

        // --------------------------------------------------------
        // Get provider information.
        // --------------------------------------------------------

        const providerIds = [
          ...new Set(
            (referralPlans || [])
              .map(
                (plan) =>
                  plan.provider_id
              )
              .filter(Boolean)
          ),
        ];

        let referralProviders:
          InsuranceProvider[] = [];

        if (
          providerIds.length > 0
        ) {
          const {
            data: providersData,
            error: providersError,
          } = await supabase
            .from(
              "insurance_providers"
            )
            .select(
              "id, name, description"
            )
            .in(
              "id",
              providerIds
            );

          if (providersError) {
            console.error(
              "Referral providers error:",
              providersError
            );
          } else {
            referralProviders =
              providersData || [];
          }
        }

        // --------------------------------------------------------
        // Combine enquiry + plan + provider.
        // --------------------------------------------------------

        const combinedReferrals: InsuranceReferral[] =
          enquiries.map(
            (enquiry) => {
              const plan =
                (
                  referralPlans ||
                  []
                ).find(
                  (item) =>
                    item.id ===
                    enquiry.plan_id
                );

              const provider =
                referralProviders.find(
                  (item) =>
                    item.id ===
                    plan?.provider_id
                );

              return {
                id: enquiry.id,
                plan_id:
                  enquiry.plan_id,
                status:
                  enquiry.status ||
                  "new",
                created_at:
                  enquiry.created_at,
                plan_name:
                  plan?.name ||
                  "Insurance Plan",
                provider_name:
                  provider?.name ||
                  "Insurance Provider",
              };
            }
          );

        setReferrals(
          combinedReferrals
        );
      } catch (referralError) {
        console.error(
          "Unexpected referral loading error:",
          referralError
        );

        setReferrals([]);
      } finally {
        setLoadingReferrals(false);
      }
    };

    loadMyReferrals();
  }, []);

  // ============================================================
  // RECOMMENDATION ENGINE
  // ============================================================

  const scoredPlans = useMemo<
    ScoredPlan[]
  >(() => {
    return plans
      .map((plan) => {
        let score = 0;

        // ======================================================
        // COVERAGE - 40 POINTS
        // ======================================================

        if (coverage === "high") {
          if (
            plan.coverage_amount >=
            25
          ) {
            score += 40;
          } else if (
            plan.coverage_amount >=
            20
          ) {
            score += 30;
          } else if (
            plan.coverage_amount >=
            15
          ) {
            score += 20;
          } else {
            score += 10;
          }
        }

        if (coverage === "medium") {
          if (
            plan.coverage_amount >=
              15 &&
            plan.coverage_amount <
              25
          ) {
            score += 40;
          } else if (
            plan.coverage_amount >=
            25
          ) {
            score += 30;
          } else if (
            plan.coverage_amount >=
            10
          ) {
            score += 20;
          } else {
            score += 10;
          }
        }

        if (coverage === "standard") {
          if (
            plan.coverage_amount <
            15
          ) {
            score += 40;
          } else if (
            plan.coverage_amount <
            20
          ) {
            score += 30;
          } else if (
            plan.coverage_amount <
            25
          ) {
            score += 20;
          } else {
            score += 10;
          }
        }

        // ======================================================
        // BUDGET - 30 POINTS
        // ======================================================

        if (budget === "low") {
          if (
            plan.estimated_premium <
            15000
          ) {
            score += 30;
          } else if (
            plan.estimated_premium <=
            18000
          ) {
            score += 20;
          } else {
            score += 10;
          }
        }

        if (budget === "medium") {
          if (
            plan.estimated_premium >=
              15000 &&
            plan.estimated_premium <=
              20000
          ) {
            score += 30;
          } else if (
            plan.estimated_premium <
            15000
          ) {
            score += 25;
          } else {
            score += 15;
          }
        }

        if (budget === "high") {
          if (
            plan.estimated_premium >
            20000
          ) {
            score += 30;
          } else if (
            plan.estimated_premium >=
            18000
          ) {
            score += 25;
          } else {
            score += 15;
          }
        }

        // ======================================================
        // WAITING PERIOD - 30 POINTS
        // ======================================================

        if (
          waitingPeriod === "short"
        ) {
          if (
            plan.waiting_period_months <=
            24
          ) {
            score += 30;
          } else if (
            plan.waiting_period_months <=
            36
          ) {
            score += 15;
          } else {
            score += 5;
          }
        }

        if (
          waitingPeriod === "medium"
        ) {
          if (
            plan.waiting_period_months >
              24 &&
            plan.waiting_period_months <=
              36
          ) {
            score += 30;
          } else if (
            plan.waiting_period_months <=
            24
          ) {
            score += 25;
          } else {
            score += 15;
          }
        }

        if (
          waitingPeriod === "long"
        ) {
          if (
            plan.waiting_period_months >
            36
          ) {
            score += 30;
          } else if (
            plan.waiting_period_months >
            24
          ) {
            score += 20;
          } else {
            score += 10;
          }
        }

        // ======================================================
        // MATCH PERCENTAGE
        // ======================================================

        const selectedPreferenceCount =
          Number(Boolean(coverage)) +
          Number(Boolean(budget)) +
          Number(
            Boolean(waitingPeriod)
          );

        const maxPossibleScore =
          (coverage ? 40 : 0) +
          (budget ? 30 : 0) +
          (waitingPeriod ? 30 : 0);

        const matchPercentage =
          maxPossibleScore > 0
            ? Math.round(
                (score /
                  maxPossibleScore) *
                  100
              )
            : 0;

        // ======================================================
        // MATCH LABEL
        // ======================================================

        let matchLabel: ScoredPlan["matchLabel"];

        if (
          selectedPreferenceCount ===
          0
        ) {
          matchLabel =
            "Other Option";
        } else if (
          matchPercentage >= 80
        ) {
          matchLabel =
            "Best Match";
        } else if (
          matchPercentage >= 55
        ) {
          matchLabel =
            "Good Match";
        } else {
          matchLabel =
            "Other Option";
        }

        return {
          ...plan,
          score,
          matchPercentage,
          matchLabel,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return (
          b.coverage_amount -
          a.coverage_amount
        );
      });
  }, [
    plans,
    coverage,
    budget,
    waitingPeriod,
  ]);

  // ============================================================
  // SCROLL TO RECOMMENDATIONS
  // ============================================================

  const handleRecommendations =
    () => {
      document
        .getElementById(
          "recommendations"
        )
        ?.scrollIntoView({
          behavior: "smooth",
        });
    };

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

  const formatStatus = (
    status: string
  ) => {
    switch (status) {
      case "new":
        return "Requested";

      case "contacted":
        return "Contacted";

      case "in_progress":
        return "In Progress";

      case "completed":
        return "Completed";

      default:
        return status
          .replaceAll("_", " ")
          .replace(
            /\b\w/g,
            (char) =>
              char.toUpperCase()
          );
    }
  };

  const getStatusClasses = (
    status: string
  ) => {
    switch (status) {
      case "contacted":
        return "bg-orange-50 text-orange-600";

      case "in_progress":
        return "bg-purple-50 text-purple-600";

      case "completed":
        return "bg-green-50 text-green-600";

      default:
        return "bg-yellow-50 text-yellow-600";
    }
  };

  // ============================================================
  // UI
  // ============================================================

  // Show only the first three referrals on the main insurance page.
  // The dedicated /insurance/referrals page continues to show all referrals.
  const visibleReferrals = referrals.slice(0, 3);

  return (
    <main className="min-h-screen bg-[#F5F7FA] px-6 py-10 text-[#1F2937]">
      <div className="mx-auto max-w-6xl">

        {/* ======================================================
            HEADER
        ====================================================== */}

        <div className="mb-8">
          <p className="mb-1 text-sm font-medium text-[#0F766E]">
            Insurance Support
          </p>

          <h1 className="text-3xl font-bold text-[#1F2937]">
            Cancer Insurance
          </h1>

          <p className="mt-2 text-sm text-[#64748B]">
            Find insurance options based
            on your care needs and
            preferences.
          </p>
        </div>

        {/* ======================================================
            TOP BANNER
        ====================================================== */}

        <section className="mb-8 rounded-2xl border border-[#E5E7EB] bg-white p-7 shadow-sm">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">

            <div className="flex items-start gap-4">

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#E8F8F6] text-xl text-[#0F766E]">
                ♡
              </div>

              <div>
                <h2 className="text-lg font-semibold text-[#1F2937]">
                  Find insurance that
                  fits your needs
                </h2>

                <p className="mt-1 max-w-2xl text-sm leading-6 text-[#64748B]">
                  We&apos;ll help you
                  compare cancer-focused
                  insurance options using
                  coverage, affordability,
                  and waiting-period
                  preferences.
                </p>
              </div>

            </div>

            <button
              type="button"
              onClick={
                handleRecommendations
              }
              className="rounded-xl bg-[#2EC4B6] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#0F766E]"
            >
              Get Recommendations
            </button>

          </div>
        </section>

        {/* ======================================================
            PREFERENCES
        ====================================================== */}

        <section className="mb-10">

          <div className="mb-5">
            <h2 className="text-xl font-bold text-[#1F2937]">
              What matters most to
              you?
            </h2>

            <p className="mt-1 text-sm text-[#64748B]">
              Choose your preferences
              to find suitable plans.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">

            {/* COVERAGE */}

            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">

              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
                ♡
              </div>

              <h3 className="font-semibold">
                Coverage
              </h3>

              <p className="mt-1 min-h-[42px] text-sm leading-5 text-[#64748B]">
                Higher coverage for
                treatment and
                hospitalization needs.
              </p>

              <select
                value={coverage}
                onChange={(e) =>
                  setCoverage(
                    e.target.value
                  )
                }
                className="mt-4 h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm text-[#64748B] outline-none focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
              >
                <option value="">
                  Select coverage
                  preference
                </option>

                <option value="high">
                  High coverage —
                  ₹25L+
                </option>

                <option value="medium">
                  Medium coverage —
                  ₹15–25L
                </option>

                <option value="standard">
                  Standard coverage —
                  ₹10–15L
                </option>
              </select>
            </div>

            {/* BUDGET */}

            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">

              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
                ₹
              </div>

              <h3 className="font-semibold">
                Budget
              </h3>

              <p className="mt-1 min-h-[42px] text-sm leading-5 text-[#64748B]">
                Consider plans that
                fit your preferred
                premium range.
              </p>

              <select
                value={budget}
                onChange={(e) =>
                  setBudget(
                    e.target.value
                  )
                }
                className="mt-4 h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm text-[#64748B] outline-none focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
              >
                <option value="">
                  Select budget
                  preference
                </option>

                <option value="low">
                  Under ₹15,000 /
                  year
                </option>

                <option value="medium">
                  ₹15,000–₹20,000 /
                  year
                </option>

                <option value="high">
                  Above ₹20,000 /
                  year
                </option>
              </select>
            </div>

            {/* WAITING PERIOD */}

            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">

              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
                ◷
              </div>

              <h3 className="font-semibold">
                Waiting Period
              </h3>

              <p className="mt-1 min-h-[42px] text-sm leading-5 text-[#64748B]">
                Prefer plans with a
                shorter waiting period.
              </p>

              <select
                value={waitingPeriod}
                onChange={(e) =>
                  setWaitingPeriod(
                    e.target.value
                  )
                }
                className="mt-4 h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm text-[#64748B] outline-none focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
              >
                <option value="">
                  Select waiting-period
                  preference
                </option>

                <option value="short">
                  Short — up to 24
                  months
                </option>

                <option value="medium">
                  Medium — 24–36
                  months
                </option>

                <option value="long">
                  Long — 36+ months
                </option>
              </select>
            </div>

          </div>
        </section>

        {/* ======================================================
            RECOMMENDATIONS
        ====================================================== */}

        <section id="recommendations">

          <div className="mb-5">
            <h2 className="text-xl font-bold">
              Recommended For You
            </h2>

            <p className="mt-1 text-sm text-[#64748B]">
              Plans are ranked according
              to your selected
              preferences.
            </p>
          </div>

          {/* LOADING */}

          {loadingPlans && (
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-12 text-center shadow-sm">
              <p className="text-sm text-[#64748B]">
                Loading insurance
                plans...
              </p>
            </div>
          )}

          {/* ERROR */}

          {!loadingPlans &&
            error && (
              <div className="rounded-2xl border border-red-200 bg-white p-8 text-center">
                <p className="font-medium text-red-600">
                  {error}
                </p>
              </div>
            )}

          {/* PLANS */}

          {!loadingPlans &&
            !error &&
            scoredPlans.length >
              0 && (
              <div className="grid gap-5 md:grid-cols-3">

                {scoredPlans.map(
                  (plan, index) => (
                    <article
                      key={plan.id}
                      className={`relative rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md ${
                        index === 0 &&
                        plan.score > 0
                          ? "border-[#2EC4B6]"
                          : "border-[#E5E7EB]"
                      }`}
                    >

                      {/* MATCH LABEL */}

                      <div className="mb-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            plan.matchLabel ===
                            "Best Match"
                              ? "bg-[#E8F8F6] text-[#0F766E]"
                              : plan.matchLabel ===
                                "Good Match"
                              ? "bg-[#F1F5F9] text-[#475569]"
                              : "bg-[#F8FAFC] text-[#64748B]"
                          }`}
                        >
                          {plan.matchLabel}
                        </span>
                      </div>

                      {/* PROVIDER */}

                      <div className="mb-3">
                        <p className="text-sm font-medium text-[#0F766E]">
                          {plan.provider
                            ?.name ||
                            "Insurance Provider"}
                        </p>

                        <h3 className="mt-1 text-xl font-bold text-[#1F2937]">
                          {plan.name}
                        </h3>
                      </div>

                      {/* DETAILS */}

                      <div className="space-y-3 border-b border-[#E5E7EB] pb-5">

                        <div className="flex justify-between gap-4 text-sm">
                          <span className="text-[#64748B]">
                            Coverage
                          </span>

                          <strong>
                            {formatCoverage(
                              plan.coverage_amount
                            )}
                          </strong>
                        </div>

                        <div className="flex justify-between gap-4 text-sm">
                          <span className="text-[#64748B]">
                            Waiting Period
                          </span>

                          <strong>
                            {
                              plan.waiting_period_months
                            }{" "}
                            months
                          </strong>
                        </div>

                        <div className="flex justify-between gap-4 text-sm">
                          <span className="text-[#64748B]">
                            Estimated Premium
                          </span>

                          <strong>
                            {formatPremium(
                              plan.estimated_premium
                            )}
                          </strong>
                        </div>

                        <div className="flex justify-between gap-4 text-sm">
                          <span className="text-[#64748B]">
                            Hospital Network
                          </span>

                          <strong>
                            {
                              plan.hospital_network_size
                            }
                            +
                          </strong>
                        </div>

                      </div>

                      {/* BENEFITS */}

                      <div className="pt-5">

                        <p className="mb-3 text-sm font-medium">
                          Benefits
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {(
                            plan.benefits ||
                            []
                          ).map(
                            (
                              benefit,
                              benefitIndex
                            ) => (
                              <span
                                key={`${plan.id}-${benefitIndex}`}
                                className="rounded-full bg-[#F5F7FA] px-3 py-1.5 text-xs text-[#1F2937]"
                              >
                                {benefit}
                              </span>
                            )
                          )}
                        </div>

                      </div>

                      {/* VIEW DETAILS */}

                      <Link
                        href={`/dashboard/insurance/${plan.id}`}
                        className="mt-5 block w-full rounded-xl border border-[#0F766E] bg-white px-4 py-3 text-center text-sm font-semibold text-[#0F766E] transition hover:bg-[#E8F8F6]"
                      >
                        View Details
                      </Link>

                    </article>
                  )
                )}

              </div>
            )}

          {/* NO PLANS */}

          {!loadingPlans &&
            !error &&
            scoredPlans.length ===
              0 && (
              <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-12 text-center">

                <h3 className="font-semibold">
                  No insurance plans
                  available
                </h3>

                <p className="mt-2 text-sm text-[#64748B]">
                  Please try again
                  later.
                </p>

              </div>
            )}

        </section>

        {/* ======================================================
            MY INSURANCE REFERRALS
        ====================================================== */}

        <section className="mt-12">

          <div className="mb-5">
            <h2 className="text-2xl font-bold text-[#1F2937]">
              My Insurance Referrals
            </h2>

            <p className="mt-1 text-sm text-[#64748B]">
              Track your submitted
              insurance referral requests.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">

            {/* LOADING */}

            {loadingReferrals && (
              <div className="flex min-h-[260px] items-center justify-center">
                <p className="text-sm text-[#64748B]">
                  Loading your referrals...
                </p>
              </div>
            )}

            {/* EMPTY */}

            {!loadingReferrals &&
              referrals.length ===
                0 && (
                <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">

                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F8F6] text-xl font-bold text-[#0F766E]">
                    +
                  </div>

                  <h3 className="text-lg font-bold text-[#1F2937]">
                    No insurance
                    referrals yet
                  </h3>

                  <p className="mt-2 max-w-md text-sm text-[#64748B]">
                    After you submit an
                    insurance referral,
                    your request will
                    appear here.
                  </p>

                  <button
                    type="button"
                    onClick={
                      handleRecommendations
                    }
                    className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#0F766E] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#095C57]"
                  >
                    Explore Plans
                  </button>

                </div>
              )}

            {/* REFERRALS */}

            {!loadingReferrals &&
              referrals.length >
                0 && (
                <div className="overflow-x-auto">

                  <table className="w-full min-w-[760px]">

                    <thead>
                      <tr className="border-b border-[#E5E7EB] text-left">

                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                          Plan
                        </th>

                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                          Provider
                        </th>

                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                          Status
                        </th>

                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                          Requested On
                        </th>

                        <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                          Action
                        </th>

                      </tr>
                    </thead>

                    <tbody>

                      {visibleReferrals.map(
                        (referral) => (
                          <tr
                            key={
                              referral.id
                            }
                            className="border-b border-[#E5E7EB] last:border-0"
                          >

                            <td className="px-6 py-5">
                              <p className="text-sm font-semibold text-[#1F2937]">
                                {
                                  referral.plan_name
                                }
                              </p>
                            </td>

                            <td className="px-6 py-5">
                              <p className="text-sm text-[#475569]">
                                {
                                  referral.provider_name
                                }
                              </p>
                            </td>

                            <td className="px-6 py-5">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                                  referral.status
                                )}`}
                              >
                                {formatStatus(
                                  referral.status
                                )}
                              </span>
                            </td>

                            <td className="px-6 py-5">
                              <p className="text-sm text-[#475569]">
                                {new Date(
                                  referral.created_at
                                ).toLocaleDateString(
                                  "en-IN",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  }
                                )}
                              </p>
                            </td>

                            <td className="px-6 py-5 text-right">

                              <Link
                                href={`/dashboard/insurance/${referral.plan_id}`}
                                className="inline-flex items-center justify-center rounded-lg border border-[#0F766E] px-4 py-2 text-xs font-semibold text-[#0F766E] transition hover:bg-[#E8F8F6]"
                              >
                                View Details
                              </Link>

                            </td>

                          </tr>
                        )
                      )}

                    </tbody>

                  </table>

                  {referrals.length > 3 && (
                    <div className="flex justify-center border-t border-[#E5E7EB] px-6 py-5">
                      <Link
                        href="/dashboard/insurance/referrals"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-[#0F766E] hover:underline"
                      >
                        View All Referrals
                        <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  )}

                </div>
              )}

          </div>
        </section>

        {/* ======================================================
            DISCLAIMER
        ====================================================== */}

        <section className="mt-8 rounded-2xl border border-[#E5E7EB] bg-white p-6">

          <p className="text-xs leading-5 text-[#64748B]">
            OncoCare+ provides this feature
            for informational and assistance
            purposes. Insurance plan details,
            premiums, eligibility, exclusions,
            waiting periods, and policy terms
            should be confirmed directly with
            the relevant insurance provider
            before making a decision.
          </p>

        </section>

      </div>
    </main>
  );
}