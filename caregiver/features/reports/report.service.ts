import { supabase } from "@/lib/supabase/client";
import { verifyPatientAccess } from "@/features/caregiver/caregiver.service";
import type { DoctorReport, LabReport } from "@/types";

interface CaregiverReportRow {
  source: "doctor_report" | "lab_report";
  id: string;
  patient_id: string;
  user_id: string;
  report_type: string | null;
  report_date: string | null;
  flag: string | null;
  summary: string | null;
  lab_name: string | null;
  report_title: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size_bytes: number | null;
  storage_path: string | null;
  extraction_status: string | null;
  review_status: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ReportDocumentUrl {
  url: string;
  expiresIn: number;
}

/**
 * Retrieves reports only through the caregiver-authorized RPC.
 */
export async function getPatientReports(
  patientId: string,
): Promise<{
  doctorReports: DoctorReport[];
  labReports: LabReport[];
}> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  const { data, error } = await supabase.rpc(
    "get_patient_reports_for_caregiver",
    {
      target_patient_id: patientId,
    },
  );

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as CaregiverReportRow[];

  const doctorReports = rows
    .filter((row) => row.source === "doctor_report")
    .map(
      (row) =>
        ({
          id: row.id,
          report_type: row.report_type ?? "Doctor Report",
          report_date: row.report_date ?? "",
          flag: row.flag ?? "",
          summary: row.summary ?? "",
        }) as DoctorReport,
    );

  const labReports = rows
    .filter((row) => row.source === "lab_report")
    .map(
      (row) =>
        ({
          id: row.id,
          user_id: row.user_id,
          report_date: row.report_date,
          lab_name: row.lab_name,
          report_title:
            row.report_title ??
            row.file_name ??
            "Laboratory Report",
          file_name: row.file_name ?? "",
          file_type: row.file_type ?? "",
          file_size_bytes: row.file_size_bytes ?? null,
          storage_path: row.storage_path ?? null,
          extraction_status: row.extraction_status ?? "",
          review_status: row.review_status ?? "",
          created_at: row.created_at,
          updated_at: row.updated_at ?? row.created_at,
        }) as LabReport,
    );

  return {
    doctorReports,
    labReports,
  };
}

/**
 * Creates a short-lived signed URL for an authorized report.
 *
 * The Storage bucket remains private.
 * Supabase Storage RLS decides whether the authenticated
 * caregiver can access the object.
 */
export async function getReportDocumentUrl(
  patientId: string,
  storagePath: string,
): Promise<ReportDocumentUrl> {
  const hasAccess = await verifyPatientAccess(patientId);

  if (!hasAccess) {
    throw new Error("PATIENT_ACCESS_DENIED");
  }

  if (!storagePath.trim()) {
    throw new Error("REPORT_STORAGE_PATH_MISSING");
  }

  const { data, error } = await supabase.storage
    .from("lab-reports")
    .createSignedUrl(storagePath, 300);

  if (error) {
    throw error;
  }

  if (!data?.signedUrl) {
    throw new Error("REPORT_SIGNED_URL_FAILED");
  }

  return {
    url: data.signedUrl,
    expiresIn: 300,
  };
}