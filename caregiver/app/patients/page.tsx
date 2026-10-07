"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  HeartPulse,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { PatientSummary } from "@/components/dashboard/PatientSummary";

import { Card } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";

import { getMyPatients } from "@/features/patients/patient.service";

import type { AssignedPatient } from "@/types";

export default function PatientsPage() {
  const [patients, setPatients] = useState<AssignedPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPatients() {
    try {
      setLoading(true);
      setError(null);

      const data = await getMyPatients();

      setPatients(data);
    } catch (err) {
      console.error("My patients loading error:", err);

      if (
        err instanceof Error &&
        err.message === "AUTH_SESSION_MISSING"
      ) {
        setError(
          "The authenticated caregiver session will be provided by the OncoCare+ integration layer.",
        );
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load your patients.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPatients();
  }, []);

  const activePatients = useMemo(
    () =>
      patients.filter(
        (patient) => patient.status === "active",
      ),
    [patients],
  );

  const notificationEnabledCount = useMemo(
    () =>
      patients.filter(
        (patient) => patient.notification_enabled,
      ).length,
    [patients],
  );

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl p-5 sm:p-8">
          <LoadingState lines={8} />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl space-y-5 p-5 sm:p-8">
          <ErrorState
            title="Patients couldn't load"
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
                  Patient assignments are loaded only after the
                  external OncoCare+ authentication layer provides
                  the caregiver's authenticated Supabase
                  session.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-[#0F766E]">
              <HeartPulse size={16} />
              Caregiver workspace
            </div>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
              My patients
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              View and manage care activities only for patients
              currently assigned to you.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 self-start rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-[#BDEBE5] hover:text-[#0F766E] sm:self-auto"
          >
            Dashboard
            <ArrowRight size={15} />
          </Link>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
                <Users size={18} />
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Assigned
                </p>

                <p className="mt-1 text-2xl font-semibold text-gray-900">
                  {patients.length}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ECFDF3] text-[#15803D]">
                <HeartPulse size={18} />
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Active
                </p>

                <p className="mt-1 text-2xl font-semibold text-gray-900">
                  {activePatients.length}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                <Bell size={18} />
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Notifications
                </p>

                <p className="mt-1 text-2xl font-semibold text-gray-900">
                  {notificationEnabledCount}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Patient list */}
        {patients.length === 0 ? (
          <EmptyState
            title="No assigned patients"
            description="There are currently no active caregiver relationships available for this account."
          />
        ) : (
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Assigned patients
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Select a patient to open their care workspace.
              </p>
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
        )}
      </div>
    </AppShell>
  );
}