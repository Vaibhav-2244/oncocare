"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Clock3,
  LockKeyhole,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { PatientNavigation } from "@/components/patients/PatientNavigation";
import { QueueStatus } from "@/components/queue/QueueStatus";
import { Card } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Badge } from "@/components/ui/Badge";

import { getPatientQueue } from "@/features/queue/queue.service";
import { verifyPatientAccess } from "@/features/patients/patient.service";

import type { QueuePosition, QueueState } from "@/types";

interface Props {
  params: Promise<{ patientId: string }>;
}

interface QueueContext {
  entry_id: string | null;
  session_id: string | null;
  patient_id: string | null;
}

export default function QueuePage({ params }: Props) {
  const [patientId, setPatientId] = useState("");
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [queueContext, setQueueContext] =
    useState<QueueContext | null>(null);

  const [queueState, setQueueState] =
    useState<QueueState | null>(null);

  const [queuePosition, setQueuePosition] =
    useState<QueuePosition | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const resolved = await params;
        const id = resolved.patientId;

        if (!id) {
          throw new Error("PATIENT_ID_MISSING");
        }

        setPatientId(id);

        const authorized = await verifyPatientAccess(id);

        if (!authorized) {
          setUnauthorized(true);
          return;
        }

        const result = await getPatientQueue(id);

        setQueueContext(result.context);
        setQueueState(result.state);
        setQueuePosition(result.position);
      } catch (err) {
        console.error(err);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load queue information.",
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [params]);

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl px-4 py-8">
          <LoadingState />
        </div>
      </AppShell>
    );
  }

  if (unauthorized) {
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Card className="p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <LockKeyhole size={22} />
              </div>

              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  Patient access unavailable
                </h1>

                <p className="mt-2 text-sm leading-6 text-gray-500">
                  You are not currently authorized to access
                  this patient's queue information.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl px-4 py-8">
          <ErrorState />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[#0F766E]">
                Patient workspace
              </p>

              <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
                Live Queue
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
                View the patient's current queue position,
                number of patients ahead, and estimated waiting
                time.
              </p>
            </div>

            <Badge variant="info">
              <span className="inline-flex items-center gap-1.5">
                <Activity size={13} />
                Queue
              </span>
            </Badge>
          </div>
        </div>

        <PatientNavigation patientId={patientId} />

        <div className="mt-6 space-y-6">
          <QueueStatus position={queuePosition} />

          {queueContext && queuePosition && (
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
                  <Activity size={18} />
                </div>

                <div>
                  <h2 className="font-semibold text-gray-900">
                    Queue information is live
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-gray-500">
                    The queue position shown above is connected
                    to the patient's active queue session.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {!queueContext && !queuePosition && (
            <Card className="p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
                  <Clock3 size={18} />
                </div>

                <div>
                  <h2 className="font-semibold text-gray-900">
                    No active queue entry
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-gray-500">
                    There is currently no active queue entry
                    available for this patient.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {queueState && (
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Activity size={17} />
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Queue session connected
                  </p>

                  <p className="text-xs text-gray-500">
                    Current queue state is available for this
                    patient.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}