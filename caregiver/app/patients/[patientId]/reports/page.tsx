"use client";

import {
  ArrowLeft,
  FileText,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";

import { ReportCard } from "@/components/reports/ReportCard";
import { ReportViewer } from "@/components/reports/ReportViewer";

import { getPatientReports } from "@/features/reports/report.service";
import { verifyPatientAccess } from "@/features/caregiver/caregiver.service";

import type { DoctorReport, LabReport } from "@/types";

interface ReportsPageProps {
  params: Promise<{
    patientId: string;
  }>;
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

export default function ReportsPage({
  params,
}: ReportsPageProps) {
  const { patientId } = use(params);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [doctorReports, setDoctorReports] = useState<
    DoctorReport[]
  >([]);

  const [labReports, setLabReports] = useState<LabReport[]>(
    [],
  );

  const [viewerUrl, setViewerUrl] = useState<string | null>(
    null,
  );

  const [viewerReport, setViewerReport] =
    useState<LabReport | null>(null);

  const loadReports = useCallback(
    async (isRefresh = false) => {
      try {
        setError("");

        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const authorized =
          await verifyPatientAccess(patientId);

        if (!authorized) {
          throw new Error("PATIENT_ACCESS_DENIED");
        }

        const result =
          await getPatientReports(patientId);

        setDoctorReports(result.doctorReports);
        setLabReports(result.labReports);
      } catch (err) {
        console.error(err);

        if (
          err instanceof Error &&
          err.message === "PATIENT_ACCESS_DENIED"
        ) {
          setError(
            "You are not authorized to access this patient's reports.",
          );
        } else {
          setError(
            "We couldn't load the patient's reports. Please try again.",
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [patientId],
  );

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  function openViewer(
    url: string,
    report: LabReport,
  ) {
    setViewerUrl(url);
    setViewerReport(report);
  }

  function closeViewer() {
    setViewerUrl(null);
    setViewerReport(null);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <ErrorState title="Reports unavailable" />

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadReports(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            <RefreshCw size={16} />
            Try again
          </button>
        </div>

        <p className="text-center text-sm text-gray-500">
          {error}
        </p>
      </div>
    );
  }

  const totalReports =
    doctorReports.length + labReports.length;

  return (
    <>
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href={`/patients/${patientId}`}
              className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900"
            >
              <ArrowLeft size={16} />
              Back to patient
            </Link>

            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <FileText size={22} />
              </div>

              <div>
                <h1 className="text-2xl font-semibold text-gray-900">
                  Reports & Documents
                </h1>

                <p className="mt-1 text-sm text-gray-500">
                  Caregiver-authorized clinical documents
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadReports(true)}
            disabled={refreshing}
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={
                refreshing ? "animate-spin" : ""
              }
            />
            Refresh
          </button>
        </div>

        <Card className="border-teal-100 bg-teal-50/50 p-4">
          <div className="flex gap-3">
            <ShieldCheck
              className="mt-0.5 shrink-0 text-teal-700"
              size={20}
            />

            <div>
              <p className="font-medium text-gray-900">
                Secure patient document access
              </p>

              <p className="mt-1 text-sm leading-6 text-gray-600">
                Documents are stored in a private clinical
                document bucket and are available only while
                your caregiver relationship with this patient
                is authorized.
              </p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-sm text-gray-500">
              Total reports
            </p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {totalReports}
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-sm text-gray-500">
              Lab reports
            </p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {labReports.length}
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-sm text-gray-500">
              Doctor reports
            </p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {doctorReports.length}
            </p>
          </Card>
        </div>

        {totalReports === 0 ? (
          <EmptyState
            title="No reports available"
            description="No caregiver-authorized reports or documents are currently available for this patient."
          />
        ) : (
          <div className="space-y-8">
            {labReports.length > 0 && (
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                      <FlaskConical
                        size={19}
                        className="text-teal-700"
                      />
                      Laboratory Reports
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      Uploaded laboratory documents
                    </p>
                  </div>

                  <Badge variant="info">
                    {labReports.length}{" "}
                    {labReports.length === 1
                      ? "report"
                      : "reports"}
                  </Badge>
                </div>

                <div className="grid gap-4">
                  {labReports.map((report) => (
                    <ReportCard
                      key={report.id}
                      report={report}
                      patientId={patientId}
                      onOpen={openViewer}
                    />
                  ))}
                </div>
              </section>
            )}

            {doctorReports.length > 0 && (
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                      <FileText
                        size={19}
                        className="text-blue-600"
                      />
                      Doctor Reports
                    </h2>

                    <p className="mt-1 text-sm text-gray-500">
                      Clinical reports shared with the patient
                    </p>
                  </div>

                  <Badge variant="info">
                    {doctorReports.length}{" "}
                    {doctorReports.length === 1
                      ? "report"
                      : "reports"}
                  </Badge>
                </div>

                <div className="grid gap-4">
                  {doctorReports.map((report) => (
                    <Card
                      key={report.id}
                      className="p-5"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {report.report_type ||
                              "Doctor Report"}
                          </h3>

                          <p className="mt-1 text-sm text-gray-500">
                            {formatDate(
                              report.report_date,
                            )}
                          </p>
                        </div>

                        {report.flag && (
                          <Badge variant="warning">
                            {report.flag}
                          </Badge>
                        )}
                      </div>

                      {report.summary && (
                        <div className="mt-4 rounded-xl bg-gray-50 p-4">
                          <p className="text-sm leading-6 text-gray-700">
                            {report.summary}
                          </p>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <ReportViewer
        url={viewerUrl}
        report={viewerReport}
        onClose={closeViewer}
      />
    </>
  );
}