"use client";

import { use, useCallback, useEffect, useState } from "react";
import { AlertCircle, Pill } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { PatientNavigation } from "@/components/patients/PatientNavigation";
import { MedicationItem } from "@/components/medications/MedicationItem";
import { MedicationHistory } from "@/components/medications/MedicationHistory";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";

import {
  getPatientMedications,
  getMedicationHistory,
} from "@/features/medications/medication.service";

import { verifyPatientAccess } from "@/features/caregiver/caregiver.service";

import type {
  Medication,
  MedicationHistory as MedicationHistoryType,
} from "@/types";

interface PageProps {
  params: Promise<{
    patientId: string;
  }>;
}

export default function PatientMedicationsPage({
  params,
}: PageProps) {
  const { patientId } = use(params);

  const [medications, setMedications] = useState<Medication[]>([]);
  const [history, setHistory] = useState<MedicationHistoryType[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  const loadMedicationData = useCallback(
    async (showFullLoader = false) => {
      if (!patientId) {
        setError("PATIENT_ID_MISSING");
        setLoading(false);
        return;
      }

      try {
        if (showFullLoader) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }

        setError(null);

        /*
         * Authorization is checked before retrieving
         * any patient-specific medication information.
         */
        const hasAccess = await verifyPatientAccess(patientId);

        if (!hasAccess) {
          setAuthorized(false);
          setMedications([]);
          setHistory([]);
          return;
        }

        setAuthorized(true);

        /*
         * Both medication queries use caregiver-authorized
         * Supabase RPCs.
         */
        const [medicationData, historyData] = await Promise.all([
          getPatientMedications(patientId),
          getMedicationHistory(patientId),
        ]);

        setMedications(medicationData);
        setHistory(historyData);
      } catch (err) {
        console.error(
          "Failed to load patient medications:",
          err,
        );

        if (
          err instanceof Error &&
          err.message === "AUTH_SESSION_MISSING"
        ) {
          setError("AUTH_SESSION_MISSING");
        } else if (
          err instanceof Error &&
          err.message === "PATIENT_ACCESS_DENIED"
        ) {
          setAuthorized(false);
          setMedications([]);
          setHistory([]);
        } else {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load medication information.",
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [patientId],
  );

  useEffect(() => {
    void loadMedicationData(true);
  }, [loadMedicationData]);

  /*
   * Reload medication data after the caregiver
   * records Given / Missed.
   */
  const handleMedicationActionRecorded = useCallback(
    async () => {
      await loadMedicationData(false);
    },
    [loadMedicationData],
  );

  if (loading) {
    return (
      <AppShell>
        <LoadingState />
      </AppShell>
    );
  }

  if (error === "AUTH_SESSION_MISSING") {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl">
          <ErrorState
            title="Caregiver workspace isn't connected yet"
          />
        </div>
      </AppShell>
    );
  }

  if (error === "PATIENT_ID_MISSING") {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl">
          <ErrorState
            title="Patient not found"
          />
        </div>
      </AppShell>
    );
  }

  if (authorized === false) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl">
          <ErrorState
            title="Patient access unavailable"
          />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl">
          <ErrorState
            title="Unable to load medications"
            onRetry={() => void loadMedicationData(true)}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <PatientNavigation patientId={patientId} />

        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E]">
                <Pill size={21} />
              </div>

              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-[#1F2937]">
                  Medications
                </h1>

                <p className="mt-1 text-sm text-gray-500">
                  View prescribed medications and record care
                  actions.
                </p>
              </div>
            </div>
          </div>

          {refreshing && (
            <div className="text-sm text-gray-400">
              Updating...
            </div>
          )}
        </div>

        {/* Clinical boundary */}
        <div className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <AlertCircle
            size={19}
            className="mt-0.5 shrink-0 text-[#3B82F6]"
          />

          <div>
            <p className="text-sm font-medium text-blue-900">
              Caregiver medication access
            </p>

            <p className="mt-1 text-sm leading-6 text-blue-800">
              You can record whether a prescribed medication
              was given or missed. Medication names, dosage,
              frequency, and prescriptions are read-only in
              the caregiver workspace.
            </p>
          </div>
        </div>

        {/* Medication list */}
        {medications.length === 0 ? (
          <EmptyState
            title="No medications available"
          />
        ) : (
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-[#1F2937]">
                Current medications
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                {medications.length}{" "}
                {medications.length === 1
                  ? "medication"
                  : "medications"}{" "}
                available
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {medications.map((medication) => (
                <MedicationItem
                  key={medication.id}
                  medication={medication}
                  patientId={patientId}
                  onActionRecorded={
                    handleMedicationActionRecorded
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* Medication history */}
        <section className="space-y-4 pt-4">
          <div>
            <h2 className="text-lg font-semibold text-[#1F2937]">
              Medication history
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Recent medication execution and response history.
            </p>
          </div>

          <MedicationHistory history={history} />
        </section>
      </div>
    </AppShell>
  );
}