"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  FileText,
  FlaskConical,
  History,
  ListChecks,
  MessageCircle,
  Pill,
  Stethoscope,
  Users,
} from "lucide-react";

interface PatientNavigationProps {
  patientId?: string;
}

const navigationItems = [
  {
    label: "Overview",
    href: "",
    icon: Users,
  },
  {
    label: "Medications",
    href: "/medications",
    icon: Pill,
  },
  {
    label: "Appointments",
    href: "/appointments",
    icon: CalendarDays,
  },
  {
    label: "Queue",
    href: "/queue",
    icon: ListChecks,
  },
  {
    label: "Reports",
    href: "/reports",
    icon: FileText,
  },
  {
    label: "Timeline",
    href: "/timeline",
    icon: History,
  },
  {
    label: "Tasks",
    href: "/tasks",
    icon: ClipboardList,
  },
  {
    label: "Care Notes",
    href: "/care-notes",
    icon: Stethoscope,
  },
  {
    label: "Instructions",
    href: "/instructions",
    icon: ClipboardList,
  },
  {
    label: "Investigations",
    href: "/investigations",
    icon: FlaskConical,
  },
  {
    label: "Messages",
    href: "/messages",
    icon: MessageCircle,
  },
];

export function PatientNavigation({
  patientId: patientIdProp,
}: PatientNavigationProps) {
  const params = useParams<{ patientId?: string }>();
  const pathname = usePathname();

  const patientId = patientIdProp ?? params.patientId;

  if (!patientId) {
    return null;
  }

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="flex gap-1 overflow-x-auto px-1 py-2 scrollbar-hide">
        {navigationItems.map((item) => {
          const href = `/patients/${patientId}${item.href}`;
          const isOverview = item.href === "";

          const isActive = isOverview
            ? pathname === `/patients/${patientId}`
            : pathname === href;

          const Icon = item.icon;

          return (
            <Link
              key={item.label}
              href={href}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-[#E6F7F5] text-[#0F766E]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-[#0F766E]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}