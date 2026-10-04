"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { PatientHeader } from "@/components/patients/PatientHeader";
import { PatientNavigation } from "@/components/patients/PatientNavigation";
import { PatientCareStatus } from "@/components/patients/PatientCareStatus";
import { PatientQuickActions } from "@/components/patients/PatientQuickActions";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";

import {
  getAuthorizedPatient,
  verifyPatientAccess,
} from "@/features/patients/patient.service";

import type { AssignedPatient } from "@/types";

interface PatientPageProps {
  params: Promise<{
    patientId: string;
  }>;
}

export default function PatientPage({
  params,
}: PatientPageProps) {
  const [patientId, setPatientId] = useState("");
  const [patient, setPatient] =
    useState<AssignedPatient | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const resolvedParams = await params;
        const id = resolvedParams.patientId;

        if (!id) {
          throw new Error("PATIENT_ID_MISSING");
        }

        if (mounted) {
          setPatientId(id);
        }

        /*
         * SECURITY BOUNDARY
         *
         * Never rely only on the patient list rendered by React.
         * This calls the database authorization function:
         *
         * is_active_caregiver_for_patient(target_patient_id)
         */
        const hasAccess = await verifyPatientAccess(id);

        if (!hasAccess) {
          if (mounted) {
            setError(
              "You are not authorized to access this patient.",
            );
          }

          return;
        }

        /*
         * After authorization succeeds, resolve the patient's
         * caregiver assignment information.
         */
        const authorizedPatient =
          await getAuthorizedPatient(id);

        if (!authorizedPatient) {
          if (mounted) {
            setError(
              "This patient is no longer available in your active caregiver assignments.",
            );
          }

          return;
        }

        if (mounted) {
          setPatient(authorizedPatient);
        }
      } catch (err) {
        console.error("Patient workspace loading error:", err);

        if (!mounted) {
          return;
        }

        if (
          err instanceof Error &&
          err.message === "AUTH_SESSION_MISSING"
        ) {
          setError(
            "The authenticated caregiver session will be provided by the OncoCare+ integration layer.",
          );
        } else if (
          err instanceof Error &&
          err.message === "PATIENT_ID_MISSING"
        ) {
          setError("A valid patient identifier is required.");
        } else {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load patient.",
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [params]);

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl space-y-5 p-5 sm:p-8">
          <LoadingState lines={6} />
        </div>
      </AppShell>
    );
  }

  if (error || !patient) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl space-y-5 p-5 sm:p-8">
          <Link
            href="/patients"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#0F766E] transition hover:text-[#0B5F59]"
          >
            <ArrowLeft size={16} />
            Back to my patients
          </Link>

          {error ===
          "The authenticated caregiver session will be provided by the OncoCare+ integration layer." ? (
            <ErrorState
              title="Caregiver session unavailable"
              description={error}
            />
          ) : (
            <Card className="p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
                <LockKeyhole size={22} />
              </div>

              <h1 className="mt-4 text-lg font-semibold text-gray-900">
                Patient access unavailable
              </h1>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
                {error ||
                  "This patient is not available for your caregiver account."}
              </p>

              <Link
                href="/patients"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0B5F59]"
              >
                Return to my patients
                <ArrowLeft size={15} />
              </Link>
            </Card>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-5 p-5 sm:p-8">
        <Link
          href="/patients"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#0F766E] transition hover:text-[#0B5F59]"
        >
          <ArrowLeft size={16} />
          My patients
        </Link>

        <PatientHeader patient={patient} />

        <PatientNavigation patientId={patientId} />

        <PatientCareStatus
          relationship={
            patient.relationship || "Caregiver"
          }
          status={patient.status}
        />

        <div>
          <h2 className="text-lg font-bold text-gray-900">
            Patient care
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Access the care information and coordination
            tools available to you.
          </p>
        </div>

        <PatientQuickActions patientId={patientId} />

        <EmptyState
          title="Today's care activity"
          description="Tasks, appointments, queue activity and other caregiver actions will appear here as their respective backend contracts are connected."
        />
      </div>
    </AppShell>
  );
}