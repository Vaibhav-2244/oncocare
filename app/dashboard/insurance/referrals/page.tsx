"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";

type InsuranceReferral = {
  id: string;
  plan_id: string;
  status: string;
  created_at: string;
  plan_name: string;
  provider_name: string;
};

type ReferralPlan = {
  id: string;
  name: string;
  provider_id: string;
};

type ReferralProvider = {
  id: string;
  name: string;
};

type ReferralEnquiry = {
  id: string;
  plan_id: string;
  status: string | null;
  created_at: string;
};

export default function InsuranceReferralsPage() {
  const [referrals, setReferrals] = useState<InsuranceReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadReferrals() {
      try {
        setLoading(true);
        setError("");

        /*
         * ---------------------------------------------------------
         * 1. Get the email
         * ---------------------------------------------------------
         *
         * First use the Supabase authenticated user's email.
         * If that is unavailable, fall back to the email saved
         * after a successful insurance enquiry submission.
         */

        let referralEmail = "";

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          console.warn(
            "Could not read authenticated user:",
            authError
          );
        }

        if (user?.email) {
          referralEmail = user.email
            .trim()
            .toLowerCase();
        }

        if (!referralEmail) {
          const savedEmail =
            window.localStorage.getItem(
              "oncocare_insurance_email"
            );

          if (savedEmail) {
            referralEmail = savedEmail
              .trim()
              .toLowerCase();
          }
        }

        console.log(
          "Insurance referral email:",
          referralEmail
        );

        if (!referralEmail) {
          if (mounted) {
            setReferrals([]);
            setError(
              "We could not determine your insurance referral email."
            );
          }

          return;
        }

        /*
         * ---------------------------------------------------------
         * 2. Load enquiries using the email
         * ---------------------------------------------------------
         *
         * This uses the SECURITY DEFINER RPC:
         *
         * get_insurance_referrals_by_email(text)
         */

        const {
          data: enquiryData,
          error: enquiriesError,
        } = await supabase.rpc(
          "get_insurance_referrals_by_email",
          {
            p_email: referralEmail,
          }
        );

        if (enquiriesError) {
          console.error(
            "Insurance referral query error:",
            enquiriesError
          );

          if (mounted) {
            setReferrals([]);
            setError(
              `Unable to load your referrals: ${enquiriesError.message}`
            );
          }

          return;
        }

        const enquiries =
          (enquiryData || []) as ReferralEnquiry[];

        console.log(
          "Insurance referrals found:",
          enquiries
        );

        /*
         * ---------------------------------------------------------
         * 3. No referrals
         * ---------------------------------------------------------
         */

        if (enquiries.length === 0) {
          if (mounted) {
            setReferrals([]);
          }

          return;
        }

        /*
         * ---------------------------------------------------------
         * 4. Get plan IDs
         * ---------------------------------------------------------
         */

        const planIds = Array.from(
          new Set(
            enquiries
              .map(
                (enquiry) => enquiry.plan_id
              )
              .filter(Boolean)
          )
        );

        if (planIds.length === 0) {
          if (mounted) {
            setReferrals([]);
          }

          return;
        }

        /*
         * ---------------------------------------------------------
         * 5. Load insurance plans
         * ---------------------------------------------------------
         */

        const {
          data: plans,
          error: plansError,
        } = await supabase
          .from("insurance_plans")
          .select(
            "id, name, provider_id"
          )
          .in("id", planIds);

        if (plansError) {
          console.error(
            "Referral plans error:",
            plansError
          );

          if (mounted) {
            setError(
              `Unable to load insurance plans: ${plansError.message}`
            );
          }

          return;
        }

        const typedPlans =
          (plans || []) as ReferralPlan[];

        /*
         * ---------------------------------------------------------
         * 6. Get provider IDs
         * ---------------------------------------------------------
         */

        const providerIds = Array.from(
          new Set(
            typedPlans
              .map(
                (plan) => plan.provider_id
              )
              .filter(Boolean)
          )
        );

        /*
         * ---------------------------------------------------------
         * 7. Load insurance providers
         * ---------------------------------------------------------
         */

        let providers:
          ReferralProvider[] = [];

        if (providerIds.length > 0) {
          const {
            data: providersData,
            error: providersError,
          } = await supabase
            .from("insurance_providers")
            .select("id, name")
            .in(
              "id",
              providerIds
            );

          if (providersError) {
            console.error(
              "Referral providers error:",
              providersError
            );

            if (mounted) {
              setError(
                `Unable to load insurance providers: ${providersError.message}`
              );
            }

            return;
          }

          providers =
            (providersData ||
              []) as ReferralProvider[];
        }

        /*
         * ---------------------------------------------------------
         * 8. Combine enquiry + plan + provider
         * ---------------------------------------------------------
         */

        const referralRows: InsuranceReferral[] =
          enquiries.map((enquiry) => {
            const plan =
              typedPlans.find(
                (item) =>
                  item.id ===
                  enquiry.plan_id
              );

            const provider =
              providers.find(
                (item) =>
                  item.id ===
                  plan?.provider_id
              );

            return {
              id: enquiry.id,
              plan_id: enquiry.plan_id,
              status:
                enquiry.status || "new",
              created_at:
                enquiry.created_at,
              plan_name:
                plan?.name ||
                "Insurance Plan",
              provider_name:
                provider?.name ||
                "Insurance Provider",
            };
          });

        console.log(
          "Final referral rows:",
          referralRows
        );

        if (mounted) {
          setReferrals(
            referralRows
          );
        }
      } catch (error) {
        console.error(
          "Unexpected referral loading error:",
          error
        );

        if (mounted) {
          setReferrals([]);
          setError(
            "Something went wrong while loading your insurance referrals."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadReferrals();

    return () => {
      mounted = false;
    };
  }, []);

  const formatStatus = (
    status: string
  ) =>
    status
      .replaceAll("_", " ")
      .replace(
        /\b\w/g,
        (character) =>
          character.toUpperCase()
      );

  return (
    <main className="min-h-screen bg-[#F5F7FA] px-5 py-10 text-[#1F2937]">
      <div className="mx-auto max-w-6xl">

        {/* BACK */}
        <Link
          href="/dashboard/insurance"
          className="mb-6 inline-flex text-sm font-medium text-[#0F766E] hover:underline"
        >
          ← Back to Insurance
        </Link>

        {/* HEADER */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">
            My Insurance Referrals
          </h1>

          <p className="mt-2 text-sm text-[#64748B]">
            Track your submitted insurance
            referral requests.
          </p>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
            <p className="text-sm font-medium text-red-700">
              {error}
            </p>
          </div>
        )}

        {/* REFERRALS */}
        <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">

          {/* LOADING */}
          {loading && (
            <div className="flex min-h-[320px] items-center justify-center">
              <p className="text-sm text-[#64748B]">
                Loading your referrals...
              </p>
            </div>
          )}

          {/* EMPTY */}
          {!loading &&
            referrals.length === 0 && (
              <div className="flex min-h-[380px] flex-col items-center justify-center px-6 text-center">

                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F8F6] text-xl font-bold text-[#0F766E]">
                  +
                </div>

                <h2 className="text-lg font-bold">
                  No insurance referrals yet
                </h2>

                <p className="mt-2 max-w-md text-sm text-[#64748B]">
                  After you submit an insurance
                  referral, your request will
                  appear here.
                </p>

                <Link
                  href="/dashboard/insurance#recommendations"
                  className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#0F766E] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#095C57]"
                >
                  Explore Plans
                </Link>
              </div>
            )}

          {/* REFERRAL TABLE */}
          {!loading &&
            referrals.length > 0 && (
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

                    {referrals.map(
                      (referral) => (
                        <tr
                          key={
                            referral.id
                          }
                          className="border-b border-[#E5E7EB] last:border-0"
                        >

                          {/* PLAN */}
                          <td className="px-6 py-5">
                            <p className="text-sm font-semibold text-[#1F2937]">
                              {
                                referral.plan_name
                              }
                            </p>
                          </td>

                          {/* PROVIDER */}
                          <td className="px-6 py-5">
                            <p className="text-sm text-[#475569]">
                              {
                                referral.provider_name
                              }
                            </p>
                          </td>

                          {/* STATUS */}
                          <td className="px-6 py-5">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                referral.status ===
                                "new"
                                  ? "bg-[#E8F8F6] text-[#0F766E]"
                                  : referral.status ===
                                      "contacted"
                                    ? "bg-blue-50 text-blue-700"
                                    : referral.status ===
                                        "in_progress"
                                      ? "bg-purple-50 text-purple-700"
                                      : referral.status ===
                                          "completed"
                                        ? "bg-green-50 text-green-700"
                                        : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {formatStatus(
                                referral.status
                              )}
                            </span>
                          </td>

                          {/* DATE */}
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

                          {/* ACTION */}
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
              </div>
            )}
        </section>

        {/* DISCLAIMER */}
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