"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  HeartPulse,
  Sparkles,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { MedicationSummary } from "@/components/dashboard/MedicationSummary";
import { PatientSummary } from "@/components/dashboard/PatientSummary";
import { TodayOverview } from "@/components/dashboard/TodayOverview";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

import { getAssignedPatients } from "@/features/caregiver/caregiver.service";
import { getNotifications } from "@/features/notifications/notification.service";
import { getDashboardMedicationSummary } from "@/features/medications/dashboard-medication.service";

import type {
  AssignedPatient,
  CaregiverNotification,
} from "@/types";

import type { DashboardMedicationSummary } from "@/features/medications/dashboard-medication.service";

export default function DashboardPage() {
  const [patients, setPatients] = useState<AssignedPatient[]>(
    [],
  );

  const [notifications, setNotifications] = useState<
    CaregiverNotification[]
  >([]);

  const [
    medicationSummaries,
    setMedicationSummaries,
  ] = useState<DashboardMedicationSummary[]>([]);

  const [loading, setLoading] = useState(true);

  const [medicationsLoading, setMedicationsLoading] =
    useState(false);

  const [error, setError] = useState<string | null>(
    null,
  );

  async function loadDashboard() {
    try {
      setLoading(true);
      setError(null);

      const [
        patientData,
        notificationData,
      ] = await Promise.all([
        getAssignedPatients(),
        getNotifications(),
      ]);

      setPatients(patientData);
      setNotifications(notificationData);

      /*
       * Medication data is loaded only for patients
       * returned by the caregiver-scoped assignment query.
       *
       * No global medication query is performed.
       */
      if (patientData.length > 0) {
        setMedicationsLoading(true);

        try {
          const medicationData =
            await getDashboardMedicationSummary(
              patientData,
            );

          setMedicationSummaries(
            medicationData,
          );
        } finally {
          setMedicationsLoading(false);
        }
      } else {
        setMedicationSummaries([]);
      }
    } catch (err) {
      console.error(
        "Dashboard loading error:",
        err,
      );

      if (
        err instanceof Error &&
        err.message === "AUTH_SESSION_MISSING"
      ) {
        setError(
          "The authenticated caregiver session will be provided by the OncoCare+ integration layer.",
        );
      } else if (
        err instanceof Error &&
        err.message === "PATIENT_ACCESS_DENIED"
      ) {
        setError(
          "One or more patient records are no longer authorized for this caregiver.",
        );
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load the caregiver dashboard.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  const unreadCount = useMemo(
    () =>
      notifications.filter(
        (notification) => !notification.is_read,
      ).length,
    [notifications],
  );

  const missedMedicationCount = useMemo(
    () =>
      medicationSummaries.reduce(
        (total, patient) =>
          total + patient.missed,
        0,
      ),
    [medicationSummaries],
  );

  if (loading) {
    return (
      <AppShell unreadCount={unreadCount}>
        <div className="mx-auto max-w-7xl p-5 sm:p-8">
          <LoadingState lines={7} />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell unreadCount={unreadCount}>
        <div className="mx-auto max-w-7xl space-y-5 p-5 sm:p-8">
          <ErrorState
            title="Caregiver workspace isn't connected yet"
            description={error}
          />

          <Card className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
                <Users size={21} />
              </div>

              <div>
                <h2 className="font-semibold text-gray-900">
                  Waiting for the authentication handoff
                </h2>

                <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
                  This standalone caregiver application does not
                  contain its own login or signup flow. Once the
                  integration layer provides the authenticated
                  Supabase session, the caregiver profile,
                  authorized patient assignments, medications,
                  appointments and notifications will load here.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell unreadCount={unreadCount}>
      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
        <DashboardHeader patientCount={patients.length} />

        {patients.length === 0 ? (
          <EmptyState
            title="No assigned patients"
            description="There are currently no active caregiver relationships available for this account."
          />
        ) : (
          <>
            {/* Assigned patients */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    My patients
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Only patients with an active caregiver
                    relationship are shown.
                  </p>
                </div>

                <Link
                  href="/patients"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0F766E]"
                >
                  View all
                  <ArrowRight size={15} />
                </Link>
              </div>

              <div className="grid gap-4">
                {patients.map((patient) => (
                  <Link
                    key={patient.relationship_id}
                    href={`/patients/${patient.patient_id}`}
                    className="block transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <PatientSummary patient={patient} />
                  </Link>
                ))}
              </div>
            </section>

            {/* Medication summary */}
            <MedicationSummary
              items={medicationSummaries}
              loading={medicationsLoading}
            />

            {/* Missed medication alert */}
            {missedMedicationCount > 0 && (
              <Card className="border-red-100 bg-red-50/60 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
                    <Bell size={17} />
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-semibold text-red-900">
                      Medication follow-up needed
                    </h3>

                    <p className="mt-1 text-sm leading-6 text-red-700">
                      {missedMedicationCount} medication{" "}
                      {missedMedicationCount === 1
                        ? "dose has"
                        : "doses have"}{" "}
                      been marked missed across your assigned
                      patients today.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Today's overview */}
            <TodayOverview />

            {/* Workspace + Lumi */}
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="p-6 lg:col-span-2">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
                    <HeartPulse size={21} />
                  </div>

                  <div>
                    <h2 className="font-semibold text-gray-900">
                      Today&apos;s care workspace
                    </h2>

                    <p className="mt-1 text-sm leading-6 text-gray-500">
                      Your patient-specific medications,
                      appointments, tasks and queue information
                      will appear here as those authorized backend
                      integrations are connected.
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <Link
                    href="/medications"
                    className="rounded-xl border border-gray-100 bg-[#F8FAFC] p-4 transition hover:border-[#BDEBE5] hover:bg-[#F3FBFA]"
                  >
                    <p className="text-sm font-semibold text-gray-900">
                      Medications
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      Track authorized medicine execution.
                    </p>
                  </Link>

                  <Link
                    href="/appointments"
                    className="rounded-xl border border-gray-100 bg-[#F8FAFC] p-4 transition hover:border-[#BDEBE5] hover:bg-[#F3FBFA]"
                  >
                    <p className="text-sm font-semibold text-gray-900">
                      Appointments
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      View patient appointments.
                    </p>
                  </Link>

                  <Link
                    href="/notifications"
                    className="rounded-xl border border-gray-100 bg-[#F8FAFC] p-4 transition hover:border-[#BDEBE5] hover:bg-[#F3FBFA]"
                  >
                    <p className="text-sm font-semibold text-gray-900">
                      Alerts
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      Review important caregiver alerts.
                    </p>
                  </Link>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
                    <Sparkles size={18} />
                  </div>

                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">
                      Lumi
                    </h2>

                    <p className="text-xs text-gray-400">
                      Care companion
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-gray-500">
                  Lumi can help you navigate the caregiver
                  workspace and organize care activities. Lumi
                  does not replace the patient&apos;s doctor or make
                  clinical decisions.
                </p>

                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#0F766E] transition hover:gap-3"
                >
                  Ask Lumi
                  <ArrowRight size={15} />
                </button>
              </Card>
            </div>

            {/* Notifications */}
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell
                    size={18}
                    className="text-[#0F766E]"
                  />

                  <div>
                    <h2 className="font-semibold text-gray-900">
                      Recent notifications
                    </h2>

                    {unreadCount > 0 && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {unreadCount} unread
                      </p>
                    )}
                  </div>
                </div>

                <Link
                  href="/notifications"
                  className="text-sm font-medium text-[#0F766E]"
                >
                  View all
                </Link>
              </div>

              {notifications.length === 0 ? (
                <p className="mt-5 text-sm text-gray-500">
                  No notifications yet.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-gray-100">
                  {notifications
                    .slice(0, 5)
                    .map((notification) => (
                      <div
                        key={notification.id}
                        className="flex items-start gap-3 py-4"
                      >
                        <div
                          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                            notification.is_read
                              ? "bg-gray-200"
                              : "bg-[#2EC4B6]"
                          }`}
                        />

                        <div className="min-w-0">
                          <p
                            className={`text-sm ${
                              notification.is_read
                                ? "font-medium text-gray-700"
                                : "font-semibold text-gray-900"
                            }`}
                          >
                            {notification.title}
                          </p>

                          <p className="mt-1 text-xs leading-5 text-gray-500">
                            {notification.message}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}