"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Pill,
  XCircle,
} from "lucide-react";

interface MedicationSummaryItem {
  patientId: string;
  patientName: string;
  total: number;
  completed: number;
  pending: number;
  missed: number;
  nextMedicationName?: string | null;
  nextMedicationTime?: string | null;
  nextMedicationAt?: string | null;
}

interface MedicationSummaryProps {
  items: MedicationSummaryItem[];
  loading?: boolean;
}

export function MedicationSummary({
  items,
  loading = false,
}: MedicationSummaryProps) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-100" />

          <div className="space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
            <div className="h-3 w-56 animate-pulse rounded bg-gray-100" />
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="h-24 animate-pulse rounded-xl bg-gray-50" />
          <div className="h-24 animate-pulse rounded-xl bg-gray-50" />
        </div>
      </section>
    );
  }

  const totalDoses = items.reduce(
    (sum, item) => sum + item.total,
    0,
  );

  const completedDoses = items.reduce(
    (sum, item) => sum + item.completed,
    0,
  );

  const pendingDoses = items.reduce(
    (sum, item) => sum + item.pending,
    0,
  );

  const missedDoses = items.reduce(
    (sum, item) => sum + item.missed,
    0,
  );

  const overallProgress =
    totalDoses > 0
      ? Math.round((completedDoses / totalDoses) * 100)
      : 0;

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E]">
            <Pill size={19} />
          </div>

          <div>
            <h2 className="font-semibold text-[#1F2937]">
              Today&apos;s medications
            </h2>

            <p className="mt-0.5 text-sm text-gray-500">
              Medication execution across your assigned patients
            </p>
          </div>
        </div>

        <Link
          href="/patients"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0F766E] hover:text-[#0b625c]"
        >
          View patients
          <ArrowRight size={15} />
        </Link>
      </div>

      {/* Overall summary */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-[#F5F7FA] p-3">
          <p className="text-xs text-gray-500">
            Total doses
          </p>

          <p className="mt-1 text-xl font-semibold text-[#1F2937]">
            {totalDoses}
          </p>
        </div>

        <div className="rounded-xl bg-green-50 p-3">
          <p className="text-xs text-green-700">
            Given
          </p>

          <p className="mt-1 text-xl font-semibold text-green-800">
            {completedDoses}
          </p>
        </div>

        <div className="rounded-xl bg-amber-50 p-3">
          <p className="text-xs text-amber-700">
            Pending
          </p>

          <p className="mt-1 text-xl font-semibold text-amber-800">
            {pendingDoses}
          </p>
        </div>

        <div className="rounded-xl bg-red-50 p-3">
          <p className="text-xs text-red-700">
            Missed
          </p>

          <p className="mt-1 text-xl font-semibold text-red-800">
            {missedDoses}
          </p>
        </div>
      </div>

      {/* Overall progress */}
      {totalDoses > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">
              Overall progress
            </span>

            <span className="text-xs font-semibold text-[#0F766E]">
              {overallProgress}%
            </span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-[#2EC4B6] transition-all duration-500"
              style={{
                width: `${overallProgress}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Patient summaries */}
      <div className="mt-5 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
            <Pill
              size={22}
              className="mx-auto text-gray-300"
            />

            <p className="mt-2 text-sm font-medium text-gray-600">
              No medication schedules available
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Medication information will appear here for
              your assigned patients.
            </p>
          </div>
        ) : (
          items.map((item) => {
            const progress =
              item.total > 0
                ? Math.round(
                    (item.completed / item.total) * 100,
                  )
                : 0;

            return (
              <div
                key={item.patientId}
                className="rounded-xl border border-gray-100 p-4 transition hover:border-teal-100 hover:bg-teal-50/20"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <Link
                      href={`/patients/${item.patientId}/medications`}
                      className="font-medium text-[#1F2937] hover:text-[#0F766E]"
                    >
                      {item.patientName}
                    </Link>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                        <CheckCircle2 size={12} />
                        {item.completed} given
                      </span>

                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                        <Clock3 size={12} />
                        {item.pending} pending
                      </span>

                      {item.missed > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                          <XCircle size={12} />
                          {item.missed} missed
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-full lg:max-w-[260px]">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {item.completed} / {item.total}
                        {" "}completed
                      </span>

                      <span className="text-xs font-semibold text-[#0F766E]">
                        {progress}%
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

                    {item.nextMedicationName && (
                      <Link
                        href={`/patients/${item.patientId}/medications`}
                        className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#0F766E]"
                      >
                        <Clock3 size={12} />

                        Next:
                        {" "}
                        <span className="font-medium">
                          {item.nextMedicationName}
                        </span>

                        {item.nextMedicationTime && (
                          <>
                            {" "}
                            · {item.nextMedicationTime}
                          </>
                        )}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Missed-dose alert */}
      {missedDoses > 0 && (
        <div className="mt-4 flex gap-3 rounded-xl border border-red-100 bg-red-50 p-3">
          <AlertCircle
            size={17}
            className="mt-0.5 shrink-0 text-red-600"
          />

          <div>
            <p className="text-sm font-medium text-red-800">
              Medication follow-up needed
            </p>

            <p className="mt-0.5 text-xs leading-5 text-red-700">
              {missedDoses} medication{" "}
              {missedDoses === 1 ? "dose has" : "doses have"}{" "}
              been marked missed today.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}