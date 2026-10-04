"use client";

import {
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  FlaskConical,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";

import { Card } from "@/components/ui/Card";
import {
  getReportDocumentUrl,
} from "@/features/reports/report.service";
import type { LabReport } from "@/types";

interface ReportCardProps {
  report: LabReport;
  patientId: string;
  onOpen: (url: string, report: LabReport) => void;
}

function formatDate(value?: string | null) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getStatusClass(status?: string | null) {
  const normalized = (status ?? "").toLowerCase();

  if (
    normalized === "completed" ||
    normalized === "approved" ||
    normalized === "reviewed"
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (normalized === "processing") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (normalized === "failed") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

export function ReportCard({
  report,
  patientId,
  onOpen,
}: ReportCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fileType = report.file_type ?? "";
  const extractionStatus =
    report.extraction_status ?? "pending";
  const reviewStatus =
    report.review_status ?? "pending";
  const fileName = report.file_name ?? "";
  const reportTitle =
    report.report_title ||
    fileName ||
    "Laboratory Report";

  const hasDocument = Boolean(report.storage_path);

  const isPdf =
    fileType === "application/pdf" ||
    fileName.toLowerCase().endsWith(".pdf");

  async function openReport() {
    if (!report.storage_path) {
      setError(
        "This report does not have an attached document.",
      );
      return;
    }

    try {
      setLoading(true);
      setError("");

      const result = await getReportDocumentUrl(
        patientId,
        report.storage_path,
      );

      onOpen(result.url, report);
    } catch (err) {
      console.error(err);
      setError(
        "The report could not be opened. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function downloadReport() {
    if (!report.storage_path) {
      setError(
        "This report does not have an attached document.",
      );
      return;
    }

    try {
      setLoading(true);
      setError("");

      const result = await getReportDocumentUrl(
        patientId,
        report.storage_path,
      );

      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.download =
        fileName || "lab-report";

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (err) {
      console.error(err);
      setError(
        "The report could not be downloaded. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              {isPdf ? (
                <FileText size={21} />
              ) : (
                <FlaskConical size={21} />
              )}
            </div>

            <div className="min-w-0">
              <h3 className="truncate font-semibold text-gray-900">
                {reportTitle}
              </h3>

              <p className="mt-1 truncate text-sm text-gray-500">
                {fileName || "Report document"}
              </p>
            </div>
          </div>

          <span
            className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClass(
              extractionStatus,
            )}`}
          >
            {extractionStatus === "completed" ? (
              <CheckCircle2 size={13} />
            ) : (
              <AlertCircle size={13} />
            )}

            {extractionStatus}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <CalendarDays size={14} />
              Report date
            </div>

            <p className="mt-1 text-sm font-medium text-gray-900">
              {formatDate(report.report_date)}
            </p>
          </div>

          <div className="rounded-xl bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <FlaskConical size={14} />
              Laboratory
            </div>

            <p className="mt-1 truncate text-sm font-medium text-gray-900">
              {report.lab_name || "Laboratory report"}
            </p>
          </div>

          <div className="rounded-xl bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <FileText size={14} />
              Review
            </div>

            <p className="mt-1 text-sm font-medium text-gray-900">
              {reviewStatus}
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void openReport()}
            disabled={!hasDocument || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2
                size={16}
                className="animate-spin"
              />
            ) : (
              <Eye size={16} />
            )}

            View report
          </button>

          <button
            type="button"
            onClick={() => void downloadReport()}
            disabled={!hasDocument || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} />
            Download
          </button>
        </div>
      </div>
    </Card>
  );
}