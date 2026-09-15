"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

type InsurancePlan = {
  id: string;
  name: string;
  provider_id: string;
  coverage_amount: number;
  estimated_premium: number;
};

type InsuranceProvider = {
  id: string;
  name: string;
};

export default function InsuranceApplyPage() {
  const searchParams = useSearchParams();

  const [plans, setPlans] = useState<InsurancePlan[]>([]);
  const [providers, setProviders] = useState<InsuranceProvider[]>([]);

  const [selectedPlan, setSelectedPlan] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [message, setMessage] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // ============================================================
  // LOAD INSURANCE PLANS
  // ============================================================

  useEffect(() => {
    const loadPlans = async () => {
      setLoading(true);
      setError("");

      const planFromUrl = searchParams.get("plan");

      const {
        data: plansData,
        error: plansError,
      } = await supabase
        .from("insurance_plans")
        .select(
          "id, name, provider_id, coverage_amount, estimated_premium"
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
          "Unable to load insurance plans. Please try again."
        );

        setLoading(false);
        return;
      }

      const loadedPlans =
        (plansData || []) as InsurancePlan[];

      const providerIds = [
        ...new Set(
          loadedPlans.map(
            (plan) => plan.provider_id
          )
        ),
      ];

      let providersData: InsuranceProvider[] = [];

      if (providerIds.length > 0) {
        const {
          data,
          error: providersError,
        } = await supabase
          .from("insurance_providers")
          .select("id, name")
          .in("id", providerIds);

        if (providersError) {
          console.error(
            "Insurance providers error:",
            providersError
          );

          setError(
            "Unable to load insurance provider information."
          );

          setLoading(false);
          return;
        }

        providersData = data || [];
      }

      setPlans(loadedPlans);
      setProviders(providersData);

      // Automatically select plan from URL
      if (
        planFromUrl &&
        loadedPlans.some(
          (plan) => plan.id === planFromUrl
        )
      ) {
        setSelectedPlan(planFromUrl);
      }

      setLoading(false);
    };

    loadPlans();
  }, [searchParams]);

  // ============================================================
  // HELPERS
  // ============================================================

  const getProviderName = (
    providerId: string
  ) => {
    return (
      providers.find(
        (provider) =>
          provider.id === providerId
      )?.name ||
      "Insurance Provider"
    );
  };

  const selectedPlanData =
    plans.find(
      (plan) =>
        plan.id === selectedPlan
    );

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
  // SUBMIT REFERRAL
  // ============================================================

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setError("");
    setSuccess(false);

    // ----------------------------------------------------------
    // VALIDATION
    // ----------------------------------------------------------

    if (!selectedPlan) {
      setError(
        "Please select an insurance plan."
      );
      return;
    }

    if (!fullName.trim()) {
      setError(
        "Please enter your full name."
      );
      return;
    }

    if (!email.trim()) {
      setError(
        "Please enter your email address."
      );
      return;
    }

    if (!phone.trim()) {
      setError(
        "Please enter your phone number."
      );
      return;
    }

    if (!city.trim()) {
      setError(
        "Please enter your city."
      );
      return;
    }

    // ----------------------------------------------------------
    // EMAIL VALIDATION
    // ----------------------------------------------------------

    const normalizedEmail =
      email.trim().toLowerCase();

    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !emailPattern.test(
        normalizedEmail
      )
    ) {
      setError(
        "Please enter a valid email address."
      );
      return;
    }

    // ----------------------------------------------------------
    // PHONE VALIDATION
    // ----------------------------------------------------------

    const phoneDigits =
      phone.replace(/\D/g, "");

    if (
      phoneDigits.length < 10 ||
      phoneDigits.length > 12
    ) {
      setError(
        "Please enter a valid phone number."
      );
      return;
    }

    // ----------------------------------------------------------
    // SUBMIT
    // ----------------------------------------------------------

    setSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Your session has expired. Please sign in again.");
        setSubmitting(false);
        return;
      }

      const enquiry = {
        plan_id: selectedPlan,
        full_name: fullName.trim(),
        email: normalizedEmail,
        phone: phone.trim(),
        city: city.trim(),
        message: message.trim() || null,
        status: "new",
      };

      let { error: insertError } = await supabase
        .from("insurance_enquiries")
        .insert({ ...enquiry, user_id: user.id });

      // Older deployments do not have user_id until the insurance migration is applied.
      if (
        insertError?.code === "PGRST204" &&
        insertError.message.includes("user_id")
      ) {
        ({ error: insertError } = await supabase
          .from("insurance_enquiries")
          .insert(enquiry));
      }

      if (insertError) {
        console.error(
          "Insurance enquiry error:",
          insertError
        );

        setError(
          insertError.message ||
            "We could not submit your referral. Please try again."
        );

        setSubmitting(false);
        return;
      }

      // --------------------------------------------------------
      // SAVE EMAIL LOCALLY
      //
      // This lets the Insurance page identify the visitor's
      // submitted referrals without requiring admin login.
      // --------------------------------------------------------

      window.localStorage.setItem(
        "oncocare_insurance_email",
        normalizedEmail
      );

      // --------------------------------------------------------
      // SUCCESS
      // --------------------------------------------------------

      setSuccess(true);

      setFullName("");
      setEmail("");
      setPhone("");
      setCity("");
      setMessage("");

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (submissionError) {
      console.error(
        "Unexpected submission error:",
        submissionError
      );

      setError(
        "Something went wrong while submitting your referral."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F5F7FA] px-5 py-10 text-[#1F2937]">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F8F6] text-xl font-bold text-[#0F766E]">
              +
            </div>

            <p className="text-sm text-[#64748B]">
              Loading insurance plans...
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <main className="min-h-screen bg-[#F5F7FA] px-5 py-10 text-[#1F2937]">
      <div className="mx-auto max-w-6xl">

        {/* ======================================================
            HEADER
        ====================================================== */}

        <div className="mb-8">
          <Link
            href="/dashboard/insurance"
            className="mb-5 inline-flex items-center text-sm font-medium text-[#0F766E] hover:underline"
          >
            ← Back to Insurance
          </Link>

          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-medium text-[#0F766E]">
                Insurance Support
              </p>

              <h1 className="mt-1 text-3xl font-bold tracking-tight">
                Request Insurance Referral
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748B]">
                Submit your details and request assistance
                with the insurance plan you selected.
              </p>
            </div>

            {selectedPlanData && (
              <div className="rounded-xl border border-[#D5F3EE] bg-[#E8F8F6] px-4 py-3">
                <p className="text-xs text-[#64748B]">
                  Selected Plan
                </p>

                <p className="mt-1 text-sm font-semibold text-[#0F766E]">
                  {selectedPlanData.name}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ======================================================
            SUCCESS
        ====================================================== */}

        {success && (
          <section className="mb-6 rounded-2xl border border-[#2EC4B6] bg-[#E8F8F6] p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0F766E] text-lg font-bold text-white">
                ✓
              </div>

              <div className="flex-1">
                <h2 className="font-bold text-[#1F2937]">
                  Referral request submitted
                </h2>

                <p className="mt-1 text-sm leading-6 text-[#64748B]">
                  Thank you. Your insurance referral
                  request has been submitted successfully.
                  A representative can review your request
                  and contact you using the details provided.
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                      href="/dashboard/insurance"
                    className="inline-flex items-center justify-center rounded-xl bg-[#0F766E] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#095C57]"
                  >
                    Back to Insurance
                  </Link>

                  {selectedPlanData && (
                    <Link
                      href={`/dashboard/insurance/${selectedPlanData.id}`}
                      className="inline-flex items-center justify-center rounded-xl border border-[#0F766E] bg-white px-5 py-2.5 text-sm font-semibold text-[#0F766E] transition hover:bg-[#E8F8F6]"
                    >
                      View Plan
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ======================================================
            ERROR
        ====================================================== */}

        {error && (
          <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 font-bold text-red-600">
                !
              </div>

              <p className="text-sm leading-6 text-red-700">
                {error}
              </p>
            </div>
          </section>
        )}

        {/* ======================================================
            FORM + PLAN
        ====================================================== */}

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">

          {/* FORM */}

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8"
          >
            <div className="border-b border-[#E5E7EB] pb-5">
              <h2 className="text-xl font-bold">
                Your Information
              </h2>

              <p className="mt-1 text-sm text-[#64748B]">
                Please provide accurate contact details so
                the referral team can reach you.
              </p>
            </div>

            {/* PLAN */}

            <div className="mt-6">
              <label
                htmlFor="insurance-plan"
                className="mb-2 block text-sm font-semibold"
              >
                Insurance Plan
              </label>

              <select
                id="insurance-plan"
                value={selectedPlan}
                onChange={(event) =>
                  setSelectedPlan(
                    event.target.value
                  )
                }
                className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm outline-none transition focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
              >
                <option value="">
                  Select an insurance plan
                </option>

                {plans.map((plan) => (
                  <option
                    key={plan.id}
                    value={plan.id}
                  >
                    {getProviderName(
                      plan.provider_id
                    )}{" "}
                    — {plan.name}
                  </option>
                ))}
              </select>
            </div>

            {/* FULL NAME */}

            <div className="mt-5">
              <label
                htmlFor="full-name"
                className="mb-2 block text-sm font-semibold"
              >
                Full Name
              </label>

              <input
                id="full-name"
                type="text"
                value={fullName}
                onChange={(event) =>
                  setFullName(
                    event.target.value
                  )
                }
                placeholder="Enter your full name"
                autoComplete="name"
                className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
              />
            </div>

            {/* EMAIL */}

            <div className="mt-5">
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-semibold"
              >
                Email Address
              </label>

              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(
                    event.target.value
                  )
                }
                placeholder="you@example.com"
                autoComplete="email"
                className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
              />
            </div>

            {/* PHONE */}

            <div className="mt-5">
              <label
                htmlFor="phone"
                className="mb-2 block text-sm font-semibold"
              >
                Phone Number
              </label>

              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(event) =>
                  setPhone(
                    event.target.value
                  )
                }
                placeholder="Enter your phone number"
                autoComplete="tel"
                inputMode="tel"
                className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
              />
            </div>

            {/* CITY */}

            <div className="mt-5">
              <label
                htmlFor="city"
                className="mb-2 block text-sm font-semibold"
              >
                City
              </label>

              <input
                id="city"
                type="text"
                value={city}
                onChange={(event) =>
                  setCity(
                    event.target.value
                  )
                }
                placeholder="Enter your city"
                autoComplete="address-level2"
                className="h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
              />
            </div>

            {/* MESSAGE */}

            <div className="mt-5">
              <label
                htmlFor="message"
                className="mb-2 block text-sm font-semibold"
              >
                Message{" "}
                <span className="font-normal text-[#94A3B8]">
                  (Optional)
                </span>
              </label>

              <textarea
                id="message"
                value={message}
                onChange={(event) =>
                  setMessage(
                    event.target.value
                  )
                }
                placeholder="Tell us if you have any questions..."
                rows={5}
                className="w-full resize-none rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#2EC4B6] focus:ring-2 focus:ring-[#2EC4B6]/20"
              />
            </div>

            {/* SUBMIT */}

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#0F766E] px-6 text-sm font-semibold text-white transition hover:bg-[#095C57] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting
                ? "Submitting Referral..."
                : "Request Referral"}
            </button>

            <p className="mt-4 text-center text-xs leading-5 text-[#94A3B8]">
              By submitting this form, you are
              requesting information and assistance
              regarding the selected insurance plan.
              This does not constitute an insurance
              purchase or policy issuance.
            </p>
          </form>

          {/* SELECTED PLAN */}

          <aside>
            <div className="sticky top-6 rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">

              <div className="mb-5 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#0F766E]">
                  Selected Plan
                </p>

                <span className="rounded-full bg-[#E8F8F6] px-2.5 py-1 text-[11px] font-semibold text-[#0F766E]">
                  Referral
                </span>
              </div>

              {selectedPlanData ? (
                <>
                  <h2 className="text-xl font-bold">
                    {selectedPlanData.name}
                  </h2>

                  <p className="mt-1 text-sm font-medium text-[#0F766E]">
                    {getProviderName(
                      selectedPlanData.provider_id
                    )}
                  </p>

                  <div className="mt-6 space-y-4">

                    <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-4">
                      <span className="text-sm text-[#64748B]">
                        Coverage
                      </span>

                      <strong className="text-sm">
                        {formatCoverage(
                          selectedPlanData.coverage_amount
                        )}
                      </strong>
                    </div>

                    <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-4">
                      <span className="text-sm text-[#64748B]">
                        Estimated Premium
                      </span>

                      <strong className="text-sm">
                        {formatPremium(
                          selectedPlanData.estimated_premium
                        )}
                      </strong>
                    </div>

                  </div>

                  <Link
                    href={`/dashboard/insurance/${selectedPlanData.id}`}
                    className="mt-6 block w-full rounded-xl border border-[#0F766E] px-4 py-3 text-center text-sm font-semibold text-[#0F766E] transition hover:bg-[#E8F8F6]"
                  >
                    View Plan Details
                  </Link>
                </>
              ) : (
                <div className="rounded-xl bg-[#F5F7FA] p-5">
                  <p className="text-sm leading-6 text-[#64748B]">
                    Select an insurance plan above to
                    see its details here.
                  </p>
                </div>
              )}

            </div>
          </aside>
        </div>

        {/* HOW IT WORKS */}

        <section className="mt-8 rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">
            How the referral works
          </h2>

          <div className="mt-5 grid gap-5 md:grid-cols-3">

            <div className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8F8F6] text-sm font-bold text-[#0F766E]">
                1
              </div>

              <div>
                <h3 className="text-sm font-semibold">
                  Submit your request
                </h3>

                <p className="mt-1 text-xs leading-5 text-[#64748B]">
                  Provide your contact information and
                  selected insurance plan.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8F8F6] text-sm font-bold text-[#0F766E]">
                2
              </div>

              <div>
                <h3 className="text-sm font-semibold">
                  Request is reviewed
                </h3>

                <p className="mt-1 text-xs leading-5 text-[#64748B]">
                  Your enquiry is recorded for follow-up
                  regarding the selected plan.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8F8F6] text-sm font-bold text-[#0F766E]">
                3
              </div>

              <div>
                <h3 className="text-sm font-semibold">
                  Provider follow-up
                </h3>

                <p className="mt-1 text-xs leading-5 text-[#64748B]">
                  A representative can contact you using
                  the information you submitted.
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* DISCLAIMER */}

        <section className="mt-6 rounded-2xl border border-[#E5E7EB] bg-white p-6">
          <p className="text-xs leading-5 text-[#64748B]">
            OncoCare+ provides this feature for
            informational and assistance purposes.
            Insurance plan details, premiums, eligibility,
            exclusions, waiting periods, and policy terms
            should be confirmed directly with the relevant
            insurance provider before making a decision.
          </p>
        </section>

      </div>
    </main>
  );
}