"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  LockKeyhole,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { PatientNavigation } from "@/components/patients/PatientNavigation";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Badge } from "@/components/ui/Badge";

import {
  getPatientTimeline,
  verifyPatientAccess,
} from "@/features/patients/patient.service";

import {
  formatDateTime,
  titleCase,
} from "@/lib/utils";

import type { PatientActivity } from "@/types";

interface Props {
  params: Promise<{
    patientId: string;
  }>;
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

function detailLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

export default function TimelinePage({
  params,
}: Props) {
  const [patientId, setPatientId] = useState("");

  const [events, setEvents] = useState<
    PatientActivity[]
  >([]);

  const [loading, setLoading] = useState(true);

  const [unauthorized, setUnauthorized] =
    useState(false);

  const [error, setError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    async function load() {
      try {
        const resolved = await params;
        const id = resolved.patientId;

        if (!id) {
          throw new Error("PATIENT_ID_MISSING");
        }

        setPatientId(id);

        const authorized =
          await verifyPatientAccess(id);

        if (!authorized) {
          setUnauthorized(true);
          return;
        }

        const data = await getPatientTimeline(id);

        setEvents(data);
      } catch (err) {
        console.error(err);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load patient timeline.",
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
        <div className="mx-auto max-w-7xl p-5 sm:p-8">
          <LoadingState lines={7} />
        </div>
      </AppShell>
    );
  }

  if (unauthorized) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl p-5 sm:p-8">
          <Card className="p-8 text-center">
            <LockKeyhole
              className="mx-auto text-red-500"
              size={25}
            />

            <h1 className="mt-4 text-lg font-semibold text-gray-900">
              Patient access unavailable
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              You are not authorized to view this
              patient&apos;s timeline.
            </p>
          </Card>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl p-5 sm:p-8">
          <ErrorState
            title="Unable to load timeline"
            description={error}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-5 p-5 sm:p-8">
        <div>
          <p className="text-sm font-medium text-[#0F766E]">
            Patient care
          </p>

          <div className="mt-1 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
              <Activity size={19} />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Patient Timeline
              </h1>

              <p className="mt-1 text-sm text-gray-500">
                Recent care activity associated with this
                patient.
              </p>
            </div>
          </div>
        </div>

        <PatientNavigation patientId={patientId} />

        {events.length === 0 ? (
          <EmptyState
            title="No timeline events"
            description="No caregiver-visible patient journey events are currently available."
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="border-b border-gray-100 bg-gray-50/70 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    Care activity
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    {events.length}{" "}
                    {events.length === 1
                      ? "event"
                      : "events"}{" "}
                    available
                  </p>
                </div>

                <Badge variant="info">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays size={13} />
                    Timeline
                  </span>
                </Badge>
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {events.map((event) => {
                const detailEntries =
                  event.details &&
                  typeof event.details === "object"
                    ? Object.entries(event.details)
                    : [];

                return (
                  <div
                    key={event.id}
                    className="flex gap-4 p-5 sm:p-6"
                  >
                    <div className="relative flex shrink-0 flex-col items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F8F6] text-[#0F766E]">
                        <Activity size={16} />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h2 className="text-sm font-semibold text-gray-900">
                            {titleCase(event.event_type)}
                          </h2>

                          <p className="mt-1 text-xs text-gray-400">
                            {formatDateTime(
                              event.created_at,
                            )}
                          </p>
                        </div>

                        {event.is_demo && (
                          <Badge variant="warning">
                            Demo
                          </Badge>
                        )}
                      </div>

                      {detailEntries.length > 0 && (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {detailEntries.map(
                            ([key, value]) => (
                              <div
                                key={key}
                                className="rounded-xl border border-gray-100 bg-gray-50 p-3"
                              >
                                <p className="text-xs font-medium text-gray-400">
                                  {detailLabel(key)}
                                </p>

                                <p className="mt-1 break-words text-sm text-gray-700">
                                  {formatDetailValue(
                                    value,
                                  )}
                                </p>
                              </div>
                            ),
                          )}
                        </div>
                      )}

                      {detailEntries.length === 0 &&
                        event.details && (
                          <div className="mt-4 rounded-xl bg-gray-50 p-3">
                            <p className="text-xs text-gray-500">
                              Additional event details are
                              available.
                            </p>
                          </div>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}