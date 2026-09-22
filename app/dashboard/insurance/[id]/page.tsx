"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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

export default function InsurancePlanDetailsPage() {
  const params = useParams();
  const planId = params.id as string;

  const [plan, setPlan] = useState<InsurancePlan | null>(null);
  const [provider, setProvider] =
    useState<InsuranceProvider | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ============================================================
  // LOAD PLAN DETAILS
  // ============================================================

  useEffect(() => {
    const loadPlan = async () => {
      if (!planId) {
        setError("Insurance plan was not found.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      // --------------------------------------------------------
      // LOAD INSURANCE PLAN
      // --------------------------------------------------------

      const { data: planData, error: planError } =
        await supabase
          .from("insurance_plans")
          .select(
            "id, name, provider_id, coverage_amount, waiting_period_months, estimated_premium, cancer_coverage, hospital_network_size, benefits"
          )
          .eq("id", planId)
          .maybeSingle();

      if (planError) {
        console.error("Insurance plan error:", planError);

        setError("Unable to load this insurance plan.");
        setLoading(false);
        return;
      }

      setPlan(planData);

      if (!planData) {
        setError("Insurance plan was not found.");
        setLoading(false);
        return;
      }

      // --------------------------------------------------------
      // LOAD PROVIDER
      // --------------------------------------------------------

      const { data: providerData, error: providerError } =
        await supabase
          .from("insurance_providers")
          .select("id, name, description")
          .eq("id", planData.provider_id)
          .maybeSingle();

      if (providerError) {
        console.error(
          "Insurance provider error:",
          providerError
        );

        setError(
          "Unable to load insurance provider details."
        );
        setLoading(false);
        return;
      }

      if (!providerData) {
        setError(
          "Unable to load insurance provider details."
        );
        setLoading(false);
        return;
      }

      setProvider(providerData);
      setLoading(false);
    };

    loadPlan();
  }, [planId]);

  // ============================================================
  // LOADING STATE
  // ============================================================

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F5F7FA] px-6 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-12 text-center shadow-sm">
            <p className="text-sm text-[#64748B]">
              Loading insurance plan details...
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ============================================================
  // ERROR STATE
  // ============================================================

  if (error || !plan) {
    return (
      <main className="min-h-screen bg-[#F5F7FA] px-6 py-10">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/dashboard/insurance"
            className="mb-6 inline-flex items-center text-sm font-medium text-[#0F766E] hover:underline"
          >
            ← Back to Insurance
          </Link>

          <div className="rounded-2xl border border-red-200 bg-white p-10 text-center shadow-sm">
            <h1 className="text-xl font-bold text-[#1F2937]">
              Insurance Plan Not Found
            </h1>

            <p className="mt-2 text-sm text-[#64748B]">
              {error ||
                "The requested insurance plan could not be found."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ============================================================
  // FORMATTERS
  // ============================================================

  const formatCoverage = (amount: number) => {
    return `₹${amount}L`;
  };

  const formatPremium = (amount: number) => {
    return `₹${amount.toLocaleString("en-IN")}`;
  };

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <main className="min-h-screen bg-[#F5F7FA] px-6 py-10 text-[#1F2937]">
      <div className="mx-auto max-w-5xl">

        {/* ====================================================== */}
        {/* BACK LINK */}
        {/* ====================================================== */}

        <Link
          href="/dashboard/insurance"
          className="mb-6 inline-flex items-center text-sm font-medium text-[#0F766E] hover:underline"
        >
          ← Back to Recommendations
        </Link>

        {/* ====================================================== */}
        {/* PLAN HEADER */}
        {/* ====================================================== */}

        <section className="mb-6 rounded-2xl border border-[#E5E7EB] bg-white p-7 shadow-sm">
          <p className="text-sm font-medium text-[#0F766E]">
            {provider?.name || "Insurance Provider"}
          </p>

          <h1 className="mt-2 text-3xl font-bold text-[#1F2937]">
            {plan.name}
          </h1>

          {provider?.description && (
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#64748B]">
              {provider.description}
            </p>
          )}

          {plan.cancer_coverage && (
            <div className="mt-5">
              <span className="inline-flex rounded-full bg-[#E8F8F6] px-4 py-2 text-xs font-semibold text-[#0F766E]">
                Cancer Coverage
              </span>
            </div>
          )}
        </section>

        {/* ====================================================== */}
        {/* PLAN OVERVIEW */}
        {/* ====================================================== */}

        <section className="mb-6">
          <h2 className="mb-4 text-xl font-bold">
            Plan Overview
          </h2>

          <div className="grid gap-4 md:grid-cols-2">

            {/* COVERAGE */}

            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
              <p className="text-sm text-[#64748B]">
                Coverage Amount
              </p>

              <p className="mt-2 text-2xl font-bold">
                {formatCoverage(plan.coverage_amount)}
              </p>

              <p className="mt-1 text-xs text-[#64748B]">
                Coverage available under this plan.
              </p>
            </div>

            {/* PREMIUM */}

            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
              <p className="text-sm text-[#64748B]">
                Estimated Premium
              </p>

              <p className="mt-2 text-2xl font-bold">
                {formatPremium(plan.estimated_premium)}
              </p>

              <p className="mt-1 text-xs text-[#64748B]">
                Estimated annual premium.
              </p>
            </div>

            {/* WAITING PERIOD */}

            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
              <p className="text-sm text-[#64748B]">
                Waiting Period
              </p>

              <p className="mt-2 text-2xl font-bold">
                {plan.waiting_period_months} months
              </p>

              <p className="mt-1 text-xs text-[#64748B]">
                Waiting period for cancer coverage.
              </p>
            </div>

            {/* HOSPITAL NETWORK */}

            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
              <p className="text-sm text-[#64748B]">
                Hospital Network
              </p>

              <p className="mt-2 text-2xl font-bold">
                {plan.hospital_network_size}+
              </p>

              <p className="mt-1 text-xs text-[#64748B]">
                Hospitals in the available network.
              </p>
            </div>

          </div>
        </section>

        {/* ====================================================== */}
        {/* BENEFITS */}
        {/* ====================================================== */}

        <section className="mb-6 rounded-2xl border border-[#E5E7EB] bg-white p-7 shadow-sm">
          <h2 className="text-xl font-bold">
            Plan Benefits
          </h2>

          <p className="mt-1 text-sm text-[#64748B]">
            Benefits available under this insurance plan.
          </p>

          {plan.benefits && plan.benefits.length > 0 ? (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {plan.benefits.map((benefit, index) => (
                <div
                  key={`${plan.id}-benefit-${index}`}
                  className="flex items-center gap-3 rounded-xl bg-[#F5F7FA] p-4"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8F8F6] text-sm font-bold text-[#0F766E]">
                    ✓
                  </div>

                  <span className="text-sm text-[#1F2937]">
                    {benefit}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-[#64748B]">
              No additional benefits have been listed for
              this plan.
            </p>
          )}
        </section>

        {/* ====================================================== */}
        {/* PROVIDER INFORMATION */}
        {/* ====================================================== */}

        {provider && (
          <section className="mb-6 rounded-2xl border border-[#E5E7EB] bg-white p-7 shadow-sm">
            <h2 className="text-xl font-bold">
              Insurance Provider
            </h2>

            <h3 className="mt-4 text-lg font-semibold text-[#0F766E]">
              {provider.name}
            </h3>

            {provider.description && (
              <p className="mt-2 text-sm leading-6 text-[#64748B]">
                {provider.description}
              </p>
            )}
          </section>
        )}

        {/* ====================================================== */}
        {/* DISCLAIMER */}
        {/* ====================================================== */}

        <section className="mb-8 rounded-2xl border border-[#E5E7EB] bg-white p-6">
          <p className="text-xs leading-5 text-[#64748B]">
            Insurance information shown here is provided for
            comparison and informational purposes. Estimated
            premiums, coverage, waiting periods, benefits, and
            network information should be verified with the
            insurance provider before making a purchase decision.
          </p>
        </section>

        {/* ====================================================== */}
        {/* ACTIONS */}
        {/* ====================================================== */}

        <div className="flex flex-col items-center justify-center gap-3 pb-8 sm:flex-row">

          {/* BACK */}

          <Link
            href="/dashboard/insurance"
            className="inline-flex w-full justify-center rounded-xl border border-[#0F766E] bg-white px-7 py-3 text-sm font-semibold text-[#0F766E] transition hover:bg-[#E8F8F6] sm:w-auto"
          >
            ← Back to Recommendations
          </Link>

          {/* APPLY / SUBMIT ENQUIRY */}

          <Link
            href={`/dashboard/insurance/apply?plan=${plan.id}`}
            className="inline-flex w-full justify-center rounded-xl border border-[#0F766E] bg-white px-7 py-3 text-sm font-semibold text-[#0F766E] transition hover:bg-[#E8F8F6] sm:w-auto"
          >
            Apply / Submit Enquiry
          </Link>

          {/* COMPARE */}

          <Link
            href={`/dashboard/insurance/compare?plan=${plan.id}`}
            className="inline-flex w-full justify-center rounded-xl bg-[#2EC4B6] px-7 py-3 text-sm font-semibold text-white transition hover:bg-[#0F766E] sm:w-auto"
          >
            Compare This Plan
          </Link>

        </div>

      </div>
    </main>
  );
}