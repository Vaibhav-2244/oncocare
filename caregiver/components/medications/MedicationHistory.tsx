import {
  CheckCircle2,
  Clock3,
  XCircle,
} from "lucide-react";

import type { MedicationHistory as MedicationHistoryType } from "@/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  formatDateTime,
  titleCase,
} from "@/lib/utils";

interface MedicationHistoryProps {
  history: MedicationHistoryType[];
}

function getStatusVariant(
  status?: string | null,
) {
  switch (status?.toLowerCase()) {
    case "taken":
    case "given":
    case "completed":
      return "success" as const;

    case "missed":
    case "skipped":
      return "error" as const;

    default:
      return "warning" as const;
  }
}

function StatusIcon({
  status,
}: {
  status?: string | null;
}) {
  switch (status?.toLowerCase()) {
    case "taken":
    case "given":
    case "completed":
      return (
        <CheckCircle2
          size={16}
          className="text-green-600"
        />
      );

    case "missed":
    case "skipped":
      return (
        <XCircle
          size={16}
          className="text-red-500"
        />
      );

    default:
      return (
        <Clock3
          size={16}
          className="text-amber-500"
        />
      );
  }
}

export function MedicationHistory({
  history,
}: MedicationHistoryProps) {
  if (history.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-gray-500">
          No medication history is available yet.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="font-semibold text-gray-900">
          Medication history
        </h2>

        <p className="mt-1 text-xs text-gray-500">
          Recorded medication activity for this patient.
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {history.map((item) => (
          <div
            key={item.id}
            className="flex gap-4 px-5 py-4"
          >
            <div className="mt-1">
              <StatusIcon status={item.status} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-gray-900">
                  {item.medication_name ||
                    "Medication"}
                </p>

                <Badge
                  variant={getStatusVariant(
                    item.status,
                  )}
                >
                  {titleCase(item.status) ||
                    "Pending"}
                </Badge>
              </div>

              {item.dosage && (
                <p className="mt-1 text-xs text-gray-500">
                  {item.dosage}
                </p>
              )}

              <div className="mt-2 space-y-1 text-xs text-gray-400">
                {item.scheduled_at && (
                  <p>
                    Scheduled:{" "}
                    {formatDateTime(
                      item.scheduled_at,
                    )}
                  </p>
                )}

                {item.taken_at && (
                  <p>
                    Recorded:{" "}
                    {formatDateTime(item.taken_at)}
                  </p>
                )}

                {item.patient_response && (
                  <p>
                    Patient response:{" "}
                    {item.patient_response}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}