'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck, ChevronRight } from 'lucide-react';
import { BPL_PATIENT_PLACEHOLDER, fetchPatientVerification, type BplPatient, type BplVerification } from '@/lib/bpl-api';
import { ProgressBar } from './progress-bar';
import { PatientProfileHeader, VerificationItem, InfoBox } from './patient-profile-components';
import { useTranslations } from 'next-intl';

interface PatientProfileModalProps {
  patient: BplPatient;
  onClose: () => void;
  onDonate: (patient: BplPatient, amount: number) => void;
}

export function PatientProfileModal({ patient, onClose, onDonate }: PatientProfileModalProps) {
  const t = useTranslations('components.bplDonations.patientProfileModal');
  const [donationAmount, setDonationAmount] = useState('');
  const [verification, setVerification] = useState<BplVerification | null>(null);

  useEffect(() => {
    let active = true;
    fetchPatientVerification(patient.id as number)
      .then((result) => { if (active) setVerification(result); })
      .catch(() => { if (active) setVerification(null); });
    return () => { active = false; };
  }, [patient.id]);
  const remaining = Number(patient.goal_amount) - Number(patient.raised_amount);

  const handleDonate = () => {
    const amount = Number(donationAmount);
    if (amount > 0 && amount <= remaining) {
      onDonate(patient, amount);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={18} />
          {t('backToDonations')}{' '}</button>

        <div className="rounded-lg bg-white shadow-lg">
          <div className="grid gap-6 p-6 md:grid-cols-3">
            {/* Main Content */}
            <div className="md:col-span-2 space-y-6">
              <div className="space-y-4">
                <div className="aspect-video overflow-hidden rounded-lg bg-slate-100">
                  <img
                    src={patient.image_url || BPL_PATIENT_PLACEHOLDER}
                    alt={patient.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <PatientProfileHeader
                  name={patient.name}
                  verified={patient.verified}
                  urgent={patient.urgent}
                  cancerType={patient.cancer_type}
                  stage={patient.stage}
                  location={patient.location}
                />
              </div>

              <div className="space-y-4">
                <div>
                  <h2 className="mb-3 text-lg font-semibold text-slate-900">{t('patientStory')}</h2>
                  <p className="text-slate-600">{patient.summary}</p>
                  <p className="mt-3 text-slate-600">
                    {t('theFamilyIsCurrentlySeekingFinancialAssistanceToContinueTreatmentWithoutInterrup')}{' '}</p>
                </div>

                <div>
                  <h2 className="mb-3 text-lg font-semibold text-slate-900">{t('treatmentInformation')}</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InfoBox label={t('treatmentRequired')} value={patient.treatment} />
                    <InfoBox label={t('cancerType')} value={patient.cancer_type} />
                    <InfoBox label={t('currentStage')} value={patient.stage} />
                    <InfoBox label={t('location')} value={patient.location} />
                    <InfoBox label={t('age')} value={`${patient.age} years`} />
                    <InfoBox label={t('gender')} value={patient.gender} />
                  </div>
                </div>

                <div>
                  <h2 className="mb-3 text-lg font-semibold text-slate-900">{t('verificationStatus')}</h2>
                  <div className="space-y-3">
                    <VerificationItem
                      title={t('bplStatusVerified')}
                      description={t('eligibilityDocumentsReviewed')}
                      verified={verification?.bpl_status_verified ?? false}
                    />
                    <VerificationItem
                      title={t('medicalDocumentsVerified')}
                      description={t('treatmentDocumentationReviewed')}
                      verified={verification?.medical_documents_verified ?? false}
                    />
                    <VerificationItem
                      title={t('beneficiaryAccountVerified')}
                      description={t('bankAccountOwnershipVerified')}
                      verified={verification?.beneficiary_account_verified ?? false}
                    />
                  </div>
                </div>

                <div>
                  <h2 className="mb-3 text-lg font-semibold text-slate-900">{t('howYourDonationHelps')}</h2>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-teal-50 p-3">
                      <p className="font-medium text-slate-900">{t('treatmentHospitalCosts')}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {t('helpsThePatientContinuePrescribedCancerTreatment')}{' '}</p>
                    </div>
                    <div className="rounded-lg bg-teal-50 p-3">
                      <p className="font-medium text-slate-900">{t('medicines')}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {t('supportsMedicinesAndTreatmentRelatedExpenses')}{' '}</p>
                    </div>
                    <div className="rounded-lg bg-teal-50 p-3">
                      <p className="font-medium text-slate-900">{t('essentialCare')}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {t('helpsWithEssentialTreatmentSupportDuringRecovery')}{' '}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Donation Panel */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6">
              <p className="text-xs font-semibold uppercase text-slate-600">{t('treatmentFund')}</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">{t('help')}{' '}{patient.name}</h2>
              <p className="mt-2 text-sm text-slate-600">
                {t('everyContributionBringsThisPatientCloserToCompletingTreatment')}{' '}</p>

              <div className="mt-6 space-y-2 rounded-lg bg-white p-4">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">{t('raised')}</span>
                  <strong className="text-slate-900">
                    ₹{Number(patient.raised_amount).toLocaleString('en-IN')}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">{t('goal')}</span>
                  <strong className="text-slate-900">
                    ₹{Number(patient.goal_amount).toLocaleString('en-IN')}
                  </strong>
                </div>
              </div>

              <div className="mt-4">
                <ProgressBar raised={Number(patient.raised_amount)} goal={Number(patient.goal_amount)} />
              </div>

              <div className="mt-4 rounded-lg border-t border-slate-200 pt-4">
                <strong className="block text-slate-900">₹{remaining.toLocaleString('en-IN')}</strong>
                <small className="text-slate-600">{t('stillNeeded')}</small>
              </div>

              <div className="mt-6 space-y-3">
                <label className="block text-sm font-medium text-slate-900">
                  {t('chooseDonationAmount')}{' '}</label>
                <div className="grid grid-cols-2 gap-2">
                  {[500, 1000, 2500, 5000].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setDonationAmount(amount.toString())}
                      className={`rounded-lg py-2 px-3 text-sm font-medium transition-colors ${
                        Number(donationAmount) === amount
                          ? 'bg-teal-600 text-white'
                          : 'border border-slate-300 text-slate-900 hover:border-teal-600'
                      }`}
                    >
                      ₹{amount.toLocaleString('en-IN')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <input
                  type="number"
                  min="1"
                  max={remaining}
                  placeholder={t('enterCustomAmount')}
                  value={donationAmount}
                  onChange={(e) => setDonationAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              {Number(donationAmount) > remaining && (
                <p className="mt-2 text-xs text-red-600">
                  {t('donationCannotExceedTheRemainingCampaignGoal')}{' '}</p>
              )}

              <div className="mt-6 flex gap-3 rounded-lg bg-white p-4">
                <ShieldCheck size={20} className="flex-shrink-0 text-teal-600" />
                <div>
                  <p className="font-medium text-slate-900">
                    {t('directToVerifiedPatientAccount')}{' '}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {t('yourDonationIsDesignatedForThisPatientAposSVerifiedTreatmentCampaign')}{' '}</p>
                </div>
              </div>

              <button
                onClick={handleDonate}
                disabled={!donationAmount || Number(donationAmount) <= 0 || Number(donationAmount) > remaining}
                className="mt-6 w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-3 font-semibold text-white transition-colors disabled:opacity-50 hover:bg-teal-700"
              >
                {t('donate')}{' '}
                {donationAmount
                  ? t('donationAmountWithCurrency', { amount: Number(donationAmount).toLocaleString('en-IN') })
                  : ''}
                <ChevronRight size={18} />
              </button>

              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-600">
                <ShieldCheck size={14} />
                {t('secureDemoCheckoutVerifiedBeneficiary')}{' '}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
