"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  UserRound,
} from "lucide-react";

import type { AssignedPatient } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

interface PatientHeaderProps {
  patient: AssignedPatient;
}

export function PatientHeader({
  patient,
}: PatientHeaderProps) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#0F766E]"
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </Link>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#E8F8F6] text-[#0F766E]">
              <UserRound size={28} />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
                  {patient.patient_name}
                </h1>

                <Badge
                  variant={
                    patient.status === "active"
                      ? "success"
                      : "default"
                  }
                >
                  {patient.status}
                </Badge>
              </div>

              <p className="mt-1 text-sm text-gray-500">
                {patient.relationship || "Care recipient"}
              </p>

              <p className="mt-1 text-xs text-gray-400">
                Patient access is based on your caregiver
                relationship.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-500">
            <CalendarDays size={16} />
            <span>Care workspace</span>
          </div>
        </div>
      </div>
    </Card>
  );
}