import { CalendarDays, Users } from "lucide-react";

interface DashboardHeaderProps {
  patientCount: number;
}

export function DashboardHeader({
  patientCount,
}: DashboardHeaderProps) {
  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-medium text-[#0F766E]">
          Caregiver workspace
        </p>

        <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Good morning
        </h1>

        <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500">
          Coordinate today&apos;s care, stay on top of
          important updates, and keep your assigned
          patients supported.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
          <CalendarDays
            size={16}
            className="text-[#0F766E]"
          />

          <span>{today}</span>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
          <Users
            size={16}
            className="text-[#0F766E]"
          />

          <span>
            {patientCount}{" "}
            {patientCount === 1
              ? "patient"
              : "patients"}
          </span>
        </div>
      </div>
    </div>
  );
}