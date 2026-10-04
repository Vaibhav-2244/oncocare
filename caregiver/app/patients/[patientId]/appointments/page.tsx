"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { AppointmentItem } from "@/components/appointments/AppointmentItem";
import { PatientNavigation } from "@/components/patients/PatientNavigation";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

import { getAuthorizedPatient } from "@/features/patients/patient.service";
import { getPatientAppointments } from "@/features/appointments/appointment.service";

import type { Appointment, AssignedPatient } from "@/types";

function isUpcoming(appointment: Appointment) {
  return new Date(appointment.starts_at).getTime() >= Date.now();
}

export default function PatientAppointmentsPage() {
  const params = useParams<{ patientId: string }>();

  const patientId = params?.patientId;

  const [patient, setPatient] = useState<AssignedPatient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAppointments() {
    if (!patientId) {
      setError("PATIENT_ID_MISSING");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      /*
       * The patient lookup itself is caregiver-authorized.
       */
      const authorizedPatient = await getAuthorizedPatient(patientId);

      if (!authorizedPatient) {
        throw new Error("PATIENT_ACCESS_DENIED");
      }

      setPatient(authorizedPatient);

      /*
       * Appointment retrieval uses the caregiver-authorized
       * database RPC.
       */
      const appointmentData = await getPatientAppointments(patientId);

      setAppointments(appointmentData);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to load appointments.";

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAppointments();
  }, [patientId]);

  const upcomingAppointments = useMemo(
    () =>
      appointments
        .filter(isUpcoming)
        .sort(
          (a, b) =>
            new Date(a.starts_at).getTime() -
            new Date(b.starts_at).getTime(),
        ),
    [appointments],
  );

  const pastAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => !isUpcoming(appointment))
        .sort(
          (a, b) =>
            new Date(b.starts_at).getTime() -
            new Date(a.starts_at).getTime(),
        ),
    [appointments],
  );

  const nextAppointment = upcomingAppointments[0];

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <ErrorState
          title={
            error === "PATIENT_ACCESS_DENIED"
              ? "Appointment access unavailable"
              : "Unable to load appointments"
          }
          description={
            error === "PATIENT_ACCESS_DENIED"
              ? "This caregiver is not authorized to view this patient's appointments."
              : "Something went wrong while loading the appointment schedule."
          }
          onRetry={() => void loadAppointments()}
        />
      </div>
    );
  }

  if (!patient) {
    return (
      <EmptyState
        title="Patient not available"
        description="The requested patient could not be found in your authorized patient list."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/patients/${patientId}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50"
          aria-label="Back to patient"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>

        <div>
          <p className="text-sm text-gray-500">{patient.patient_name}</p>

          <h1 className="text-2xl font-semibold text-gray-900">
            Appointments
          </h1>
        </div>
      </div>

      <PatientNavigation patientId={patientId} />

      {nextAppointment && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-teal-600" />

            <h2 className="text-lg font-semibold text-gray-900">
              Next appointment
            </h2>
          </div>

          <AppointmentItem
            appointment={nextAppointment}
            highlight
          />
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Upcoming
            </h2>

            <p className="text-sm text-gray-500">
              Scheduled appointments for this patient.
            </p>
          </div>
        </div>

        {upcomingAppointments.length === 0 ? (
          <Card className="shadow-sm">
            <EmptyState
              title="No upcoming appointments"
              description="There are currently no future appointments available for this patient."
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {upcomingAppointments
              .slice(0, nextAppointment ? 1 : undefined)
              .map((appointment) => (
                <AppointmentItem
                  key={appointment.id}
                  appointment={appointment}
                  highlight={appointment.id === nextAppointment?.id}
                />
              ))}
          </div>
        )}
      </section>

      {pastAppointments.length > 0 && (
        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-gray-900">
              Previous appointments
            </h2>

            <p className="text-sm text-gray-500">
              Recent appointment history for this patient.
            </p>
          </div>

          <div className="space-y-4">
            {pastAppointments.map((appointment) => (
              <AppointmentItem
                key={appointment.id}
                appointment={appointment}
              />
            ))}
          </div>
        </section>
      )}

      {!nextAppointment && pastAppointments.length === 0 && (
        <Card className="shadow-sm">
          <EmptyState
            title="No appointments yet"
            description="No authorized appointment records are currently available for this patient."
          />
        </Card>
      )}
    </div>
  );
}