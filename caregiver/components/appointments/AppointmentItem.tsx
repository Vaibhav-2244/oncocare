"use client";

import {
  CalendarDays,
  Clock3,
  FileText,
  Stethoscope,
} from "lucide-react";

import type { Appointment } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

interface AppointmentItemProps {
  appointment: Appointment;
  highlight?: boolean;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getStatusVariant(status: string | null) {
  const normalized = status?.toLowerCase();

  if (
    normalized === "confirmed" ||
    normalized === "scheduled" ||
    normalized === "completed"
  ) {
    return "success" as const;
  }

  if (
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "no_show"
  ) {
    return "error" as const;
  }

  return "warning" as const;
}

function formatStatus(status: string | null) {
  if (!status) return "Scheduled";

  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AppointmentItem({
  appointment,
  highlight = false,
}: AppointmentItemProps) {
  return (
    <Card
      className={
        highlight
          ? "border-teal-200 bg-teal-50/30 shadow-sm"
          : "shadow-sm"
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {highlight && (
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-700">
                Next appointment
              </div>
            )}

            <h3 className="text-base font-semibold text-gray-900">
              {appointment.visit_type
                ? appointment.visit_type
                    .replaceAll("_", " ")
                    .replace(/\b\w/g, (letter) => letter.toUpperCase())
                : "Patient appointment"}
            </h3>

            {appointment.reason && (
              <p className="mt-1 text-sm text-gray-500">
                {appointment.reason}
              </p>
            )}
          </div>

          <Badge variant={getStatusVariant(appointment.status)}>
            {formatStatus(appointment.status)}
          </Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
            <CalendarDays className="h-5 w-5 text-teal-600" />

            <div>
              <p className="text-xs text-gray-500">Date</p>
              <p className="text-sm font-medium text-gray-900">
                {formatDate(appointment.starts_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
            <Clock3 className="h-5 w-5 text-blue-600" />

            <div>
              <p className="text-xs text-gray-500">Time</p>
              <p className="text-sm font-medium text-gray-900">
                {formatTime(appointment.starts_at)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Stethoscope className="h-4 w-4 text-gray-400" />
            <span>
              Doctor appointment
            </span>
          </div>

          {appointment.duration_minutes && (
            <span className="text-sm text-gray-400 sm:ml-auto">
              {appointment.duration_minutes} min
            </span>
          )}
        </div>

        {appointment.notes && (
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <div className="mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Notes
              </span>
            </div>

            <p className="text-sm leading-6 text-gray-600">
              {appointment.notes}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}