"use client";

import {
  Download,
  ExternalLink,
  FileText,
  X,
} from "lucide-react";

import type { LabReport } from "@/types";

interface ReportViewerProps {
  url: string | null;
  report: LabReport | null;
  onClose: () => void;
}

export function ReportViewer({
  url,
  report,
  onClose,
}: ReportViewerProps) {
  if (!url || !report) {
    return null;
  }

  const isPdf =
    report.file_type === "application/pdf" ||
    report.file_name.toLowerCase().endsWith(".pdf");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <FileText size={18} />
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">
                {report.report_title || report.file_name}
              </p>

              <p className="truncate text-xs text-gray-500">
                {report.file_name}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
              title="Open in new tab"
            >
              <ExternalLink size={18} />
            </a>

            <a
              href={url}
              download={report.file_name || "lab-report"}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
              title="Download"
            >
              <Download size={18} />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
              title="Close"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-gray-100">
          {isPdf ? (
            <iframe
              src={url}
              title={report.report_title || report.file_name}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center overflow-auto p-4 sm:p-8">
              <img
                src={url}
                alt={report.report_title || report.file_name}
                className="max-h-full max-w-full rounded-lg bg-white object-contain shadow"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}