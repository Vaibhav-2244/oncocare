import {
  Activity,
  Clock3,
  Hash,
  Users,
} from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { QueuePosition } from "@/types";

interface QueueStatusProps {
  position?: QueuePosition | null;
}

function formatStatus(status?: string | null) {
  if (!status) return null;

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function QueueStatus({
  position,
}: QueueStatusProps) {
  if (!position) {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
            <Activity size={20} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-gray-900">
                Live queue
              </h2>

              <Badge variant="info">
                No active position
              </Badge>
            </div>

            <p className="mt-1 text-sm leading-6 text-gray-500">
              There is currently no active queue position
              available for this patient.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const statusLabel = formatStatus(position.status);

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E8F8F6] text-[#0F766E]">
            <Activity size={20} />
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">
              Live queue
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Current patient queue position
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">Live</Badge>

          {statusLabel && (
            <Badge variant="info">
              {statusLabel}
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <Hash
            size={17}
            className="text-gray-400"
          />

          <p className="mt-3 text-xs font-medium text-gray-400">
            Token
          </p>

          <p className="mt-1 text-2xl font-bold text-gray-900">
            {position.token_number ?? "—"}
          </p>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <Users
            size={17}
            className="text-gray-400"
          />

          <p className="mt-3 text-xs font-medium text-gray-400">
            Patients ahead
          </p>

          <p className="mt-1 text-2xl font-bold text-gray-900">
            {position.ahead ?? "—"}
          </p>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <Clock3
            size={17}
            className="text-gray-400"
          />

          <p className="mt-3 text-xs font-medium text-gray-400">
            Estimated wait
          </p>

          <p className="mt-1 text-2xl font-bold text-gray-900">
            {position.estimated_wait_minutes != null
              ? `${position.estimated_wait_minutes} min`
              : "—"}
          </p>
        </div>
      </div>

      {position.position != null && (
        <div className="mt-4 rounded-xl bg-[#F5F7FA] px-4 py-3">
          <p className="text-sm text-gray-600">
            Current queue position:{" "}
            <span className="font-semibold text-gray-900">
              #{position.position}
            </span>
          </p>
        </div>
      )}
    </Card>
  );
}