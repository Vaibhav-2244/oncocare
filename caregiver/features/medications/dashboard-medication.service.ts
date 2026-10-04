import type { AssignedPatient, Medication, MedicationHistory } from "@/types";

import {
  getPatientMedications,
  getMedicationHistory,
} from "@/features/medications/medication.service";

export interface DashboardMedicationSummary {
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

interface TodayDose {
  medicationId: string;
  medicationName: string;
  scheduledAt: Date;
  status: "pending" | "taken" | "missed";
}

function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseMedicationTime(
  value: string,
  baseDate: Date,
): Date | null {
  const raw = value.trim();

  let hours: number;
  let minutes: number;

  const twelveHourMatch = raw.match(
    /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
  );

  if (twelveHourMatch) {
    hours = Number(twelveHourMatch[1]);
    minutes = Number(twelveHourMatch[2]);

    const meridiem = twelveHourMatch[3].toUpperCase();

    if (hours < 1 || hours > 12 || minutes > 59) {
      return null;
    }

    if (meridiem === "AM") {
      hours = hours === 12 ? 0 : hours;
    } else {
      hours = hours === 12 ? 12 : hours + 12;
    }
  } else {
    const twentyFourHourMatch = raw.match(
      /^(\d{1,2}):(\d{2})$/,
    );

    if (!twentyFourHourMatch) {
      return null;
    }

    hours = Number(twentyFourHourMatch[1]);
    minutes = Number(twentyFourHourMatch[2]);

    if (hours > 23 || minutes > 59) {
      return null;
    }
  }

  const result = new Date(baseDate);

  result.setHours(hours, minutes, 0, 0);

  return result;
}

function medicationIsActiveToday(
  medication: Medication,
  todayString: string,
): boolean {
  if (!medication.is_active) {
    return false;
  }

  if (
    medication.start_date &&
    medication.start_date > todayString
  ) {
    return false;
  }

  if (
    medication.end_date &&
    medication.end_date < todayString
  ) {
    return false;
  }

  return true;
}

function getTodayDoses(
  medications: Medication[],
  history: MedicationHistory[],
): TodayDose[] {
  const now = new Date();
  const todayString = getLocalDateString(now);

  const historyByMedicationAndMinute = new Map<
    string,
    MedicationHistory
  >();

  for (const entry of history) {
    if (!entry.scheduled_at) {
      continue;
    }

    const scheduledDate = new Date(entry.scheduled_at);

    if (getLocalDateString(scheduledDate) !== todayString) {
      continue;
    }

    const key = [
      entry.medication_id,
      scheduledDate.getFullYear(),
      scheduledDate.getMonth(),
      scheduledDate.getDate(),
      scheduledDate.getHours(),
      scheduledDate.getMinutes(),
    ].join(":");

    historyByMedicationAndMinute.set(key, entry);
  }

  const doses: TodayDose[] = [];

  for (const medication of medications) {
    if (!medicationIsActiveToday(medication, todayString)) {
      continue;
    }

    const times = Array.isArray(medication.times)
      ? medication.times
      : [];

    for (const time of times) {
      if (typeof time !== "string") {
        continue;
      }

      const scheduledAt = parseMedicationTime(
        time,
        now,
      );

      if (!scheduledAt) {
        continue;
      }

      const key = [
        medication.id,
        scheduledAt.getFullYear(),
        scheduledAt.getMonth(),
        scheduledAt.getDate(),
        scheduledAt.getHours(),
        scheduledAt.getMinutes(),
      ].join(":");

      const historyEntry =
        historyByMedicationAndMinute.get(key);

      let status: TodayDose["status"] = "pending";

      if (historyEntry?.status === "taken") {
        status = "taken";
      } else if (historyEntry?.status === "missed") {
        status = "missed";
      }

      doses.push({
        medicationId: medication.id,
        medicationName: medication.name,
        scheduledAt,
        status,
      });
    }
  }

  return doses.sort(
    (a, b) =>
      a.scheduledAt.getTime() -
      b.scheduledAt.getTime(),
  );
}

function formatMedicationTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

async function buildPatientSummary(
  patient: AssignedPatient,
): Promise<DashboardMedicationSummary> {
  const [medications, history] = await Promise.all([
    getPatientMedications(patient.patient_id),
    getMedicationHistory(patient.patient_id),
  ]);

  const doses = getTodayDoses(
    medications,
    history,
  );

  const completed = doses.filter(
    (dose) => dose.status === "taken",
  ).length;

  const pending = doses.filter(
    (dose) => dose.status === "pending",
  ).length;

  const missed = doses.filter(
    (dose) => dose.status === "missed",
  ).length;

  const now = new Date();

  const nextPendingDose =
    doses.find(
      (dose) =>
        dose.status === "pending" &&
        dose.scheduledAt.getTime() >= now.getTime(),
    ) ??
    doses.find(
      (dose) => dose.status === "pending",
    );

  return {
    patientId: patient.patient_id,
    patientName: patient.patient_name,
    total: doses.length,
    completed,
    pending,
    missed,
    nextMedicationName:
      nextPendingDose?.medicationName ?? null,
    nextMedicationTime: nextPendingDose
      ? formatMedicationTime(
          nextPendingDose.scheduledAt,
        )
      : null,
    nextMedicationAt:
      nextPendingDose?.scheduledAt.toISOString() ??
      null,
  };
}

export async function getDashboardMedicationSummary(
  patients: AssignedPatient[],
): Promise<DashboardMedicationSummary[]> {
  if (!patients.length) {
    return [];
  }

  /*
   * Security boundary:
   *
   * `patients` must already come from the caregiver's
   * active patient-caregiver relationships.
   *
   * Each medication/history request then goes through
   * the existing caregiver-authorized RPCs, which verify
   * access for the individual patient.
   *
   * We never query all medications and filter them
   * client-side.
   */

  const summaries = await Promise.all(
    patients.map((patient) =>
      buildPatientSummary(patient),
    ),
  );

  return summaries;
}