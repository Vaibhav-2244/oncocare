"use client";

import {
  CalendarDays,
  FileText,
  ListChecks,
  MessageSquare,
  Pill,
  Stethoscope,
} from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/Card";

interface PatientQuickActionsProps {
  patientId: string;
}

const actions = [
  {
    label: "Medications",
    description: "Track prescribed medicines",
    icon: Pill,
    href: (id: string) =>
      `/patients/${id}/medications`,
  },
  {
    label: "Appointments",
    description: "View authorized appointments",
    icon: CalendarDays,
    href: (id: string) =>
      `/patients/${id}/appointments`,
  },
  {
    label: "Reports",
    description: "View authorized reports",
    icon: FileText,
    href: (id: string) =>
      `/patients/${id}/reports`,
  },
  {
    label: "Care Notes",
    description: "Record care observations",
    icon: Stethoscope,
    href: (id: string) =>
      `/patients/${id}/care-notes`,
  },
  {
    label: "Tasks",
    description: "Manage patient-care activities",
    icon: ListChecks,
    href: (id: string) =>
      `/patients/${id}/tasks`,
  },
  {
    label: "Timeline",
    description: "Review the care journey",
    icon: ListChecks,
    href: (id: string) =>
      `/patients/${id}/timeline`,
  },
  {
    label: "Messages",
    description: "Authorized communication",
    icon: MessageSquare,
    href: () => "/messages",
  },
];

export function PatientQuickActions({
  patientId,
}: PatientQuickActionsProps) {
  return (
    <Card className="p-5 sm:p-6">
      <div>
        <h2 className="font-semibold text-gray-900">
          Care workspace
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Patient-specific care actions
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.label}
              href={action.href(patientId)}
              className="group rounded-xl border border-gray-100 bg-[#F8FAFC] p-4 transition hover:-translate-y-0.5 hover:border-[#BDEBE5] hover:bg-[#F3FBFA]"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E8F8F6] text-[#0F766E] transition group-hover:bg-white">
                  <Icon size={17} />
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {action.label}
                  </p>

                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    {action.description}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}