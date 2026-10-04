"use client";

import { useState } from "react";
import { Check, Clock3, Pill, X } from "lucide-react";
import { toast } from "sonner";

import type { Medication } from "@/types";
import { recordMedicationAction } from "@/features/medications/medication.service";
import { Card } from "@/components/ui/Card";

interface MedicationItemProps {
  medication: Medication;
  patientId: string;
  onActionRecorded?: () => void;
}

export function MedicationItem({
  medication,
  patientId,
  onActionRecorded,
}: MedicationItemProps) {
  const [loading, setLoading] = useState<"taken" | "missed" | null>(null);

  async function handleAction(status: "taken" | "missed") {
    if (loading) return;

    try {
      setLoading(status);

      await recordMedicationAction(
        patientId,
        medication.id,
        status,
        new Date().toISOString(),
      );

      toast.success(
        status === "taken"
          ? `${medication.name} marked as given`
          : `${medication.name} marked as missed`,
      );

      onActionRecorded?.();
    } catch (error) {
      console.error("Medication action failed:", error);

      toast.error(
        error instanceof Error
          ? error.message === "PATIENT_ACCESS_DENIED"
            ? "You are not authorized for this patient."
            : "Unable to update medication status."
          : "Unable to update medication status.",
      );
    } finally {
      setLoading(null);
    }
  }

  const times = Array.isArray(medication.times)
    ? medication.times
    : [];

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#0F766E]">
              <Pill size={21} />
            </div>

            <div className="min-w-0">
              <h3 className="font-semibold text-[#1F2937]">
                {medication.name}
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                {medication.dosage}
              </p>

              <p className="mt-1 text-xs text-gray-400">
                {medication.frequency}
              </p>
            </div>
          </div>

          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
              medication.is_active
                ? "bg-green-50 text-green-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {medication.is_active ? "Active" : "Inactive"}
          </span>
        </div>

        {times.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {times.map((time, index) => (
              <span
                key={`${String(time)}-${index}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#F5F7FA] px-3 py-1.5 text-xs text-gray-600"
              >
                <Clock3 size={13} />
                {String(time)}
              </span>
            ))}
          </div>
        )}

        {medication.notes && (
          <p className="rounded-xl bg-[#F5F7FA] px-3 py-2 text-sm text-gray-600">
            {medication.notes}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={() => handleAction("taken")}
            disabled={loading !== null}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#0b625c] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check size={17} />

            {loading === "taken" ? "Saving..." : "Given"}
          </button>

          <button
            type="button"
            onClick={() => handleAction("missed")}
            disabled={loading !== null}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={17} />

            {loading === "missed" ? "Saving..." : "Missed"}
          </button>
        </div>
      </div>
    </Card>
  );
}