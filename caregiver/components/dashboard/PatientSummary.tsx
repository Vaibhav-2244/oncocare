import {
  ChevronRight,
  UserRound,
} from "lucide-react";

import type { AssignedPatient } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

interface PatientSummaryProps {
  patient: AssignedPatient;
}

export function PatientSummary({
  patient,
}: PatientSummaryProps) {
  const status =
    patient.status?.toLowerCase() || "active";

  return (
    <Card className="group p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E8F8F6] text-[#0F766E]">
          <UserRound size={21} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold text-gray-900">
              {patient.patient_name}
            </h2>

            <Badge
              variant={
                status === "active"
                  ? "success"
                  : "default"
              }
            >
              {patient.status || "Active"}
            </Badge>
          </div>

          <p className="mt-1 text-sm text-gray-500">
            {patient.relationship ||
              "Care recipient"}
          </p>

          <p className="mt-1 text-xs text-gray-400">
            Authorized caregiver relationship
          </p>
        </div>

        <div className="hidden shrink-0 items-center gap-2 text-sm font-medium text-[#0F766E] sm:flex">
          View patient

          <ChevronRight
            size={17}
            className="transition-transform group-hover:translate-x-1"
          />
        </div>

        <ChevronRight
          size={19}
          className="shrink-0 text-gray-300 sm:hidden"
        />
      </div>
    </Card>
  );
}