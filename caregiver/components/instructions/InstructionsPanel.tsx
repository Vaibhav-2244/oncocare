"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, Loader2 } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";

import {
  getPatientInstructions,
  updateInstructionStatus,
} from "@/features/instructions/instruction.service";

import type {
  DoctorCaregiverInstruction,
  InstructionStatus,
} from "@/types";

interface InstructionsPanelProps {
  patientId: string;
}

function formatDate(value: string | null) {
  if (!value) return "No due date";

  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function priorityLabel(priority: string) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function priorityClass(priority: string) {
  switch (priority) {
    case "urgent":
      return "bg-red-50 text-red-700 border-red-100";
    case "high":
      return "bg-amber-50 text-amber-700 border-amber-100";
    case "low":
      return "bg-gray-50 text-gray-600 border-gray-100";
    default:
      return "bg-blue-50 text-blue-700 border-blue-100";
  }
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function InstructionsPanel({
  patientId,
}: InstructionsPanelProps) {
  const [instructions, setInstructions] = useState<
    DoctorCaregiverInstruction[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadInstructions() {
    try {
      setLoading(true);
      setError(null);

      const data = await getPatientInstructions(patientId);

      setInstructions(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load doctor instructions.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInstructions();
  }, [patientId]);

  async function handleStatusUpdate(
    instructionId: string,
    status: InstructionStatus,
  ) {
    try {
      setUpdatingId(instructionId);
      setError(null);

      const updated = await updateInstructionStatus(
        patientId,
        instructionId,
        status,
      );

      setInstructions((current) =>
        current.map((instruction) =>
          instruction.id === updated.id ? updated : instruction,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update instruction.",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return <LoadingState lines={5} />;
  }

  if (error && instructions.length === 0) {
    return (
      <ErrorState
        title="Unable to load instructions"
        description={error}
      />
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {instructions.length === 0 ? (
        <EmptyState
          title="No doctor instructions"
          description="There are no caregiver instructions for this patient."
        />
      ) : (
        instructions.map((instruction) => {
          const isUpdating = updatingId === instruction.id;

          return (
            <Card key={instruction.id} className="p-5 sm:p-6">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-gray-900">
                        {instruction.title}
                      </h3>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${priorityClass(
                          instruction.priority,
                        )}`}
                      >
                        {priorityLabel(instruction.priority)}
                      </span>
                    </div>

                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      {instruction.instruction_text}
                    </p>
                  </div>

                  <Badge>
                    {statusLabel(instruction.status)}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 size={14} />
                    Due: {formatDate(instruction.due_at)}
                  </span>

                  <span>
                    Issued: {formatDate(instruction.created_at)}
                  </span>
                </div>

                {instruction.status !== "completed" &&
                  instruction.status !== "cancelled" && (
                    <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                      {instruction.status === "pending" && (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() =>
                            void handleStatusUpdate(
                              instruction.id,
                              "acknowledged",
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0B625C] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isUpdating && <Loader2 size={15} className="animate-spin" />}
                          Acknowledge
                        </button>
                      )}

                      {(instruction.status === "pending" ||
                        instruction.status === "acknowledged") && (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() =>
                            void handleStatusUpdate(
                              instruction.id,
                              "in_progress",
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Start
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() =>
                          void handleStatusUpdate(
                            instruction.id,
                            "completed",
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-[#BDEBE5] bg-[#F3FBFA] px-4 py-2 text-sm font-medium text-[#0F766E] transition hover:bg-[#E8F8F6] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <CheckCircle2 size={15} />
                        Mark completed
                      </button>
                    </div>
                  )}
              </div>
            </Card>
          );
        })
      )}

      <button
        type="button"
        onClick={() => void loadInstructions()}
        className="text-sm font-medium text-[#0F766E] hover:underline"
      >
        Refresh instructions
      </button>
    </div>
  );
}