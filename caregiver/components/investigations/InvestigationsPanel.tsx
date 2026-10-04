"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  FlaskConical,
} from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";

import { getPatientInvestigations } from "@/features/investigations/investigation.service";

import type { PatientInvestigation } from "@/types";

interface InvestigationsPanelProps {
  patientId: string;
}

function formatDate(value: string | null) {
  if (!value) return "Not scheduled";

  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatStatus(status: string) {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();

  if (
    normalized.includes("completed") ||
    normalized.includes("report_ready") ||
    normalized.includes("reviewed")
  ) {
    return "bg-green-50 text-green-700 border-green-100";
  }

  if (
    normalized.includes("cancelled") ||
    normalized.includes("failed")
  ) {
    return "bg-red-50 text-red-700 border-red-100";
  }

  if (
    normalized.includes("processing") ||
    normalized.includes("in_progress") ||
    normalized.includes("checked_in")
  ) {
    return "bg-blue-50 text-blue-700 border-blue-100";
  }

  return "bg-amber-50 text-amber-700 border-amber-100";
}

export function InvestigationsPanel({
  patientId,
}: InvestigationsPanelProps) {
  const [investigations, setInvestigations] = useState<
    PatientInvestigation[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadInvestigations() {
    try {
      setLoading(true);
      setError(null);

      const data = await getPatientInvestigations(patientId);

      setInvestigations(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load investigations.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInvestigations();
  }, [patientId]);

  if (loading) {
    return <LoadingState lines={5} />;
  }

  if (error && investigations.length === 0) {
    return (
      <ErrorState
        title="Unable to load investigations"
        description={error}
      />
    );
  }

  if (investigations.length === 0) {
    return (
      <EmptyState
        title="No investigations"
        description="No investigation orders are available for this patient."
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {investigations.map((investigation) => (
        <Card
          key={investigation.id}
          className="p-5 sm:p-6"
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
                  <FlaskConical size={19} />
                </div>

                <div>
                  <h2 className="font-semibold text-gray-900">
                    {investigation.investigation_name}
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    {investigation.category}
                  </p>
                </div>
              </div>

              <Badge>
                {formatStatus(investigation.status)}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl bg-[#F8FAFC] p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <CalendarDays size={14} />
                  Scheduled
                </div>

                <p className="mt-2 text-sm font-medium text-gray-900">
                  {formatDate(investigation.scheduled_for)}
                </p>
              </div>

              <div className="rounded-xl bg-[#F8FAFC] p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <Clock3 size={14} />
                  Ordered
                </div>

                <p className="mt-2 text-sm font-medium text-gray-900">
                  {formatDate(investigation.ordered_at)}
                </p>
              </div>

              <div className="rounded-xl bg-[#F8FAFC] p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <CheckCircle2 size={14} />
                  Report
                </div>

                <p className="mt-2 text-sm font-medium text-gray-900">
                  {investigation.report_ready_at
                    ? "Report ready"
                    : "Not ready"}
                </p>
              </div>
            </div>

            {investigation.prep_instructions && (
              <div className="rounded-xl border border-[#BDEBE5] bg-[#F3FBFA] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0F766E]">
                  <FileText size={16} />
                  Preparation instructions
                </div>

                <p className="mt-2 text-sm leading-6 text-gray-700">
                  {investigation.prep_instructions}
                </p>
              </div>
            )}

            {investigation.needs_reschedule && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                This investigation needs to be rescheduled.
              </div>
            )}

            {investigation.cancel_reason && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                Cancellation reason: {investigation.cancel_reason}
              </div>
            )}

            <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-gray-100 pt-4 text-xs text-gray-500">
              {investigation.performed_at && (
                <span>
                  Performed: {formatDate(investigation.performed_at)}
                </span>
              )}

              {investigation.report_ready_at && (
                <span>
                  Report ready: {formatDate(investigation.report_ready_at)}
                </span>
              )}

              {investigation.reviewed_at && (
                <span>
                  Reviewed: {formatDate(investigation.reviewed_at)}
                </span>
              )}
            </div>
          </div>
        </Card>
      ))}

      <button
        type="button"
        onClick={() => void loadInvestigations()}
        className="text-sm font-medium text-[#0F766E] hover:underline"
      >
        Refresh investigations
      </button>
    </div>
  );
}