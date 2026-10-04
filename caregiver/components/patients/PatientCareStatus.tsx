import {
  Activity,
  CheckCircle2,
  Clock3,
  ShieldCheck,
} from "lucide-react";

import { Card } from "@/components/ui/Card";

interface PatientCareStatusProps {
  relationship: string;
  status: string;
}

export function PatientCareStatus({
  relationship,
  status,
}: PatientCareStatusProps) {
  const items = [
    {
      icon: ShieldCheck,
      label: "Caregiver relationship",
      value: relationship || "Caregiver",
    },
    {
      icon: Activity,
      label: "Patient status",
      value: status || "Active",
    },
    {
      icon: CheckCircle2,
      label: "Access",
      value: "Authorized",
    },
    {
      icon: Clock3,
      label: "Workspace",
      value: "Care coordination",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <Card key={item.label} className="p-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
              <Icon size={18} />
            </div>

            <p className="mt-4 text-xs font-medium text-gray-400">
              {item.label}
            </p>

            <p className="mt-1 truncate text-sm font-semibold text-gray-900">
              {item.value}
            </p>
          </Card>
        );
      })}
    </div>
  );
}