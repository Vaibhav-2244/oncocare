import { AlertCircle, RefreshCw } from "lucide-react";

import { Card } from "./Card";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this information right now.",
  onRetry,
}: ErrorStateProps) {
  return (
    <Card className="p-8">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
          <AlertCircle size={24} />
        </div>

        <h2 className="mt-4 text-lg font-semibold text-gray-900">
          {title}
        </h2>

        <p className="mt-2 text-sm leading-6 text-gray-500">
          {description}
        </p>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#115E59]"
          >
            <RefreshCw size={15} />
            Try again
          </button>
        )}
      </div>
    </Card>
  );
}