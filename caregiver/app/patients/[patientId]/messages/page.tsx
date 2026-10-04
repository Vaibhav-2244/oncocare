"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useParams } from "next/navigation";

import { AppShell } from "@/components/layout/AppShell";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PatientHeader } from "@/components/patients/PatientHeader";
import { MessagesPanel } from "@/components/messages/MessagesPanel";

import { getAuthorizedPatient } from "@/features/patients/patient.service";
import { getCurrentUser } from "@/features/caregiver/caregiver.service";

import type { AssignedPatient } from "@/types";

export default function PatientMessagesPage() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId;

  const [patient, setPatient] = useState<AssignedPatient | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [authorizedPatient, user] = await Promise.all([
          getAuthorizedPatient(patientId),
          getCurrentUser(),
        ]);

        if (!authorizedPatient) {
          throw new Error("PATIENT_ACCESS_DENIED");
        }

        setPatient(authorizedPatient);
        setCurrentUserId(user?.id ?? null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load patient messages."
        );
      } finally {
        setLoading(false);
      }
    }

    if (patientId) {
      void load();
    }
  }, [patientId]);

  if (loading) {
    return (
      <AppShell>
        <LoadingState />
      </AppShell>
    );
  }

  if (error || !patient) {
    return (
      <AppShell>
        <ErrorState
          title={
            error === "PATIENT_ACCESS_DENIED"
              ? "Patient messages unavailable"
              : "Unable to load patient messages"
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PatientHeader patient={patient} />

        <div>
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E]">
              <MessageCircle className="h-5 w-5" />
            </div>

            <div>
              <h1 className="text-2xl font-semibold text-[#1F2937]">
                Messages
              </h1>

              <p className="text-sm text-gray-500">
                Communicate directly with {patient.patient_name}.
              </p>
            </div>
          </div>

          <MessagesPanel
            patientId={patient.patient_id}
            currentUserId={currentUserId}
          />
        </div>
      </div>
    </AppShell>
  );
}