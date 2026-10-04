"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Clock3,
  Pill,
  AlertCircle,
  Circle,
  X,
} from "lucide-react";
import { toast } from "sonner";

import type {
  Medication,
  MedicationHistory as MedicationHistoryType,
} from "@/types";

import { recordMedicationAction } from "@/features/medications/medication.service";

interface TodayMedicationScheduleProps {
  patientId: string;
  medications: Medication[];
  history: MedicationHistoryType[];
  onActionRecorded?: () => void;
}

type DoseStatus = "pending" | "taken" | "missed";

interface ScheduledDose {
  id: string;
  medication: Medication;
  scheduledAt: Date;
  timeLabel: string;
  status: DoseStatus;
}

function parseMedicationTime(
  timeValue: unknown,
  baseDate: Date,
): Date | null {
  if (typeof timeValue !== "string") {
    return null;
  }

  const value = timeValue.trim();

  if (!value) {
    return null;
  }

  const result = new Date(baseDate);

  /*
   * Supports:
   * 08:00
   * 8:00
   * 08:30
   * 8:30 AM
   * 8:30 PM
   */
  const twelveHourMatch = value.match(
    /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
  );

  if (twelveHourMatch) {
    let hours = Number(twelveHourMatch[1]);
    const minutes = Number(twelveHourMatch[2]);
    const period = twelveHourMatch[3].toUpperCase();

    if (
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes) ||
      hours < 1 ||
      hours > 12 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }

    if (period === "AM" && hours === 12) {
      hours = 0;
    }

    if (period === "PM" && hours !== 12) {
      hours += 12;
    }

    result.setHours(hours, minutes, 0, 0);

    return result;
  }

  const twentyFourHourMatch = value.match(
    /^(\d{1,2}):(\d{2})$/,
  );

  if (!twentyFourHourMatch) {
    return null;
  }

  const hours = Number(twentyFourHourMatch[1]);
  const minutes = Number(twentyFourHourMatch[2]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  result.setHours(hours, minutes, 0, 0);

  return result;
}

function isSameMinute(
  first: Date,
  second: Date,
): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate() &&
    first.getHours() === second.getHours() &&
    first.getMinutes() === second.getMinutes()
  );
}

