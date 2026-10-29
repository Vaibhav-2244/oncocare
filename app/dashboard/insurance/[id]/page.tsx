"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase-client";
import { PaymentCheckoutButton } from "@/components/payments/checkout-button";
import { useTranslations } from 'next-intl';

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
type InsuranceOffer = { offer_type: 'one-time'; amount_in_paise: number; duration_days: number | null };
type InsuranceApplication = { id: string; order_id: string; plan_id: string; issuance_status: string; created_at: string };

export default function InsurancePlanDetailsPage() {
  const t = useTranslations('insurance.id');
  const params = useParams();
  const planId = params.id as string;

  const [plan, setPlan] = useState<InsurancePlan | null>(null);
  const [provider, setProvider] =
    useState<InsuranceProvider | null>(null);
  const [paymentOffers, setPaymentOffers] = useState<InsuranceOffer[]>([]);
  const [paymentOfferError, setPaymentOfferError] = useState('');
  const [applications, setApplications] = useState<InsuranceApplication[]>([]);
  const [applicationError, setApplicationError] = useState('');
  const [applicationsLoading, setApplicationsLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadApplications = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setApplications([]);
      return;
    }
    setApplicationsLoading(true);
    setApplicationError('');
    try {
      const response = await fetch('/api/payments/insurance-applications', {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load insurance application status.');
      setApplications((payload.applications ?? []).filter((application: InsuranceApplication) => application.plan_id === planId));
    } catch (applicationLoadError) {
      setApplicationError(applicationLoadError instanceof Error ? applicationLoadError.message : 'Unable to load insurance application status.');
    } finally {
      setApplicationsLoading(false);
    }
  }, [planId]);

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
      setPaymentOfferError("");
      setPaymentOffers([]);

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

      const offersResponse = await fetch(`/api/payments/offers?kind=insurance&entityId=${encodeURIComponent(planData.id)}`, { cache: 'no-store' });
      if (offersResponse.ok) {
        const offersPayload = await offersResponse.json();
        setPaymentOffers((offersPayload.offers ?? []).filter((offer: InsuranceOffer) => offer.offer_type === 'one-time'));
      } else {
        setPaymentOffers([]);
        setPaymentOfferError('Current payment options are unavailable.');
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

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  // ============================================================
  // LOADING STATE
  // ============================================================

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F5F7FA] px-6 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-12 text-center shadow-sm">
            <p className="text-sm text-[#64748B]">
              {t('loadingInsurancePlanDetails')}{' '}</p>
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
            {t('backToInsurance')}{' '}</Link>

          <div className="rounded-2xl border border-red-200 bg-white p-10 text-center shadow-sm">
            <h1 className="text-xl font-bold text-[#1F2937]">
              {t('insurancePlanNotFound')}{' '}</h1>

            <p className="mt-2 text-sm text-[#64748B]">
              {error ||
                t('theRequestedInsurancePlanCouldNotBeFound')}
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
          {t('backToRecommendations')}{' '}</Link>

        {/* ====================================================== */}
        {/* PLAN HEADER */}
        {/* ====================================================== */}

        <section className="mb-6 rounded-2xl border border-[#E5E7EB] bg-white p-7 shadow-sm">
          <p className="text-sm font-medium text-[#0F766E]">
            {provider?.name || t('insuranceProvider')}
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
                {t('cancerCoverage')}{' '}</span>
            </div>
          )}
        </section>

        {/* ====================================================== */}
        {/* PLAN OVERVIEW */}
        {/* ====================================================== */}

        <section className="mb-6">
          <h2 className="mb-4 text-xl font-bold">
            {t('planOverview')}{' '}</h2>

          <div className="grid gap-4 md:grid-cols-2">

            {/* COVERAGE */}

            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
              <p className="text-sm text-[#64748B]">
                {t('coverageAmount')}{' '}</p>

              <p className="mt-2 text-2xl font-bold">
                {formatCoverage(plan.coverage_amount)}
              </p>

              <p className="mt-1 text-xs text-[#64748B]">
                {t('coverageAvailableUnderThisPlan')}{' '}</p>
            </div>

            {/* PREMIUM */}

            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
              <p className="text-sm text-[#64748B]">
                {t('estimatedPremium')}{' '}</p>

              <p className="mt-2 text-2xl font-bold">
                {formatPremium(plan.estimated_premium)}
              </p>

              <p className="mt-1 text-xs text-[#64748B]">
                {t('estimatedAnnualPremium')}{' '}</p>
            </div>

            {/* WAITING PERIOD */}

            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
              <p className="text-sm text-[#64748B]">
                {t('waitingPeriod')}{' '}</p>

              <p className="mt-2 text-2xl font-bold">
                {plan.waiting_period_months} {t('months')}{' '}</p>

              <p className="mt-1 text-xs text-[#64748B]">
                {t('waitingPeriodForCancerCoverage')}{' '}</p>
            </div>

            {/* HOSPITAL NETWORK */}

            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
              <p className="text-sm text-[#64748B]">
                {t('hospitalNetwork')}{' '}</p>

              <p className="mt-2 text-2xl font-bold">
                {plan.hospital_network_size}+
              </p>

              <p className="mt-1 text-xs text-[#64748B]">
                {t('hospitalsInTheAvailableNetwork')}{' '}</p>
            </div>

          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Configured payment options</h2>
          <p className="mt-1 text-sm text-[#64748B]">Payment confirms only your application. Insurance coverage begins only after the insurer&apos;s separate policy issuance and confirmation. Recurring billing is not configured; displayed payment options are one-time charges only.</p>
          {paymentOfferError && <p role="alert" className="mt-4 text-sm text-rose-700">{paymentOfferError}</p>}
          {paymentOffers.length === 0 && !paymentOfferError && <p className="mt-4 text-sm text-[#64748B]">No approved payment offer is configured for this plan.</p>}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {paymentOffers.map((offer) => (
              <div key={offer.offer_type} className="rounded-xl border border-slate-200 p-4">
                <p className="font-semibold capitalize text-slate-800">{offer.offer_type.replace('-', ' ')}</p>
                <p className="my-2 text-xl font-bold text-teal-700">₹{(Number(offer.amount_in_paise) / 100).toLocaleString('en-IN')}</p>
                {offer.duration_days && <p className="mb-3 text-xs text-slate-500">{offer.duration_days} day plan term</p>}
                <PaymentCheckoutButton
                  payload={{ kind: 'insurance', insurancePlanId: plan.id, offerType: offer.offer_type }}
                  description={`${provider?.name ?? 'Insurance'} - ${plan.name}`}
                  onPaymentComplete={() => { void loadApplications(); }}
                />
              </div>
            ))}
          </div>
        </section>
        <section className="mb-6 rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Your application status</h2>
          {applicationError && <p role="alert" className="mt-3 text-sm text-rose-700">{applicationError}</p>}
          {applicationsLoading && <p className="mt-3 text-sm text-slate-500">Loading application status…</p>}
          {!applicationsLoading && applications.length === 0 && <p className="mt-3 text-sm text-[#64748B]">No payment-backed application is recorded for this plan.</p>}
          <div className="mt-3 space-y-2">
            {applications.map((application) => (
              <article key={application.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-semibold capitalize text-slate-800">{application.issuance_status.replaceAll('_', ' ')}</p>
                <p className="mt-1 text-xs text-slate-500">Application {application.id} · submitted {new Date(application.created_at).toLocaleString()}</p>
                {application.issuance_status !== 'issued' && <p className="mt-1 text-xs text-slate-600">This status does not indicate policy issuance or active coverage.</p>}
              </article>
            ))}
          </div>
        </section>

        {/* ====================================================== */}
        {/* BENEFITS */}
        {/* ====================================================== */}

        <section className="mb-6 rounded-2xl border border-[#E5E7EB] bg-white p-7 shadow-sm">
          <h2 className="text-xl font-bold">
            {t('planBenefits')}{' '}</h2>

          <p className="mt-1 text-sm text-[#64748B]">
            {t('benefitsAvailableUnderThisInsurancePlan')}{' '}</p>

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
              {t('noAdditionalBenefitsHaveBeenListedForThisPlan')}{' '}</p>
          )}
        </section>

        {/* ====================================================== */}
        {/* PROVIDER INFORMATION */}
        {/* ====================================================== */}

        {provider && (
          <section className="mb-6 rounded-2xl border border-[#E5E7EB] bg-white p-7 shadow-sm">
            <h2 className="text-xl font-bold">
              {t('insuranceProvider')}{' '}</h2>

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
            {t('insuranceInformationShownHereIsProvidedForComparisonAndInformationalPurposesEsti')}{' '}</p>
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
            {t('backToRecommendations')}{' '}</Link>

          {/* APPLY / SUBMIT ENQUIRY */}

          <Link
            href={`/dashboard/insurance/apply?plan=${plan.id}`}
            className="inline-flex w-full justify-center rounded-xl border border-[#0F766E] bg-white px-7 py-3 text-sm font-semibold text-[#0F766E] transition hover:bg-[#E8F8F6] sm:w-auto"
          >
            {t('applySubmitEnquiry')}{' '}</Link>

          {/* COMPARE */}

          <Link
            href={`/dashboard/insurance/compare?plan=${plan.id}`}
            className="inline-flex w-full justify-center rounded-xl bg-[#2EC4B6] px-7 py-3 text-sm font-semibold text-white transition hover:bg-[#0F766E] sm:w-auto"
          >
            {t('compareThisPlan')}{' '}</Link>

        </div>

      </div>
    </main>
  );
}
