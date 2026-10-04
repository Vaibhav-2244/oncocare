"use client";

import {
  ArrowLeft,
  FileText,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";

import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";

import { CareNotesPanel } from "@/components/care-notes/CareNotesPanel";

import {
  verifyPatientAccess,
} from "@/features/caregiver/caregiver.service";

interface CareNotesPageProps {
  params: Promise<{
    patientId: string;
  }>;
}

export default function CareNotesPage({
  params,
}: CareNotesPageProps) {
  const { patientId } = use(params);

  const [authorized, setAuthorized] =
    useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      try {
        const result =
          await verifyPatientAccess(patientId);

        if (active) {
          setAuthorized(result);
        }
      } catch (error) {
        console.error(error);

        if (active) {
          setAuthorized(false);
        }
      }
    }

    void checkAccess();

    return () => {
      active = false;
    };
  }, [patientId]);

  if (authorized === null) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <LoadingState lines={5} />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        <ErrorState
          title="Care notes unavailable"
          description="You are not authorized to access care notes for this patient."
        />

        <div className="flex justify-center">
          <Link
            href="/patients"
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0B625C]"
          >
            <ArrowLeft size={16} />
            Back to patients
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <Link
          href={`/patients/${patientId}`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft size={16} />
          Back to patient
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
            <FileText size={22} />
          </div>

          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Care Notes
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Record and review day-to-day patient observations
            </p>
          </div>
        </div>
      </div>

      <Card className="border-[#BDEBE5] bg-[#F3FBFA] p-4">
        <div className="flex gap-3">
          <ShieldCheck
            size={20}
            className="mt-0.5 shrink-0 text-[#0F766E]"
          />

          <div>
            <p className="font-medium text-gray-900">
              Caregiver observation space
            </p>

            <p className="mt-1 text-sm leading-6 text-gray-600">
              Use this area to record what you observe during
              the patient's day-to-day care. Care notes do not
              change diagnoses, prescriptions, dosages, or
              treatment plans.
            </p>
          </div>
        </div>
      </Card>

      <CareNotesPanel patientId={patientId} />
    </main>
  );
}