function getHistoryStatus(
  medicationId: string,
  scheduledAt: Date,
  history: MedicationHistoryType[],
): DoseStatus {
  const matchingEntries = history
    .filter((entry) => {
      if (entry.medication_id !== medicationId) {
        return false;
      }

      if (!entry.scheduled_at) {
        return false;
      }

      const historyDate = new Date(entry.scheduled_at);

      if (Number.isNaN(historyDate.getTime())) {
        return false;
      }

      return isSameMinute(historyDate, scheduledAt);
    })
    .sort((a, b) => {
      const first = new Date(a.scheduled_at ?? 0).getTime();
      const second = new Date(b.scheduled_at ?? 0).getTime();

      return second - first;
    });

  const latest = matchingEntries[0];

  if (!latest) {
    return "pending";
  }

  if (latest.status === "taken") {
    return "taken";
  }

  if (
    latest.status === "missed" ||
    latest.status === "not_taken"
  ) {
    return "missed";
  }

  return "pending";
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function isPastDose(date: Date): boolean {
  return date.getTime() < Date.now();
}

function getStatusLabel(status: DoseStatus): string {
  switch (status) {
    case "taken":
      return "Given";

    case "missed":
      return "Missed";

    default:
      return "Pending";
  }
}

export function TodayMedicationSchedule({
  patientId,
  medications,
  history,
  onActionRecorded,
}: TodayMedicationScheduleProps) {
  const [loadingDose, setLoadingDose] = useState<string | null>(
    null,
  );

  const today = useMemo(() => new Date(), []);

  const doses = useMemo<ScheduledDose[]>(() => {
    const result: ScheduledDose[] = [];

    for (const medication of medications) {
      if (!medication.is_active) {
        continue;
      }

      if (
        medication.start_date &&
        medication.start_date > today.toISOString().slice(0, 10)
      ) {
        continue;
      }

      if (
        medication.end_date &&
        medication.end_date <
          today.toISOString().slice(0, 10)
      ) {
        continue;
      }

      const rawTimes = Array.isArray(medication.times)
        ? medication.times
        : [];

      rawTimes.forEach((time, index) => {
        const scheduledAt = parseMedicationTime(
          time,
          today,
        );

        if (!scheduledAt) {
          return;
        }

        const status = getHistoryStatus(
          medication.id,
          scheduledAt,
          history,
        );

        result.push({
          id: `${medication.id}-${scheduledAt.getTime()}-${index}`,
          medication,
          scheduledAt,
          timeLabel: formatTime(scheduledAt),
          status,
        });
      });
    }

    return result.sort(
      (a, b) =>
        a.scheduledAt.getTime() -
        b.scheduledAt.getTime(),
    );
  }, [medications, history, today]);

  const completedCount = doses.filter(
    (dose) => dose.status === "taken",
  ).length;

  const missedCount = doses.filter(
    (dose) => dose.status === "missed",
  ).length;

  const pendingCount = doses.filter(
    (dose) => dose.status === "pending",
  ).length;

  const progress =
    doses.length > 0
      ? Math.round((completedCount / doses.length) * 100)
      : 0;

  async function handleAction(
    dose: ScheduledDose,
    status: "taken" | "missed",
  ) {
    if (loadingDose) {
      return;
    }

    try {
      setLoadingDose(`${dose.id}-${status}`);

      await recordMedicationAction(
        patientId,
        dose.medication.id,
        status,
        dose.scheduledAt.toISOString(),
      );

      toast.success(
        status === "taken"
          ? `${dose.medication.name} marked as given`
          : `${dose.medication.name} marked as missed`,
      );

      onActionRecorded?.();
    } catch (error) {
      console.error(
        "Failed to record medication action:",
        error,
      );

      if (
        error instanceof Error &&
        error.message === "PATIENT_ACCESS_DENIED"
      ) {
        toast.error(
          "You are not authorized for this patient.",
        );
      } else {
        toast.error(
          "Unable to update this medication dose.",
        );
      }
    } finally {
      setLoadingDose(null);
    }
  }

  return (
    <section className="space-y-4">
      {/* Summary */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E]">
                <Pill size={21} />
              </div>

              <div>
                <h2 className="text-lg font-semibold text-[#1F2937]">
                  Today&apos;s medication schedule
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {formatDate(today)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="min-w-[78px] rounded-xl bg-[#F5F7FA] px-3 py-2 text-center">
              <p className="text-lg font-semibold text-[#1F2937]">
                {completedCount}
              </p>

              <p className="text-[11px] text-gray-500">
                Given
              </p>
            </div>

            <div className="min-w-[78px] rounded-xl bg-amber-50 px-3 py-2 text-center">
              <p className="text-lg font-semibold text-amber-700">
                {pendingCount}
              </p>

              <p className="text-[11px] text-amber-600">
                Pending
              </p>
            </div>

            <div className="min-w-[78px] rounded-xl bg-red-50 px-3 py-2 text-center">
              <p className="text-lg font-semibold text-red-700">
                {missedCount}
              </p>

              <p className="text-[11px] text-red-600">
                Missed
              </p>
            </div>
          </div>
        </div>

        {doses.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">
                Today&apos;s progress
              </span>

              <span className="text-xs font-semibold text-[#0F766E]">
                {completedCount} / {doses.length} completed
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-[#2EC4B6] transition-all duration-500"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Empty schedule */}
      {doses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F5F7FA] text-gray-400">
            <Pill size={22} />
          </div>

          <h3 className="mt-3 text-sm font-semibold text-[#1F2937]">
            No doses scheduled today
          </h3>

          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            There are no active medication times available for
            this patient today.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {doses.map((dose) => {
            const isOverdue =
              dose.status === "pending" &&
              isPastDose(dose.scheduledAt);

            const takenLoading =
              loadingDose === `${dose.id}-taken`;

            const missedLoading =
              loadingDose === `${dose.id}-missed`;

            return (
              <div
                key={dose.id}
                className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
                  dose.status === "taken"
                    ? "border-green-100"
                    : dose.status === "missed"
                      ? "border-red-100"
                      : isOverdue
                        ? "border-amber-200"
                        : "border-gray-100"
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  {/* Dose information */}
                  <div className="flex min-w-0 items-start gap-4">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        dose.status === "taken"
                          ? "bg-green-50 text-green-600"
                          : dose.status === "missed"
                            ? "bg-red-50 text-red-600"
                            : isOverdue
                              ? "bg-amber-50 text-amber-600"
                              : "bg-blue-50 text-blue-600"
                      }`}
                    >
                      {dose.status === "taken" ? (
                        <Check size={20} />
                      ) : dose.status === "missed" ? (
                        <X size={20} />
                      ) : isOverdue ? (
                        <AlertCircle size={20} />
                      ) : (
                        <Clock3 size={20} />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-[#1F2937]">
                          {dose.medication.name}
                        </h3>

                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                            dose.status === "taken"
                              ? "bg-green-50 text-green-700"
                              : dose.status === "missed"
                                ? "bg-red-50 text-red-700"
                                : isOverdue
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {getStatusLabel(dose.status)}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-gray-500">
                        {dose.medication.dosage}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 size={13} />
                          {dose.timeLabel}
                        </span>

                        <span>
                          {dose.medication.frequency}
                        </span>
                      </div>

                      {isOverdue && (
                        <p className="mt-2 text-xs font-medium text-amber-700">
                          This scheduled dose is overdue.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {dose.status === "pending" ? (
                    <div className="grid shrink-0 grid-cols-2 gap-2 lg:w-[220px]">
                      <button
                        type="button"
                        onClick={() =>
                          void handleAction(dose, "taken")
                        }
                        disabled={loadingDose !== null}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0F766E] px-3 py-2.5 text-sm font-medium text-white transition hover:bg-[#0b625c] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Check size={16} />

                        {takenLoading
                          ? "Saving..."
                          : "Given"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void handleAction(dose, "missed")
                        }
                        disabled={loadingDose !== null}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <X size={16} />

                        {missedLoading
                          ? "Saving..."
                          : "Missed"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-2 text-sm font-medium text-gray-500">
                      {dose.status === "taken" ? (
                        <>
                          <Check
                            size={17}
                            className="text-green-600"
                          />
                          Dose recorded
                        </>
                      ) : (
                        <>
                          <X
                            size={17}
                            className="text-red-600"
                          />
                          Dose marked missed
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Small explanatory note */}
      <div className="flex gap-2 rounded-xl bg-[#F5F7FA] p-3">
        <Circle
          size={14}
          className="mt-0.5 shrink-0 text-gray-400"
        />

        <p className="text-xs leading-5 text-gray-500">
          Medication details are read-only for caregivers.
          Recording a dose only updates the execution status;
          it does not change the patient&apos;s prescription.
        </p>
      </div>
    </section>
  );
}