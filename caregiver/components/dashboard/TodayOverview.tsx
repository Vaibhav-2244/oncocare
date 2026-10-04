import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Pill,
} from "lucide-react";

import { Card } from "@/components/ui/Card";

export function TodayOverview() {
  const items = [
    {
      label: "Tasks",
      value: "Today",
      description: "Care tasks assigned to you",
      icon: ClipboardList,
    },
    {
      label: "Medications",
      value: "Today",
      description: "Prescribed medication schedule",
      icon: Pill,
    },
    {
      label: "Appointments",
      value: "Today",
      description: "Upcoming patient appointments",
      icon: CalendarClock,
    },
    {
      label: "Care status",
      value: "Active",
      description: "Patient-specific care workspace",
      icon: CheckCircle2,
    },
  ];

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">
          Today&apos;s overview
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          A quick view of the areas you&apos;ll use
          throughout the day.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <Card
              key={item.label}
              className="p-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
                  <Icon size={19} />
                </div>

                <span className="text-xs font-medium text-gray-400">
                  {item.value}
                </span>
              </div>

              <h3 className="mt-4 text-sm font-semibold text-gray-900">
                {item.label}
              </h3>

              <p className="mt-1 text-xs leading-5 text-gray-500">
                {item.description}
              </p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}